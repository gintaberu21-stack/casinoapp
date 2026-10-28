import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,readFile,rm,mkdir} from "node:fs/promises";
import {tmpdir} from "node:os";
import path from "node:path";
import {Store} from "../server/store.js";
test("local profiles and chips survive server recreation; photo removal is persisted",async()=>{
 const base=path.resolve(".data/test"); await mkdir(base,{recursive:true});
 const dir=await mkdtemp(path.join(base,"royal-local-"));
 try {
  const file=path.join(dir,"accounts.json");const first=new Store(null);await first.enableLocalPersistence(file);
  const account=await first.createAccount("hashed-account","Player");
  await first.updateAccount(account.playerId,{avatar:"data:image/jpeg;base64,/9j/2Q==",chips:1700});
  const second=new Store(null);await second.enableLocalPersistence(file);
  const loaded=await second.findAccount("hashed-account");
  assert.equal(loaded.avatar,"data:image/jpeg;base64,/9j/2Q==");assert.equal(loaded.chips,1700);
  assert.ok((await second.createAccount("another","Other")).playerId>account.playerId);
  await second.updateAccount(account.playerId,{avatar:null});
  const third=new Store(null);await third.enableLocalPersistence(file);
  assert.equal((await third.findAccount("hashed-account")).avatar,null);
  assert.equal(JSON.parse(await readFile(file,"utf8")).accounts.length,2);
 }finally{await rm(dir,{recursive:true,force:true});}
});