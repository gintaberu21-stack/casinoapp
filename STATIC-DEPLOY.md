# 静的フロントエンドの公開

既存のWeb Serviceは残します。MongoDBの設定もそのまま使用します。

1. この変更をGitHubに反映し、既存Web Serviceを再デプロイします。
2. Renderで同じリポジトリから **Static Site** を新規作成します。
   - Build Command: `npm run build:static`
   - Publish Directory: `static-site`
   - 環境変数 `BACKEND_URL`: 既存Web Serviceの公開URL（例: `https://your-service.onrender.com`）。パスは付けません。
3. Static SiteのRedirects/Rewritesに `/` → `/rooms.html`（Rewrite）を設定します。Blueprintではrender.yamlに設定済みです。
4. 既存Web Serviceに環境変数 `FRONTEND_ORIGINS` を追加し、Static SiteのURLを設定して再デプロイします。末尾の `/` は付けません。複数の場合はカンマで区切ります。
5. 利用者には **Static SiteのURL** を案内します。既存Web ServiceのURLでは起動待ち画面が引き続き出ます。

画面の表示と同時にサーバーの起動を開始します。接続待ちの間も画面を表示し、下部に「サーバーに接続中…」と表示します。起動待ちではAPIを送信せず、起動確認後に送信します。賭け操作の自動再送は行いません。

`ACCESS_CODE` による合言葉制限が有効な環境では、この分離構成をそのまま公開しないでください。既存の制限は同一サイトのCookieを使用するため、別サイト用の認証対応が必要です。既存のアクセス制限を解除する変更は含めていません。

URLが変わるためブラウザーの保存領域も変わります。既存URLのアカウントは新しいURLへ自動移行しません。既存アカウントを引き継ぐ必要がある場合は、公開前に移行方法を用意してください。

確認: サーバーがスリープした後にStatic Siteを開き、ゲーム一覧が先に表示されること、接続表示が消えた後にアカウント作成・対戦・ルーレット・スロットが動くことを確認します。
