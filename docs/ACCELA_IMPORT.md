# Accela hourly ingestion

The importer uses plain HTTP and Python 3.9+ standard-library modules. It does not
need Chrome, Browserless, npm packages, or an Accela login.

## Storage

- `accela_cases`: unique `(agency, case_number)`, real source URL, filing date,
  address/type/status, source summary, separate `owners`, `occupants`, `violators`
  JSON arrays, narrative and violation tables, parcels, latest structured raw detail.
- `accela_case_versions`: a new snapshot only when detail content changes.
- `accela_import_runs`: dates, counters, completion/failure, and error text.
- `accela_import_state`: renewable fenced lease and completed discovery watermark.

Parties preserve source text, role, phone/email when present, and raw lines.
`OCCUPANT`, `OCCUPANTS`, `CURRENT OCCUPANT`, `TENANT`, and `UNKNOWN OCCUPANT`
entries from a violator section go to `occupants`; named entries go to `violators`.
`source_role` retains the original classification. Do not treat owner, violator,
applicant, or occupant as interchangeable. Do not send generic occupants to name
skip tracing. Name/address normalization and review are a later CRM step.

Tables are private, RLS enabled, with no browser-role grants. The importer uses a
service-role-only, SECURITY INVOKER RPC. No scraper credentials or contact records
are committed or printed in workflow logs. This does not create outreach permission.

## Schedule and bounded work

The GitHub Actions workflow imports at minute 17 of each hour from 7 a.m. through
6 p.m. America/Indiana/Indianapolis, on a hosted runner. A local-time gate handles daylight
saving changes and skips automatic runs starting at or after 7 p.m. or before
7 a.m. Manual dispatch bypasses this window for testing/backfills. An import
already in progress may finish after the cutoff; its maximum duration is 50 minutes.
GitHub schedules are best-effort, not an exact one-hour SLA; public repositories
may disable schedules after 60 days without repository activity. Enable GitHub
Actions failure notifications for the owner. Manual workflow dispatch is available.

Every run searches from the last complete discovery date minus two days, through
today in America/Indiana/Indianapolis. Catch-up windows are capped at seven days
and advance across later runs after outages. An initial run starts two days back;
use explicit start/end dates for older backfills. The watermark never moves backward.

CSV record IDs must exactly match IDs from all paginated search result links before
accepting discovery. Internal Accela cap IDs are read from real links, never inferred.
An unrecognized empty/error page fails closed; it never deletes existing cases.
Changing records during pagination may fail completeness validation and retry next run.

Up to 150 due detail pages run per hour by default. New/changed source summaries
are queued immediately; successful open-case details refresh daily and closed/void
cases weekly. Pending work remains in the database. Request failures back off
1, 2, 4, 8, 16, then 24 hours; previously fetched details are preserved. One failed
case does not stop other cases. Detail errors are stored and the run status stays
`partial`, so those cases retry on their backoff. The process still exits 0 when
the errors are under the failure threshold, and it prints a GitHub Actions
`::warning::` annotation with the count. By default that threshold is more than
10% of `details_checked` (successful detail pages) and at least 3 errors: one or
two detail errors never fail the job on their own, and three or more fail it only
when they exceed 10% of the pages checked. Zero successful checks with at least 3
detail errors is over the threshold. Discovery, database, and other run-level
errors still exit nonzero. Override the limits with `--detail-error-rate` (a
fraction, default `0.10`) and `--detail-error-minimum` (default `3`), or with
`ACCELA_DETAIL_ERROR_RATE` and `ACCELA_DETAIL_ERROR_MINIMUM`. The hourly workflow
uses these defaults.

Requests are sequential with at least one second spacing and limited transient
retries. Lease renewal prevents concurrent workers; a terminated worker becomes
abandoned when its expired lease is reclaimed. A valid parser result must match the
requested case number. Attachments, inspection history, and processing-status tabs
are not imported yet. Filing-date discovery cannot find older, never-imported cases
without a backfill; the refresh queue only covers known cases.

## Run locally

With the repo's existing gitignored `.env`:

```sh
node scripts/run-accela.mjs --start 2026-09-29 --end 2026-09-29 --max-details 3
```

Hosted worker environment: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
GitHub repository secrets: `ACCELA_SUPABASE_URL`, `ACCELA_SUPABASE_SERVICE_ROLE_KEY`.
Service-role access is privileged; only trusted repository maintainers should be
able to change/dispatch the workflow. Do not run it on pull-request code.

## Checks

```sh
python3 -m unittest discover -s tests/accela -v
```

`tests/accela/database.sql` checks lease exclusivity/fencing, idempotent snapshots,
change history, failed-fetch preservation, and denied browser access. Run it against
a migrated database with no active importer; all test writes roll back.

The live September 29 discovery test imported 193 unique summaries and checked
three detail pages successfully. No CRM frontend or outreach sequence is enabled
by this importer.
