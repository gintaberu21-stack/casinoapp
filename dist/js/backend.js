import { showBackendLoading } from "./backend-loading.js";
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
  const loading = showBackendLoading();
  const minimumDisplay = new Promise((resolve) => setTimeout(resolve, 700));
  let attempts = 0;
  for (;;) {
    try {
      const response = await fetch(backendUrl("/healthz"), {
        cache: "no-store", signal: AbortSignal.timeout(10000),
      });
      if (response.ok && (await response.json()).ok === true) break;
    } catch { /* A sleeping server may return HTML or time out. */ }
    if (++attempts >= 6) loading.delayed();
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  await minimumDisplay;
  loading.close();
}

export async function apiFetch(path, options) {
  await waitForBackend();
  return fetch(backendUrl(path), options);
}

if (BACKEND_URL) void waitForBackend();
