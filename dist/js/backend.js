import { BACKEND_URL } from "./backend-config.js";

export const backendUrl = (path) => new URL(path, BACKEND_URL || location.origin).href;
export function websocketUrl() {
  const url = new URL(backendUrl("/ws"));
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.href;
}

let ready;
export function waitForBackend() {
  if (!ready) ready = connect();
  return ready;
}
async function connect() {
  const status = document.createElement("div");
  status.setAttribute("role", "status");
  status.style.cssText = "position:fixed;bottom:18px;left:50%;transform:translateX(-50%);z-index:2147483647;padding:12px 20px;border:1px solid #c6a45c;border-radius:12px;background:#23121ff2;color:#fff8e8;font:14px system-ui;max-width:90vw;text-align:center;pointer-events:none";
  status.textContent = "サーバーに接続中… 初回は1分ほどかかる場合があります";
  document.body.append(status);
  let attempts = 0;
  for (;;) {
    try {
      const response = await fetch(backendUrl("/healthz"), {
        cache: "no-store", signal: AbortSignal.timeout(10000),
      });
      if (response.ok && (await response.json()).ok === true) break;
    } catch { /* A sleeping server may return HTML or time out. */ }
    if (++attempts >= 6) status.textContent = "接続に時間がかかっています。自動で再接続しています…";
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  status.remove();
}

export async function apiFetch(path, options) {
  await waitForBackend();
  return fetch(backendUrl(path), options);
}

if (BACKEND_URL) void waitForBackend();
