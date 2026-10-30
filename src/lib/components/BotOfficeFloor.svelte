<script lang="ts">
	import { onMount } from 'svelte';
	import { officeSummary, wrapMessage, type BotRow } from '$lib/office/bots';
	import {
		actorsAtGoals,
		officePlan,
		spriteFor,
		stepActors,
		type OfficePlan,
		type Station
	} from '$lib/office/floor';

	let {
		bots,
		mode,
		phase
	}: {
		bots: BotRow[];
		mode: 'wide' | 'narrow';
		phase: 'loading' | 'ready' | 'unconfigured';
	} = $props();

	const plan = $derived(officePlan(mode));
	let scene = $state({ actors: [] as ReturnType<typeof actorsAtGoals>, now: 0 });
	let root: HTMLDivElement;
	let botsNow: BotRow[] = [];
	let modeNow: 'wide' | 'narrow' = 'wide';
	let reduced = $state(false);
	let space = '';

	$effect(() => {
		botsNow = bots;
		modeNow = mode;
	});

	const actors = $derived(scene.actors.length ? scene.actors : actorsAtGoals(bots, plan));

	onMount(() => {
		const media = window.matchMedia('(prefers-reduced-motion: reduce)');
		const syncMotion = () => {
			reduced = media.matches;
		};
		syncMotion();
		media.addEventListener('change', syncMotion);
		let frame = 0;
		let last = performance.now();
		const loop = (now: number) => {
			frame = requestAnimationFrame(loop);
			if (root?.offsetParent === null) return;
			const dt = Math.min(0.05, (now - last) / 1000);
			last = now;
			const current = officePlan(modeNow);
			if (current.id !== space) {
				space = current.id;
				scene = { actors: actorsAtGoals(botsNow, current), now };
				return;
			}
			scene = { actors: stepActors(scene.actors, botsNow, current, dt, reduced), now };
		};
		frame = requestAnimationFrame(loop);
		return () => {
			cancelAnimationFrame(frame);
			media.removeEventListener('change', syncMotion);
		};
	});

	function caption(station: Station, bot: BotRow | undefined) {
		const vacant = !bot && station.placeholder;
		return {
			name: bot?.name ?? station.label,
			status: bot ? title(bot.status) : vacant ? 'Not hired yet' : phase === 'loading' ? '…' : '—',
			vacant
		};
	}

	function title(value: string) {
		return value.slice(0, 1).toUpperCase() + value.slice(1);
	}

	function nameSize(name: string, width: number) {
		const base = width >= 170 ? 15 : mode === 'narrow' ? 14 : 14;
		if (name.length > 18) return base - 2;
		if (name.length > 15) return base - 1;
		return base;
	}

	function bubbleFrame(x: number, y: number, lines: string[], current: OfficePlan) {
		const w = Math.min(210, Math.max(96, ...lines.map((line) => line.length * 7.2 + 22)));
		const h = 14 + lines.length * 16;
		let left = x - w / 2;
		let top = y - 68 - h;
		const below = top < 8;
		if (below) top = y + 28;
		left = Math.max(8, Math.min(current.width - w - 8, left));
		top = Math.max(8, Math.min(current.height - h - 8, top));
		return { left, top, w, h, below, tail: Math.max(left + 16, Math.min(left + w - 16, x)) };
	}
</script>

