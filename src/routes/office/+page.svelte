<script lang="ts">
	import { onMount } from 'svelte';
	import BotOfficeBoard from '$lib/components/BotOfficeBoard.svelte';
	import {
		applyBotEvent,
		explainOfficeError,
		parseBotRow,
		type BotChange,
		type BotRow
	} from '$lib/office/bots';
	import { officeSupabase } from '$lib/supabase-public';

	let bots = $state<BotRow[]>([]);
	let phase = $state<'loading' | 'ready' | 'unconfigured'>('loading');
	let link = $state<'connecting' | 'live' | 'offline'>('connecting');
	let problem = $state('');

	onMount(() => {
		const supabase = officeSupabase();
		if (!supabase) {
			phase = 'unconfigured';
			link = 'offline';
			problem = '';
			return;
		}
		let ready = false;
		const queued: BotChange[] = [];
		const take = (change: BotChange) => {
			if (!ready) queued.push(change);
			else bots = applyBotEvent(bots, change);
		};
		const channel = supabase
			.channel('bot-status-office')
			.on('postgres_changes', { event: '*', schema: 'public', table: 'bot_status' }, (payload) => {
				take({ eventType: payload.eventType, new: payload.new, old: payload.old });
			})
			.subscribe((status) => {
				if (status === 'SUBSCRIBED') link = 'live';
				else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
					link = 'offline';
				}
			});
		void (async () => {
			try {
				const { data, error } = await supabase
					.from('bot_status')
					.select('bot_id,name,color,status,doing,talking_to,message,updated_at');
				if (error) problem = explainOfficeError(error.message);
				else {
					problem = '';
					bots = (data ?? []).flatMap((row) => {
						const parsed = parseBotRow(row);
						return parsed ? [parsed] : [];
					});
				}
			} catch (error) {
				problem = explainOfficeError(
					error instanceof Error ? error.message : 'Unable to load bot status.'
				);
			} finally {
				ready = true;
				for (const change of queued) bots = applyBotEvent(bots, change);
				phase = 'ready';
			}
		})();
		return () => {
			void supabase.removeChannel(channel);
		};
	});
</script>

<svelte:head><title>Bot team office · Apex</title></svelte:head>
<BotOfficeBoard {bots} {phase} {link} {problem} />
