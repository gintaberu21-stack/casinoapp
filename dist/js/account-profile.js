import { trackRank, refreshRanks } from "./rank-decoration.js";
import { normalizeNickname, nicknameError } from "./nickname.js";
import { apiFetch } from "./backend.js";
import { syncWalletResponse } from "./shared-wallet.js";

export function avatarCrop(width, height, zoom = 1, x = 0, y = 0) {
  const size = Math.min(width, height) / Math.max(1, Math.min(3, zoom));
  return { sx: (width - size) * (Math.max(-100, Math.min(100, x)) + 100) / 200,
    sy: (height - size) * (Math.max(-100, Math.min(100, y)) + 100) / 200, size };
}
const dialog = document.getElementById("account-profile-dialog");
if (dialog) {
  const $ = id => document.getElementById(id);
  const opener = document.querySelector('[data-info="profile"]');
  const status = $("account-profile-status");
  let account = null, editing = false, saving = false, draftAvatar = null, image = null, objectUrl = null;
  let loadVersion = 0;
  function cachedAccount() {
    try { return JSON.parse(localStorage.getItem("casinoDuel.accountProfile")); } catch { return null; }
  }
  function showAvatar(avatar) {
    $("account-avatar").hidden = !avatar;
    $("account-avatar-default").hidden = Boolean(avatar);
    if (avatar) $("account-avatar").src = avatar;
    else $("account-avatar").removeAttribute("src");
  }
  function updateHeader(current) {
    let icon = opener.querySelector(":scope > img");
    if (current?.avatar) {
      if (!icon) { icon = document.createElement("img"); icon.alt = "アカウント"; opener.append(icon); }
      icon.src = current.avatar;
    } else icon?.remove();
  }
  function render(current = cachedAccount()) {
    account = current;
    updateHeader(current);
    trackRank(opener, current?.playerId);
    trackRank($("account-picture-button"), current?.playerId);
    $("account-player-name").textContent = current?.name ?? "プレイヤー";
    $("account-player-id").textContent = current?.playerId ?? "—";
    $("account-player-chips").textContent = Number(current?.chips ?? 0).toLocaleString("ja-JP");
    $("account-edit").disabled = !current?.playerId || editing;
    if (!editing) showAvatar(current?.avatar);
  }
  function releaseImage() {
    loadVersion++;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = null; image = null;
    $("account-photo-file").value = "";
  }
  function setEditing(value) {
    editing = value;
    $("account-edit-form").hidden = !value;
    $("account-player-name").hidden = value;
    $("account-name-field").hidden = !value;
    $("account-picture-hint").hidden = !value;
    $("account-picture-button").disabled = !account?.playerId;
    $("account-edit").disabled = value || !account?.playerId;
    $("account-photo-crop").hidden = true;
    $("account-name-input").value = account?.name ?? "";
    draftAvatar = account?.avatar ?? null;
    status.textContent = "";
    status.classList.remove("is-error");
    $("account-name-input").removeAttribute("aria-invalid");
    releaseImage();
    showAvatar(draftAvatar);
    if (value) $("account-name-input").focus();
  }
  function commit(current) {
    syncWalletResponse({ account: current });
    window.dispatchEvent(new CustomEvent("casino:profile-updated", { detail: current }));
    render(current);
  }
  async function request(method, body) {
    const token = localStorage.getItem("casinoDuel.accountToken");
    if (!token) throw Error("ホーム画面でアカウントにログインしてください。");
    const response = await apiFetch("/api/account", {
      method, headers: { Authorization: "Bearer " + token, ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: "no-store",
    });
    if (!response.headers.get("content-type")?.includes("application/json"))
      throw Error("サーバーの更新が必要です。再起動後にもう一度お試しください。");
    const data = await response.json();
    if (!response.ok) throw Error(data.error ?? "保存できませんでした。");
    return data.account;
  }
  opener.addEventListener("click", async () => {
    render(); setEditing(false); dialog.showModal();
    try { const latest = await request("GET"); if (!editing) commit(latest); }
    catch (error) { status.textContent = error.message; }
  });
  $("account-edit").addEventListener("click", () => setEditing(true));
  $("account-edit-cancel").addEventListener("click", () => { setEditing(false); render(account); });
  function close() { if (saving) return; setEditing(false); dialog.close(); }
  $("account-close").addEventListener("click", close);
  dialog.addEventListener("cancel", event => { event.preventDefault(); close(); });
  dialog.addEventListener("click", event => { if (event.target === dialog) close(); });
  function choosePhoto() {
    if (saving || !account?.playerId) return;
    if (!editing) setEditing(true);
    $("account-photo-file").click();
  }
  $("account-picture-button").addEventListener("click", choosePhoto);
  $("account-photo-select").addEventListener("click", choosePhoto);
  function redraw() {
    if (!image) return;
    const crop = avatarCrop(image.naturalWidth, image.naturalHeight,
      Number($("account-photo-zoom").value), Number($("account-photo-x").value), Number($("account-photo-y").value));
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    const context = canvas.getContext("2d");
    context.fillStyle = "#211117";
    context.fillRect(0, 0, 256, 256);
    context.drawImage(image, crop.sx, crop.sy, crop.size, crop.size, 0, 0, 256, 256);
    draftAvatar = canvas.toDataURL("image/jpeg", 0.85);
    showAvatar(draftAvatar);
  }
  $("account-photo-file").addEventListener("change", async () => {
    const file = $("account-photo-file").files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 20 * 1024 * 1024) {
      status.textContent = "20MB以下の写真を選んでください。"; return;
    }
    releaseImage();
    const version = loadVersion;
    const preview = new Image();
    objectUrl = URL.createObjectURL(file);
    preview.src = objectUrl;
    status.textContent = "写真を読み込み中…";
    try {
      await preview.decode();
      if (version !== loadVersion || !editing) return;
      image = preview;
      $("account-photo-zoom").value = "1";
      $("account-photo-x").value = $("account-photo-y").value = "0";
      redraw();
      $("account-photo-crop").hidden = false;
      status.textContent = "写真の位置と大きさを調整して保存してください。";
    } catch { status.textContent = "写真を読み込めませんでした。別の写真を選んでください。"; }
  });
  for (const id of ["account-photo-zoom", "account-photo-x", "account-photo-y"])
    $(id).addEventListener("input", redraw);
  $("account-photo-remove").addEventListener("click", () => {
    releaseImage(); draftAvatar = null; showAvatar(null); $("account-photo-crop").hidden = true;
  });
  $("account-edit-form").addEventListener("submit", async event => {
    event.preventDefault();
    if (saving) return;
    const name = normalizeNickname($("account-name-input").value);
    const validation = nicknameError(name);
    if (validation) {
      status.textContent = validation;
      status.classList.add("is-error");
      $("account-name-input").setAttribute("aria-invalid", "true");
      return;
    }
    status.classList.remove("is-error");
    $("account-name-input").removeAttribute("aria-invalid");
    saving = true;
    const controls = dialog.querySelectorAll("button, input");
    controls.forEach(control => { control.disabled = true; });
    status.textContent = "保存中…";
    try {
      const updated = await request("PUT", { name, avatar: draftAvatar });
      editing = false; commit(updated); setEditing(false);
      status.textContent = "プロフィールを保存しました。";
    } catch (error) { status.textContent = error.message; status.classList.add("is-error"); }
    finally {
      saving = false;
      controls.forEach(control => { control.disabled = false; });
      $("account-edit").disabled = editing || !account?.playerId;
      $("account-picture-button").disabled = !account?.playerId;
    }
  });
  window.addEventListener("casino:account", event => { if (!editing) render(event.detail); });
  window.addEventListener("storage", event => {
    if (event.key === "casinoDuel.accountProfile" && !editing) render();
  });
  render();
  void refreshRanks();
}
