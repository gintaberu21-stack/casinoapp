export const MAX_NICKNAME_LENGTH = 8;
export const normalizeNickname = value => String(value ?? "").trim().replace(/[<>]/g, "");
export function nicknameError(value) {
  const name = normalizeNickname(value);
  if (!name) return "ニックネームを入力してください。";
  if (Array.from(name).length > MAX_NICKNAME_LENGTH) return "ニックネームは8文字以下で入力してください。";
  return "";
}
