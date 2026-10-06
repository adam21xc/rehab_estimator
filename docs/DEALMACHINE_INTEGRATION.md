# DealMachine integration

Our app is the system of record. The first rollout is capped at **100 source lead records**, including the original seven pilot records; this is not a 100-credit budget. The cohort contains 25 records per group: Accela, foreclosure, unsupervised estate, and eviction, distributed across available counties. Duplicate properties can have multiple source leads.

## Data model

Keep `accela_cases` and `indiana_cases` intact. `dm_source_links` stores source snapshots, record types, candidate addresses and review decisions. A shared `dm_properties` row connects multiple lead types to one property. `dm_contacts` and `dm_property_contacts` preserve provider contact candidates separately. This supports a unified workspace without flattening court facts and property facts into one row or one mutually exclusive enum.

`dm_requests` saves raw responses, timestamps and credits before projections. Normalized addresses share a durable cache; repeated views and accepted cached results do not call the provider. An atomic request claim prevents concurrent duplicate submissions. Ambiguous or timed-out requests remain pending and require reconciliation; do not delete claims and blindly retry. Different address spellings beyond the implemented normalization may still need separate matching.

Provider estimates update when newer results are projected; existing non-null property facts are preserved. There is no scheduled refresh or cache expiry yet. Original source records are never overwritten by provider data. Ownership disagreements and contradictory estimates go to review. Court party addresses require confirmation as subject-property addresses before enrichment. Landlords must be distinguished from tenants; an estate party address is not necessarily estate property. Contact associations do not authorize outreach.

## Use

Set server-only `DEALMACHINE_API_KEY` and `DEALMACHINE_ORGANIZATION_ID` in the deployment environment. Never expose them through public environment variables. Database tables are private, with RLS enabled and access through the existing allowlisted, authenticated server routes.

Open `/enrichment` to review saved records, confirm addresses and enrich up to three ready records at a time. Refresh saved data only reads the database. The detailed view includes saved source facts and provider responses.

`node scripts/dealmachine-rollout.mjs` imports existing ignored pilot artifacts and fills the bounded cohort. Add `--run` to process ready records through the shared database cache. The previous local-only pilot runner is disabled. Do not use it to bypass persistence.

Initial database-backed run: 100 records, 27 with enrichment linked to 17 unique properties and 18 provider contacts; 11 accepted, 16 findings to review, 73 awaiting property matching. Recorded credits total 35 (14 original pilot + 21 new). No pending requests. These are run-time observations, not fixed future totals.

## Remaining work

Review the 73 property matches before processing them. Evaluate which saved fields should appear in the CRM and marketing segmentation. Owner mailing addresses were not confirmed as a dedicated enrichment field in the samples; do not substitute the subject-property address for absentee-owner mail.

Mail is deferred. The current mail API supports custom HTML front/back designs with draft publication control. Direct Canva PDF/PNG compatibility has not been verified with actual artwork. Check dimensions, bleed, address/postage safe areas and rendered preview when the design is supplied, before ordering mail. No mail campaigns or designs were submitted during this rollout.

## Eviction ownership flow

Confirmed rental premises are enriched for property-owner contacts (`contact_audience: owners`). Defendant names stay in the source snapshot as likely tenants and are never used as ownership-match requirements. All recorded plaintiffs are shown separately as landlord-side parties; an owner-name match is supporting evidence and a mismatch alone does not block a property link. Missing provider ownership, different addresses/units, provider warnings and conflicting estimates still require review. Party mailing addresses still require premises confirmation. LLC-associated contacts remain provider owner candidates, not verified individual owners. Existing source snapshots and cached responses support this flow without a data migration or another paid lookup.

## Foreclosure ownership evidence

Compare provider owners with all named defendants, preserving plaintiffs separately. No bank/person heuristic excludes an owner. Conservative name comparison handles comma name order, punctuation, missing middle names, compatible middle initials and entity suffix differences; conflicting first names, spelled-out middle names and personal suffixes do not match. Close matches are supporting evidence, not proof of legal identity or subject-property selection. Name agreement remains a likely match for human review, with address/unit differences, missing owners, additional unmatched co-owners and provider conflicts still flagged. The review page computes this evidence from saved source/property data without spending credits or changing prior human decisions.

The review page expands details immediately below the selected case. Its status, case type, and inclusive filing-date filters combine; undated records are hidden only when a date boundary is set. Date values come from the saved source `file_date` (MyCase) or `filed_date` (Accela), not enrichment time. Filters affect the displayed review list; the processing action continues to use the full ready queue and the page states this explicitly.
