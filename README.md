# Rehab estimator and outreach

A Svelte 5 / SvelteKit application with four screens:

- `/rehab`: property rehab calculator with 39 categories and 180 priced items.
- `/`: outreach administration for Gmail and Supabase.
- `/leads`: authenticated Accela case inbox with search and detail views.
- `/sales`: authenticated Marion County sales intelligence, participant rankings,
  matched resales, holding periods, inventory candidates, and same-day transfer candidates.
  Click an address for a property profile with recorded history, Google Maps, and a Zillow address lookup.

## Local development

Use Node.js 22.12+ (the `.nvmrc` selects Node 22). Use Python 3.9+ for the importers.

```sh
nvm install
nvm use
npm ci
cp .env.example .env
# Fill in the real Supabase values and approved email in .env before starting.
npm run dev
```

Outreach requires a local, Git-ignored `.env` with `PUBLIC_SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`,
`GMAIL_REDIRECT_URI`, `GMAIL_REFRESH_TOKEN`, `FROM_EMAIL`, `SENDING_NAME`, and
`PUBLIC_BASE_DOMAIN`. Never put the service-role key or OAuth secrets in public
variables. Optional settings include `BATCH_SIZE`, `SEND_DELAY_MS`,
`DAYS_BETWEEN_FOLLOWUPS`, `MAX_FOLLOWUPS`, `SEND_DUE_SECRET`, and
`SCAN_REPLIES_SECRET` (required by the reply scanner).

For local Gmail reauthorization, register
`http://localhost:5173/api/oauth/callback` in the Google OAuth client, set it as
`GMAIL_REDIRECT_URI`, and visit `http://localhost:5173/api/oauth/start`. Save the
returned refresh token as `GMAIL_REFRESH_TOKEN` in `.env`. Restart the server if
needed. The authorization callback is an administrative setup tool and displays
credentials; do not share its output.

The external database must already contain `deal_machine_leads`, `emails_table`,
`bump_followup(_nk, _thread)`, and `track_open(token)`. Their schema is not managed
by this repository. The pixel endpoint supports the legacy `_token` RPC signature
only when the primary signature is missing.

## Moving development to another Mac

Clone or pull this repository on the Mac Mini, then follow Local development above.
The source, lockfile, tests, and SQL migrations are versioned together.

Transfer the real `.env` separately using your password manager or a private file
transfer. The template contains no real credentials. Connect to the existing Supabase
project to reuse saved estimates, media, imported Accela cases, and the completed
11,675-row Gateway sales snapshot. Do not rerun schema migrations against the existing
project merely because you switched computers. This repository is not a complete
bootstrap for a brand-new database: legacy outreach tables/functions predate it.

Raw sales downloads, outreach test manifests, and Supabase CLI caches are ignored.
They are not needed to display data already stored in Supabase. Unsaved browser
calculator drafts/photos live on the original computer; save estimates to cloud
history before switching if you need to retain them.

For browser tests, run `npx playwright install chromium`, then `npm test`.
The test suite uses mock email/SMS/image providers and does not prove live provider
configuration. Standalone live-test scripts may create temporary users/records;
the email send script sends real messages and is not part of `npm test`.

## Current implementation boundaries

The lead and sales pages are read-only views, not a finished CRM pipeline. MyCase is connected through the existing scraper’s `indiana_cases` table. The current sales snapshot has sale dates
through July 31, 2026 and is not refreshed by a scheduled worker. To refresh manually,
run `python3 scripts/sales/fetch.py`, then `node scripts/sales/import.mjs`. A normal
fetch starts fresh; use `python3 scripts/sales/fetch.py --resume` only for an
interrupted download. Run `python3 -m unittest discover -s tests/sales -v` to check
cache freshness and resumption without contacting Gateway. Gross resale
spreads are not net profits or reported assignment fees.

Accela ingestion is deployed separately in GitHub Actions. Its workflow is active;
scheduled invocations have completed successfully, including October 2, 2026.
GitHub may delay or skip scheduled runs, so the hourly cron is not an exact-time guarantee. The configured import window remains 7 a.m.–7 p.m.
America/Indiana/Indianapolis (Eastern time, including daylight saving); changing computers does not change that schedule.
It runs on GitHub-hosted workers, so the Mac Mini does not need to stay on for Accela ingestion.
Avoid installing a duplicate local Accela schedule. Gateway sales refresh is still manual;
email/SMS outreach is not automatically enabled by cloning the repository.

