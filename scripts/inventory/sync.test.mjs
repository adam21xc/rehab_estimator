import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	sourceLink,
	planSync,
	canRefreshSource,
	planStatusRefreshes,
	syncInventory,
	MYCASE_ENRICHMENT_WINDOW_DAYS,
	enrichmentWindowDays,
	parseFileDate,
	mycaseFilingInWindow
} from './sync.mjs';

const now = new Date('2026-10-30T15:00:00Z');
const accela = {
	agency: 'INDY',
	case_number: 'A',
	address: '123 MAIN ST INDIANAPOLIS IN 46222',
	owners: [],
	detail_checked_at: null
};
const court = {
	case_number: 'B',
	case_type_code: 'EVSC',
	primary_defendant_address: accela.address,
	primary_defendant_name: 'Tenant',
	token: 'secret',
	raw_json: { secret: true }
};

test('only complete source property addresses become ready; court party addresses never do', () => {
	assert.equal(sourceLink('accela', accela).status, 'ready');
	assert.equal(sourceLink('accela', { ...accela, address: 'MAIN ST' }).status, 'needs_match');
	const link = sourceLink('mycase', court);
	assert.equal(link.status, 'needs_match');
	assert.equal(link.source_record.token, undefined);
	assert.equal(link.source_record.raw_json, undefined);
});

test('repeat sync adds nothing and preserves reviewed source links', () => {
	const recent = { ...court, file_date: '10/01/2026' };
	const a = sourceLink('accela', accela);
	const m = {
		...sourceLink('mycase', recent),
		status: 'accepted',
		property_id: 'property',
		reviewed_at: 'date'
	};
	const p = planSync([accela], [recent], [a, m], { now, windowDays: 90 });
	assert.equal(p.additions.length, 0);
	assert.equal(p.tasks.filter((t) => t.kind === 'case_documents').length, 0);
	assert.equal(m.status, 'accepted');
});

test('only missing details create fetch tasks; document tasks use stable record IDs', () => {
	const p = planSync(
		[{ ...accela, detail_checked_at: 'date' }],
		[{ ...court, file_date: '10/01/2026' }],
		[],
		{ now, windowDays: 90 }
	);
	assert.equal(p.additions.length, 2);
	assert.deepEqual(
		p.tasks.map((t) => [t.id, t.kind]),
		[['mycase:B', 'case_documents']]
	);
});

test('fresh details update only untouched unenriched Accela records', () => {
	const current = sourceLink('accela', { ...accela, detail_checked_at: 'new' });
	const saved = {
		status: 'ready',
		address_role: 'subject_property',
		source_detail_checked_at: 'old'
	};
	assert.ok(canRefreshSource(saved, current));
	for (const change of [
		{ property_id: 'p' },
		{ reviewed_at: 'date' },
		{ status: 'accepted' },
		{ status: 'no_match' },
		{ address_role: 'reviewed_subject_property' },
		{ source_detail_checked_at: 'new' }
	])
		assert.ok(!canRefreshSource({ ...saved, ...change }, current));
});

test('enrichment window defaults to 90 days and can be overridden', () => {
	assert.equal(MYCASE_ENRICHMENT_WINDOW_DAYS, 90);
	assert.equal(enrichmentWindowDays({}), 90);
	assert.equal(enrichmentWindowDays({ MYCASE_ENRICHMENT_WINDOW_DAYS: '30' }), 30);
	assert.equal(enrichmentWindowDays({ MYCASE_ENRICHMENT_WINDOW_DAYS: '0' }), 0);
	assert.throws(() => enrichmentWindowDays({ MYCASE_ENRICHMENT_WINDOW_DAYS: '90.5' }));
});

