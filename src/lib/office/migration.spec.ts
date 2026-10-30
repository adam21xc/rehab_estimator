import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const file = readdirSync(join(root, 'supabase/migrations')).find((name) =>
	name.endsWith('_bot_status.sql')
);
const sql = file ? readFileSync(join(root, 'supabase/migrations', file), 'utf8') : '';

describe('bot_status migration', () => {
	it('matches the approved table, read-only policies, realtime publication, and seed', () => {
		expect(file).toBeTruthy();
		expect(sql).toContain('create table public.bot_status');
		expect(sql).toContain('bot_id text primary key');
		expect(sql).toContain('name text not null');
		expect(sql).toContain('color text');
		expect(sql).toContain(
			"status text not null check (status in ('active', 'idle', 'blocked', 'waiting'))"
		);
		expect(sql).toContain('doing text');
		expect(sql).toContain('talking_to text');
		expect(sql).toContain('message text');
		expect(sql).toContain('updated_at timestamptz not null default now()');
		expect(sql).toContain('bot_status_touch_updated_at');
		expect(sql).toContain('before update on public.bot_status');
		expect(sql).toContain('enable row level security');
		expect(sql).toContain('grant select on table public.bot_status to anon, authenticated');
		expect(sql).toContain('for select');
		expect(sql).toContain('to anon');
		expect(sql).toContain('to authenticated');
		expect(sql).not.toMatch(/for insert|for update|for delete|for all/i);
		expect(sql).toContain('replica identity full');
		expect(sql).toContain('alter publication supabase_realtime add table public.bot_status');
		expect(sql).toContain("('jarvis', 'Jarvis', '#111111', 'active', null)");
		expect(sql).toContain("('lead-scout', 'Lead Scout', null, 'idle', null)");
		expect(sql).toContain(
			"('seller-followup', 'Seller Follow-up', null, 'blocked', 'Needs Full Disk Access on Mac mini')"
		);
		expect(sql).toContain("('deal-analyzer', 'Deal Analyzer', null, 'idle', null)");
		expect(sql).toContain("('research-assistant', 'Research Assistant', '#22C55E', 'idle', null)");
	});
});
