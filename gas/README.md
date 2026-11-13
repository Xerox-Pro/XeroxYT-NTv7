# XeroxYT-NTv7 GAS版

既存のReact画面・CSSをビルドし、GASのHTML Serviceで起動します。
ブラウザ → `google.script.run` → GAS `UrlFetchApp` → 既存API の経路です。
GitHubにアップロードするJS・CSSにAPI接続先とAPI共有シークレットは入りません。
既存のVercel/Cloudflareデプロイの設定変更は不要です。

## 初回セットアップ

1. https://script.google.com/ で独立したプロジェクトを作成。
2. `Code.gs` をコピーし、HTMLファイル `Index` を作って `Index.html` をコピー。
3. プロジェクトの設定でマニフェストを表示し、`appsscript.json` をコピー。
4. 「プロジェクトの設定 → スクリプト プロパティ」に以下を登録。GASではこの機能を環境変数の代わりに使います。

| 名前 | 値 |
| --- | --- |
| `API_BASE_URL` | 現在使えるAPIのHTTPSオリジン。末尾の `/api` は付けない |
| `API_SHARED_SECRET` | 既存APIに設定済みの共有シークレット。認証を使わないAPIなら不要 |
| `ACCOUNT_BASE_URL` | サイトアカウント用APIのHTTPSオリジン。API_BASE_URLと同じなら省略 |
| `UPSTREAM_ORIGIN` | APIの `ALLOWED_ORIGINS` に登録済みの既存フロントエンドのHTTPSオリジン |
| `ASSET_REPO` | `Xerox-Pro/XeroxYT-NTv7`（省略可） |
| `ASSET_BRANCH` | `gas-runtime`（省略可） |

5. 「デプロイ → 新しいデプロイ → ウェブアプリ」。実行ユーザーは「自分」、アクセス範囲は利用対象に合わせて設定し、認可して `/exec` のURLを保存。
6. 検索・動画・ログイン・履歴・Instagram/TikTokを実際のAPIで確認。

API接続先やシークレットをGitHub・HTML・VITE変数に書かないでください。
スクリプトを共同編集できる人はスクリプトプロパティを読めます。
この作業からGASアカウントへの作成・公開は行っていません。

## 同じGASリンクで更新

- `main` に画面の変更をpushすると `Publish GAS assets` がビルド・テストし、`gas-runtime` にビルド済みJS・CSS・アイコンをアップロードします。初回はActionsでワークフローを手動実行しても構いません。
- GASを開くたびにGitHubから `gas/web/release.json` を取得します。JS・CSSはそのリリースの**同一コミットSHA**に固定したjsDelivr URLで読み込みます。古いCDNキャッシュと新しいCSSが混ざりません。
- 通常の画面更新ではGASの編集・再デプロイは不要。開いている画面には再読み込み後に反映されます。
- `Code.gs` / `Index.html` 自体を変更した場合だけ、GASの「デプロイを管理 → 既存デプロイを編集 → 新しいバージョン → デプロイ」を使います。**新しいデプロイを作成しなければ既存 `/exec` URLを保持できます。**
- 過去のJS・CSSは削除しないため、更新前から開いているページでも継続使用できます。ロールバックはrelease.jsonのrevision/entry/cssを以前の組み合わせへ戻します。

## 維持する機能と制約

| 項目 | GAS版の方式・制約 |
| --- | --- |
| デザイン・アプリ切替 | 元のReactコンポーネントとTailwind/CSSを再利用。PC・タブレット・スマホの既存レイアウトを維持 |
| 検索・おすすめ・コメント・チャット・各種操作 | 既存のJSON APIをGAS経由で呼び出し。API自体の可用性・機能に依存 |
| 動画・Shorts | 元のYouTube埋め込み方式。外部プレイヤー/CDNのURLはブラウザに見える |
| IG/TikTokのメディア | APIが直接再生できる外部CDN URLを返すものは既存の方式を利用。APIオリジン上の動画ストリームやRange中継はGAS RPCでは実装していないため再生不可 |
| サイトログイン・履歴同期 | 利用者ごとにランダムな256bitトークンで分離し、上流のサイトセッションCookieだけGASのキャッシュに保持。Google/SNSのCookieは既存API側で管理 |
| ログイン保持 | GASキャッシュは最大6時間。期限や早期削除で再ログインが必要。既存サイトとGAS版は別ログイン・別ブラウザストレージ |
| Google/SNS連携 | 同じAPIルートを利用。API側のCookie認証・デバイス認証が対応している範囲。OAuthの戻り先やiframe制限はGAS公開後に実機確認が必要 |
| URL共有・画面遷移 | iframe内はハッシュルーター、共有リンクはGAS `/exec?route=...` |
| PWA・オフライン | GASのiframeでは既存サービスワーカー登録を行わない。GAS版のPWAインストール・オフライン動作は対象外 |
| 使用量・速度 | JSON通信はGAS実行・URL Fetch割当を消費。ブラウザ同時RPCは4本に制限。中継が増えるため元サイトより遅くなる場合あり |

**GAS単体で全機能の完全互換を保証するものではありません。** 特に動画のバイナリ配信・PWA・OAuthのiframe制約は別途の対応が必要です。
API URLの非公開化はアクセス認証の代わりにはなりません。GAS公開範囲内の利用者は提供するAPI操作を実行できます。過去の公開コード・別サービスのレスポンスで既に公開されたURLまでは隠せません。
API URLはスクリプトプロパティに閉じ、ブラウザ向けのorigin一覧・直通チケットAPIは禁止し、応答内の設定済みホストも伏せます。APIホストを含むメディアURLはそのまま再生できないため、公開用CDNのURLを返す必要があります。
GASのキャッシュは保証されたセッションDBではありません。大人数向けの運用では既存API側の認証と割当も確認してください。

## 手動ビルド

```sh
npm ci --ignore-scripts
npm run test:gas
npm run build:gas
```

生成先は `gas/web/`。通常のVercel向け `npm run build` は変わりません。
`release.json` の `revision` には**ビルド済みファイルが存在するコミットSHA**を設定してから公開します。自動ワークフローはアセットのコミットと、そのSHAを指すリリース情報のコミットを順に作ります。

## 検証範囲

NodeでGASのサーバーAPIを模擬し、パス検証・Cookie分離・JSON/認証中継・URL秘匿・リダイレクト拒否・異常応答を検証します。ビルド生成物の起動と画面遷移はDOMシミュレーションで検証します。実ブラウザによる見た目の確認は、この実行環境の制限で実施できていません。GAS公開・実APIログイン・実機動画再生は公開後の確認が必要です。
