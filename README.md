# CASINO DUEL

専門学校の文化祭向けに制作中の、必殺技カード付きブラックジャックです。

## 現在の状態

Phase 1（フロントエンド）まで実装済みです。HTML / CSS / Vanilla JavaScript だけで動作し、バックエンドはまだ実装していません。持ちチップ500からのベット制で、全5ラウンド。ラウンドごとに賭け額を自分で決め、最後にチップが多い方の勝ちです。チップが0になった時点で敗北します。8種類の必殺技カードをランク付き（A/B/C）で重複なしに3枚ずつ配り、使用済みカードは試合終了まで復活しません。必殺技はターンを消費しません。

## 構成

- `dist/index.html` — ロビー、ゲームテーブル、説明画面
- `dist/styles.css` — レスポンシブUIとアニメーション
- `dist/js/deck.js` — 山札と得点計算
- `dist/js/skills.js` — 必殺技カードの定義
- `dist/js/game.js` — ゲーム状態と勝敗判定
- `dist/js/ui.js` — カード表示と演出
- `dist/js/app.js` — 画面操作とゲーム進行
- `dist/js/sound.js` — Web Audioで合成する効果音
- `dist/js/match.js` — ID採番と対戦申し込み（暫定のローカル実装）
- `dist/js/matchUI.js` — 相手検索ページと対戦部屋

## 確認

```text
npm run check
```

Phase 2では、確認後にNode.jsバックエンドを追加します。