test('MyCase enrichment tasks stay inside the 90-day filing window, including the boundary', () => {
	assert.equal(parseFileDate('08/01/2026'), '2026-08-01');
	assert.equal(parseFileDate('02/31/2026'), null);
	assert.equal(parseFileDate('2/06/2026'), null);
	assert.equal(mycaseFilingInWindow('08/01/2026', now, 90), true);
	assert.equal(mycaseFilingInWindow('07/31/2026', now, 90), false);
	const plan = (file_date, case_number = 'B') =>
		planSync([], [{ ...court, case_number, file_date }], [], { now, windowDays: 90 });
	assert.deepEqual(
		plan('08/01/2026').tasks.map((t) => t.id),
		['mycase:B']
	);
	assert.equal(plan('07/31/2026').tasks.length, 0);
	assert.equal(plan('10/30/2026', 'TODAY').tasks.length, 1);
	assert.equal(plan('02/06/2026').tasks.length, 0);
	assert.equal(plan('02/06/2026').additions.length, 1);
	for (const file_date of [undefined, '', '02/31/2026', '2026-02-06', '2/06/2026', '10/31/2026']) {
		const p = plan(file_date);
		assert.equal(p.tasks.length, 0, `queued ${file_date}`);
		assert.equal(p.additions.length, 1, `tracked ${file_date}`);
	}
	// 03:30Z on Oct 31 is still Oct 30 in Indiana, so the Aug 1 boundary stays inside.
	assert.equal(
		planSync([], [{ ...court, file_date: '08/01/2026' }], [], {
			now: new Date('2026-10-31T03:30:00Z'),
			windowDays: 90
		}).tasks.length,
		1
	);
	assert.equal(
		planSync([], [{ ...court, file_date: '08/01/2026' }], [], {
			now: new Date('2026-10-31T04:30:00Z'),
			windowDays: 90
		}).tasks.length,
		0
	);
});

test('archived task ids are not recreated', () => {
	const recent = { ...court, file_date: '10/01/2026' };
	const p = planSync([{ ...accela, detail_checked_at: null }], [recent], [], {
		now,
		archivedIds: ['mycase:B', 'accela:INDY:A']
	});
	assert.deepEqual(p.tasks, []);
	assert.equal(p.additions.length, 2);
	const open = planSync([], [recent], [], { now, archivedIds: ['mycase:OTHER'] });
	assert.deepEqual(
		open.tasks.map((t) => t.id),
		['mycase:B']
	);
});

test('status refresh updates court outcome on tracked cases and does not create tasks', () => {
	const current = {
		...court,
		file_date: '02/06/2026',
		status: 'Dismissed',
		disposition: 'sheriff sale',
		case_status_date: '10/20/2026'
	};
	const saved = {
		id: 'mycase:B',
		status: 'needs_match',
		address_role: 'party_address_unverified_subject_property',
		updated_at: '2026-04-01T00:00:00Z',
		court_status: 'Pending',
		court_disposition: null,
		court_case_status_date: '02/06/2026'
	};
	const p = planSync([], [current], [saved], { now, archivedIds: ['mycase:B'] });
	assert.equal(p.tasks.length, 0);
	assert.equal(p.additions.length, 0);
	assert.deepEqual(planStatusRefreshes(p.sources, [saved]), [
		{
			id: 'mycase:B',
			updated_at: '2026-04-01T00:00:00Z',
			patch: {
				status: 'Dismissed',
				disposition: 'sheriff sale',
				case_status_date: '10/20/2026'
			}
		}
	]);
	assert.equal(saved.status, 'needs_match');
	const unchanged = {
		...court,
		file_date: '02/06/2026',
		status: 'Pending',
		case_status_date: '10/01/2026'
	};
	const pending = { ...saved, court_case_status_date: null };
	assert.deepEqual(
		planStatusRefreshes(planSync([], [unchanged], [pending], { now }).sources, [pending]),
		[]
	);
});

