import crypto from "node:crypto";

const COOKIE_NAME = "casino_duel_access";

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function parseCookies(header = "") {
  return Object.fromEntries(header.split(";").map((part) => {
    const index = part.indexOf("=");
    if (index < 0) return [part.trim(), ""];
    return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1))];
  }).filter(([key]) => key));
}

export function createAccessGate({ code = "", secret = "" } = {}) {
  const enabled = Boolean(code);
  const signingSecret = secret || code;
  const token = enabled
    ? crypto.createHmac("sha256", signingSecret).update(`casino-duel:${code}`).digest("hex")
    : "";

  const authorized = (request) => {
    if (!enabled) return true;
    return safeEqual(parseCookies(request.headers.cookie)[COOKIE_NAME] ?? "", token);
  };

  const page = (invalid = false) => `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>CASINO DUEL — PRIVATE TABLE</title><style>
*{box-sizing:border-box}body{margin:0;min-height:100svh;display:grid;place-items:center;background:radial-gradient(circle at 50% 20%,#173f36,#071713 66%);color:#fff8e8;font-family:system-ui,sans-serif}.gate{width:min(90vw,390px);padding:34px 28px;border:1px solid #c6a45c;border-radius:20px;text-align:center;background:#071b17ee;box-shadow:0 24px 80px #0008}.mark{font-size:42px;color:#e0bd69}.kicker{letter-spacing:.28em;color:#c6a45c;font-size:11px}h1{margin:6px 0;font-family:Georgia,serif;letter-spacing:.08em}.note{color:#bac8c2;font-size:13px;line-height:1.7}.error{color:#ff8b91;font-weight:700}input,button{width:100%;height:52px;border-radius:12px;font-size:16px}input{margin:18px 0 10px;padding:0 16px;color:#fff;background:#04100e;border:1px solid #49655d;text-align:center;letter-spacing:.12em}button{border:1px solid #f1d48d;background:linear-gradient(#d1ae60,#987330);color:#10201b;font-weight:900;letter-spacing:.12em}
</style></head><body><main class="gate"><div class="mark">♠</div><div class="kicker">INVITATION ONLY</div><h1>CASINO DUEL</h1><p class="note">共有された合言葉を入力してください。</p>${invalid ? '<p class="error">合言葉が違います</p>' : ""}<form method="post" action="/access"><input name="code" type="password" autocomplete="current-password" required autofocus placeholder="合言葉"><button type="submit">ENTER THE TABLE</button></form></main></body></html>`;

  return {
    enabled,
    authorized,
    showPage(_request, response) { response.type("html").send(page(false)); },
    submit(request, response) {
      if (!enabled || safeEqual(request.body?.code ?? "", code)) {
        response.setHeader("Set-Cookie", `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=604800`);
        response.redirect("/");
        return;
      }
      response.status(401).type("html").send(page(true));
    },
    middleware(request, response, next) {
      if (authorized(request)) { next(); return; }
      response.redirect(303, "/access");
    },
  };
}
