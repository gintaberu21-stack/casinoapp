# CASINO DUEL

専門学校の文化祭向けに制作中の、必殺技カード付きブラックジャックです。

## 現在の状態

スマホ2台のオンライン対戦まで実装済みです。Express + WebSocketのホスト権威方式で、ID検索、申し込み、承認、対戦開始、コイントス、ターン、手札、必殺技、チップ、ラウンド結果を同期します。オンライン対戦では両者が別々の金額と1〜3倍の倍率を選び、勝敗時の増減もそれぞれのベットで計算します。MongoDBがあれば在席と試合結果を保存し、ローカルではメモリ保存で動きます。文化祭向けの本番環境は、サインイン・合言葉なしでURLからすぐ遊べます。

ゲームは持ちチップ500からの全5ラウンド制です。8種類の必殺技カードを重複なしに3枚ずつ配り、使用済みカードは試合終了まで復活しません。

## 構成

- `dist/index.html` — ロビー、ゲームテーブル、説明画面
- `dist/styles.css` — レスポンシブUIとアニメーション
- `dist/js/deck.js` — 山札と得点計算
- `dist/js/skills.js` — 必殺技カードの定義
- `dist/js/game.js` — ゲーム状態と勝敗判定
- `dist/js/ui.js` — カード表示と演出
- `dist/js/app.js` — 画面操作とゲーム進行
- `dist/js/sound.js` — Web Audioで合成する効果音
- `dist/js/match.js` — WebSocket接続、ID採番、対戦申し込み、状態中継
- `dist/js/matchUI.js` — 相手検索ページと対戦部屋
- `server/index.js` — 静的配信、WebSocketハブ、試合結果API
- `server/access.js` — 共有者向け合言葉ゲート
- `server/db.js` / `server/store.js` — MongoDBとローカル用メモリ保存

## 確認

```text
npm run check
npm run test:integration
```
