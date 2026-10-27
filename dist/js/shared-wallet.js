const PROFILE_KEY = "casinoDuel.accountProfile";
export function cachedWalletBalance() {
  try {
    const account = JSON.parse(localStorage.getItem(PROFILE_KEY));
    return Number.isFinite(account?.chips) ? account.chips : null;
  } catch { return null; }
}
export function syncWalletResponse(data) {
  const balance = data?.account?.chips ?? data?.balance;
  if (!Number.isFinite(balance)) return null;
  try {
    const previous = JSON.parse(localStorage.getItem(PROFILE_KEY)) ?? {};
    localStorage.setItem(PROFILE_KEY, JSON.stringify({ ...previous, ...data.account, chips: balance }));
  } catch { /* A storage failure must not change the server balance. */ }
  return balance;
}
