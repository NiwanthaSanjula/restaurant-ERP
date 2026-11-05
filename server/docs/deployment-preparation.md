# Portfolio deployment preparation

Prepared on local develop. No commit, push or deployment is part of this task.
The existing Atlas development database containing fictional restaurant data is
the authorized deployment target. Business records, accounts, roles, credentials
and settings are preserved. No seed, migration or provisioning runs at startup.

## Exact Vercel project settings

Create two projects from this repository. Use develop as the production branch
only after a separately authorized review/commit/push; leave main untouched.

| Setting | Client project | API project |
|---|---|---|
| Root Directory | `client` | `server` |
| Framework Preset | Vite | Express |
| Node.js Version | `24.x` | `24.x` |
| Install Command | `npm ci --include=dev` | `npm ci --include=dev` |
| Build Command | `npm run build` | `npm run build` |
| Output Directory | `dist` | Framework default; do not override |
| Entry | `index.html` | Exported Express app: `src/server.ts` |

Per-project vercel.json files supply framework/install/build settings. API startup
exports a handler without opening a listener on Vercel; requests await a cached
MongoDB connection with a five-connection pool. Local long-lived startup remains.
Review pool/concurrency limits for the target Atlas tier.

See [Vercel Express](https://vercel.com/docs/frameworks/backend/express),
[monorepo roots](https://vercel.com/docs/monorepos), and
[Node versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions).

## Environment variables

Set values separately for Production and approved Preview environments.

| Project | Name | Value |
|---|---|---|
| Client | `VITE_API_URL` | `https://<approved-api-host>/api`; no trailing slash, public/build-time. |
| API | `NODE_ENV` | `production` |
| API | `MONGODB_URI` | Existing Atlas development URI, supplied privately. |
| API | `JWT_SECRET` | Strong server-only secret, at least 32 characters, identical across workers. |
| API | `FRONTEND_URL` | Exact approved HTTPS client origin; explicit comma-separated origins if more previews are allowed. |
| API | `APP_TIME_ZONE` | `Asia/Colombo` |
| API | `DEMO_SESSION_STORE` | `mongodb` |

You must choose the actual client/API domains, provide the Atlas URI and JWT secret,
and allow Vercel-to-Atlas network access. No secret values are recorded here.
VERCEL is platform-supplied. VITE_HOSTED_MODE is derived automatically by Vite;
do not set it manually. PORTFOLIO_HOSTED_MODE=1 optionally enables the same file/media
behavior for local API/preview verification. It does not change authentication.
Hosted client builds reject missing, credential-bearing, localhost, non-HTTPS or
malformed API URLs. Normal local development retains existing file behavior.

SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and EMAIL_FROM are optional and unnecessary
for read-only demo browsing. Existing accounts need no INITIAL_RUN_SECRET. PORT is
local-only. Actual environments, credentials, runtime uploads, seeds, caches and
local build output are excluded by .vercelignore. Never expose secrets in VITE_*.

## Approved bundled media

client/public/portfolio-assets contains three approved existing images: the La Tavola
logo, bottled-water photo and shared illustrative POS menu photo. manifest.json
records byte sizes/hashes; README.md records provenance. The shared illustration
is not an individual photograph of each dish.

server/src/config/portfolioMedia.json maps only the 16 approved seeded product IDs
and public company-logo response fields to /portfolio-assets/... client paths.
Hosted response mapping runs after existing allowlists. It changes no stored
records, permissions, pricing or stock. Echoed virtual image aliases are omitted
from unrelated partial-update saves so they cannot overwrite the original images.
Unmapped products retain their existing images; local responses remain unchanged.

The client SPA rewrite excludes static assets/fonts/icons. Images resolve on the
client origin, including sign-in/sidebar/header logos and printed output.
They do not depend on API /uploads or a developer's local server.

One stored company-logo localhost/upload reference remains deliberately unchanged
in Atlas and is remapped in hosted responses. The approved seeded catalog has no
unresolved hosted local image references. Future local media requires another
explicit approved asset or durable media service; private files are not published.

## Hosted disk actions

UI file controls for product images, system/receipt logos, receipt-logo deletion
and customer import are disabled with a visible explanation. Other authorized
fields remain usable. Local development keeps existing file handling.

Independently, the mounted API rejects POST /api/upload,
POST /api/settings/receipt-logo, DELETE /api/settings/receipt-logo and
POST /api/customers/import with 503 hosted_file_actions_disabled. This occurs
after authentication/permission checks and demo mutation denial, before multipart
parsing, disk access or external effects. Anonymous callers still get 401;
restricted/demo callers get 403. /uploads is not exposed in hosted mode.

This intentional restriction completes the portfolio file scope. Writable hosted
media/imports require durable storage and a bounded/direct upload design later.
Never use /tmp for permanent media. Large exports still need hosted limit checks.
See [Vercel function limits](https://vercel.com/docs/functions/limitations).

## Shared-auth TTL indexes: applied and verified

The authorized preflight found public_demo_sessions and public_demo_login_limits
absent/empty. Only those namespaces were created. Each now has:

- Name: `demo_expiry`; key: `{ expiresAt: 1 }`; `expireAfterSeconds: 0`.
- Non-unique, non-sparse, no partial filter; MongoDB also creates its normal _id_ index.
- Only temporary session/hashed-throttle records; expiry uses BSON Date.

The preparation utility inspects BOTH collections and every existing record before
any DDL, refuses unexpected shapes/expiry types/conflicting indexes, and never
drops/replaces an index or writes business records. It verified both definitions
and compared in-memory fingerprints of all non-auth records and index definitions:
unchanged. No database dump/backup or secret output was produced.

From server:

```sh
npm run demo:storage                 # read-only preflight/verification
npm run demo:storage -- --apply      # explicit auth-index setup; no changes on rerun
```

Shared session revocation and atomic bounded throttling use these collections.
Raw tokens/passwords/IPs are not stored. Runtime reads independently check expiry
because TTL cleanup is asynchronous. Missing shared storage/indexes fail closed;
Vercel/production cannot fall back to process-local memory. Existing demo identity,
explicit role and business data are retained.
See [MongoDB TTL](https://www.mongodb.com/docs/manual/core/index-ttl/).

## Remaining release gates

1. Review pending work and obtain separate commit/push/deployment authorization.
2. Supply actual domains/secrets and verify Vercel-to-Atlas networking in the chosen
   region. Local connectivity is not proof of cloud connectivity.
3. Deploy API preview first, then client with its API URL and exact CORS origin.
   Check static assets/SPA deep links, Try Demo, cross-worker logout/throttling,
   fresh/saved Sales Counter selection, all 16 items, print/export, anonymous 401,
   restricted/demo 403, and hosted file-action 503. Use fixtures for business writes.
4. Review existing client bundle-size/browser-data warnings; no dependency upgrades.

No real Vercel preview/build was deployed in this task. Hosted bundle limits,
cross-worker routing and platform networking still require the approved preview.

## Verification completed locally

- Server and client package builds passed; the full mocked server suite passed
  784 tests in 30 suites. Final focused deployment/settings/media checks passed
  112 tests after the last file-control change. No tests connected to a real database.
- A separate Vercel-mode client build passed with a fixture HTTPS API origin.
  An isolated browser preview verified loaded logo images, all 16 catalog images,
  disabled product/system/receipt file controls and the import explanation in both
  themes, with no real API mutations or external/localhost media dependencies.
- Read-only Atlas verification confirmed both exact TTL definitions, zero auth
  records, and one retained local settings-logo reference; product, receipt and user
  media fields contained no local references. Apply fingerprints proved all non-auth
  records/indexes unchanged. A subsequent dry-run proposed no index changes.
- Browser reports/screenshots and index evidence are in the external local folder
  `C:/Users/niwan/AppData/Local/Temp/LaTavola-portfolio-release-dJnVfD`.
- Existing bundle-size, mixed static/dynamic-import and stale browser-data warnings
  remain. No dependency versions, live business data, accounts, roles or settings
  were changed. Main remains at `2453904e596ce5c4c08756da4dddae5e618128ed`.