This is suitable for local development, not an approval to expose the entire app
publicly. Legacy outreach endpoints need an authorization review before public
hosting: `/api/gmail-test` has no session guard, and `/api/send-due` permits requests
when `SEND_DUE_SECRET` is absent. The CRM endpoints independently require a verified,
allowlisted workspace account. Paid image generation and live SMS/email sending
were not exercised by the repository verification.

## Calculator state

`src/lib/stores/project.svelte.ts` creates a separate state instance for each page.
It uses `$state` for the project and `$derived` for totals. Components use `$props`
and callback props; the page uses `$effect` for browser persistence. There is no
shared mutable server-side project singleton.

Existing `rehab_project_v1` localStorage data and saved catalog prices are retained.
Restoration validates saved data and matches progress by category key. Corrupt saved
data is preserved rather than overwritten. Browser storage failures show a warning.
Unsaved photos remain data URLs in the local draft and are limited by browser storage capacity.
Saving an estimate uploads JPEG/PNG/WebP photos to private Supabase Storage and replaces
local image data with authenticated media references. Old temporary blob URLs cannot
recover image bytes after their originating browser session ends. See the cloud setup below.

## Verification

```sh
npm run check
npx playwright install chromium
npm test
npm run build
```

The rehab browser tests cover quantities, totals, category navigation, summary,
legacy saved projects, reloads, photos, invalid quantities, and storage failures.
Pixel unit tests mock Supabase and never contact live services.

## Isolated live outreach tests

These commands use real Supabase credentials and create temporary test rows.
They never run `/api/send-due` or send to existing campaign contacts.

Test the deployed tracking endpoint (or pass a local origin as the first argument):

```sh
node scripts/test-outreach-pixel.mjs
node scripts/test-outreach-pixel.mjs http://localhost:5173
```

This creates two isolated plus-alias records with `responded: true` so they cannot
enter the campaign queue. It checks first/repeated requests, timestamps, an untouched
control, missing/unknown tokens, and GIF/cache headers, then deletes its exact test
records in `finally`. No email is sent. This verifies HTTP-to-database behavior,
not whether a mail client loads the image.

To send two labeled messages to plus aliases of the authenticated sender using the
app's Gmail sender and email renderer:

```sh
node scripts/test-outreach-email.mjs send
```

The script verifies the authenticated address matches `FROM_EMAIL`, checks that the
sent MIME contains the tracking pixel, and writes a manifest under Git-ignored
`.outreach-tests/`. Open only the message labeled `OPEN THIS MESSAGE` in Gmail with
images enabled; leave the control unopened. Inspect counts and then remove the
test records using the printed manifest path:

```sh
node scripts/test-outreach-email.mjs check .outreach-tests/<manifest>.json
node scripts/test-outreach-email.mjs cleanup .outreach-tests/<manifest>.json
```

Email test records remain excluded from the queue until cleanup. The labeled emails
remain in the mailbox. If sending fails partway, use the manifest to clean up the
test records. Pixel counts measure image fetches, not independently verified human
reads; client image loading and caching can affect results.

### Live verification (September 29, 2026)

The deployed and local pixel endpoints passed first-request, repeated-request,
untouched-control, timestamp, and missing/unknown-token checks using isolated records.
Those HTTP test records were removed afterward.

