# CASINO DUEL

専門学校の文化祭向けに制作中の、必殺技カード付きブラックジャックです。

## 現在の状態

Phase 1（フロントエンド）まで実装済みです。HTML / CSS / Vanilla JavaScript だけで動作し、バックエンドはまだ実装していません。

## 構成

- `dist/index.html` — ロビー、ゲームテーブル、説明画面
- `dist/styles.css` — レスポンシブUIとアニメーション
- `dist/js/deck.js` — 山札と得点計算
- `dist/js/skills.js` — 必殺技カードの定義
- `dist/js/game.js` — ゲーム状態と勝敗判定
- `dist/js/ui.js` — カード表示と演出
- `dist/js/app.js` — 画面操作とゲーム進行

## 確認

```text
npm run check
```

Phase 2では、確認後にNode.jsバックエンドを追加します。
