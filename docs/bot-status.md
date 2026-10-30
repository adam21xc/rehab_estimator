# Bot status

The office at `/office` reads `public.bot_status`. Bots update their own row with the service role. The browser uses `PUBLIC_SUPABASE_ANON_KEY` (anon or publishable key) and only has `select`.

Apply `supabase/migrations/20261030160500_bot_status.sql` once in the Supabase SQL editor (or `supabase db push` against the project you mean to change). That migration creates the table, the `updated_at` trigger, read-only RLS, the Realtime publication, and the seed rows. Do not put the service-role key in `PUBLIC_` variables.

`updated_at` is set by the `before update` trigger. Leave it out of the statement.

`talking_to` is another bot's `bot_id`, or `null`. The office walks the bot to that desk (or into Jarvis's office) and shows `message`. Set both back to `null` when the conversation is over so the bot walks home.

This upsert changes `status`, `doing`, `talking_to`, and `message` only. An existing `name` and `color` stay as they are. `name` is still required so the insert works if the row is missing.

```sql
insert into public.bot_status (bot_id, name, status, doing, talking_to, message)
values (
  'lead-scout',
  'Lead Scout',
  'active',
  'Scanning new seller leads',
  null,
  null
)
on conflict (bot_id) do update
set status = excluded.status,
    doing = excluded.doing,
    talking_to = excluded.talking_to,
    message = excluded.message;
```

Walk over to Jarvis and say something:

```sql
insert into public.bot_status (bot_id, name, status, doing, talking_to, message)
values (
  'lead-scout',
  'Lead Scout',
  'active',
  'Bringing Jarvis a new seller lead',
  'jarvis',
  'Found a motivated seller on 10th Street.'
)
on conflict (bot_id) do update
set status = excluded.status,
    doing = excluded.doing,
    talking_to = excluded.talking_to,
    message = excluded.message;
```

Go idle and clear the conversation. The bot walks to the lounge couch:

```sql
insert into public.bot_status (bot_id, name, status, doing, talking_to, message)
values ('lead-scout', 'Lead Scout', 'idle', null, null, null)
on conflict (bot_id) do update
set status = excluded.status,
    doing = excluded.doing,
    talking_to = excluded.talking_to,
    message = excluded.message;
```

`status` must be `active`, `idle`, `blocked`, or `waiting`. Blocked and waiting rows show up under Waiting on Adam. Use `doing` for the short note, for example `Needs Full Disk Access on Mac mini`.

Run the statement as the service role (a server-side Supabase client or a Postgres session that bypasses RLS). The anon key cannot insert or update.