After Gmail reauthorization, two labeled messages were delivered to plus aliases
of the sender. Both sent MIME messages contained their unique tracking pixels.
Both database records already showed one fetch while both Gmail messages still had
`UNREAD` and `INBOX` labels, including the unopened control. This demonstrates that
`open_count` is not proof of a human read. Automatic image fetching is a possible
explanation; request provenance was not captured, so its exact cause is unconfirmed.
Google documents image scanning and proxying:
[image handling in Gmail](https://support.google.com/mail/answer/145919).

After the user confirmed opening the test message with images enabled, both counters
remained at one and both timestamps were unchanged. The test therefore did not
distinguish the confirmed manual open from the unopened control. Earlier automatic
fetching followed by caching is consistent with this result, but not conclusively
identified. The email test database records were removed; the labeled messages were
left in the mailbox.

## Mobile walkthrough and CRM roadmap

The calculator now has a phone-sized category selector with previous/next navigation,
larger touch controls, a saved property address, a safe-area-aware total bar, and a
modal summary. Desktop keeps the category tabs. Browser tests cover 390 px and 320 px
phone widths, address/quantity persistence, navigation boundaries, modal dismissal,
and horizontal overflow with large totals.

See [the CRM rollout plan](docs/CRM_ROADMAP.md) for the reviewed MyCase/Accela
integrations, proposed property/contact/message model, DealMachine enrichment flow,
and the earlier design notes. The Accela worker has since been implemented; see
[its operating documentation](docs/ACCELA_IMPORT.md) for the current importer design.

## Cloud history and remodel studio

The Apex interface supports local estimates without sign-in. **Save estimate** requires
an approved Supabase Auth account and creates an immutable historical snapshot (including
catalog prices). **History** lists 30 versions at a time and opens any saved version;
saving edits creates another version. **New** starts a separate property draft.

The migration in `supabase/migrations/20260929212257_rehab_estimates_and_renderings.sql`
was applied to the existing application project `hjjovyarddvzqfhzaiuq`. It creates
`rehab_estimates`, `rehab_renderings`, and the private `rehab-media` bucket. RLS
restricts rows/files to their owning Supabase Auth user. No public image URLs are created.
Keep this migration with the repo; do not reapply it to the same database.

Server environment:

```dotenv
# Existing values remain required; never expose the service key to the browser.
PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVER_KEY
# Comma-separated approved email addresses. Defaults to FROM_EMAIL if omitted.
REHAB_ALLOWED_EMAILS=adam@adam-buys-houses.com
# Enables real rendering requests; configure only on the server.
OPENAI_API_KEY=YOUR_OPENAI_API_KEY
```

Use **Sign in → Create account** for the approved email, confirm its email if required,
then sign in. Supabase Auth must allow email/password login. Configure the Auth Site URL
and allowed redirect URLs for `/rehab` on localhost and the deployment. The Supabase
confirmation-email sender may require custom SMTP. Existing Gmail OAuth authorization
is separate from this account. Access/refresh tokens live in HttpOnly SameSite cookies;
the server verifies the user with Supabase on each private request. Mutations require
a matching Origin. Sign-out leaves the current local draft on that device.

**Design studio:** add photos to repair items, save the estimate, choose a photo and
style, describe changes, then select **Generate remodel concept**. The server sends
that selected photo and prompt to OpenAI's Images edits API with
`gpt-image-2.5-sunburst`, medium quality, one 1024×1024 JPEG. The original remains
untouched. Results, prompts and statuses are attached to that saved version; reopen
it from History to revisit/download them. `Suggest a direction` lets the model propose
a visual treatment. Generation requires an API key, billing and model access; a ChatGPT
subscription alone does not configure this server. Documentation:
https://developers.openai.com/api/docs/guides/image-generation

Requests are explicit, limited to one active job per user and 10 requests per rolling
24 hours. A client request ID prevents accidental reuse of the same request. No paid
request is automatically retried. A request has a 180-second provider timeout; the
hosting platform must support that duration. Interrupted requests may be charged;
refresh concept history before requesting another. This initial version runs generation
within the HTTP request, not a durable background worker. Jobs interrupted by a process
restart are marked failed on the next generation attempt after 10 minutes.

Original photos are limited to 5 MB each, JPEG/PNG/WebP, up to 100 per saved estimate.
Convert iPhone HEIC images before uploading. Local drafts are not an offline media cache:
cloud photos require sign-in and connectivity. Production should also set hosting request
size limits and configure storage lifecycle cleanup for abandoned uploads.

Validation:

- `npm test`: unit/browser tests, including cloud workflow using mocked HTTP responses.
- `node scripts/test-rehab-cloud.mjs`: live isolated Supabase save/read, ownership,
  storage privacy, immutable estimates, and rendering concurrency checks. Creates
  temporary Auth users and cleans all test users, records and files. Does not call OpenAI.
- Real OpenAI generation has not been exercised without `OPENAI_API_KEY`.

The Supabase advisor found no warnings on the new rehab tables. Existing unrelated
lead tables have RLS disabled, and several existing functions have mutable search paths.
Review these before broadening CRM access:
https://supabase.com/docs/guides/database/database-linter?lint=0013_rls_disabled_in_public

## Twilio SMS workspace

The calculator's **SMS outreach** tab provides an authenticated shared inbox and
explicit one-to-one text sending. Approved workspace users share SMS history; estimates
remain individually owned. Email outreach has not yet been merged into this timeline.
The database migration `20260929215920_twilio_sms_workspace.sql` adds server-only
` sms_messages` and `sms_suppressions` tables with RLS enabled and no browser-role grants.

Configure these server-only values in `.env` (never paste credentials into chat):

```dotenv
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
# Use a Messaging Service or an SMS-capable Twilio number in E.164 format.
TWILIO_MESSAGING_SERVICE_SID=MG...
# TWILIO_FROM_NUMBER=+13175550123
# Public HTTPS origin, without a path/query. Localhost cannot receive Twilio webhooks.
SMS_PUBLIC_BASE_URL=https://YOUR_DEPLOYMENT_HOST
```

Configure your Twilio number or Messaging Service's inbound-message webhook as POST:
`https://YOUR_DEPLOYMENT_HOST/api/twilio/webhook`. The app attaches the delivery callback
URL to every outbound message automatically. Enable the Messaging Service's Advanced
Opt-Out where supported. Twilio account registration/sender requirements still apply;
credentials alone do not guarantee carrier delivery. No account settings are changed by
this code, and no bulk campaigns or automatic texts are enabled.

All callbacks validate Twilio's SDK signature against the exact public URL and all form
parameters, and verify AccountSid. The history records inbound replies, delivery state,
errors and author. Duplicate callbacks do not create duplicate inbound messages. STOP
variants and Twilio OptOutType=STOP block future sends. START does not automatically remove
the app's suppression; review consent before manually clearing a suppression. Suppression
is workspace-wide for the number. The confirmation checkbox records an operator assertion,
not an independent consent-verification service.

Outbound request UUIDs prevent the same submission from being sent twice. Network timeouts
are marked `unknown`, with no automatic retry; a partial unique index also blocks a second
unresolved send to that number. Check Twilio and reconcile uncertain rows before retrying.
This initial integration does not import older Twilio history, attach MMS media, or infer
phone-to-property matches. It supports manually selected SMS recipients only.

Verification: `node scripts/test-twilio-integration.mjs` exercises actual route handlers
against live Supabase with temporary records, intercepts all Twilio API calls, tests
inbound STOP and callback ordering, and cleans up. It never sends a real SMS. Browser and
unit tests cover the signup controls, disabled unconfigured sending and signature checks.

Official Twilio references:

- https://www.twilio.com/docs/messaging/api/message-resource
- https://www.twilio.com/docs/usage/webhooks/webhooks-security

## MyCase lead inbox

On `/leads`, select **MyCase court leads**. The authorized server endpoints
`/api/rehab/mycase` and `/api/rehab/mycase/[id]` read the same `indiana_cases`
table written by the separate `mycase-scraper` project. No copy/backfill or second
source table is needed: successful scraper upserts appear on the next CRM refresh.
The scraper must continue pointing at the same Supabase project using its existing
`SUPABASE_URL` and server-only `SUPABASE_SERVICE_ROLE` configuration.

The inbox includes mortgage foreclosures (MF), unsupervised estates (EU), and
evictions (EVSC/EVCD), with county, type, name/address/case search, date sorting,
and pagination. Unrelated case types are excluded from both list and detail routes.
Dates are parsed from the legacy MM/DD/YYYY text before sorting. The current small
dataset is read in 1,000-row batches before filtering/pagination; at larger scale,
add an indexed normalized filing-date column to the source schema.

Party mailing addresses are not verified subject-property addresses. Case status
is a court source status, not an acquisition pipeline stage. The case dialog shows
stored parties and a link to MyCase search; source tokens and raw payloads are not
exposed. The last stored update is shown explicitly. The inbox shows the latest stored update; its count grows as the scraper imports new cases.

Fresh scraping runs separately in the `adam21xc/mycase-scraper` GitHub repository:
its **MyCase daily import** workflow is scheduled for 8:17 a.m. Eastern, using
Browserless and writing directly to this database. It checks the existing 14
foreclosure/estate/eviction court prefixes in Marion, Hendricks, and Tippecanoe
counties for the current and previous month. This is not every court in those
counties and does not backfill older missing months. GitHub scheduling can be delayed;
a scheduled run delayed past 7 p.m. Eastern is skipped. Manual dispatch is available.
No Mac Mini cron is required. Review GitHub Actions for failures and run summaries;
refreshing this inbox only reads the latest database records.

Run `node scripts/test-crm-live.mjs` for live read/auth checks using a temporary user;
source records are never modified by that verification.

MyCase detail dialogs also show the chronological case summary from stored
`raw_json.Events`, including filing/order notes, party labels, and hearing sessions.
Event dates are sorted oldest first with source order retained for same-day entries;
future hearings are scheduled events, not proof they occurred. Document names are
shown without exposing source download tokens or implying download permission.
The scraper already upserts on the text primary key `case_number`: each successful
refresh replaces the same case snapshot (including events), not a new lead.
This is the latest stored snapshot, not an audit history of every prior scrape.
The daily current/previous-month scope does not refresh older active cases; a separate
older-case reconciliation job is still needed for that coverage.
