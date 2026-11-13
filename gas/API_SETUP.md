# 利用者が自分のAPIを構築する手順

作者の稼働中API・D1・Vercelブラウザ・秘密鍵は使いません。公開されているコードを、自分のCloudflareアカウントへ配置します。Google CloudのYouTube Data APIキーは基本構成には不要です。

構成は `GAS画面 → GAS中継 → 自分のCloudflare Worker → YouTube等` と、自分のD1です。GAS版の画面表示にVercelは不要です。

## 1. 用意するもの

- Googleアカウント、Cloudflareアカウント、GitHubアカウント。
- Node.js 22以上、Git。WindowsではPowerShellからも以下のコマンドを実行できます。
- ソース：[フロントエンド](https://github.com/Xerox-Pro/XeroxYT-NTv7) と [バックエンド](https://github.com/Xerox-Pro/XeroxYT-NTv7-APIv1)。自分で更新する場合は両方をForkしてください。

以下の `YOUR_ACCOUNT` は自分のGitHubユーザー名に置き換えます。すでにフロントを取得済みなら重複cloneしないでください。

```sh
git clone https://github.com/YOUR_ACCOUNT/XeroxYT-NTv7.git
git clone https://github.com/YOUR_ACCOUNT/XeroxYT-NTv7-APIv1.git
cd XeroxYT-NTv7-APIv1
npm ci --ignore-scripts
```

## 2. 作者の接続先を使わない構成を準備

APIリポジトリの従来版にはSNSログイン用Vercelブラウザの固定URLが含まれます。この経路はそのまま利用しません。付属スクリプトで、接続先を自分の環境変数 `SOCIAL_BROWSER_URL` のみから読む形に変更し、独立した設定ファイルを生成します。

APIリポジトリのフォルダにいる状態で実行：

```sh
node ../XeroxYT-NTv7/gas/prepare-api.mjs .
```

生成される `wrangler.gas.jsonc` は以下の初期設定です。

| 設定 | 値・用途 |
| --- | --- |
| `name` | `xeroxyt-ntv7-apiv1`。同一アカウントに同名Workerがあれば自分用の別名に変更 |
| `d1_databases[].binding` | `DB`。変更しない |
| `database_name` | これから自分で作る `xeroxyt-accounts` |
| `database_id` | 自分で作ったD1のIDへ置き換え |
| `ALLOWED_ORIGINS` | `https://script.google.com` |
| `REQUIRE_PROXY_SECRET` | `true`。GASとAPIだけが持つ共有鍵を必須化 |
| `SOCIAL_BROWSER_PROVIDER` | `cloudflare`。作者のVercelブラウザは使わない |
| `SOCIAL_UNOFFICIAL_ENABLED` | `false`。SNSのアカウント連携は追加設定後に有効化 |

このスクリプトは既存の `wrangler.jsonc` を変更しません。2回目以降は作成済み `wrangler.gas.jsonc` のDB設定を保持します。以降のWranglerコマンドはすべて **`--config wrangler.gas.jsonc`** を付けます。

## 3. 自分のD1を作成

```sh
npx wrangler login
npx wrangler whoami
npx wrangler d1 create xeroxyt-accounts --config wrangler.gas.jsonc
```

自分のCloudflareアカウントであることを確認します。表示された `database_id` を `wrangler.gas.jsonc` に設定します。複数アカウントを使っている場合は、そのファイルに自分の `account_id` も追加してください。

新規D1へテーブルを作成します。

```sh
npx wrangler d1 execute xeroxyt-accounts --remote --file schema.sql --config wrangler.gas.jsonc
```

APIはアカウント・履歴・Google連携のテーブルを内包します。別のアカウントWorkerは不要です。フロント側の古い `cloudflare/auth/wrangler.jsonc` はこのセットアップで使用しないでください。

## 4. 自分専用の共有鍵を登録

パスワード管理アプリ等で十分長いランダム値を1つ作成し、安全に保管してください。同じ値をCloudflareとGASの両方に登録します。チャットやGitHubには書きません。

```sh
npx wrangler secret put API_SHARED_SECRET --config wrangler.gas.jsonc
```

プロンプトに自分の共有鍵を入力します。コマンド引数に鍵を直書きしないでください。

## 5. ビルドして公開

```sh
npm test
npm run build
npx wrangler deploy --dry-run --config wrangler.gas.jsonc
npx wrangler deploy --config wrangler.gas.jsonc
```

最後に表示される自分のWorker URLを控えます。例は `https://your-api.your-subdomain.workers.dev`。この例をそのまま設定せず、実際のURLを使用してください。

Worker URLを普通にブラウザで開くと403になることがあります。許可Originと共有鍵のない通信を拒否する設計です。

この手順では有料プランへ自動変更しません。実行制限・必要なプランは自分のCloudflareアカウントで確認してください。

## 6. GASに設定

[GASセットアップ](README.md) の手順で `Code.gs` / `Index.html` / `appsscript.json` を用意し、スクリプトプロパティを登録します。

| GASのスクリプトプロパティ | 設定する値 |
| --- | --- |
| `API_BASE_URL` | 自分のWorkerのHTTPSオリジン。`/api` は付けない |
| `API_SHARED_SECRET` | 手順4で自分が登録した鍵と同じ値 |
| `UPSTREAM_ORIGIN` | `https://script.google.com`。APIのALLOWED_ORIGINSと一致させる |
| `ACCOUNT_BASE_URL` | 省略可。今回のAPIはアカウント機能も内包 |
| `ASSET_REPO` | 自分のフロントを使うなら `YOUR_ACCOUNT/XeroxYT-NTv7` |
| `ASSET_BRANCH` | `gas-runtime` |

`UPSTREAM_ORIGIN` はGASがサーバー間通信に付けるOriginです。GAS iframeの変動するホスト名を列挙する必要はありません。Originは認証の代わりにはならないため、共有鍵必須の設定を維持します。

自分のフロントをForkした場合はGitHub Actionsを有効にし、`Publish GAS assets` を手動実行してください。成功すると `gas-runtime` が作られます。作者のGitHubからJS/CSSだけ読み込む場合でも、APIは自分のものを使えます。

## 7. 稼働確認

公開したGASのリンクからサイトアカウントを新規作成し、ログイン、検索、動画の埋め込み再生、履歴保存と再読み込みを順に確認します。Googleアカウント連携はサイトアカウントとは別です。

| 状況 | 確認箇所 |
| --- | --- |
| APIが403 | API_SHARED_SECRETの一致、UPSTREAM_ORIGINとALLOWED_ORIGINSの一致 |
| 502 / テーブルがない | D1のID・DB binding・schema.sql適用。Cloudflare側のログ |
| ログインが数時間で切れる | GASのセッションキャッシュは最大6時間。早期削除もあり |
| JS/CSSが読めない | 自分のgas-runtimeブランチとrelease.json、Actionsの実行結果 |
| Workers 1102 | API解析処理がCPU制限に到達。GASへの移植だけでは解消しない |
| SNSの公開検索・動画が取得不可 | 外部サービスのログイン要求・回数制限・仕様変更。API自前化だけで必ず取得できるわけではない |

## 8. SNSログインを追加する場合

公開投稿のAPIと、ログイン後のDM・個人向けフィードは別の機能です。`SOCIAL_UNOFFICIAL_ENABLED=true` だけで全機能が動作するとは限りません。

- Cloudflareブラウザを使う場合は、自分のWorkerに `browser: { "binding": "BROWSER" }` を追加し、ブラウザ機能の利用条件・API互換性を確認します。APIの実装との接続は実機検証が必要です。
- Vercelのログイン用ブラウザを使う場合は、自分のVercelプロジェクトへブラウザブリッジを用意し、`SOCIAL_BROWSER_PROVIDER=vercel` と **自分の** `SOCIAL_BROWSER_URL=https://自分のドメイン/api/social-browser` を設定します。手順2の変更後はURL未設定で接続を拒否し、作者の固定URLへはフォールバックしません。これは基本構成に含まれる自動セットアップではありません。
- 公式Instagram/TikTok OAuthは自分の開発者アプリ・審査・キーとコールバック設定が必要です。現APIの戻り先は通常Webサイト向けで、GASのハッシュルーターへの戻りには追加対応が必要です。APIのURLを完全にブラウザから隠す要件とも調整が必要です。
- GASは動画バイナリ・Rangeストリーミングを中継しません。直接再生できる外部CDNのURL、または対応済みの埋め込みを使用します。

## 更新

フロントはmainへのpush → Actions → gas-runtime → 同じGASリンクで再読み込み。APIは自分のForkを更新し、`npm ci --ignore-scripts` と手順2を再実行して固定接続先が戻っていないことを確認後、ビルド・同じWorkerへデプロイします。Worker名を変えなければAPI URLも維持できます。

参照：この手順はAPIリポジトリの構成（2026-11-14確認）に合わせています。
[Cloudflare D1コマンド](https://developers.cloudflare.com/workers/wrangler/commands/d1/) / [Workers・Secretコマンド](https://developers.cloudflare.com/workers/wrangler/commands/workers/) / [GASからのサーバー呼び出し](https://developers.google.com/apps-script/guides/html/communication)。
