import test from "node:test";
import assert from "node:assert/strict";
import { nicknameError, normalizeNickname } from "../dist/js/nickname.js";
import { accountProfileChanges } from "../server/account-profile.js";
import { MatchService } from "../dist/js/match.js";

test("eight characters are accepted and nine are rejected without truncation", () => {
  for (const name of ["12345678", "あいうえおかきく", "😀".repeat(8)]) {
    assert.equal(nicknameError(name), "");
    assert.equal(accountProfileChanges({ name }).name, name);
  }
  for (const name of ["123456789", "あいうえおかきくけ", "😀".repeat(9)]) {
    assert.equal(nicknameError(name), "ニックネームは8文字以下で入力してください。");
    assert.throws(() => accountProfileChanges({ name }), /8文字以下/);
  }
  assert.equal(normalizeNickname("  そる  "), "そる");
});

test("registration and websocket renames reject overlong nicknames instead of shortening them", () => {
  let sent = 0, saved = 0;
  globalThis.localStorage = { setItem() { saved++; } };
  const service = Object.create(MatchService.prototype);
  service.socket = { readyState: 1 };
  service.send = () => sent++;
  assert.equal(service.register("123456789"), false);
  assert.equal(service.rename("123456789"), false);
  assert.equal(sent, 0);
  assert.equal(saved, 0);
  assert.equal(service.rename("12345678"), true);
  assert.equal(sent, 1);
});
