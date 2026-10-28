import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
const source = readFileSync(new URL("../server/index.js", import.meta.url), "utf8");
const start = source.indexOf("const frontendOrigins =");
const end = source.indexOf('app.get("/healthz"', start);
function preflight(origin) {
  let middleware;
  vm.runInNewContext(source.slice(start,end), {
    process: {env:{FRONTEND_ORIGINS:"https://royal-play.example"}},
    app: {use: fn => {middleware=fn;}}
  });
  const headers={}; let status;
  middleware({method:"OPTIONS",get:()=>origin}, {
    vary(){},setHeader:(key,value)=>{headers[key]=value;},sendStatus:code=>{status=code;}
  },()=>{throw Error("preflight must stop before routes");});
  return {headers,status};
}
test("public frontend can preflight a profile PUT with authorization and JSON",()=>{
  const {headers,status}=preflight("https://royal-play.example");
  assert.equal(status,204);
  assert.equal(headers["Access-Control-Allow-Origin"],"https://royal-play.example");
  assert.ok(headers["Access-Control-Allow-Methods"].split(/,\s*/).includes("PUT"));
  assert.match(headers["Access-Control-Allow-Headers"],/Authorization/);
  assert.match(headers["Access-Control-Allow-Headers"],/Content-Type/);
});
test("unapproved origins stay blocked",()=>{
  const {headers,status}=preflight("https://unapproved.example");
  assert.equal(status,403);
  assert.equal(headers["Access-Control-Allow-Origin"],undefined);
});