# Codebase review and development handoff

Reviewed October 2, 2026 against this checkout. This is a source review and local
verification, not a live audit of the deployed Supabase project or external workers.

## Changes in this pass

- Reduced `npm audit` from **35 findings (3 critical, 24 high, 6 moderate, 2 low)**
  to **zero reported findings**, including development dependencies.
- Refreshed vulnerable dependencies within existing ranges, including Svelte,
  SvelteKit, Vite, Playwright and affected transitive dependencies.
- Migrated Vitest 3 to 4.1.11, its Playwright provider and Svelte browser helper.
  Updated the config, browser import and type reference; browser tests run headless.
- Overrode only SvelteKit's `cookie` dependency to 0.7.2. The old 0.6 dependency
  accepts invalid cookie attributes; the compatible API is retained with stricter
  validation. Keep this override until the framework itself selects a patched
  version. Do not remove it merely to reduce the number of overrides.
- Required `SEND_DUE_SECRET` for batch email, dry-run contact previews and Gmail
  test sends. Missing configuration now fails closed. Added in-memory password
  inputs to the existing admin screen, including its already-required scanner secret.
- Rejected newline injection in Gmail test subjects, escaped test-message HTML,
  handled JSON null input and removed contact/address debug logging from send-due.
- Added mocked route regression tests that verify unauthorized requests cannot
  reach the database or mail provider, authorized previews do not send, and test
  email validation works.

The lockfile is part of the fix: use `npm ci` on another machine. Deprecation and
install-script policy warnings are separate from vulnerability findings; no broad
install-script approval policy was added. A clean audit does not establish that
the application or its deployment is free of security issues.

