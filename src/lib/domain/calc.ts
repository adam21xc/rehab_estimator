import type { CalcTotals, RehabProject } from './types';


export function computeTotals(project: RehabProject): CalcTotals {
const byCategory = project.catalog.categories.map((cat) => {
const prog = project.progress.find((p) => p.categoryKey === cat.key);
const subtotal = (prog?.lines ?? []).reduce((acc, line) => {
const it = cat.items.find((i) => i.id === line.itemId);
if (!it) return acc;
const qty = Number.isFinite(line.quantity) ? line.quantity : 0;
return acc + qty * it.cost;
}, 0);
return { categoryKey: cat.key, subtotal };
});
const grandTotal = byCategory.reduce((a, b) => a + b.subtotal, 0);
return { byCategory, grandTotal };
}