<script lang="ts">
	import { createBrowserSupabaseClient } from '$lib/supabase';
	import type { Conversation } from '$lib/types';
	import { goto, invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';

	let { data, children } = $props();
	let conversations = $derived((data.conversations ?? []) as Conversation[]);
	let startOpen = $state(false);
	let sidebarOpen = $state(false);
	let startMenuRef: HTMLElement | null = null;
	const supabase = createBrowserSupabaseClient();

	const closeIfOutside = (event: MouseEvent) => {
		if (!startMenuRef) return;
		if (!startMenuRef.contains(event.target as Node)) startOpen = false;
	};

	const logout = async () => {
		await supabase.auth.signOut();
		window.location.href = '/login';
	};

	const newChat = async () => {
		startOpen = false;
		sidebarOpen = false;
		await goto(resolve('/chat/new'));
		await invalidateAll();
	};
</script>

<svelte:document onclick={closeIfOutside} />

<div class="desktop">
	<div class="window main-window">
		<div class="title-bar">
			<div class="title-bar-text">Win95 GPT</div>
			<button class="sidebar-toggle" onclick={() => (sidebarOpen = !sidebarOpen)} aria-label="Toggle sidebar">
				☰
			</button>
			<div class="title-bar-controls">
				<button aria-label="Minimize"></button>
				<button aria-label="Maximize"></button>
				<button aria-label="Close"></button>
			</div>
		</div>
		<div class="window-body body">
			<aside class="sidebar" class:open={sidebarOpen}>
				<div class="field-row-stacked">
					<strong>Chats</strong>
					<ul class="tree-view conv-list">
						{#each conversations as conversation (conversation.id)}
							<li>
								<button
									type="button"
									class="chat-link"
									onclick={() => {
										sidebarOpen = false;
										window.location.assign(`/chat/${conversation.id}`);
									}}
								>
									📁 {conversation.title}
								</button>
							</li>
						{/each}
					</ul>
					<button onclick={newChat}>📄 Nuevo chat</button>
				</div>
			</aside>
			<section class="content">{@render children()}</section>
		</div>
	</div>
</div>

<footer class="taskbar" bind:this={startMenuRef}>
	<button class="start-btn" onclick={() => (startOpen = !startOpen)}>Inicio 🪟</button>
	<div class="active-task">📄 Chat activo</div>
	<div class="clock">{new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</div>

	{#if startOpen}
		<div class="window start-menu">
			<div class="window-body menu-body">
				<a href="https://moisesvalero.es" target="_blank" rel="noreferrer">🌐 Mi portfolio</a>
				<a href="https://galerianova.es" target="_blank" rel="noreferrer">🛍️ Galería Nova</a>
				<hr />
				<button onclick={logout}>🔌 Cerrar sesión</button>
			</div>
		</div>
	{/if}
</footer>

<style>
	.desktop { padding: 8px 8px 42px; min-height: 100vh; }
	.main-window { min-height: calc(100vh - 58px); }
	.body { display: grid; grid-template-columns: 260px 1fr; gap: 10px; min-height: calc(100vh - 110px); }
	.sidebar { border-right: 1px solid #808080; padding-right: 8px; }
	.sidebar-toggle { display: none; margin-left: auto; margin-right: 8px; min-width: 30px; }
	.conv-list { height: 60vh; overflow-y: auto; margin: 0.5rem 0; }
	.content { min-width: 0; }
	.taskbar {
		position: fixed; left: 0; right: 0; bottom: 0; height: 34px; display: grid;
		grid-template-columns: auto 1fr auto; align-items: center; gap: 8px; padding: 4px 8px;
		background: silver; border-top: 2px solid #fff;
		box-shadow: inset 0 1px #dfdfdf;
	}
	.active-task { border: 2px inset #c0c0c0; padding: 2px 8px; }
	.clock { border: 2px inset #c0c0c0; padding: 2px 8px; min-width: 64px; text-align: center; }
	.start-menu { position: absolute; bottom: 38px; left: 8px; z-index: 99; min-width: 220px; }
	.menu-body { display: grid; gap: 8px; }
	.menu-body a, .menu-body button { text-align: left; text-decoration: none; color: #000; }
	.chat-link {
		background: transparent;
		border: 0;
		padding: 0;
		text-align: left;
		cursor: pointer;
	}
	@media (max-width: 900px) {
		.sidebar-toggle { display: inline-block; }
		.body { grid-template-columns: 1fr; }
		.sidebar {
			display: none;
			position: absolute;
			z-index: 30;
			width: min(280px, 84vw);
			max-height: calc(100vh - 130px);
			overflow: auto;
			background: silver;
			border: 2px outset #c0c0c0;
			padding: 8px;
		}
		.sidebar.open { display: block; }
	}
</style>