Upstream references: [Vitest advisory and patched versions](https://github.com/vitest-dev/vitest/security/advisories/GHSA-82fw-gwwq-j7x9),
[cookie validation advisory](https://github.com/advisories/GHSA-pxg6-pf52-xh8x).

## How the application fits together

| Area               | Main entry points                                                                                      | Data flow and boundary                                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Calculator         | `src/routes/rehab/+page.svelte`, `src/lib/stores/project.svelte.ts`, `src/lib/domain/`                 | Per-page Svelte state; catalog snapshot and quantities calculate locally; one draft persists under `rehab_project_v1`.            |
| Pricing            | `src/lib/data/rehabCatalog.ts`, `src/lib/domain/calc.ts`                                               | Quantities multiply snapshot prices. Previously saved estimates retain their original catalog.                                    |
| Cloud history      | `src/lib/components/EstimateWorkspace.svelte`, `src/routes/api/rehab/estimates/`                       | Photos upload first, then the server validates the snapshot and recomputes its total. Every save inserts an immutable version.    |
| Media and concepts | `src/routes/api/rehab/photos/`, `media/`, `renderings/`                                                | Private Supabase bucket, owner-scoped paths; explicit image generation tied to a saved photo and estimate.                        |
| Workspace auth     | `src/lib/server/rehab-auth.ts`, `src/routes/api/rehab/session/`                                        | Verified Supabase user plus email allowlist; HttpOnly cookies restricted to `/api/rehab`; matching Origin on mutations.           |
| SMS                | `src/lib/components/SmsWorkspace.svelte`, `src/lib/server/twilio.ts`, `src/routes/api/twilio/webhook/` | Shared workspace inbox via server-role queries after authentication; signatures and AccountSid checked on callbacks.              |
| Accela leads       | `src/routes/leads/+page.svelte`, `src/routes/api/rehab/leads/`, `scripts/accela/`                      | Read-only inbox over private source tables. Python worker uses a fenced database lease and preserves changed detail versions.     |
| MyCase leads       | `src/lib/components/MyCaseInbox.svelte`, `src/lib/mycase/`, `src/routes/api/rehab/mycase/`             | Reads `indiana_cases` written by another repository. Filters supported case types and removes raw payloads from detail responses. |
| Sales              | `src/routes/sales/`, `src/lib/sales/analytics.ts`, `src/lib/server/sales-data.ts`, `scripts/sales/`    | Imports complete snapshots, caches raw rows by import ID, computes actor/resale/inventory views in the app server.                |
| Email              | `src/routes/+page.svelte`, `src/lib/due.ts`, `gmail.ts`, `render.ts`, `templates.ts`                   | Separate admin flow over legacy leads and email counters. Sending, scanning and tracking are separate routes.                     |

The API is the authorization boundary; hiding a button is not sufficient. Shared
lead, sales and SMS data uses service-role access after an explicit workspace check.
Estimate queries instead attach the user's JWT so database ownership RLS also
applies. Preserve that distinction when adding endpoints.

Several server-only modules live directly in `src/lib` (`supabase.ts`, `gmail.ts`,
`due.ts`, `google-oauth.ts`). Private environment imports currently prevent their
use in client bundles. Moving them under `src/lib/server` would make their intent
clearer when this area is next refactored.

## Strengths worth preserving

- No shared mutable calculator singleton during server rendering. Restoration
  validates stored data, matches category keys and preserves corrupt drafts.
- Estimate saves capture a snapshot before awaiting uploads, so later edits are
  not falsely marked saved. Totals are recomputed on the server.
- The new migrations enable RLS and limit browser grants. Saved estimates are
  owner-scoped; source tables and the shared SMS inbox are server-only.
- SMS has request IDs, unique provider IDs, suppression handling and a partial
  index that blocks additional unresolved sends. Provider timeouts are not retried
  automatically; callback updates avoid overwriting later states.
- Accela uses bounded discovery windows, source identity checks, version history,
  retry backoff and a fenced lease. Gateway only publishes a complete import.
- Sales analytics explicitly handle duplicate/conflicting source rows, multi-parcel
  transfers and ambiguous same-day order instead of treating every price as a flip.

## Remaining work, in priority order

### Before broader hosting or automated email outreach

1. **Complete administrative route protection.** `api/gmail-health/+server.ts`
   can call Gmail and return mailbox identity/counts without a session guard.
   `api/oauth/start` and `api/oauth/callback` are setup tools; the callback has a
   state check but displays credentials and lacks explicit no-store headers.
   Put these behind an admin/setup boundary before exposing them. The email-send
   secret fix does not authenticate these separate routes.
2. **Make batch email retry-safe.** `api/send-due/+server.ts` reads due contacts,
   sends, then calls `bumpFollowup`. Two requests can select the same contacts;
   a successful Gmail send followed by a failed database update also leaves the
   contact eligible. Add transactional claims, per-message records and uncertain
   outcome reconciliation before scheduling it. Disable repeated UI submissions
   as an additional usability measure, not the only protection.
3. **Review live database access and capture missing schema.** This repository
   does not define the legacy email/DealMachine/MyCase schema and RPCs. The README
   reports earlier RLS warnings, but this pass did not verify current live grants.
   New table ownership policies do not themselves enforce `REHAB_ALLOWED_EMAILS`;
   that allowlist is an app-layer rule. Confirm direct Data API access and signup
   policy before expanding the workspace. A new database cannot yet be bootstrapped
   entirely from these migrations.
4. **Harden the email pipeline inputs.** The general `src/lib/gmail.ts` sender
   interpolates subjects and addresses into MIME headers; extend the newline
   validation beyond the Gmail-test route to imported/source-derived values.
   Bound the send batch size and validate numeric query parameters. The reply
   scanner counts any non-self message in a thread after its cutoff, and its
   auto-reply check is currently called without the raw headers it can inspect.
   Test bounces, automated replies and multi-party threads before relying on it
   to stop sequences automatically.

### Foundation for the feature backlog

5. **Introduce canonical properties, contacts and opportunities.** The estimator,
   source inboxes and SMS workspace are adjacent tools, not yet one CRM. Keep
   original case/source records intact and link them to reviewed property/contact
   entities. Use parcel/county identity where available; party mailing addresses
   and normalized company names are not sufficient proof of identity. Attach
   estimates and conversations to these entities, then add pipeline stages/tasks.
6. **Move filtering and pagination closer to the database.** Every MyCase list
   request loads all supported cases in 1,000-row batches before searching and
   sorting. Add an indexed normalized filing date and database pagination as it
   grows. Sales caches raw data but recomputes full analytics for each list and
   property request; cache derived results by snapshot/scope or materialize them.
7. **Remove the fixed 2026 sales assumption before year rollover.** The snapshot
   loader, importer, fetch artifact name, date validator and monthly chart buckets
   are tied to 2026. A year selector requires coordinated changes across those
   layers, plus tests spanning years. Gateway refresh is manual in this repo.
8. **Make field photo storage resilient.** A 5 MB image expands when stored as a
   data URL, and every calculator change serializes the whole local draft.
   Multiple photos can exhaust browser storage and make edits expensive. IndexedDB
   blobs, resized uploads and explicit sync state are the next step for offline
   field use. Define retention/cleanup for uploads whose estimate save fails.
9. **Use durable jobs if rendering becomes a core workflow.** Generation runs
   inside an HTTP request with a 180-second timeout. Request IDs and a unique
   active-job index help, but a server restart can strand a job; ten-minute cleanup
   occurs only on the next attempt. A worker with polling and reconciliation would
   make deployment timeouts and provider uncertainty visible. The daily allowance
   count and insert are separate operations, not an atomic quota reservation.

### Development reliability

10. **Add application CI and reusable test configuration.** The only checked-in
    GitHub workflow runs the Accela parser/importer. Add check, lint, unit/browser
    and production build gates for application changes. Use dummy credentials and
    mocked providers there. Generated Supabase types would reduce unchecked query
    shapes. Authentication refresh/cookie behavior and database policy regressions
    deserve dedicated coverage; browser mocks do not prove those integrations.

`docs/CRM_ROADMAP.md` is a historical plan. Its statements that cloud history,
Twilio and the Accela worker are absent are superseded by the implementation and
README. Its proposed canonical CRM model remains a useful starting point.

## Where to start a feature

| Feature                     | Start here                                                   | Preserve/test                                                                            |
| --------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Catalog items or pricing    | `src/lib/data/rehabCatalog.ts`                               | Existing saved prices, category keys and item IDs; calculator/browser restoration tests. |
| Calculator fields           | `src/lib/domain/types.ts`, `schema.ts`, store and components | Backward-compatible saved snapshots and localStorage; server snapshot validation.        |
| Pipeline or follow-up tasks | New CRM schema/API beside source tables                      | Reviewed source links, authorization and distinct source/pipeline statuses.              |
| Inbox filters               | Lead/MyCase routes and their domain selectors                | Filtering before pagination, date normalization and source provenance.                   |
| Sales metrics               | `src/lib/sales/analytics.ts`                                 | Ambiguous transfers, duplicates, multi-parcel rows and chronological ordering.           |
| Messaging automation        | Email message/claim model and SMS server routes              | Suppression, idempotency, uncertain sends and callback ordering.                         |

## Verification and local setup

This pass ran on Node 24.20.0; `.nvmrc` recommends Node 22. No `.env` was present.
Checks used `PUBLIC_SUPABASE_URL=http://127.0.0.1:54321` and
`SUPABASE_SERVICE_ROLE_KEY=local-test-placeholder` as process environment values.
These are test placeholders, not usable cloud credentials.

- `npm audit --json`: zero findings.
- `npm run check`: zero errors and warnings with the test environment.
- `npm run lint`: formatting and ESLint passed.
- `npm test`: 31 Vitest tests and 23 Playwright tests passed. Playwright built and
  ran the production preview as part of that run.
- Python: six Accela tests and two Gateway fetch/cache tests passed.

Live provider sends, paid renderings, database writes, migrations and remote worker
runs were not performed. Tests cover mocked cloud flows and selected real HTTP
authorization boundaries; they do not verify live RLS or provider configuration.

For actual development, follow the README to create a private `.env` with the
existing project credentials. Do not reapply migrations merely to set up this Mac.
Run `npm run dev` after configuring the environment. Keep live-test scripts separate
from ordinary unit/browser tests: some create cloud records and one sends email.
