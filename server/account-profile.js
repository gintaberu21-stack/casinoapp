import { normalizeNickname, nicknameError } from "../dist/js/nickname.js";

export function accountProfileChanges(body = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("プロフィール情報が正しくありません。");
  const name = typeof body.name === "string" ? normalizeNickname(body.name) : "";
  const error = nicknameError(name);
  if (error) throw new Error(error);
  const changes = { name };
  if (Object.hasOwn(body, "avatar")) {
    if (body.avatar === null || body.avatar === "") changes.avatar = null;
    else {
      if (typeof body.avatar !== "string" || body.avatar.length > 140000 ||
          !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(body.avatar))
        throw new Error("写真を選び直してください。");
      const encoded = body.avatar.slice("data:image/jpeg;base64,".length);
      const bytes = Buffer.from(encoded, "base64");
      if (bytes.length > 100 * 1024 || bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8 ||
          bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9 || bytes.toString("base64") !== encoded)
        throw new Error("写真の形式またはサイズが正しくありません。");
      changes.avatar = body.avatar;
    }
  }
  return changes;
}