<div bind:this={root}>
	<svg
		class="floor"
		viewBox="0 0 {plan.width} {plan.height}"
		role="img"
		aria-label={officeSummary(bots)}
	>
		<defs>
			<filter id="shadow-{plan.id}" x="-30%" y="-30%" width="160%" height="160%">
				<feDropShadow
					dx="0"
					dy="1.2"
					stdDeviation="1.2"
					flood-color="#1b140c"
					flood-opacity="0.2"
				/>
			</filter>
		</defs>
		<rect
			x={plan.building.x}
			y={plan.building.y}
			width={plan.building.w}
			height={plan.building.h}
			rx="18"
			fill="var(--building)"
			stroke="var(--wall)"
			stroke-width="8"
		/>
		<rect
			x={plan.lounge.x}
			y={plan.lounge.y}
			width={plan.lounge.w}
			height={plan.lounge.h}
			fill="var(--lounge-floor)"
		/>
		<rect
			x={plan.jarvisRoom.x}
			y={plan.jarvisRoom.y}
			width={plan.jarvisRoom.w}
			height={plan.jarvisRoom.h}
			fill="var(--jarvis-floor)"
		/>
		<rect
			x={plan.hall.x}
			y={plan.hall.y}
			width={plan.hall.w}
			height={plan.hall.h}
			rx="8"
			fill="var(--rug)"
		/>
		<line
			x1={plan.jarvisRoom.x + plan.jarvisRoom.w}
			y1={plan.jarvisRoom.y}
			x2={plan.jarvisRoom.x + plan.jarvisRoom.w}
			y2={plan.door.wallY}
			stroke="var(--wall)"
			stroke-width="8"
		/>
		<line
			x1={plan.jarvisRoom.x}
			y1={plan.door.wallY}
			x2={plan.door.x}
			y2={plan.door.wallY}
			stroke="var(--wall)"
			stroke-width="8"
		/>
		<line
			x1={plan.door.x + plan.door.w}
			y1={plan.door.wallY}
			x2={plan.jarvisRoom.x + plan.jarvisRoom.w}
			y2={plan.door.wallY}
			stroke="var(--wall)"
			stroke-width="8"
		/>
		<path
			d="M {plan.door.x} {plan.door.wallY} A 34 34 0 0 0 {plan.door.x} {plan.door.wallY - 34}"
			fill="none"
			stroke="var(--wall)"
			stroke-width="2"
		/>
		<text
			x={plan.jarvisRoom.x + plan.jarvisRoom.w - 12}
			y={plan.jarvisRoom.y + 22}
			text-anchor="end"
			fill="var(--muted)"
			font-size="12">Private office</text
		>
		<rect
			x={plan.jarvisRoom.x + 16}
			y={plan.jarvisRoom.y + 34}
			width="22"
			height="36"
			rx="3"
			fill="var(--screen)"
			stroke="var(--wall)"
			stroke-width="2"
		/>
		<rect
			x={plan.couch.x}
			y={plan.couch.y}
			width={plan.couch.w}
			height={plan.couch.h}
			rx="18"
			fill="var(--couch)"
		/>
		<rect
			x={plan.couch.x + 8}
			y={plan.couch.y + 6}
			width={plan.couch.w - 16}
			height="14"
			rx="7"
			fill="var(--couch-back)"
		/>
		<ellipse
			cx={plan.couch.x + 28}
			cy={plan.couch.y + plan.couch.h / 2 + 4}
			rx="14"
			ry="16"
			fill="var(--pillow)"
		/>
		<rect
			x={plan.couch.x + plan.couch.w * 0.42}
			y={plan.couch.y + 22}
			width={plan.couch.w * 0.5}
			height={plan.couch.h - 30}
			rx="10"
			fill="var(--blanket)"
		/>
		<rect
			x={plan.coffee.x}
			y={plan.coffee.y}
			width={plan.coffee.w}
			height={plan.coffee.h}
			rx="10"
			fill="var(--desk)"
			stroke="var(--desk-top)"
		/>
		<circle
			cx={plan.coffee.x + 28}
			cy={plan.coffee.y + plan.coffee.h / 2}
			r="8"
			fill="var(--plaque)"
			stroke="var(--desk-top)"
		/>
		<g transform="translate({plan.plant.x} {plan.plant.y})">
			<rect x="-10" y="22" width="20" height="16" rx="3" fill="var(--pot)" />
			<ellipse cx="0" cy="10" rx="16" ry="14" fill="var(--plant)" />
			<ellipse cx="-12" cy="16" rx="9" ry="11" fill="var(--plant-dark)" />
			<ellipse cx="12" cy="14" rx="8" ry="10" fill="var(--plant-dark)" />
		</g>
		{#if plan.cabinet}
			<g filter="url(#shadow-{plan.id})">
				<rect
					x={plan.cabinet.x}
					y={plan.cabinet.y}
					width={plan.cabinet.w}
					height={plan.cabinet.h}
					rx="3"
					fill="var(--chair)"
				/>
				<line
					x1={plan.cabinet.x + 4}
					y1={plan.cabinet.y + plan.cabinet.h / 2}
					x2={plan.cabinet.x + plan.cabinet.w - 4}
					y2={plan.cabinet.y + plan.cabinet.h / 2}
					stroke="var(--building)"
				/>
			</g>
		{/if}
		{#if plan.cooler}
			<g filter="url(#shadow-{plan.id})">
				<rect
					x={plan.cooler.x}
					y={plan.cooler.y + 16}
					width={plan.cooler.w}
					height={plan.cooler.h - 16}
					rx="3"
					fill="var(--chair)"
				/>
				<rect
					x={plan.cooler.x + 6}
					y={plan.cooler.y}
					width={plan.cooler.w - 12}
					height="20"
					rx="6"
					fill="var(--screen)"
				/>
			</g>
		{/if}
		{#each plan.stations as station (station.id)}
			{@const bot = bots.find((row) => row.bot_id === station.id)}
			{@const plate = caption(station, bot)}
			<rect
				x={station.seat.x - 13}
				y={station.seat.y - 8}
				width="26"
				height="18"
				rx="6"
				fill="var(--chair)"
				opacity={plate.vacant ? 0.45 : 0.9}
			/>
			<g filter="url(#shadow-{plan.id})">
				<rect
					x={station.desk.x}
					y={station.desk.y}
					width={station.desk.w}
					height={station.desk.h}
					rx="8"
					fill={plate.vacant ? 'var(--plaque)' : 'var(--desk)'}
					stroke="var(--desk-top)"
					stroke-width="2"
					stroke-dasharray={plate.vacant ? '7 6' : '0'}
					opacity={plate.vacant ? 0.7 : 1}
				/>
				{#if !plate.vacant}
					<rect
						x={station.desk.x + 14}
						y={station.desk.y + 6}
						width={station.desk.w - 28}
						height="12"
						rx="2"
						fill="var(--monitor)"
					/>
					<rect
						x={station.desk.x + station.desk.w / 2 - 8}
						y={station.desk.y + 18}
						width="16"
						height="3"
						fill="var(--monitor)"
					/>
				{/if}
				<text
					x={station.desk.x + station.desk.w / 2}
					y={station.desk.y + (plate.vacant ? 28 : 38)}
					text-anchor="middle"
					fill="var(--ink)"
					font-size={nameSize(plate.name, station.desk.w)}
					font-weight="700">{plate.name}</text
				>
				<text
					x={station.desk.x + station.desk.w / 2}
					y={station.desk.y + (plate.vacant ? 46 : 54)}
					text-anchor="middle"
					fill="var(--ink)"
					font-size={mode === 'narrow' ? 13 : 12}>{plate.status}</text
				>
			</g>
		{/each}
		{#each [...actors].sort((a, b) => a.y - b.y) as actor (actor.id)}
			{@const bot = bots.find((row) => row.bot_id === actor.id)}
			{#if bot}
				{@const sprite = spriteFor(actor, bot, scene.now, reduced)}
				<g
					data-bot={sprite.id}
					data-pose={sprite.pose}
					transform="translate({sprite.x} {sprite.y}) rotate({sprite.rotation}) scale({sprite.face *
						1.55} {sprite.breath * 1.55})"
				>
					<title>{bot.name}, {bot.status}</title>
					<ellipse cx="0" cy="16" rx="13" ry="4.5" fill="#1b140c" opacity="0.16" />
					{#if sprite.pose === 'walk'}
						<rect x="-8" y={11 + sprite.step} width="5" height="8" rx="2" fill={sprite.fill} />
						<rect x="3" y={11 - sprite.step} width="5" height="8" rx="2" fill={sprite.fill} />
					{/if}
					<rect
						x="-12"
						y="-2"
						width="24"
						height="18"
						rx="8"
						fill={sprite.fill}
						stroke={sprite.stroke}
						stroke-width="1.6"
					/>
					<circle
						cx="0"
						cy="-15"
						r="10"
						fill={sprite.fill}
						stroke={sprite.stroke}
						stroke-width="1.6"
					/>
					<ellipse cx="0" cy="-14" rx="6.2" ry="4.4" fill={sprite.plate} />
					<g transform="translate(0 -14) scale(1 {sprite.eyeScale})">
						<circle cx="-2.6" cy="0" r="1.35" fill={sprite.eye} />
						<circle cx="2.6" cy="0" r="1.35" fill={sprite.eye} />
					</g>
					{#if sprite.typing}
						<circle
							cx={-6 + sprite.hand}
							cy="16"
							r="2.3"
							fill={sprite.plate}
							stroke={sprite.stroke}
						/>
						<circle
							cx={6 - sprite.hand}
							cy="16"
							r="2.3"
							fill={sprite.plate}
							stroke={sprite.stroke}
						/>
					{/if}
				</g>
			{/if}
		{/each}
		{#each actors as actor (actor.id)}
			{@const bot = bots.find((row) => row.bot_id === actor.id)}
			{#if bot}
				{@const sprite = spriteFor(actor, bot, scene.now, reduced)}
				{#if sprite.bubble === 'zzz'}
					<g transform="translate({sprite.x} {sprite.y - 46})" aria-hidden="true">
						{#each sprite.zzz as mark, index (`z${index}`)}
							<text
								x={mark.x}
								y={mark.y}
								fill="var(--muted)"
								font-size={mark.size}
								opacity={mark.opacity}
								font-style="italic">z</text
							>
						{/each}
					</g>
				{:else if sprite.bubble === 'hourglass'}
					<g transform="translate({sprite.x} {sprite.y - 58})" aria-hidden="true">
						<rect
							x="-16"
							y="-16"
							width="32"
							height="32"
							rx="10"
							fill="var(--bubble)"
							stroke="var(--line)"
						/>
						<g transform="rotate({sprite.hourglass})">
							<path d="M-6 -7 H6 L1 0 L6 7 H-6 L-1 0 Z" fill="var(--warn)" />
						</g>
					</g>
				{:else if sprite.bubble === 'ellipsis'}
					<g transform="translate({sprite.x} {sprite.y - 58})" aria-hidden="true">
						<rect
							x="-18"
							y="-14"
							width="36"
							height="28"
							rx="10"
							fill="var(--bubble)"
							stroke="var(--line)"
						/>
						{#each [0, 1, 2] as dot (dot)}
							<circle
								cx={-8 + dot * 8}
								cy="0"
								r="2.1"
								fill="var(--bubble-ink)"
								opacity={dot < sprite.dots ? 1 : 0.28}
							/>
						{/each}
					</g>
				{:else if sprite.bubble === 'speech' && bot.message}
					{@const lines = wrapMessage(bot.message, mode === 'narrow' ? 18 : 24, 3)}
					{@const box = bubbleFrame(sprite.x, sprite.y, lines, plan)}
					<g aria-hidden="true">
						<rect
							x={box.left}
							y={box.top}
							width={box.w}
							height={box.h}
							rx="10"
							fill="var(--bubble)"
							stroke="var(--line)"
						/>
						{#if box.below}
							<polygon
								points="{box.tail - 6},{box.top} {box.tail + 6},{box.top} {box.tail},{box.top - 8}"
								fill="var(--bubble)"
							/>
						{:else}
							<polygon
								points="{box.tail - 6},{box.top + box.h} {box.tail + 6},{box.top +
									box.h} {box.tail},{box.top + box.h + 8}"
								fill="var(--bubble)"
							/>
						{/if}
						<text fill="var(--bubble-ink)" font-size="12">
							{#each lines as line, index (index)}
								<tspan x={box.left + 10} y={box.top + 18 + index * 16}>{line}</tspan>
							{/each}
						</text>
					</g>
				{/if}
			{/if}
		{/each}
	</svg>
</div>

<style>
	.floor {
		display: block;
		width: 100%;
		height: auto;
		font-family: inherit;
	}
</style>
