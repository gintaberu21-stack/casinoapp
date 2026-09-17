import { MongoClient } from "mongodb";

let client = null;
let database = null;

/** MONGODB_URIが無いときはnullを返し、呼び出し側はメモリ保存にフォールバックする。 */
export async function connect(uri) {
  if (!uri) return null;
  client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
  await client.connect();
  database = client.db(process.env.MONGODB_DB || "casino_duel");
  await database.collection("players").createIndex({ playerId: 1 }, { unique: true });
  await database.collection("matches").createIndex({ finishedAt: -1 });
  return database;
}

export function getDatabase() {
  return database;
}

export async function close() {
  await client?.close();
  client = null;
  database = null;
}
