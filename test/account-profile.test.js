import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { Store } from "../server/store.js";
import { accountProfileChanges } from "../server/account-profile.js";

const avatar = "data:image/jpeg;base64,/9j/2Q==";
test("profile validation accepts a name and JPEG, and ignores protected account fields", () => {
  assert.deepEqual(accountProfileChanges({ name: "  New Name  ", avatar, chips: 999999, playerId: 99 }),
    { name: "New Name", avatar });
  assert.deepEqual(accountProfileChanges({ name: "A" }), { name: "A" });
  assert.deepEqual(accountProfileChanges({ name: "A", avatar: null }), { name: "A", avatar: null });
  for (const body of [{ name: "" }, { name: "A".repeat(9) }, { name: "A", avatar: "https://bad.example/a.jpg" },
    { name: "A", avatar: "data:image/svg+xml;base64,PHN2Zz4=" },
    { name: "A", avatar: "data:image/jpeg;base64,aGVsbG8=" }]) assert.throws(() => accountProfileChanges(body));
});

test("profile API edits only the signed-in player's name and picture", async () => {
  const source = await readFile(new URL("../server/index.js", import.meta.url), "utf8");
  const start = source.indexOf('app.get("/api/account"');
  const end = source.indexOf('app.use("/api/slot"', start);
  const store = new Store();
  const a = await store.createAccount("profile-token-A-123456789", "A");
  const b = await store.createAccount("profile-token-B-123456789", "B");
  await store.updateAccount(a.playerId, { chips: 500, debt: 100 });
  let get, put;
  const context = vm.createContext({
    app: { get: (path, callback) => get = callback, put: (path, middleware, callback) => put = callback },
    express: { json: () => () => {} }, enqueue: callback => callback(), store,
    accountKeyFor: value => value, publicAccount: value => value, accountProfileChanges, sendTo() {},
  });
  vm.runInContext(source.slice(start, end), context);
  let body, status = 200;
  const response = { status(code) { status = code; return this; }, json(value) { body = value; return this; }, setHeader() {} };
  const request = { get: () => "Bearer profile-token-A-123456789",
    body: { name: "GINTA", avatar, playerId: b.playerId, chips: 999999, debt: 0, stats: { wins: 100 } } };
  await put(request, response);
  assert.equal(status, 200);
  const updated = await store.findAccountById(a.playerId);
  assert.equal(updated.name, "GINTA");
  assert.equal(updated.avatar, avatar);
  assert.equal(updated.playerId, a.playerId);
  assert.equal(updated.chips, 500);
  assert.equal(updated.debt, 100);
  assert.equal(updated.stats.wins, 0);
  assert.equal((await store.findAccountById(b.playerId)).name, "B");
  await get(request, response);
  assert.equal(body.account.avatar, avatar);
  request.body = { name: "GINTA", avatar: null };
  await put(request, response);
  assert.equal((await store.findAccountById(a.playerId)).avatar, null);
  await put({ ...request, get: () => "" }, response);
  assert.equal(status, 401);
});

test("square avatar crops stay in bounds for portrait, landscape, zoom and edge positions", async () => {
  globalThis.document = { getElementById: () => null };
  const { avatarCrop } = await import("../dist/js/account-profile.js");
  for (const [width, height] of [[1000, 2000], [3000, 1000], [512, 512]]) {
    for (const zoom of [1, 2, 3]) for (const x of [-100, 0, 100]) for (const y of [-100, 0, 100]) {
      const crop = avatarCrop(width, height, zoom, x, y);
      assert.ok(crop.size > 0);
      assert.ok(crop.sx >= 0 && crop.sy >= 0);
      assert.ok(crop.sx + crop.size <= width + 0.0001);
      assert.ok(crop.sy + crop.size <= height + 0.0001);
    }
  }
  assert.deepEqual(avatarCrop(1000, 2000), { sx: 0, sy: 500, size: 1000 });
});

