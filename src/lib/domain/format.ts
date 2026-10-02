// Flexible currency formatter: whole dollars by default, up to 2 decimals when asked
export const currency = (n: number, opts?: { min?: number; max?: number }) =>
	new Intl.NumberFormat(undefined, {
		style: 'currency',
		currency: 'USD',
		minimumFractionDigits: opts?.min ?? 0,
		maximumFractionDigits: opts?.max ?? 2
	}).format(n);

const unitLabels: Record<string, string> = {
	ea: 'each',
	sf: 'sq ft',
	psf: 'per sq ft',
	lf: 'linear ft',
	ls: 'lump sum'
};
export const unitLabel = (unit: string) => unitLabels[unit] ?? unit;