function createDb(seed) {
	const tables = {
		accela_cases: [...(seed.accela || [])],
		indiana_cases: [...(seed.mycase || [])],
		dm_source_links: (seed.links || []).map((row) => ({
			...row,
			source_record: { ...row.source_record }
		})),
		enrichment_tasks: [],
		enrichment_tasks_archived: [...(seed.archived || [])]
	};
	const ops = [];
	function run(state) {
		ops.push({
			table: state.table,
			op: state.op,
			cols: state.cols,
			ids: state.rows?.map((row) => row.id) || null,
			values: state.values ? { ...state.values } : null
		});
		const table = tables[state.table];
		if (!table) return { data: null, error: { message: `missing ${state.table}` } };
		if (state.op === 'upsert') {
			const inserted = [];
			for (const row of state.rows) {
				if (!table.some((item) => item.id === row.id)) {
					table.push({ ...row });
					inserted.push({ id: row.id });
				}
			}
			return { data: inserted, error: null };
		}
		if (state.op === 'update') {
			const matches = table.filter((row) =>
				state.filters.every(([kind, key, value]) =>
					kind === 'eq' ? row[key] === value : row[key] == value
				)
			);
			for (const row of matches) Object.assign(row, state.values);
			return { data: matches.map((row) => ({ id: row.id })), error: null };
		}
		let rows = table;
		for (const [kind, key, value] of state.filters) {
			rows = rows.filter((row) => (kind === 'eq' ? row[key] === value : row[key] == value));
		}
		if (state.range) rows = rows.slice(state.range[0], state.range[1] + 1);
		if (state.single) {
			return rows[0]
				? { data: rows[0], error: null }
				: { data: null, error: { message: 'not found' } };
		}
		return { data: rows.map((row) => ({ ...row })), error: null };
	}
	function from(table) {
		const state = {
			table,
			op: 'select',
			filters: [],
			cols: null,
			rows: null,
			values: null,
			range: null,
			single: false
		};
		const builder = {
			select(cols) {
				state.cols = cols;
				return builder;
			},
			order() {
				return builder;
			},
			range(start, end) {
				state.range = [start, end];
				return builder;
			},
			eq(key, value) {
				state.filters.push(['eq', key, value]);
				return builder;
			},
			is(key, value) {
				state.filters.push(['is', key, value]);
				return builder;
			},
			upsert(rows) {
				state.op = 'upsert';
				state.rows = rows;
				return builder;
			},
			update(values) {
				state.op = 'update';
				state.values = values;
				return builder;
			},
			single() {
				state.single = true;
				return builder;
			},
			then(resolve, reject) {
				try {
					resolve(run(state));
				} catch (error) {
					reject(error);
				}
			}
		};
		return builder;
	}
	return { db: { from }, tables, ops };
}

test('sync writes a status-only refresh and does not queue old or archived cases', async () => {
	const { db, tables, ops } = createDb({
		mycase: [
			{
				case_number: 'OLD',
				case_type_code: 'MF',
				county_code: '49',
				file_date: '02/06/2026',
				status: 'Decided',
				case_status_date: '10/15/2026',
				primary_defendant_name: 'Tenant',
				primary_defendant_address: accela.address,
				parties: [],
				court: 'Marion',
				style: 'Example'
			},
			{
				case_number: 'NEW',
				case_type_code: 'MF',
				county_code: '49',
				file_date: '10/01/2026',
				status: 'Pending',
				case_status_date: '10/01/2026',
				primary_defendant_name: 'Tenant',
				primary_defendant_address: accela.address,
				parties: [],
				court: 'Marion',
				style: 'Example'
			}
		],
		links: [
			{
				id: 'mycase:OLD',
				status: 'accepted',
				property_id: 'property',
				address_role: 'reviewed_subject_property',
				reviewed_at: '2026-03-01T00:00:00Z',
				updated_at: '2026-03-01T00:00:00Z',
				court_status: 'Pending',
				court_disposition: null,
				court_case_status_date: '02/06/2026',
				source_record: {
					status: 'Pending',
					file_date: '02/06/2026',
					case_status_date: '02/06/2026',
					case_number: 'OLD',
					primary_defendant_name: 'Tenant'
				}
			}
		],
		archived: [{ id: 'mycase:NEW' }]
	});
	const result = await syncInventory(db, { now });
	assert.equal(result.tasksAdded, 0);
	assert.equal(result.statusesRefreshed, 1);
	assert.equal(result.added, 1);
	assert.equal(
		ops.some((op) => op.table === 'enrichment_tasks'),
		false
	);
	assert.equal(
		ops.some((op) => op.table === 'enrichment_tasks_archived' && op.op === 'select'),
		true
	);
	const updates = ops.filter((op) => op.table === 'dm_source_links' && op.op === 'update');
	assert.equal(updates.length, 1);
	assert.equal(updates[0].values.status, undefined);
	assert.equal(updates[0].values.source_record.status, 'Decided');
	assert.equal(updates[0].values.source_record.case_status_date, '10/15/2026');
	assert.equal(updates[0].values.source_record.file_date, '02/06/2026');
	assert.equal(updates[0].values.source_record.primary_defendant_name, 'Tenant');
	assert.equal(tables.dm_source_links.find((row) => row.id === 'mycase:OLD').status, 'accepted');
	assert.ok(tables.dm_source_links.some((row) => row.id === 'mycase:NEW'));
	assert.equal(tables.enrichment_tasks.length, 0);
});
