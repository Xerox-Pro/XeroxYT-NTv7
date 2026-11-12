# 統合アプリの実装状況

既存のReact/Vite構成に追加。Next.js移行、新規リポジトリ作成、既存D1レコードの削除は行っていません。

## 利用できる機能

- YouTube / Instagram / TikTokの切り替え。PC・タブレットはサイドバー、スマホはヘッダー。
- サービス別ルート、最後のページとアプリの復元、戻る・進む、サービス別の端末内ページ履歴。
- 既存YouTubeプレイヤーをマウントしたままミニプレイヤーへ移行。他サービスで再生を始めると一時停止。
- Instagram / TikTok別の画面。公開リンクの追加、公式埋め込み、端末内保存、共有、興味なし。
- 縦型フィードのスクロールスナップ、次の直接動画のメタデータだけの先読み、画面外の再生停止。
- 追加済みコンテンツの検索と、公式サービスでの動画・ユーザー・ハッシュタグ検索への遷移。
- サービス別・サイトアカウント別の独自推薦。視聴・完了・再視聴・スキップ・好み・保存・検索を使用。
- D1の既存保存領域に、推薦設定とOAuth情報をサービス別のキーで暗号化保存。共有学習は標準OFF。
- 新規APIはCloudflareへ直接接続。VercelでInstagram/TikTokのAPIを中継しない。
- OAuth処理：stateの単回消費、サイトセッションとの対応、暗号化保存、プロフィール、本人の投稿、ページング、TikTokのトークン更新、解除。
- 公式APIで利用できないDMは公式サービスへのリンクを表示。

## 管理者設定が必要な項目

CloudflareのSecrets/Variablesで設定します。秘密値をソース、README、ブラウザへ入れないでください。

| サービス | キー名 |
| --- | --- |
| Instagram | `INSTAGRAM_CLIENT_ID`, `INSTAGRAM_CLIENT_SECRET`, `INSTAGRAM_REDIRECT_URI`, `INSTAGRAM_APPROVED` |
| TikTok | `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_REDIRECT_URI`, `TIKTOK_APPROVED` |

- コールバックは同じWorkerの `/api/instagram/oauth/callback` または `/api/tiktok/oauth/callback`。
- プロバイダーの管理画面にも同一のHTTPSコールバックを登録。
- 承認済みアプリでのみ `*_APPROVED=true`。設定不足ならログインボタンは無効。
- Instagramのスコープは `instagram_business_basic`。プロアカウントが対象。
- TikTokのスコープは `user.info.basic,video.list`。Login Kit / Display APIの許可が必要。
- Instagramは現在、短期トークンの範囲で接続。期限切れ時は再連携が必要。長期トークン交換・自動更新は未実装。
- 実アカウントでの同意・ログイン・権限付与・投稿取得は、キー設定と審査の完了後に検証が必要。

## 未対応・制約

| 項目 | 状況 |
| --- | --- |
| 本家Instagramホーム・おすすめ・フォロー投稿 | 取得しない。本人の投稿とユーザー追加の公開リンクのみ |
| 本家TikTok For You・フォロー中フィード | Display APIの対象外。独自おすすめと公式リンクで区別 |
| ストーリーズ | 公式サービスへ遷移。アプリ内の取得は未対応 |
| DM、返信、リアクション、既読・未読、通知 | アプリ内送受信は未対応。公式サービスへ遷移 |
| 公式のいいね・保存・コメント | 公式投稿で操作。アプリ内の好みと保存は別物 |
| 他ユーザーのプロフィール・投稿一覧 | 公式プロフィールへ遷移。自分のデータを他人の情報として表示しない |
| 非公式API | instagrapi / TikTok-Apiを調査したが、有効化していない。追加認証・アカウント制限・実行基盤の問題があり、安定性を未検証 |
| 非公開・地域制限・埋め込み不可の投稿 | アクセス制限を回避しない。公式リンクを表示 |
| 動画本体・音源メタデータ | 直接許可されたメディアURLまたは公式埋め込みのみ。独自の動画プロキシ・ダウンロードは追加しない |
| Next.js | 未移行。既存YouTubeの保護を優先してReact/Viteを維持 |
| YouTubeの既存通信経路 | 直接接続と互換中継を維持。Vercel API Routesの全面撤去は未実施。新規2サービスは直接接続のみ |

