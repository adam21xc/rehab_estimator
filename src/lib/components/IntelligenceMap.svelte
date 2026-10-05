<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import type mapboxgl from 'mapbox-gl';
	import 'mapbox-gl/dist/mapbox-gl.css';
	import {
		canGeocode,
		filterProperties,
		SOURCE_LABELS,
		SOURCE_COLORS,
		sourceCount,
		spiderOffsets,
		toGeoJSON,
		type Property,
		type Source
	} from '$lib/intelligence/properties';
	type MapData = {
		properties: Property[];
		missingAddresses: number;
		counts: Record<Source, number>;
		cacheReady: boolean;
		token: string;
		salesCoverage: { from: string | null; to: string | null; capturedAt: string } | null;
	};
	let data = $state<MapData | null>(null),
		loading = $state(true),
		problem = $state(''),
		mapProblem = $state('');
	let sources = $state<Source[]>(['accela', 'mycase', 'sales']),
		from = $state(''),
		to = $state(''),
		query = $state(''),
		multiple = $state(false);
	let selectedKey = $state(''),
		activeRecord = $state(''),
		colocated = $state<string[]>([]),
		listPage = $state(1);
	let geocoding = $state(false),
		progress = $state(''),
		stop = false,
		disposed = false;
	let container: HTMLDivElement;
	let map: mapboxgl.Map | undefined, sdk: typeof mapboxgl, resize: ResizeObserver | undefined;
	let markers: mapboxgl.Marker[] = [];
	let ready = $state(false);
	const filtered = $derived(
		filterProperties(data?.properties || [], { sources, from, to, query, multiple })
	);
	const located = $derived(filtered.filter((p) => p.coordinates));
	const selected = $derived(filtered.find((p) => p.key === selectedKey));
	const waiting = $derived(
		data?.properties.filter(
			(p) => ['missing', 'pending'].includes(p.locationStatus) && canGeocode(p.address)
		).length || 0
	);
	const reviewCount = $derived(
		data?.properties.filter(
			(p) => ['review', 'failed'].includes(p.locationStatus) || !canGeocode(p.address)
		).length || 0
	);
	const multiSource = $derived(filtered.filter((p) => sourceCount(p) > 1).length);
	const allSources: Source[] = ['accela', 'mycase', 'sales'];
	const money = (n: number) =>
		new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD',
			maximumFractionDigits: 0
		}).format(n);
	async function refresh() {
		problem = '';
		loading = true;
		try {
			const response = await fetch('/api/rehab/map');
			const value = await response.json();
			if (!response.ok) throw new Error(value.message || 'Unable to load map records.');
			if (!disposed) {
				data = value;
				if (!map) await initialize();
			}
		} catch (e) {
			if (!disposed) problem = (e as Error).message;
		} finally {
			if (!disposed) loading = false;
		}
	}
	function fit() {
		if (!map || !sdk || !located.length) return;
		const bounds = new sdk.LngLatBounds();
		for (const p of located) bounds.extend(p.coordinates!);
		map.fitBounds(bounds, { padding: 60, maxZoom: 15, duration: 700 });
	}
	function clearSpiders() {
		for (const marker of markers) marker.remove();
		markers = [];
	}
	function select(property: Property) {
		selectedKey = property.key;
		activeRecord = '';
		if (property.coordinates && map)
			map.easeTo({
				center: property.coordinates,
				zoom: Math.max(map.getZoom(), 16),
				duration: 550
			});
	}
	function drawSpiders(property: Property | undefined) {
		clearSpiders();
		if (!property?.coordinates || !map || !sdk || property.records.length < 2) return;
		const records = property.records.slice(0, 48),
			offsets = spiderOffsets(records.length);
		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('width', '400');
		svg.setAttribute('height', '400');
		svg.style.pointerEvents = 'none';
		for (const [x, y] of offsets) {
			const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
			line.setAttribute('x1', '200');
			line.setAttribute('y1', '200');
			line.setAttribute('x2', String(200 + x));
			line.setAttribute('y2', String(200 + y));
			line.setAttribute('stroke', '#cbd2e3');
			line.setAttribute('stroke-width', '1.5');
			svg.append(line);
		}
		const lines = document.createElement('div');
		lines.style.pointerEvents = 'none';
		lines.append(svg);
		markers.push(new sdk.Marker({ element: lines }).setLngLat(property.coordinates).addTo(map));
		records.forEach((record, i) => {
			const button = document.createElement('button');
			button.className = 'map-indicator';
			button.textContent = String(i + 1);
			button.style.background = SOURCE_COLORS[record.source];
			button.setAttribute(
				'aria-label',
				`${SOURCE_LABELS[record.source]}: ${record.title}, ${record.date || 'date unknown'}`
			);
			button.title = `${SOURCE_LABELS[record.source]} · ${record.title}`;
			button.addEventListener('click', () => {
				activeRecord = record.id;
				document
					.getElementById('map-record-' + i)
					?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
			});
			markers.push(
				new sdk.Marker({ element: button, offset: offsets[i] })
					.setLngLat(property.coordinates!)
					.addTo(map!)
			);
		});
	}
	async function initialize() {
		if (!data?.token || disposed) return;
		try {
			sdk = (await import('mapbox-gl')).default;
			if (disposed) return;
			if (!sdk.supported())
				throw new Error(
					'This browser cannot display the map. The address list is still available below.'
				);
			map = new sdk.Map({
				container,
				accessToken: data.token,
				style: 'mapbox://styles/mapbox/dark-v11',
				center: [-86.1581, 39.7684],
				zoom: 10
			});
			map.addControl(new sdk.NavigationControl(), 'top-right');
			map.on('error', () => {
				mapProblem =
					'The basemap could not load. Check the Mapbox token and allowed URLs. The address list remains available.';
			});
			map.on('load', () => {
				if (!map) return;
				mapProblem = '';
				map.addSource('properties', {
					type: 'geojson',
					data: toGeoJSON([]),
					cluster: true,
					clusterMaxZoom: 14,
					clusterRadius: 45
				});
				map.addLayer({
					id: 'clusters',
					type: 'circle',
					source: 'properties',
					filter: ['has', 'point_count'],
					paint: {
						'circle-color': '#615187',
						'circle-radius': ['step', ['get', 'point_count'], 20, 100, 26, 1000, 32],
						'circle-stroke-color': '#b8a3eb',
						'circle-stroke-width': 1
					}
				});
				map.addLayer({
					id: 'cluster-label',
					type: 'symbol',
					source: 'properties',
					filter: ['has', 'point_count'],
					layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 12 },
					paint: { 'text-color': '#ffffff' }
				});
				map.addLayer({
					id: 'properties',
					type: 'circle',
					source: 'properties',
					filter: ['!', ['has', 'point_count']],
					paint: {
						'circle-color': ['get', 'color'],
						'circle-radius': ['case', ['>', ['get', 'count'], 1], 11, 7],
						'circle-stroke-color': '#111520',
						'circle-stroke-width': 2
					}
				});
				map.addLayer({
					id: 'property-count',
					type: 'symbol',
					source: 'properties',
					filter: ['all', ['!', ['has', 'point_count']], ['>', ['get', 'count'], 1]],
					layout: {
						'text-field': ['to-string', ['get', 'count']],
						'text-size': 11,
						'text-allow-overlap': true
					},
					paint: { 'text-color': '#12131a' }
				});
				map.on('click', 'clusters', (event) => {
					const feature = event.features?.[0];
					if (!feature || feature.geometry.type !== 'Point') return;
					const center = feature.geometry.coordinates as [number, number];
					(map!.getSource('properties') as mapboxgl.GeoJSONSource).getClusterExpansionZoom(
						feature.properties!.cluster_id,
						(err, zoom) => {
							if (!err && zoom != null) map?.easeTo({ center, zoom });
						}
					);
				});
				map.on('click', 'properties', (event) => {
					const hits = map!.queryRenderedFeatures(event.point, { layers: ['properties'] });
					colocated = [...new Set(hits.map((f) => String(f.properties?.key)))];
					const property = filtered.find((p) => p.key === colocated[0]);
					if (property) select(property);
				});
				for (const layer of ['clusters', 'properties']) {
					map.on('mouseenter', layer, () => {
						map!.getCanvas().style.cursor = 'pointer';
					});
					map.on('mouseleave', layer, () => {
						map!.getCanvas().style.cursor = '';
					});
				}
				ready = true;
			});
			resize = new ResizeObserver(() => map?.resize());
			resize.observe(container);
		} catch (e) {
			mapProblem = (e as Error).message;
		}
	}
	$effect(() => {
		const rows = filtered;
		if (ready && map) {
			(map.getSource('properties') as mapboxgl.GeoJSONSource).setData(toGeoJSON(rows));
		}
	});
	$effect(() => {
		if (ready) drawSpiders(selected);
	});
	$effect(() => {
		void sources;
		void from;
		void to;
		void query;
		void multiple;
		listPage = 1;
	});
	async function locateMissing() {
		geocoding = true;
		stop = false;
		problem = '';
		let total = 0;
		try {
			while (!stop && !disposed) {
				const response = await fetch('/api/rehab/map', { method: 'POST' });
				const result = await response.json();
				if (!response.ok) throw new Error(result.message || 'Unable to locate addresses.');
				total += result.attempted;
				progress = `${total.toLocaleString()} addresses checked this run. Coordinates saved for reuse.`;
				await refresh();
				if (!result.attempted || !result.remaining) break;
			}
		} catch (e) {
			problem = (e as Error).message;
			await refresh().catch(() => {});
			problem = (e as Error).message;
		} finally {
			geocoding = false;
		}
	}
	onMount(() => {
		void refresh();
		return () => {
			disposed = true;
			stop = true;
			resize?.disconnect();
			clearSpiders();
			map?.remove();
		};
	});
