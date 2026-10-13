import { MatchService } from "./match.js";

const service = new MatchService();
const dialog = document.getElementById("lobby-account");
const form = document.getElementById("lobby-account-form");
const input = document.getElementById("lobby-name");
const submit = document.getElementById("lobby-register");
const error = document.getElementById("lobby-account-error");
const wallet = document.getElementById("lobby-wallet");
const lobby = document.querySelector("main");
let ready = false;
// The lobby only needs one account snapshot, not a multiplayer presence.
// Keeping its socket open displaces the same account in another game/tab.
const retryConnection = service.scheduleRetry.bind(service);
service.scheduleRetry = () => {
  if (!ready) retryConnection();
};

function requireAccount() {
  ready = false;
  lobby.inert = true;
  submit.disabled = false;
  submit.textContent = "アカウントを作成";
  if (!dialog.open) dialog.showModal();
  input.focus();
}
function render() {
  const account = service.account;
  if (!account) return;
  const name = document.createElement("span");
  name.className = "lobby-wallet-name";
  name.textContent = account.name;
  const chips = document.createElement("span");
  chips.className = "lobby-wallet-chips";
  chips.textContent = `${Number(account.chips ?? 0).toLocaleString("ja-JP")} CHIP`;
  wallet.replaceChildren(name, chips);
  wallet.title = `${account.name} / ${chips.textContent}`;
}
dialog.addEventListener("cancel", (event) => event.preventDefault());
service.addEventListener("account", render);
service.addEventListener("welcome", () => {
  ready = true;
  lobby.inert = false;
  dialog.close();
  error.textContent = "";
  render();
  clearTimeout(service.retryTimer);
  service.socket?.close();
});
service.addEventListener("accountRequired", requireAccount);
service.addEventListener("accountError", (event) => {
  requireAccount();
  error.textContent = event.detail.message ?? "登録できませんでした";
});
service.addEventListener("connection", (event) => {
  if (!event.detail.connected) {
    if (ready) return;
    if (dialog.open) error.textContent = "接続を待っています。自動的に再接続します。";
    else wallet.textContent = "再接続中…";
  }
});
form.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = input.value.trim().replace(/[<>]/g, "");
  if (!name) {
    error.textContent = "ニックネームを入力してください";
    return;
  }
  error.textContent = "アカウントを登録しています…";
  submit.disabled = true;
  submit.textContent = "登録中…";
  // Keep a token from an interrupted registration instead of creating a second account.
  if (service.token) {
    service.account = { ...service.account, name };
    localStorage.setItem("casinoDuel.accountProfile", JSON.stringify(service.account));
    service.send({ type: "join", token: service.token, nickname: name });
    service.join();
  } else service.register(name);
});
document.querySelectorAll(".blackjack-entry,.roulette-entry").forEach((link) => {
  link.addEventListener("click", (event) => {
    if (!ready) {
      event.preventDefault();
      if (!service.token) requireAccount();
      else wallet.textContent = "接続を確認しています…";
    }
  });
});
if (!service.token) requireAccount();
else {
  render();
  service.join();
}
window.addEventListener("pageshow", (event) => {
  if (event.persisted) {
    ready = false;
    service.join();
  }
});
