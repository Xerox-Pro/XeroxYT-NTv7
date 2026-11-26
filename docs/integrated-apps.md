# Instagram / TikTok integration status

Updated 2026-11-13. Existing React/Vite frontend and Cloudflare API repositories are retained. YouTube routing, authentication and player lifecycle are unchanged.

## UI

- Instagram: home feed, story tray/viewer, reels, account search, profile grid, messages, comments, note composer.
- TikTok: vertical recommended feed, following feed, inbox/messages, profile grid, video/user search.
- Phone (<768px): bottom navigation and sticky header; tablet (768–1199px): icon rail; desktop: labelled sidebar.
- Separate service state, guest storage and account storage. YouTube iframe remains mounted during service switches.
- The supplied YouTube JPEG is used in the header logo and app picker; Instagram/TikTok assets are retained. Single tap returns home; double tap opens the app picker; keyboard ArrowDown opens it. No simulated users or invented feed results are displayed.

## Connection

Settings → 自分のアカウントを接続 uses the user's existing official-site session. The user signs in on the official site, then explicitly authorizes the unofficial session connection. This is a session import, not a native username/password login implementation. This site cannot automatically read another origin's cookies.

`SOCIAL_UNOFFICIAL_ENABLED=true` enables the consent-gated import endpoint. Only allowlisted cookies are accepted. The server checks the account identity, probes feed / inbox / stories and enables successful reads. Cookies are stored encrypted in D1 with account/service-associated authenticated encryption. They are not returned in status responses or written into browser storage by the connection form. TikTok reactions/comments require its own CSRF cookie; neither passwords nor CSRF values are synthesized. TikTok IM additionally requires the user's own logged-in `device_id`.

Official OAuth remains available only when administrator client keys, callback URI and provider approval are configured. No credentials are committed to either repository.

## Account features

| Feature | Instagram | TikTok |
| --- | --- | --- |
| Personal account feed | Nonofficial timeline adapter, enabled after successful probe | Nonofficial recommend endpoint, enabled after successful probe; provider may reject requests |
| Stories | Tray and image/video viewer, probe-gated | Unsupported |
| DM | Existing threads, text history, user-initiated text send | Existing threads / text adapter; requires device ID; real account interoperability unverified |
| Search | Account search via nonofficial endpoint; profiles open official site | Nonofficial video/user search with separate result types and pagination |
| Like / unlike | User-initiated adapter for numeric media IDs from the connected feed | User-initiated adapter, requires the session's own `tt_csrf_token` |
| Comments | Read, pagination and user-initiated text posting | Read/pagination; posting requires the session's own `tt_csrf_token` |
| Notes | Text composer, mutual followers / close friends audience | Unsupported |
| Following feed | Timeline adapter only; no separate following-only selector | Probe-gated following endpoint; loaded items sorted newest first |
| Media/voice DM, calls, live notifications | Unsupported | Unsupported |
| Other users' profiles and complete account tools | Official-site fallback | Official-site fallback |

Write capabilities describe implemented adapters, not a successful live write probe. No test post or message is sent on connection. Provider signatures, challenges, region restrictions or endpoint changes may prevent operation. Public-link imports lack numeric media IDs and keep official interaction fallbacks. The local preference button and device-local bookmarks are distinct from account likes and saves.

## Request safety

- New social traffic uses direct Cloudflare connection and a short-lived site-scoped ticket; Vercel refuses social API relay requests.
- Fixed HTTPS credential destinations, no redirects with credentials, bounded input/response sizes, per-user read/write quotas.
- Provider challenges/throttling trigger a cooldown. No challenge bypass, token forgery, device identity borrowing or automated engagement.
- Mutations use a unique client ID and server-side duplicate claim. No automatic mutation retries. Uncertain sends require review instead of automatic resending.
- Disconnect deletes both unofficial session and official OAuth link; official OAuth revocation is attempted. Users should revoke a leaked session from the official app.
- Unofficial APIs can still cause additional verification, restrictions or account suspension. Encryption reduces exposure and does not guarantee safety.

## Verification

- Frontend TypeScript and production build; existing full suite passed 143 tests, including the new behavior and chronological-order checks.
- Added DOM behavior test covers account feed selection, comments, notes, text DM, escaping provider text and blocking duplicate/uncertain sends.
- Existing routing tests cover 390 / 820 / 1280px DOM environments and preserve the same YouTube player.
- API full suite passed 72 tests, including new invalid ID/audience, acknowledgement, fixed-destination, challenge, capability, encryption and disconnect checks.
- Provider responses in these tests are mocked. Real-account login, feed, DM, notes, comments and likes are not verified. Full native feature parity is not claimed.
- The public Instagram desktop layout was inspected in the browser. Browser screenshots and visual checks are reported separately from DOM tests; a DOM viewport does not prove rendered layout.

## Sources

- Meta official API: https://www.postman.com/meta/instagram/overview
- TikTok Login Kit: https://developers.tiktok.com/docs/en/login-kit-overview
- TikTok Display API: https://developers.tiktok.com/docs/en/display-api-get-started
- Nonofficial Instagram protocol reference: https://github.com/subzeroid/instagrapi
- TikTok IM attribution and limitations: API repository `docs/social-protocols.md`

## Dedicated browser login

Settings now offers a dedicated Browser Run login before manual cookie import.
The user opens the short-lived official-page Live View, completes login and 2FA
there, returns and selects “ログイン完了・Cookieを保存”. Cookie extraction and
account/service-scoped encrypted storage occur server-side, then the browser
closes. Cancellation closes it without importing. Login views expire after ten
minutes; view links should not be shared. Session recording is disabled. Actual
provider sign-in with a real account remains unverified and can be rejected by
the provider. The application never promises to bypass verification or blocks.

## Same-origin login screen relay

The external Live View is replaced by authenticated same-origin login/view and
login/input requests through Vercel to Cloudflare. Users click the rendered screen,
send text with the masked input box, use Tab / Backspace / Enter, and manually
refresh or scroll. There is no client connection to live.browser.run. Frames and
input values are not persisted. Text is sent transiently by POST, not in URLs.
This is a screenshot/input relay, not an unrestricted HTML or WebSocket proxy.
