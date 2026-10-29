import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

// Reproduce a browser that has the pre-win-rate game-records module cached.
// Link the real module graphs without evaluating DOM or WebSocket side effects.
const checkGraph = `
import { SourceTextModule } from 'node:vm';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const [entry, legacy] = process.argv.slice(1);
const modules = new Map();
function load(url) {
  if (modules.has(url.href)) return modules.get(url.href);
  let source = readFileSync(url, 'utf8');
  if (url.pathname.endsWith('/game-records.js') && !url.search) {
    source = source.replace('export function localWinRate', 'function localWinRate');
  }
  if (legacy === 'yes') source = source.replaceAll('./game-records.js?v=local-win-rate-1', './game-records.js');
  const module = new SourceTextModule(source, { identifier: url.href });
  modules.set(url.href, module);
  return module;
}
const root = load(pathToFileURL(path.resolve(entry)));
await root.link((specifier, referencing) => load(new URL(specifier, referencing.identifier)));
`;

for (const entry of ["dist/js/shared-footer.js", "dist/js/app.js"]) {
  test(`${entry} links when the old records module is cached`, () => {
    const run = (legacy) => execFileSync(process.execPath,
      ["--experimental-vm-modules", "--input-type=module", "-e", checkGraph, entry, legacy],
      { encoding: "utf8", windowsHide: true, stdio: "pipe" });
    assert.throws(() => run("yes"), /does not provide an export named 'localWinRate'/);
    assert.doesNotThrow(() => run("no"));
  });
}