async function profileUI({ put } = {}) {
  const source = (await readFile(new URL("../dist/js/account-profile.js", import.meta.url), "utf8"))
    .replace(/^import .*;\r?\n/gm, "").replace("export function avatarCrop", "function avatarCrop")
    .replace('import("./avatar-gestures.js")', "loadGestures()");
  const elements = new Map();
  function element() {
    return { hidden: false, disabled: false, children: [], listeners: {}, classList: {add(){}, remove(){}, toggle(){}},
      addEventListener(type, fn) { this.listeners[type] = fn; },
      setAttribute(){}, removeAttribute(){}, querySelectorAll(){return [];},
      querySelector(){return this.children.find(child => child.src) ?? null;},
      append(child){this.children.push(child);}, focus(){},
      showModal(){this.open=true;}, close(){this.open=false;}, textContent: "Photo" };
  }
  function get(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); }
  const opener = element(), ranked = [], timers = new Map();
  const controlIds = ["account-edit", "account-close", "account-edit-cancel", "account-edit-save",
    "account-photo-select", "account-photo-remove", "account-picture-button", "account-name-input",
    "account-photo-file", "account-photo-file-avatar"];
  get("account-profile-dialog").querySelectorAll = selector => controlIds
    .filter(id => !selector.includes(":not") || !["account-close", "account-edit-cancel"].includes(id)).map(get);
  const account = {playerId:42,name:"Mobile",avatar,chips:3000};
  const context = vm.createContext({
    document: {getElementById: get, querySelector: () => opener, createElement: element},
    localStorage: {getItem: key => key.endsWith("accountProfile") ? JSON.stringify(account) : "test-token"},
    window: {addEventListener(){}, dispatchEvent(){}},
    CustomEvent: class {}, URL, AbortController,
    setTimeout: callback => { const id = {}; timers.set(id, callback); return id; },
    clearTimeout: id => timers.delete(id),
    trackRank: (node,id) => ranked.push([node,id]), refreshRanks: async()=>{},
    syncWalletResponse(){}, normalizeNickname: name=>name, nicknameError: ()=>null,
    loadGestures: () => Promise.reject(Error("asset returned 404")),
    apiFetch: async(_url, options)=> options?.method === "PUT" && put ? put(options) :
      ({ok:true,headers:{get:()=>"application/json"},json:async()=>({account})}),
  });
  vm.runInContext(source, context);
  await new Promise(resolve => setImmediate(resolve));
  return {opener, ranked, get, timers, account};
}

test("profile still opens and restores its photo and rank targets when touch assets fail", async () => {
  const {opener, ranked, get} = await profileUI();
  assert.equal(opener.children[0].src, avatar);
  assert.ok(ranked.some(([node,id])=>node===opener&&id===42));
  assert.ok(ranked.some(([node,id])=>node===get("account-picture-button")&&id===42));
  await opener.listeners.click();
  assert.equal(get("account-profile-dialog").open, true);
  assert.equal(get("account-avatar").src, avatar);
  assert.equal(get("account-avatar").hidden, false);
  assert.equal(get("account-edit").disabled, false);
  assert.equal(get("account-player-chips").textContent, "3,000");
});

test("both native photo inputs prepare editing without preventing their picker activation", async () => {
  const {get,opener} = await profileUI();
  await opener.listeners.click();
  for (const id of ["account-photo-file-avatar", "account-photo-file"]) {
    let prevented = false;
    get(id).listeners.click({preventDefault(){prevented=true;}});
    assert.equal(prevented,false);
    assert.equal(get("account-edit-form").hidden,false);
    assert.equal(get(id).disabled,false);
    assert.equal(typeof get(id).listeners.change,"function");
    get("account-edit-cancel").listeners.click();
    assert.equal(get("account-edit-form").hidden,true);
  }
});

test("a stalled profile save times out, restores editing controls, and can be retried", async () => {
  let stalled = true, sent;
  const ui = await profileUI({put: options => {
    sent = JSON.parse(options.body);
    return stalled ? new Promise(()=>{}) :
      {ok:true,headers:{get:()=>"application/json"},json:async()=>({account:{...ui.account,...sent}})};
  }});
  const {get, opener, timers} = ui;
  await opener.listeners.click(); get("account-edit").listeners.click();
  const pending = get("account-edit-form").listeners.submit({preventDefault(){}});
  assert.equal(get("account-photo-select").disabled, true);
  assert.equal(get("account-close").disabled, false);
  assert.equal(get("account-edit-cancel").disabled, false);
  assert.equal(timers.size, 1);
  [...timers.values()][0](); await pending;
  assert.equal(get("account-photo-select").disabled, false);
  assert.equal(get("account-edit-save").disabled, false);
  assert.equal(get("account-edit-form").hidden, false);
  assert.equal(get("account-avatar").src, avatar);
  assert.match(get("account-profile-status").textContent, /通信/);
  stalled = false;
  await get("account-edit-form").listeners.submit({preventDefault(){}});
  assert.equal(get("account-edit-form").hidden, true);
  assert.equal(sent.avatar, avatar);
  assert.equal(timers.size, 0);
});

test("cancel and close abort stalled saves; late responses cannot replace the restored profile", async () => {
  for (const action of ["account-close", "account-edit-cancel"]) {
    let resolveSave, signal;
    const {get,opener,timers} = await profileUI({put: options=>{
      signal = options.signal;
      return new Promise(resolve=>{resolveSave=resolve;});
    }});
    await opener.listeners.click(); get("account-edit").listeners.click();
    get("account-name-input").value="Changed";
    const pending = get("account-edit-form").listeners.submit({preventDefault(){}});
    get(action).listeners.click(); await pending;
    assert.equal(signal.aborted, true);
    assert.equal(get("account-edit").disabled, false);
    assert.equal(get("account-edit-form").hidden, true);
    assert.equal(timers.size, 0);
    resolveSave({ok:true,headers:{get:()=>"application/json"},json:async()=>({account:{playerId:42,name:"Changed",chips:3000}})});
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(get("account-player-name").textContent,"Mobile");
    if (action === "account-close") assert.equal(get("account-profile-dialog").open,false);
  }
});
