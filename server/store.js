import { roundChips, valueToInventory } from "../dist/js/game.js";
const COUNTER_ID = "playerId";

/**
 * 待機中プレイヤーと試合結果の保存先。
 * MongoDBがあればそちらを、無ければプロセス内メモリを使う（ローカル確認用）。
 */
export class Store {
  constructor(database) {
    this.database = database ?? null;
    this.memory = { counter: 0, players: new Map(), accounts: new Map(), matches: [] };
  }

  get usesMongo() {
    return Boolean(this.database);
  }

  /** 連番のプレイヤーID。最初の人が1番、次の人が2番。 */
  async nextPlayerId() {
    if (!this.usesMongo) {
      this.memory.counter += 1;
      return this.memory.counter;
    }
    // includeResultMetadataを明示しないとドライバの版で戻り値の形が変わるので固定する。
    const document = await this.database
      .collection("counters")
      .findOneAndUpdate(
        { _id: COUNTER_ID },
        { $inc: { value: 1 } },
        { upsert: true, returnDocument: "after", includeResultMetadata: false },
      );
    const next = Number(document?.value);
    return Number.isInteger(next) && next > 0 ? next : 1;
  }

  /** 誰もいなくなったら採番をリセットして、またIDを1番から配る。 */
  async resetCounter() {
    if (!this.usesMongo) {
      this.memory.counter = 0;
      return;
    }
    await this.database
      .collection("counters")
      .updateOne({ _id: COUNTER_ID }, { $set: { value: 0 } }, { upsert: true });
  }

  async normalizeAccount(account) {
    if (!account) return null;
    const chips = roundChips(account.chips);
    const debt = roundChips(account.debt);
    if (chips !== account.chips || debt !== account.debt || account.inventory?.white) {
      const changes = { chips, debt, inventory: valueToInventory(chips) };
      await this.updateAccount(account.playerId, changes);
      return { ...account, ...changes };
    }
    return account;
  }

  async findAccount(accountKey) {
    const account = !this.usesMongo
      ? this.memory.accounts.get(accountKey) ?? null
      : await this.database.collection("accounts").findOne({ accountKey }, { projection: { _id: 0 } });
    return this.normalizeAccount(account);
  }

  async findAccountById(playerId) {
    const account = !this.usesMongo
      ? [...this.memory.accounts.values()].find((account) => account.playerId === playerId) ?? null
      : await this.database.collection("accounts").findOne({ playerId }, { projection: { _id: 0 } });
    return this.normalizeAccount(account);
  }

  async createAccount(accountKey, nickname) {
    const existing = await this.findAccount(accountKey);
    if (existing) return existing;
    const now = new Date();
    const account = {
      accountKey,
      playerId: await this.nextPlayerId(),
      name: nickname,
      chips: 3000,
      inventory: { red: 5, blue: 3, black: 1 },
      debt: 0,
      bet: { amount: 100, multiplier: 1 },
      gainedChips: 0,
      gainedByGame: { blackjack: 0, roulette: 0, slot: 0 },
      stats: { matches: 0, wins: 0, losses: 0, draws: 0 },
      createdAt: now,
      updatedAt: now,
    };
    if (!this.usesMongo) this.memory.accounts.set(accountKey, account);
    else await this.database.collection("accounts").insertOne(account);
    return { ...account };
  }

  async updateAccount(playerId, changes) {
    const safe = { ...changes, updatedAt: new Date() };
    if (Object.hasOwn(changes, "chips")) {
      safe.chips = roundChips(changes.chips);
      if (safe.chips !== changes.chips) safe.inventory = valueToInventory(safe.chips);
    }
    if (Object.hasOwn(changes, "debt")) safe.debt = roundChips(changes.debt);
    if (!this.usesMongo) {
      const account = [...this.memory.accounts.values()].find((entry) => entry.playerId === playerId);
      if (account) Object.assign(account, safe);
      return account ? { ...account } : null;
    }
    return this.database
      .collection("accounts")
      .findOneAndUpdate(
        { playerId },
        { $set: safe },
        { returnDocument: "after", includeResultMetadata: false, projection: { _id: 0 } },
      );
  }