</script>

<section class="intelligence-map" aria-label="Property intelligence map">
	<header>
		<div>
			<p class="eyebrow">LOCATION INTELLIGENCE</p>
			<h2>The signals, on the map.</h2>
			<p>Explore court records, code enforcement, and recorded sales together.</p>
		</div>
		<button onclick={refresh} disabled={loading || geocoding}
			>{loading ? 'Refreshing…' : 'Refresh records'}</button
		>
	</header>
	<div class="map-filters">
		<fieldset>
			<legend>Show on map</legend>{#each allSources as source (source)}<label
					class="source-toggle"
					style={`--source:${SOURCE_COLORS[source]}`}
					><input type="checkbox" bind:group={sources} value={source} /><span class="dot"
					></span>{SOURCE_LABELS[source]}<small
						>{data?.counts[source].toLocaleString() || '—'}</small
					></label
				>{/each}
		</fieldset>
		<div class="filter-row">
			<label class="search"
				>Address or parcel<input
					bind:value={query}
					placeholder="Search a street, address, or parcel…"
				/></label
			><label>From<input type="date" bind:value={from} /></label><label
				>Through<input type="date" bind:value={to} /></label
			><label class="multi"
				><input type="checkbox" bind:checked={multiple} />Multiple indicators</label
			>
		</div>
	</div>
	{#if from && to && from > to}<p class="notice" role="alert">
			Choose an end date on or after the start date.
		</p>{/if}
	{#if problem}<p class="notice" role="alert">{problem}</p>{/if}
	{#if data && !data.cacheReady}<p class="notice">
			Location storage needs to be connected before addresses can be placed on the map. Source
			records are available below.
		</p>{/if}
	<div class="map-summary" aria-live="polite">
		<span
			><strong>{located.length.toLocaleString()}</strong> mapped / {filtered.length.toLocaleString()}
			matching addresses</span
		><span><strong>{multiSource.toLocaleString()}</strong> addresses across sources</span><button
			onclick={fit}
			disabled={!ready || !located.length}>Fit visible results ↗</button
		>
	</div>
	<div class="map-body">
		<div class="map-stage">
			<div class="map-canvas" bind:this={container}></div>
			{#if mapProblem}<div class="map-message" role="alert">
					{mapProblem}
				</div>{:else if !data?.token && !loading}<div class="map-message">
					Add a Mapbox public token to display the basemap.
				</div>{:else if !located.length}<div class="map-message">
					{loading
						? 'Loading property records…'
						: filtered.length
							? 'No saved locations for these filters yet.'
							: 'No addresses match these filters.'}
				</div>{/if}
			<div class="map-key">
				<span><i style="background:#ebeff9"></i>Multiple sources</span><span
					>Numbers on pins = records</span
				>
			</div>
		</div>
		<aside aria-label="Selected property">
			{#if selected}
				<div class="detail-heading">
					<span class="eyebrow">ADDRESS DETAILS</span><button
						aria-label="Close property details"
						onclick={() => {
							selectedKey = '';
							colocated = [];
						}}>×</button
					>
				</div>
				<h3>{selected.address}</h3>
				<p>
					{selected.records.length} visible records · {selected.coordinates
						? 'Location saved'
						: selected.locationStatus === 'review'
							? 'Location needs review'
							: 'Not mapped yet'}
				</p>
				{#if colocated.length > 1}<div class="nearby">
						<strong>Also at this point</strong
						>{#each filtered.filter((p) => colocated.includes(p.key) && p.key !== selectedKey) as other (other.key)}<button
								onclick={() => select(other)}>{other.address}</button
							>{/each}
					</div>{/if}
				<div class="records">
					{#each selected.records as record, i (`${record.source}:${record.id}`)}<article
							id={'map-record-' + i}
							class:active={activeRecord === record.id}
							style={`--source:${SOURCE_COLORS[record.source]}`}
						>
							<div class="record-source">
								{i + 1} · {SOURCE_LABELS[record.source]}<time
									>{record.date || 'Date unavailable'}</time
								>
							</div>
							<h4>{record.title}</h4>
							<p>{record.id}{record.status ? ` · ${record.status}` : ''}</p>
							{#if record.addressRole === 'defendant'}<p class="caution">
									Defendant address; connection to the subject property is unverified.
								</p>{/if}
							{#if record.source === 'sales'}<p>
									{record.price != null
										? money(record.price)
										: 'Price unavailable or conflicting'}{record.multiParcel
										? ' · Multi-parcel transfer total'
										: ''}
								</p>
								<p>Buyer: {record.buyer || 'Unknown'}<br />Seller: {record.seller || 'Unknown'}</p>
								<a
									href={resolve('/sales/property/[parcel]', { parcel: record.parcel || 'unknown' })}
									>View parcel sales →</a
								>{/if}
						</article>{/each}
				</div>
				<p class="future">
					Owner, ownership duration, and estimated mortgage details will appear here after
					DealMachine enrichment.
				</p>
			{:else}<div class="empty-detail">
					<div class="target">◎</div>
					<h3>Follow the overlap.</h3>
					<p>
						Select a pin or an address below to see every matching record. Records at one address
						fan out when selected.
					</p>
					<p>Zoom out to explore clusters. Toggle Gateway sales to focus on lead indicators.</p>
				</div>{/if}
		</aside>
	</div>
	<footer>
		<div>
			<strong>Saved locations, reused on every visit.</strong>
			<p>
				{waiting.toLocaleString()} addresses awaiting lookup · {reviewCount.toLocaleString()} need address
				or match review · {data?.missingAddresses.toLocaleString() || 0} records without an address.
			</p>
		</div>
		{#if geocoding}<button
				onclick={() => {
					stop = true;
					progress = 'Stopping after the current batch…';
				}}>Stop locating</button
			>{:else}<button
				class="primary"
				onclick={locateMissing}
				disabled={!data?.cacheReady || !data?.token || !waiting}>Locate missing addresses</button
			>{/if}
	</footer>
	{#if progress}<p class="progress" role="status">{progress}</p>{/if}
	<p class="coverage-note">
		The map opens over Indianapolis. Use “Fit visible results” to include all matching locations,
		including out-of-state defendant addresses. Address lookups use Mapbox permanent geocoding and
		may incur usage charges. Only confident street-address matches are pinned. Filters use filing
		dates for cases and sale dates for transfers; undated records are excluded when a date range is
		set.
	</p>
	{#if data?.salesCoverage}<p class="coverage-note">
			Gateway coverage: Marion County, {data.salesCoverage.from || 'unknown start'} through {data
				.salesCoverage.to || 'unknown end'}. This is a lagged 2026 snapshot. Address overlaps are
			exploratory, not a measured sale-conversion rate.
		</p>{/if}
	<details class="address-list">
		<summary>Browse matching addresses ({filtered.length.toLocaleString()})</summary>
		<div class="address-rows">
			{#each filtered.slice((listPage - 1) * 30, listPage * 30) as property (property.key)}<button
					class="address-row"
					onclick={() => select(property)}
					><span
						>{property.address}<small
							>{[...new Set(property.records.map((r) => SOURCE_LABELS[r.source]))].join(
								' · '
							)}</small
						></span
					><span
						>{property.records.length} records<small
							>{property.coordinates
								? 'Mapped'
								: property.locationStatus === 'review'
									? 'Needs review'
									: 'Not mapped'}</small
						></span
					></button
				>{/each}
		</div>
		<div class="pager">
			<button disabled={listPage <= 1} onclick={() => listPage--}>Previous addresses</button><span
				>Page {listPage} of {Math.max(1, Math.ceil(filtered.length / 30))}</span
			><button disabled={listPage * 30 >= filtered.length} onclick={() => listPage++}
				>Next addresses</button
			>
		</div>
	</details>
</section>

<style>
	.intelligence-map {
		border: 1px solid #30313b;
		border-radius: 16px;
		background: #18191f;
		margin: 26px 0 34px;
		overflow: hidden;
		color: #edeef4;
	}
	header,
	footer {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 20px;
		padding: 24px;
	}
	h2 {
		font-size: 25px;
		letter-spacing: -0.7px;
		margin: 6px 0 8px;
	}
	p {
		margin: 0;
		color: #a6a8b9;
		font-size: 13px;
		line-height: 1.6;
	}
	.eyebrow {
		font-size: 10px;
		letter-spacing: 2px;
		color: #b5a0f5;
		font-weight: 700;
	}
	button {
		border: 1px solid #41424e;
		background: #272832;
		color: #efeff7;
		border-radius: 7px;
		padding: 9px 12px;
		cursor: pointer;
		font: inherit;
		font-size: 12px;
	}
	button:hover {
		background: #363745;
	}
	button:disabled {
		opacity: 0.45;
		cursor: default;
	}
	button.primary {
		background: #8b6cef;
		color: white;
		border-color: #8b6cef;
	}
	.map-filters {
		padding: 0 24px 20px;
	}
	fieldset {
		display: flex;
		gap: 10px;
		flex-wrap: wrap;
		border: 0;
		padding: 0;
		margin: 0 0 18px;
	}
	legend {
		font-size: 11px;
		color: #a6a8b9;
		margin-bottom: 8px;
	}
	.source-toggle {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 9px 12px;
		border: 1px solid #393b46;
		border-radius: 8px;
		font-size: 12px;
	}
	.dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--source);
	}
	small {
		color: #9799ac;
		font-size: 11px;
	}
	.filter-row {
		display: flex;
		gap: 12px;
		align-items: end;
		flex-wrap: wrap;
	}
	label {
		font-size: 11px;
		color: #c1c2cf;
	}
	label.search {
		flex: 1;
		min-width: 200px;
	}
	input:not([type='checkbox']) {
		display: block;
		width: 100%;
		box-sizing: border-box;
		padding: 10px 12px;
		background: #111218;
		border: 1px solid #3c3d48;
		border-radius: 6px;
		color: #eeeef5;
		margin-top: 5px;
		color-scheme: dark;
		font: inherit;
		font-size: 13px;
	}
	.multi {
		display: flex;
		gap: 7px;
		align-items: center;
		padding: 12px 0;
	}
	input[type='checkbox'] {
		accent-color: #a18be4;
	}
	.map-summary {
		display: flex;
		align-items: center;
		gap: 24px;
		flex-wrap: wrap;
		padding: 12px 24px;
		border-top: 1px solid #30313b;
		font-size: 12px;
		color: #a6a8b9;
	}
	.map-summary strong {
		color: #f4f3f9;
		font-size: 16px;
	}
	.map-summary button {
		margin-left: auto;
	}
	.map-body {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 310px;
		border-block: 1px solid #30313b;
	}
	.map-stage {
		position: relative;
		min-width: 0;
		height: 520px;
		background: #10121b;
	}
	.map-canvas {
		height: 100%;
		width: 100%;
	}
	.map-message {
		position: absolute;
		top: 20px;
		left: 20px;
		right: 60px;
		max-width: 410px;
		background: #20212aed;
		border: 1px solid #464753;
		padding: 14px;
		border-radius: 8px;
		font-size: 13px;
		line-height: 1.5;
		pointer-events: none;
	}
	.map-key {
		display: flex;
		flex-wrap: wrap;
		gap: 14px;
		position: absolute;
		bottom: 36px;
		left: 12px;
		background: #161820e8;
		padding: 8px 10px;
		border-radius: 6px;
		font-size: 10px;
		pointer-events: none;
	}
	.map-key span {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.map-key i {
		width: 7px;
		height: 7px;
		border-radius: 50%;
	}
	aside {
		padding: 20px;
		border-left: 1px solid #30313b;
		max-height: 520px;
		box-sizing: border-box;
		overflow: auto;
		min-width: 0;
	}
	h3 {
		font-size: 18px;
		line-height: 1.4;
		margin: 8px 0;
		overflow-wrap: anywhere;
	}
	.detail-heading {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.detail-heading button {
		font-size: 18px;
		padding: 2px 9px;
	}
	.empty-detail {
		padding: 45px 4px;
	}
	.empty-detail p {
		margin-top: 16px;
	}
	.target {
		font-size: 44px;
		color: #a18be4;
	}
	.records {
		display: grid;
		gap: 10px;
		margin-top: 18px;
	}
	article {
		background: #21222c;
		border: 1px solid #363744;
		border-left: 3px solid var(--source);
		padding: 12px;
		border-radius: 7px;
	}
	article.active {
		outline: 2px solid var(--source);
	}
	h4 {
		font-size: 13px;
		margin: 9px 0 6px;
	}
	article p {
		font-size: 11px;
		overflow-wrap: anywhere;
	}
	article a {
		font-size: 12px;
		color: #bca9ff;
		display: inline-block;
		margin-top: 8px;
	}
	.record-source {
		font-size: 10px;
		color: var(--source);
	}
	time {
		display: block;
		color: #aaaec0;
		margin-top: 4px;
	}
	.caution {
		color: #e1b572;
		margin-top: 8px;
	}
	.future {
		border-top: 1px solid #383945;
		margin-top: 18px;
		padding-top: 14px;
		font-size: 11px;
	}
	.nearby {
		display: grid;
		gap: 6px;
		font-size: 11px;
		margin-top: 15px;
	}
	.notice {
		margin: 0 24px 15px;
		background: #3a2e20;
		color: #edc998;
		border: 1px solid #654c2e;
		padding: 12px;
		border-radius: 7px;
	}
	footer strong {
		font-size: 12px;
	}
	footer p {
		font-size: 11px;
		margin-top: 5px;
	}
	.coverage-note,
	.progress {
		padding: 0 24px 12px;
		font-size: 11px;
	}
	.progress {
		color: #c5b5f4;
	}
	.address-list {
		border-top: 1px solid #33343f;
		padding: 18px 24px;
	}
	summary {
		cursor: pointer;
		font-size: 13px;
	}
	.address-rows {
		margin-top: 12px;
	}
	.address-row {
		display: flex;
		width: 100%;
		text-align: left;
		justify-content: space-between;
		gap: 20px;
		border-radius: 0;
		border: 0;
		border-bottom: 1px solid #363744;
		background: transparent;
		padding: 13px 0;
	}
	.address-row small {
		display: block;
		margin-top: 4px;
	}
	.address-row span:last-child {
		text-align: right;
		flex-shrink: 0;
	}
	.pager {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		margin-top: 15px;
		font-size: 11px;
	}
	:global(.map-indicator) {
		width: 28px;
		height: 28px;
		border: 2px solid #161820;
		border-radius: 50%;
		color: #111;
		font-size: 12px;
		font-weight: 700;
		cursor: pointer;
		box-shadow: 0 2px 8px #0007;
		padding: 0;
	}
	@media (max-width: 1000px) {
		.map-body {
			grid-template-columns: minmax(0, 1fr) 260px;
		}
		.map-filters {
			padding-inline: 16px;
		}
		header,
		footer {
			padding: 18px;
			flex-wrap: wrap;
		}
		.map-summary {
			gap: 12px;
		}
	}
	@media (max-width: 700px) {
		.map-body {
			grid-template-columns: 1fr;
		}
		.map-stage {
			height: 400px;
		}
		aside {
			border-left: 0;
			border-top: 1px solid #33343f;
			max-height: 400px;
		}
		.empty-detail {
			padding: 4px;
		}
		.empty-detail .target {
			display: none;
		}
		.empty-detail p {
			margin-top: 8px;
		}
		.source-toggle {
			padding: 8px;
		}
		.filter-row > label:not(.search) {
			flex: 1;
		}
		.map-summary {
			padding: 12px 16px;
		}
		.map-summary button {
			margin-left: 0;
		}
		.address-list {
			padding: 16px;
		}
		.address-row {
			font-size: 11px;
		}
		.pager {
			flex-wrap: wrap;
		}
		.map-key {
			font-size: 9px;
		}
		.notice {
			margin-inline: 16px;
		}
	}
</style>
