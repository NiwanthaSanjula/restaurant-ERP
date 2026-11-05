# Public read-only visitor

On the sign-in page choose **Try Demo**. The dashboard and standalone POS show
**Read-only demo** and **Exit Demo**. Cart quantities, adjustments and payment
amounts are local previews. No register is opened and Submit Payment is disabled.
Existing sales can be viewed, printed, exported and reprinted as kitchen tickets.

## Identity provisioning (current development database)

From `server`, run `npm run demo:provision` for a read-only preflight. After
review, `npm run demo:provision -- --apply` inserts only one deterministic visitor
User and its Role, transactionally. Existing accounts, roles, business records,
settings and registers are never updated. The tool fingerprints other records
before/after, validates schemas and collisions, and is idempotent. It stops if
visitor grants were edited. There is no automatic administrator/role fallback.

The account has a generated, undisclosed password hash and cannot use password
login. Authentication is issued only by POST `/api/auth/demo`; no request identity
or grants are accepted. The stored immutable visitor marker AND deterministic
identity detect visitor sessions, including JWTs with missing/tampered demo flags.
Missing, inactive or changed roles deny access rather than repairing privileges.

## Enforcement and response contract

`routes/api.ts` is the shared production/test mount. `publicApiBoundary` runs
before every business router, validators and multipart parsers. All private APIs
require authentication and explicit existing canonical grants. Existing handler
permissions still apply. The code-owned policy covers every mounted directory;
unknown routes deny by default. Legacy role-label GET restrictions are replaced
for visitors only after the boundary verifies their explicit canonical read grant.
Staff permissions and mutation handlers retain their normal restrictions.

Visitor POST/PUT/PATCH/DELETE business operations return 403 `demo_read_only`,
independent of payload flags. Only session login/exit and the existing pure kitchen
issue preview are exceptions. This includes uploads, email settings, prefix and
currency writes, payments, returns and single/bulk Z-bill deletion. Anonymous
legacy reads/writes now fail before their controllers. Profile reads/edits use the
authenticated identity rather than a caller-supplied user ID.

`demoResponse.ts` explicitly allowlists business DTOs and nested structures; new
fields are private by default. Users omit emails, phones, password hashes and
tokens. Mail settings expose only a redaction indicator. System settings expose
branding, currency, regional display fields; private contacts/configuration are
hidden. Audit CSV/PDF/JSON omit snapshots and private metadata. Currency GET skips
default insertion for visitors; other mounted GET handlers were checked for
hidden writes (prefix/cart reads already return defaults without saving).

## Coverage and limits

Browse every implemented sidebar directory, including Roles (View permissions),
Users, System/Receipt/Mail/Prefix settings, purchasing, stock, kitchen and reports.
Forms can be inspected without saving. Missing setup/data remain honest empty
states. Hold and View Menu remain unavailable. Register Reports is explicitly
marked unconnected and links to the existing Z-bill summaries.

Sessions last one hour. Exit revokes only that session. Production/Vercel uses
shared MongoDB storage for sessions and atomic IP throttling (10 allowances per
fixed 15-minute window). Missing storage/indexes fail closed. Local development may
use the bounded in-memory mode; its sessions end on restart. Run the dry-run-first
`npm run demo:storage` utility before enabling the shared store, and explicitly
approve index creation on the intended deployment target. See
[deployment preparation](deployment-preparation.md) for environment names, TTL
indexes, proxy handling, upload limitations and the remaining release gates.

Focused tests exercise the actual mounted API, every mounted mutation and private
read, explicit grants, revoked/tampered tokens, safe projections, no default writes,
uploads and staff regressions. Provisioning tests use isolated storage. Business
mutation tests never access the configured database.
