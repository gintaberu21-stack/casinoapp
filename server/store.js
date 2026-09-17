const COUNTER_ID = "playerId";

/**
 * 待機中プレイヤーと試合結果の保存先。
 * MongoDBがあればそちらを、無ければプロセス内メモリを使う（ローカル確認用）。
 */
export class Store {
  constructor(database) {
    this.database = database ?? null;
    this.memory = { counter: 0, players: new Map(), matches: [] };
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
    const result = await this.database.collection("counters").findOneAndUpdate(
      { _id: COUNTER_ID },
      { $inc: { value: 1 } },
      { upsert: true, returnDocument: "after" },
    );
    return result.value ?? result?.value?.value ?? 1;
  }

  /** 誰もいなくなったら採番をリセットして、またIDを1番から配る。 */
  async resetCounter() {
    if (!this.usesMongo) {
      this.memory.counter = 0;
      return;
    }
    await this.database.collection("counters").updateOne(
      { _id: COUNTER_ID },
      { $set: { value: 0 } },
      { upsert: true },
    );
  }

  async addPlayer(player) {
    if (!this.usesMongo) {
      this.memory.players.set(player.playerId, player);
      return;
    }
    await this.database.collection("players").updateOne(
      { playerId: player.playerId },
      { $set: player },
      { upsert: true },
    );
  }

  async setStatus(playerId, status, peerId = null) {
    if (!this.usesMongo) {
      const player = this.memory.players.get(playerId);
      if (player) Object.assign(player, { status, peerId });
      return;
    }
    await this.database.collection("players").updateOne({ playerId }, { $set: { status, peerId } });
  }

  async removePlayer(playerId) {
    if (!this.usesMongo) {
      this.memory.players.delete(playerId);
      return;
    }
    await this.database.collection("players").deleteOne({ playerId });
  }

  async listPlayers() {
    if (!this.usesMongo) return [...this.memory.players.values()].sort((a, b) => a.playerId - b.playerId);
    return this.database.collection("players").find({}, { projection: { _id: 0 } }).sort({ playerId: 1 }).toArray();
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
    return this.database.collection("matches").find({}, { projection: { _id: 0 } }).sort({ finishedAt: -1 }).limit(limit).toArray();
  }
}
