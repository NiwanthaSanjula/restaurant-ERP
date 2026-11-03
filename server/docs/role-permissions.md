# Role permissions checkpoint

`User.roleId` references the authoritative, active `Role`. `Role.permissions` retains
the existing array of `{ component, actions }` entries, with boolean action keys.
The schema now retains the granular action names already used by API middleware.
`User.role` is a legacy label, not a permission source. `RolePermissions` and the
standalone `Permission` metadata records are not authorization authorities.

Every authenticated request checks that its assigned role exists, is active and has
recognized grants. Unmapped legacy actions are denied individually. Named permission
checks load the current role again; there is no cross-request permission cache.
Consequently permission changes, role deactivation and reassignment affect the
next request using the existing token. Neither an administrator label nor missing
records grant access. Product create/update/delete no longer bypass checks; product
reads also require the existing `manageProducts:read` permission.

The role editor uses `/api/roles/permission-catalog`, preserves granular grants,
and reports unmapped legacy entries. Replacing those entries requires explicit UI
acknowledgement. The API validates and normalizes submissions independently.

The frontend obtains its own effective grants from `/api/auth/me`, never from
cached role labels or role-name defaults. Known aliases are expanded by the server
for existing PermissionGate consumers. The UI refreshes after login and role edits,
and on window focus/storage changes. Other open sessions need focus or page reload
to refresh their visible controls; re-login is unnecessary. The backend does not
wait for a UI refresh to enforce revocation. Routes/navigation and write controls
in products, users, roles, system/mail/receipt settings and POS use these grants.

## Explicit compatibility

- `manageRoles` -> `manageRolesAndPermissions`; CRUD -> create/view/edit/delete_role.
- `posOperations` -> `managePOS`; create -> create_sale, read -> view_pos.
- `reports` -> `manageReports`; read -> view_reports.
- `manageCategory` -> `manageCategories`.
- User CRUD -> create/view/edit/delete_user.
- Menu, order and table CRUD -> their same-named create/view/edit/delete action.
- Existing CRUD-only master-data modules, including products, retain CRUD keys.

POS update/delete and report create/update/delete have no unambiguous single target.
They are not expanded into financial actions. Unknown keys (including false legacy
keys) and non-boolean values grant nothing; contradictory aliases deny that specific
permission. Other known grants remain usable so legacy users can sign in and authorized
role editors can repair their roles. New role writes still reject unresolved entries.
Generic menu/report grants do not imply item-specific/report-specific
grants. Unknown permission metadata never adds actions to the recognized catalog.

## Provisioning and migration

The existing `/api/auth/initial-run` path remains protected by its configured setup
secret and the zero-user check. It validates configured credentials before writing
and creates a Role containing explicit recognized administrator grants, then assigns
that ID to the first user. It is never invoked automatically to repair missing roles.
No seed files or records were changed or executed for this checkpoint.

Existing Role arrays require review/normalization, and users lacking valid role IDs
need explicit assignments. The migration utility is **not run automatically**.
It defaults to planning and refuses to connect without explicit scan/apply intent.
It never assigns users by coarse labels, merges legacy grants, deletes records or
changes active flags. Conflicts between the two old stores and ambiguous actions
are reported and skipped. Keep the snapshot and reviewed plan as backups.

From `server`, an offline dry run using a deliberately exported, credential-free
snapshot (roles: id/name/isActive/permissions; legacyRoles: roleName/permissions;
users: id/roleId/role) is:

```powershell
node -r ts-node/register src/scripts/migrateRolePermissions.ts --snapshot C:\review\roles.json --out C:\review\plan.json
```

If an operator separately authorizes a database read, `--scan --out <external-plan>`
uses explicitly configured `MONGODB_URI` and writes a dry-run plan without changes.
After reviewing it, `--apply --plan <external-plan> --confirm-reviewed` applies only
unambiguous, lossless conversions with compare-and-set checks. Stale plans stop the
operation; earlier successful conversions are retained, never reset. Unassigned
users and ambiguous administrator roles need a separately reviewed operator repair
or a currently authorized administrator; the utility does not invent their grants.

## Last role-manager recovery protection

Application role/account updates, deactivations, deletions and reassignments must
leave at least one active account whose active assigned Role effectively grants
both `manageRolesAndPermissions:view_role` and `edit_role`. Normalization and
explicit legacy mappings match request authorization. Names and `User.role`
labels do not count. Unsupported or conflicting grants confer no recovery rights.
An existing zero-manager state may be explicitly repaired; the guard invents no grants.
If existing data has only an API role editor without View Role, its remaining
edit capability is also protected while an explicit repair adds viewing access.

Sensitive mutations run in a MongoDB transaction. A shared
`authorization_guards` revision write serializes the check and mutation across
processes and prevents concurrent changes to different roles/accounts from
removing both remaining managers. Assigned-role deletion restrictions still apply.
Failed account-provisioning cleanup also passes through the guard.

Transaction support (replica set or mongos) is required for these access mutations.
Unsupported deployments fail closed with HTTP 503 and save no access change;
last-manager removal returns HTTP 409 with an explanation. There is no unsafe
standalone fallback. The internal guard document is written only by a future
authorized mutation; no migration, account update or live execution is part of
this change. Name/description-only role edits and non-access account profile
edits do not alter recovery eligibility.

## Remaining endpoint-policy boundaries

This task unifies existing named permission checks. Previously public/authentication-only
endpoints retain their policies except the related product reads. Older role-name-only
`authorize('admin')` guards on expense, transfer and warehouse operations still impose
their old additional rules after assigned-role validation. Choosing granular policies
for those operations remains separate work; no broad financial policy was inferred.
REST-009 settings authentication, administrative checks, response allowlists and safe
credential updates, plus the REST-010 receipt contract, remain in place.
