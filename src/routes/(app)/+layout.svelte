<script lang="ts">
	import { createBrowserSupabaseClient } from '$lib/supabase';
	import type { Conversation } from '$lib/types';
	import { goto, invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/stores';

	let { data, children } = $props();
	let conversations = $derived((data.conversations ?? []) as Conversation[]);
	let taskTabs = $derived(conversations.slice(0, 8));
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

	const renameConversation = async (conversationId: string, currentTitle: string) => {
		const title = prompt('Nuevo nombre del chat', currentTitle)?.trim();
		if (!title) return;

		const response = await fetch(`/api/conversations/${conversationId}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ title })
		});

		if (!response.ok) {
			const errorText = await response.text();
			alert(errorText || 'No se pudo renombrar el chat');
			return;
		}

		await invalidateAll();
	};

	const deleteConversation = async (conversationId: string) => {
		if (!confirm('¿Borrar este chat?')) return;

		const response = await fetch(`/api/conversations/${conversationId}`, {
			method: 'DELETE'
		});

		if (!response.ok) {
			const errorText = await response.text();
			alert(errorText || 'No se pudo borrar el chat');
			return;
		}

		if (window.location.pathname.includes(`/chat/${conversationId}`)) {
			await goto(resolve('/chat/new'));
		}

		await invalidateAll();
	};

	const projects = [
		{ name: 'NovaKit', url: 'https://novakit.moisesvalero.es/' },
		{ name: 'GaleriaNova', url: 'https://galerianova.es/' },
		{ name: 'GaleriaNova Legacy', url: 'https://galerianova.moisesvalero.es/' },
		{ name: 'V-Shield', url: 'https://v-shield.moisesvalero.es/' },
		{ name: 'ScanIt', url: 'https://scanit-rho.vercel.app/' },
		{ name: 'CV Generator', url: 'https://moisesverse3.gumroad.com/l/pro-cv-generator-sveltekit' },
		{ name: 'moisesvalero.es', url: 'https://moisesvalero.es/' },
		{ name: 'Diseño Web', url: 'https://moisesvalero.es/diseno-web' }
	];

	const faviconFor = (url: string) => `https://www.google.com/s2/favicons?domain=${encodeURIComponent(url)}&sz=16`;
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
							<li class="chat-item">
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
								<div class="chat-actions">
									<button
										type="button"
										class="small-btn"
										onclick={(event) => {
											event.stopPropagation();
											void renameConversation(conversation.id, conversation.title);
										}}
									>
										Renombrar
									</button>
									<button
										type="button"
										class="small-btn"
										onclick={(event) => {
											event.stopPropagation();
											void deleteConversation(conversation.id);
										}}
									>
										Borrar
									</button>
								</div>
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
	<button class="start-btn" onclick={() => (startOpen = !startOpen)}>
		<span class="start-logo" aria-hidden="true">
			<span class="sq red"></span><span class="sq green"></span><span class="sq blue"></span><span class="sq yellow"></span>
		</span>
		Inicio
	</button>
	<div class="task-tabs">
		{#each taskTabs as tab (tab.id)}
			<button
				class="task-tab"
				class:active={$page.url.pathname === `/chat/${tab.id}`}
				onclick={() => window.location.assign(`/chat/${tab.id}`)}
				title={tab.title}
			>
				📄 {tab.title}
			</button>
		{/each}
	</div>
	<div class="clock">{new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</div>

	{#if startOpen}
		<div class="window start-menu">
			<div class="window-body menu-body">
				<div class="start-section-label">Programs</div>
				{#each projects as project (project.url)}
					<button
						type="button"
						class="start-link"
						onclick={() => {
							startOpen = false;
							window.open(project.url, '_blank', 'noopener,noreferrer');
						}}
					>
						<img src={faviconFor(project.url)} alt="" width="16" height="16" />
						{project.name}
					</button>
				{/each}
				<div class="start-section-label">Web Projects</div>
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
		grid-template-columns: auto 1fr auto; align-items: center; gap: 6px; padding: 4px 8px;
		background: silver; border-top: 2px solid #fff;
		box-shadow: inset 0 1px #dfdfdf;
	}
	.start-btn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-weight: 700;
		padding-inline: 8px;
	}
	.start-logo {
		display: inline-grid;
		grid-template-columns: repeat(2, 6px);
		grid-template-rows: repeat(2, 6px);
		gap: 1px;
		width: 13px;
		height: 13px;
	}
	.sq { display: block; width: 6px; height: 6px; }
	.red { background: #ff0000; }
	.green { background: #00a000; }
	.blue { background: #0000ff; }
	.yellow { background: #ffcc00; }
	.task-tabs {
		display: flex;
		gap: 4px;
		overflow-x: auto;
		white-space: nowrap;
		padding-bottom: 1px;
	}
	.task-tab {
		border: 2px outset #c0c0c0;
		background: silver;
		padding: 2px 8px;
		min-width: 120px;
		max-width: 220px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		text-align: left;
	}
	.task-tab.active {
		border: 2px inset #c0c0c0;
		background: #dfdfdf;
	}
	.clock { border: 2px inset #c0c0c0; padding: 2px 8px; min-width: 64px; text-align: center; }
	.start-menu { position: absolute; bottom: 38px; left: 8px; z-index: 99; min-width: 220px; }
	.menu-body { display: grid; gap: 8px; }
	.menu-body button { text-align: left; text-decoration: none; color: #000; }
	.start-link {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		border: 0;
		background: transparent;
		padding: 4px 6px;
	}
	.start-link:hover,
	.start-link:focus-visible {
		background: #000080;
		color: #fff;
		outline: none;
	}
	.start-link:hover img,
	.start-link:focus-visible img {
		filter: saturate(1.2) brightness(1.1);
	}
	.start-section-label {
		font-size: 11px;
		font-weight: 700;
		color: #404040;
		text-transform: uppercase;
		letter-spacing: 0.2px;
		padding: 2px 4px;
	}
	.chat-link {
		background: transparent;
		border: 0;
		padding: 0;
		text-align: left;
		cursor: pointer;
		flex: 1;
		min-width: 0;
		width: 100%;
	}
	.chat-item {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 2px 0;
	}
	.chat-actions {
		display: flex;
		gap: 4px;
		flex-shrink: 0;
	}
	.small-btn {
		min-width: auto;
		padding: 1px 6px;
		font-size: 11px;
		line-height: 1.2;
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
		.chat-item { align-items: flex-start; }
		.chat-actions { flex-wrap: wrap; }
	}
</style>
