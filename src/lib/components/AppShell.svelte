<script lang="ts">
	import { page } from '$app/state';
	import WorkspaceIcon from './WorkspaceIcon.svelte';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import type { Snippet } from 'svelte';
	let { children }: { children: Snippet } = $props();
	let collapsed = $state(false);
	let drawer: HTMLDialogElement;
	const groups = [
		{
			title: 'Discover',
			items: [
				{ label: 'Lead enrichment', path: '/enrichment', query: '', href: resolve('/enrichment'), color: '#35b9a1' },
				{
					label: 'Sales intelligence',
					path: '/sales',
					query: '',
					href: resolve('/sales'),
					color: '#8b6cef'
				},
				{
					label: 'Accela records',
					path: '/leads',
					query: '?source=accela',
					href: resolve('/leads?source=accela'),
					color: '#35b9a1'
				},
				{
					label: 'MyCase',
					path: '/leads',
					query: '?source=mycase',
					href: resolve('/leads?source=mycase'),
					color: '#d6a243'
				}
			]
		},
		{
			title: 'Plan & renovate',
			items: [
				{
					label: 'Rehab calculator',
					path: '/rehab',
					query: '?view=estimate',
					href: resolve('/rehab?view=estimate'),
					color: '#5b9fff'
				},
				{
					label: 'Saved estimates',
					path: '/rehab',
					query: '?view=history',
					href: resolve('/rehab?view=history'),
					color: '#5b9fff'
				},
				{
					label: 'Property images',
					path: '/rehab',
					query: '?view=gallery',
					href: resolve('/rehab?view=gallery'),
					color: '#42c9b4'
				},
				{
					label: 'Design studio',
					path: '/rehab',
					query: '?view=studio',
					href: resolve('/rehab?view=studio'),
					color: '#c18aff'
				}
			]
		},
		{
			title: 'Communicate',
			items: [
				{
					label: 'SMS outreach',
					path: '/rehab',
					query: '?view=sms',
					href: resolve('/rehab?view=sms'),
					color: '#42c9b4'
				},
				{ label: 'Email outreach', path: '/', query: '', href: resolve('/'), color: '#ed97b5' }
			]
		}
	];
	function active(item: { path: string; query: string }) {
		if (item.path === '/sales') return page.url.pathname.startsWith('/sales');
		if (page.url.pathname !== item.path) return false;
		if (!item.query) return true;
		const [key, value] = item.query.slice(1).split('=');
		return (page.url.searchParams.get(key) || (key === 'view' ? 'estimate' : 'accela')) === value;
	}
	const current = $derived(groups.flatMap((g) => g.items).find(active)?.label || 'Workspace');
	onMount(() => {
		try {
			collapsed = localStorage.getItem('apex-sidebar-collapsed') === 'true';
		} catch {
			/* Storage is optional. */
		}
	});
	function toggle() {
		collapsed = !collapsed;
		try {
			localStorage.setItem('apex-sidebar-collapsed', String(collapsed));
		} catch {
			/* Storage is optional. */
		}
	}
</script>

{#snippet navigation(mobile = false)}
	<a
		class="workspace-brand"
		href={resolve('/rehab')}
		aria-label="Apex workspace home"
		onclick={() => {
			if (mobile) drawer.close();
		}}
		><span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span><span class="nav-label"
			>apex<span class="brand-caption">property workspace</span></span
		></a
	>
	<div class="workspace-picker">
		<span class="workspace-avatar">A</span><span class="nav-label"
			>Main workspace<small>Your property toolkit</small></span
		>
	</div>
	<nav aria-label={mobile ? 'Mobile workspace navigation' : 'Workspace navigation'}>
		{#each groups as group (group.title)}
			<div class="nav-group">
				<p class="nav-label">{group.title}</p>
				{#each group.items as item (item.label)}
					<!-- eslint-disable svelte/no-navigation-without-resolve -->
					<!-- All navigation URLs are resolved in the configuration above. -->
					<a
						href={item.href}
						class:nav-active={active(item)}
						aria-current={active(item) ? 'page' : undefined}
						title={item.label}
						onclick={() => {
							if (mobile) drawer.close();
						}}
						><span class="nav-icon" style:color={item.color} aria-hidden="true"
							><WorkspaceIcon name={item.label} /></span
						><span class="nav-label">{item.label}</span></a
					>
					<!-- eslint-enable svelte/no-navigation-without-resolve -->
				{/each}
			</div>
		{/each}
	</nav>
	<div class="sidebar-bottom">
		<span class="workspace-avatar">A</span><span class="nav-label"
			>Apex CRM<small>Discover. Connect. Renovate.</small></span
		>
	</div>
{/snippet}
<div class="app-frame" class:sidebar-collapsed={collapsed}>
	<a class="skip-link" href="#workspace-content">Skip to content</a>
	<aside class="app-sidebar">
		{@render navigation()}<button
			class="sidebar-toggle"
			onclick={toggle}
			aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
			aria-expanded={!collapsed}>{collapsed ? '›' : '‹'}</button
		>
	</aside>
	<div class="app-body">
		<header class="app-topbar">
			<button class="mobile-menu" aria-label="Open navigation" onclick={() => drawer.showModal()}
				>☰</button
			>
			<div class="breadcrumb">
				<span>Workspace</span><span aria-hidden="true">/</span><strong>{current}</strong>
			</div>
			<span class="topbar-brand">APEX <span>CRM</span></span>
		</header>
		<div id="workspace-content" tabindex="-1">{@render children()}</div>
	</div>
</div>
<dialog bind:this={drawer} class="navigation-drawer" aria-label="Workspace menu">
	<button class="drawer-close" onclick={() => drawer.close()} aria-label="Close navigation"
		>×</button
	>{@render navigation(true)}
</dialog>
