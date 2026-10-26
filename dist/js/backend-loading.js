// A modal lives in the browser's top layer, above account dialogs and page content.
export function showBackendLoading() {
  const style = document.createElement("style");
  style.textContent = `
    .backend-loading { position:fixed; inset:0; width:100vw; height:100dvh;
      max-width:none; max-height:none; box-sizing:border-box; margin:0; border:0; outline:0; border-radius:0;
      padding:24px; color:#fff3db; background:radial-gradient(ellipse at 50% 35%,#54182c,#190910 75%);
      font-family:system-ui,sans-serif; text-align:center; }
    .backend-loading[open] { display:grid; place-content:center; justify-items:center; gap:24px; }
    .backend-loading::backdrop { background:#190910; }
    .backend-loading h2 { margin:0; color:#f3d58a; font:700 clamp(30px,7vw,52px) Georgia,serif; letter-spacing:.13em; }
    .backend-loading p { margin:0; line-height:1.8; font-size:14px; max-width:30em; }
    .backend-loading small { color:#c9acae; font-size:12px; }
    .backend-loading-spinner { width:42px; height:42px; border:2px solid #d4af5733;
      border-top-color:#f3d58a; border-radius:50%; animation:backend-spin 1s linear infinite !important; }
    @keyframes backend-spin { to { transform:rotate(360deg); } }
    @media(prefers-reduced-motion:reduce) {
      .backend-loading .backend-loading-spinner { animation-duration:2.4s !important; }
    }
  `;
  document.head.append(style);
  const overlay = document.createElement("dialog");
  overlay.className = "backend-loading";
  overlay.setAttribute("aria-label", "ROYAL PLAY 読み込み中");
  overlay.innerHTML = `<h2>ROYAL PLAY</h2><span class="backend-loading-spinner" aria-hidden="true"></span>
    <p role="status" aria-live="polite">サーバーに接続中…</p>
    <small>初回は1分ほどかかる場合があります</small>`;
  overlay.addEventListener("cancel", (event) => event.preventDefault());
  document.body.append(overlay);
  overlay.showModal();
  return {
    delayed() {
      overlay.querySelector('[role="status"]').textContent = "接続に時間がかかっています。自動で再接続しています…";
    },
    close() { overlay.close(); overlay.remove(); style.remove(); },
  };
}
