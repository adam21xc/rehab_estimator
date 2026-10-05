<script lang="ts">
	let { name }: { name: string } = $props();
	const paths: Record<string, string> = {
		'Lead enrichment': 'M5 3h14v18H5zM8 7h8M8 11h8M8 16l2 2 5-5',
		'Sales intelligence': 'M4 19V11h4v8M10 19V5h4v14M16 19V8h4v11M3 19h18',
		'Accela records': 'M5 3h14v18H5zM8 7h8M8 11h8M8 15h5',
		MyCase: 'M12 3v17M7 21h10M4 7h16M6 7l-3 7h6L6 7m12 0-3 7h6l-3-7',
		'Rehab calculator': 'M3 11l9-8 9 8M5 10v11h14V10M9 21v-8h6v8',
		'Saved estimates': 'M5 3h14v18H5zM8 7h8M8 11h2M14 11h2M8 15h2M14 15h2',
		'Property images': 'M3 4h18v16H3zM3 16l6-6 5 5 3-3 4 4M16 8h.01',
		'Design studio': 'm12 3 9 9-9 9-9-9 9-9ZM12 7v10M7 12h10',
		'SMS outreach': 'M4 4h16v12H9l-5 4V4ZM8 8h8M8 12h5',
		'Email outreach': 'M3 5h18v14H3zM3 6l9 7 9-7'
	};
</script>

<svg
	width="18"
	height="18"
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="1.6"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"><path d={paths[name]} /></svg
>
