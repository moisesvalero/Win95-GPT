<script lang="ts">
	import type { Message, Role } from '$lib/types';
	import type { PageData } from './$types';
	import { marked } from 'marked';
	import DOMPurify from 'dompurify';
	import { browser } from '$app/environment';
	import Prism from 'prismjs';
	import { env } from '$env/dynamic/public';
	import 'prismjs/components/prism-markup';
	import 'prismjs/components/prism-css';
	import 'prismjs/components/prism-javascript';
	import 'prismjs/components/prism-typescript';
	import 'prismjs/components/prism-json';
	import 'prismjs/components/prism-bash';

	let { data }: { data: PageData } = $props();
	let conversationId = $derived(data.conversation.id as string);
	let initialMessages = $derived((data.messages ?? []) as Message[]);
	let messages = $state([] as Message[]);
	let selectedModel = $state(env.PUBLIC_MODEL || 'gpt-5.4-mini');
	let prompt = $state('');
	let isStreaming = $state(false);
	let scroller: HTMLDivElement | null = null;

	const renderAssistant = (content: string) => {
		if (!browser) return content;
		const html = marked.parse(content) as string;
		return DOMPurify.sanitize(html);
	};

	const renderMarkdown = (node: HTMLElement, content: string) => {
		node.innerHTML = renderAssistant(content);
		node.querySelectorAll('pre code').forEach((block) => Prism.highlightElement(block as HTMLElement));
		return {
			update(next: string) {
				node.innerHTML = renderAssistant(next);
				node.querySelectorAll('pre code').forEach((block) => Prism.highlightElement(block as HTMLElement));
			}
		};
	};

	const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

	const saveMessage = async (role: Role, content: string) => {
		await fetch(`/api/chat?id=${conversationId}&persist=1`, {
			method: 'PUT',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ role, content })
		});
	};

	const updateTitleIfNeeded = async (firstText: string) => {
		if (messages.length > 2) return;
		const title = firstText.split(/\s+/).slice(0, 6).join(' ');
		await fetch(`/api/chat?id=${conversationId}&title=1`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ title: title || 'Nueva conversación' })
		});
	};

	const send = async () => {
		const content = prompt.trim();
		if (!content || isStreaming) return;

		isStreaming = true;
		prompt = '';

		const userMessage = {
			id: crypto.randomUUID(),
			conversation_id: conversationId,
			role: 'user' as const,
			content,
			created_at: new Date().toISOString()
		};
		messages = [...messages, userMessage];
		await saveMessage('user', content);

		const assistantMessage: Message = {
			id: crypto.randomUUID(),
			conversation_id: conversationId,
			role: 'assistant',
			content: '',
			created_at: new Date().toISOString()
		};
		messages = [...messages, assistantMessage];

		const response = await fetch('/api/chat', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				conversationId,
				model: selectedModel,
				messages: messages.map((m) => ({ role: m.role, content: m.content }))
			})
		});

		if (!response.body) {
			isStreaming = false;
			return;
		}

		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let finalText = '';

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			const chunk = decoder.decode(value, { stream: true });
			const parts = chunk.split(/(\s+)/);
			for (const part of parts) {
				if (!part) continue;
				finalText += part;
				messages = messages.map((m) => (m.id === assistantMessage.id ? { ...m, content: finalText } : m));
				await sleep(12);
			}
		}

		await saveMessage('assistant', finalText);
		await updateTitleIfNeeded(content);
		isStreaming = false;
	};

	$effect(() => {
		messages = [...initialMessages];
	});

	$effect(() => {
		messages.length;
		if (scroller) scroller.scrollTop = scroller.scrollHeight;
	});

	const onKey = async (event: KeyboardEvent) => {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			await send();
		}
	};
</script>

<div class="chat-wrap">
	<div class="sunken-panel messages" bind:this={scroller}>
		{#each messages as message (message.id)}
			<div class="row {message.role === 'user' ? 'user' : 'assistant'}">
				<div class="bubble">
					{#if message.role === 'assistant'}
						<div use:renderMarkdown={message.content}></div>
					{:else}
						{message.content}
					{/if}
				</div>
			</div>
		{/each}
	</div>

	<div class="composer">
		<div class="field-row model-row">
			<label for="model">Modelo:</label>
			<select id="model" bind:value={selectedModel} disabled={isStreaming}>
				<option value="gpt-5.4-mini">gpt-5.4-mini</option>
				<option value="gpt-4.1-mini">gpt-4.1-mini</option>
			</select>
		</div>
		<textarea
			rows="3"
			placeholder="Escribe tu mensaje..."
			bind:value={prompt}
			disabled={isStreaming}
			onkeydown={onKey}
		></textarea>
		<button onclick={send} disabled={isStreaming || !prompt.trim()}>Enviar</button>
	</div>
</div>

<style>
	.chat-wrap { display: grid; grid-template-rows: 1fr auto; gap: 8px; height: calc(100vh - 140px); }
	.messages { overflow-y: auto; padding: 10px; }
	.row { display: flex; margin-bottom: 8px; }
	.row.user { justify-content: flex-end; }
	.row.assistant { justify-content: flex-start; }
	.bubble { max-width: 78%; padding: 8px; background: #fff; border: 2px solid #808080; }
	.row.user .bubble { background: #e8f4ff; }
	.composer { display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: end; }
	.model-row { grid-column: 1 / -1; align-items: center; }
	:global(.messages pre) {
		margin: 0.5rem 0;
		padding: 0.5rem;
		background: #1e1e1e;
		color: #f8f8f2;
		overflow-x: auto;
	}
	:global(.messages code) { font-family: Consolas, 'Courier New', monospace; }
	:global(.messages p) { margin: 0.35rem 0; }
	textarea { width: 100%; min-height: 68px; resize: vertical; }
</style>