  async recordChipGain(playerId, amount, eventId, game) {
    if (!Number.isSafeInteger(amount) || amount < 0 ||
        typeof eventId !== "string" || eventId.length > 160 ||
        !["blackjack", "roulette", "slot"].includes(game)) return null;
    const id = `${game}:${eventId}`;
    if (!this.usesMongo) {
      const account = [...this.memory.accounts.values()].find(item => item.playerId === playerId);
      if (!account) return null;
      account.gainEventIds ??= [];
      if (!account.gainEventIds.includes(id)) {
        account.gainEventIds.push(id);
        account.gainedChips = (account.gainedChips ?? 0) + amount;
        account.gainedByGame ??= {};
        account.gainedByGame[game] = (account.gainedByGame[game] ?? 0) + amount;
        account.updatedAt = new Date();
      }
      return { ...account };
    }
    const account = await this.database.collection("accounts").findOneAndUpdate(
      { playerId, gainEventIds: { $ne: id } },
      { $inc: { gainedChips: amount, [`gainedByGame.${game}`]: amount },
        $addToSet: { gainEventIds: id }, $set: { updatedAt: new Date() } },
      { returnDocument: "after", includeResultMetadata: false, projection: { _id: 0 } },
    );
    return account ?? this.findAccountById(playerId);
  }

  async leaderboard() {
    const accounts = this.usesMongo
      ? await this.database.collection("accounts")
          .find({}, { projection: { _id: 0, playerId: 1, name: 1, chips: 1 } }).toArray()
      : [...this.memory.accounts.values()];
    return accounts
      .map(account => ({ playerId: account.playerId, name: account.name,
        chips: Math.max(0, Number(account.chips) || 0) }))
      .sort((a, b) => b.chips - a.chips || a.playerId - b.playerId)
      .map((account, index) => ({ rank: index + 1, ...account }));
  }

  async recordOutcome(playerId, outcome) {
    const field = outcome === "win" ? "wins" : outcome === "loss" ? "losses" : "draws";
    if (!this.usesMongo) {
      const account = await this.findAccountById(playerId);
      if (!account) return null;
      account.stats ??= { matches: 0, wins: 0, losses: 0, draws: 0 };
      account.stats.matches += 1;
      account.stats[field] += 1;
      account.updatedAt = new Date();
      return { ...account };
    }
    return this.database
      .collection("accounts")
      .findOneAndUpdate(
        { playerId },
        { $inc: { "stats.matches": 1, [`stats.${field}`]: 1 }, $set: { updatedAt: new Date() } },
        { returnDocument: "after", includeResultMetadata: false, projection: { _id: 0 } },
      );
  }

  async addPlayer(player) {
    if (!this.usesMongo) {
      this.memory.players.set(player.playerId, player);
      return;
    }
    await this.database
      .collection("players")
      .updateOne({ playerId: player.playerId }, { $set: player }, { upsert: true });
  }

  async setStatus(playerId, status, peerId = null) {
    if (!this.usesMongo) {
      const player = this.memory.players.get(playerId);
      if (player) Object.assign(player, { status, peerId });
      return;
    }
    await this.database.collection("players").updateOne({ playerId }, { $set: { status, peerId } });
  }

  async updatePlayerProfile(playerId, profile) {
    if (!this.usesMongo) {
      const player = this.memory.players.get(playerId);
      if (player) Object.assign(player, profile);
      return;
    }
    await this.database.collection("players").updateOne({ playerId }, { $set: profile });
  }

  async removePlayer(playerId) {
    if (!this.usesMongo) {
      this.memory.players.delete(playerId);
      return;
    }
    await this.database.collection("players").deleteOne({ playerId });
  }

  async clearPlayers() {
    if (!this.usesMongo) this.memory.players.clear();
    else await this.database.collection("players").deleteMany({});
  }

  async listPlayers() {
    if (!this.usesMongo)
      return [...this.memory.players.values()].sort((a, b) => a.playerId - b.playerId);
    return this.database
      .collection("players")
      .find({}, { projection: { _id: 0 } })
      .sort({ playerId: 1 })
      .toArray();
  }

  async countPlayers() {
    if (!this.usesMongo) return this.memory.players.size;
    return this.database.collection("players").countDocuments();
  }

  /** 終わった試合の記録。文化祭の集計に使えるように残しておく。 */
  async saveMatch(record) {
    const entry = { ...record, finishedAt: new Date() };
    if (!this.usesMongo) {
      this.memory.matches.unshift(entry);
      this.memory.matches.length = Math.min(this.memory.matches.length, 100);
      return;
    }
    await this.database.collection("matches").insertOne(entry);
  }

  async recentMatches(limit = 20) {
    if (!this.usesMongo) return this.memory.matches.slice(0, limit);
    return this.database
      .collection("matches")
      .find({}, { projection: { _id: 0 } })
      .sort({ finishedAt: -1 })
      .limit(limit)
      .toArray();
  }
}
