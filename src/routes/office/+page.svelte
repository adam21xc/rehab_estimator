<script lang="ts">
	import { onMount } from 'svelte';
	import BotOfficeBoard from '$lib/components/BotOfficeBoard.svelte';
	import {
		applyBotEvent,
		explainOfficeError,
		parseBotRow,
		reconcileBots,
		type BotChange,
		type BotRow
	} from '$lib/office/bots';
	import { officeSupabase } from '$lib/supabase-public';

	let bots = $state<BotRow[]>([]);
	let phase = $state<'loading' | 'ready' | 'unconfigured'>('loading');
	let link = $state<'connecting' | 'live' | 'reconnecting'>('connecting');
	let problem = $state('');

	onMount(() => {
		const supabase = officeSupabase();
		if (!supabase) {
			phase = 'unconfigured';
			link = 'reconnecting';
			problem = '';
			return;
		}
		const client = supabase;
		let ready = false;
		const queued: BotChange[] = [];
		const take = (change: BotChange) => {
			if (!ready) queued.push(change);
			else bots = applyBotEvent(bots, change);
		};
		const channel = client
			.channel('bot-status-office')
			.on('postgres_changes', { event: '*', schema: 'public', table: 'bot_status' }, (payload) => {
				take({ eventType: payload.eventType, new: payload.new, old: payload.old });
			})
			.subscribe((status) => {
				if (status === 'SUBSCRIBED') link = 'live';
				else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
					link = 'reconnecting';
				}
			});
		async function load(initial: boolean) {
			const started = Date.now();
			try {
				const { data, error } = await client
					.from('bot_status')
					.select('bot_id,name,color,status,doing,talking_to,message,updated_at');
				if (error) {
					problem = explainOfficeError(error.message);
					if (link === 'live') link = 'reconnecting';
					return;
				}
				problem = '';
				const incoming = (data ?? []).flatMap((row) => {
					const parsed = parseBotRow(row);
					return parsed ? [parsed] : [];
				});
				bots = reconcileBots(bots, incoming, started);
			} catch (error) {
				problem = explainOfficeError(
					error instanceof Error ? error.message : 'Unable to load bot status.'
				);
				if (link === 'live') link = 'reconnecting';
			} finally {
				if (initial) {
					ready = true;
					for (const change of queued) bots = applyBotEvent(bots, change);
					phase = 'ready';
				}
			}
		}
		void load(true);
		const poll = setInterval(() => {
			void load(false);
		}, 30_000);
		return () => {
			clearInterval(poll);
			void client.removeChannel(channel);
		};
	});
</script>

<svelte:head><title>Bot team office · Apex</title></svelte:head>
<BotOfficeBoard {bots} {phase} {link} {problem} />
