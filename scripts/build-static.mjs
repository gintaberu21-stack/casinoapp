import { cp, mkdir, writeFile } from "node:fs/promises";
const url = new URL(process.env.BACKEND_URL || "");
if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash)
  throw new Error("BACKEND_URL must be the HTTPS origin of the existing Render Web Service");
await mkdir("static-site", { recursive: true });
await cp("dist", "static-site", { recursive: true });
await writeFile("static-site/js/backend-config.js", `export const BACKEND_URL = ${JSON.stringify(url.origin)};\n`);
