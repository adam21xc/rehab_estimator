import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';
import type { RehabProject } from '$lib/domain/types';
import { computeTotals } from '$lib/domain/calc';

const KEY = 'rehab_project_v1';

function load(): RehabProject | null {
  if (!browser) return null;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as RehabProject) : null;
  } catch {
    return null;
  }
}

export const projectStore = (() => {
  const initial = load();
  const store = writable<RehabProject | null>(initial);
  if (browser) {
    store.subscribe((val) => {
      if (!val) return;
      try {
        localStorage.setItem(KEY, JSON.stringify(val));
      } catch {
        // Ignore storage errors (private mode/quota)
      }
    });
  }
  const totals = derived(store, ($p) =>
    $p ? computeTotals($p) : { byCategory: [], grandTotal: 0 }
  );
  return { store, totals };
})();