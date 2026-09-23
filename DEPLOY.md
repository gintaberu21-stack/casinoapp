# デプロイ手順（MongoDB Atlas + Render）

コードと設定はすべて用意済みです。GitHubリポジトリも設定済みです。

接続文字列はパスワードを含みます。**チャットに貼らず、Renderの画面に直接入力してください。**

---

## 1. GitHubへ最新版を反映する

`origin`はGitHubの`gintaberu21-stack/casinoapp`です。

```bash
git push origin main
```

`node_modules` と `.env` は `.gitignore` 済みなので上がりません。

---

## 2. MongoDB Atlas を用意する

1. https://cloud.mongodb.com にログイン
2. **Create** → **M0（無料）** を選択。リージョンは日本に近い `ap-northeast-1 (Tokyo)` などを選ぶ
3. **Database Access** → **Add New Database User**
   - 認証は Password、ユーザー名とパスワードを決める（**記号を避けると URL エンコード不要で楽**）
   - 権限は `Read and write to any database`
4. **Network Access** → **Add IP Address** → **Allow access from anywhere（0.0.0.0/0）**
   - Render は送信元IPが固定されないため、無料プランではこれが必要です
5. **Database** → **Connect** → **Drivers** → 表示される接続文字列をコピー

```
mongodb+srv://ユーザー名:パスワード@クラスタ名.xxxxx.mongodb.net/?retryWrites=true&w=majority
```

`<password>` の部分は手順3で決めたパスワードに置き換えます。

---

## 3. Render にデプロイする

1. https://dashboard.render.com → **New** → **Web Service**
2. **Build and deploy from a Git repository** → 手順1のリポジトリを選ぶ
   - 初回は GitHub との連携許可を求められます
3. 設定はリポジトリの `render.yaml` が持っているので、基本そのままでOK
   - Runtime: Node / Build: `npm install` / Start: `npm start`
   - Health Check Path: `/healthz`
   - Region: Singapore（`render.yaml` で指定済み）
4. **Environment** に環境変数を追加：

   | Key | Value |
   |---|---|
   | `MONGODB_URI` | 手順2でコピーした接続文字列 |
   | `MONGODB_DB` | `casino_duel` |

5. **Create Web Service** を押すとビルドとデプロイが始まります

---

## 4. 動作確認

デプロイ完了後、発行された URL（`https://casino-duel-xxxx.onrender.com` など）で確認します。

- `https://<URL>/healthz` を開いて `{"ok":true,"storage":"mongodb"}` と出れば **MongoDB接続まで成功**
  - `"storage":"memory"` の場合は `MONGODB_URI` が読めていません（環境変数のスペルか、Atlas の Network Access を確認）
- トップページが合言葉なしで直接開くことを確認します
- 「ふたりで対決」→ 右上に自分のIDが出れば **WebSocket接続も成功**
- **スマホ2台**で開き、片方のIDをもう片方で検索 → 申し込み → 承認 → 同じ部屋に入れることを確認

---

## 注意点

- **無料プランは15分アクセスが無いとスリープします。** 復帰に50秒ほどかかるため、文化祭の当日は開場前に一度アクセスして起こしておくか、有料プラン（$7/月）にしてください。
- スリープするとWebSocketも切れます。クライアントは2秒ごとに自動再接続しますが、IDは振り直しになります。
- 静的サイト（OpenAI Sites）側はもう不要です。Render が `dist` も配信します。並行運用する場合、Sites 側は WebSocket が無いのでマッチングは動きません。

---

## ローカルで動かす

```bash
npm install
npm start          # http://localhost:3000
npm run test:integration
```

`MONGODB_URI` を設定しなければメモリ保存で起動するので、DBなしで動作確認できます。
Atlas に繋いで試したい場合は `.env.example` を `.env` にコピーして接続文字列を入れてください。