## 主な変更ファイル

- `src/App.tsx`, `src/main.tsx`：サービスルーティング、復元、URLと履歴。
- `src/MainApp.tsx`, `src/components/VideoPlayer.tsx`：既存プレイヤー維持、別サービスへの切り替えと再生調整。
- `src/components/AppSwitcher.tsx`, `Navbar.tsx`, `Sidebar.tsx`：切り替えUI。
- `src/social/`：サービス別UI、メディア、APIクライアント、公開リンク検証、独自推薦。
- `src/lib/apiTransport.mjs`：新規サービス専用のCloudflare直接接続。
- `vite.config.ts`：新規アプリのバンドルをPWAの初回一括取得から除外。
- APIリポジトリ `cloudflare/social/api.mjs`, `cloudflare/api/worker.mjs`：サービス別API。
- `tests/social-*.test.mjs`：ルーティング、プレイヤー維持、公開URLの検証、OAuth分離。

## 検証範囲

既存YouTubeのプレイヤー・再生位置・コメント表示・接続方式・非公開キャッシュの回帰テスト、新規ルート・履歴・サービス切り替えを390/820/1280px相当のDOMで検証。OAuthはプロバイダーを模した応答で検証。ブラウザではプレビューの切り替え・公開リンク追加・埋め込み失敗時の公式リンクを確認しました。TikTokの検証用公開動画は検証ブラウザでサービス側エラーとなり、再生成功は確認していません。

実アカウントログイン・ネイティブDM・本家おすすめを完成済みとして扱わないでください。使用量の削減率も実測前には断定しません。

## 推薦エンジンの共通化方針

共通イベント形式は `{service, contentId, kind, value, timestamp, source}` とし、`service` はYouTube / Instagram / TikTokを区別します。YouTubeは既存の視聴・推薦処理を維持し、今回の新規推薦実装はInstagram / TikTokの許可された候補に限定しています。YouTubeを含む3サービス共通の学習パイプラインとサービス横断学習は未接続です。

## 検証結果

- フロント：関連テスト30件成功、TypeScriptチェック成功、Viteビルド成功。
- API：既存・追加テスト56件成功、Worker / Nodeビルド成功。
- サービス切り替え後も同じYouTube iframeを保持することを検証。
- OAuthのstate再利用拒否、保存データの暗号化、権限のない機能の無効表示、公開リンクの検証をテスト。
- 実アカウントでのInstagram / TikTokログインは、管理者キーと審査設定がないため未検証。
- 独立チャンクとPWA初回プリキャッシュ除外を確認。実端末での読み込み時間・運用使用量の比較測定は未実施。

## 調査した公開ドキュメント

- TikTok Login Kit: https://developers.tiktok.com/docs/en/login-kit-web
- TikTok Display API: https://developers.tiktok.com/docs/en/display-api-overview
- TikTok Embed Player: https://developers.tiktok.com/docs/en/embed-player
- Meta公式Instagram API資料: https://www.postman.com/meta/instagram/overview
- 非公式Instagram APIの調査対象: https://github.com/subzeroid/instagrapi
- 非公式TikTok APIの調査対象: https://github.com/davidteather/TikTok-Api

ビルド出力の比較では、YouTube側の初期JavaScriptはgzip 222.12 kBから224.54 kB（+2.42 kB）です。追加アプリ本体は別チャンクで、PWAの初回一括取得にも含めていません。これは転送サイズの比較で、読み込み時間の実測ではありません。

追加で、TikTokのトークン更新と解除が重なっても解除済み連携を復活させないこと、更新後のトークンだけを使用することを検証しました。
