<script lang="ts">
	import type { Message, Role } from '$lib/types';
	import type { PageData } from './$types';
	import { marked } from 'marked';
	import DOMPurify from 'dompurify';
	import { browser } from '$app/environment';
	import Prism from 'prismjs';
	import { env } from '$env/dynamic/public';
	import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
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
	let useWebSearch = $state(true);
	let attachedImageDataUrl = $state('');
	let attachedImageName = $state('');
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

	const downloadBlob = (filename: string, blob: Blob) => {
		if (!browser) return;
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = filename;
		document.body.appendChild(link);
		link.click();
		link.remove();
		URL.revokeObjectURL(url);
	};

	const exportMessage = async (content: string, format: 'txt' | 'md' | 'json' | 'pdf') => {
		if (format === 'txt') {
			downloadBlob('respuesta.txt', new Blob([content], { type: 'text/plain;charset=utf-8' }));
			return;
		}
		if (format === 'md') {
			downloadBlob('respuesta.md', new Blob([content], { type: 'text/markdown;charset=utf-8' }));
			return;
		}
		if (format === 'json') {
			const payload = JSON.stringify({ content }, null, 2);
			downloadBlob('respuesta.json', new Blob([payload], { type: 'application/json;charset=utf-8' }));
			return;
		}

		const pdfDoc = await PDFDocument.create();
		const pageWidth = 595.28;
		const pageHeight = 841.89;
		const margin = 40;
		const fontSize = 11;
		const lineHeight = 15;
		const maxTextWidth = pageWidth - margin * 2;
		const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

		let page = pdfDoc.addPage([pageWidth, pageHeight]);
		let cursorY = pageHeight - margin;
		const pushLine = (line: string) => {
			if (cursorY < margin + lineHeight) {
				page = pdfDoc.addPage([pageWidth, pageHeight]);
				cursorY = pageHeight - margin;
			}
			page.drawText(line, {
				x: margin,
				y: cursorY,
				size: fontSize,
				font,
				color: rgb(0, 0, 0)
			});
			cursorY -= lineHeight;
		};

		const textLines = content.replace(/\r\n/g, '\n').split('\n');
		for (const rawLine of textLines) {
			const words = rawLine.split(/\s+/).filter(Boolean);
			if (!words.length) {
				pushLine(' ');
				continue;
			}
			let currentLine = '';
			for (const word of words) {
				const candidate = currentLine ? `${currentLine} ${word}` : word;
				const width = font.widthOfTextAtSize(candidate, fontSize);
				if (width <= maxTextWidth) {
					currentLine = candidate;
					continue;
				}
				if (currentLine) pushLine(currentLine);
				if (font.widthOfTextAtSize(word, fontSize) <= maxTextWidth) {
					currentLine = word;
					continue;
				}
				let chunk = '';
				for (const ch of word) {
					const next = `${chunk}${ch}`;
					if (font.widthOfTextAtSize(next, fontSize) <= maxTextWidth) {
						chunk = next;
					} else {
						if (chunk) pushLine(chunk);
						chunk = ch;
					}
				}
				currentLine = chunk;
			}
			if (currentLine) pushLine(currentLine);
		}

		const pdfBytes = await pdfDoc.save();
		const pdfByteArray = Uint8Array.from(pdfBytes);
		downloadBlob('respuesta.pdf', new Blob([pdfByteArray], { type: 'application/pdf' }));
	};

	const onFileChange = async (event: Event) => {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		attachedImageName = file.name;
		attachedImageDataUrl = await new Promise<string>((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(String(reader.result ?? ''));
			reader.onerror = () => reject(new Error('No se pudo leer la imagen'));
			reader.readAsDataURL(file);
		});
	};

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
		if ((!content && !attachedImageDataUrl) || isStreaming) return;

		isStreaming = true;
		prompt = '';

		const userMessage = {
			id: crypto.randomUUID(),
			conversation_id: conversationId,
			role: 'user' as const,
			content: content || `[Imagen adjunta: ${attachedImageName || 'archivo'}]`,
			created_at: new Date().toISOString()
		};
		messages = [...messages, userMessage];
		await saveMessage('user', userMessage.content);

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
				useWeb: useWebSearch,
				imageDataUrl: attachedImageDataUrl || null,
				messages: messages.map((m) => ({ role: m.role, content: m.content }))
			})
		});

		attachedImageDataUrl = '';
		attachedImageName = '';

		if (!response.ok) {
			const errorText = await response.text();
			messages = messages.map((m) =>
				m.id === assistantMessage.id
					? { ...m, content: errorText || 'Error al generar la respuesta.' }
					: m
			);
			isStreaming = false;
			return;
		}

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
						<div class="assistant-actions">
							<button class="tiny-btn" type="button" onclick={() => exportMessage(message.content, 'txt')}>
								Guardar TXT
							</button>
							<button class="tiny-btn" type="button" onclick={() => exportMessage(message.content, 'md')}>
								Guardar MD
							</button>
							<button class="tiny-btn" type="button" onclick={() => exportMessage(message.content, 'json')}>
								Guardar JSON
							</button>
							<button class="tiny-btn" type="button" onclick={() => exportMessage(message.content, 'pdf')}>
								Guardar PDF
							</button>
						</div>
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
				<option value="gpt-5-mini">gpt-5-mini</option>
				<option value="gpt-4.1-mini">gpt-4.1-mini</option>
				<option value="gpt-4o-mini">gpt-4o-mini (visión)</option>
			</select>
			<label for="web-search">Buscar online</label>
			<input id="web-search" type="checkbox" bind:checked={useWebSearch} disabled={isStreaming} />
		</div>
		<div class="field-row model-row">
			<label for="img">Imagen:</label>
			<input id="img" type="file" accept="image/*" onchange={onFileChange} disabled={isStreaming} />
			{#if attachedImageName}
				<span class="img-name">{attachedImageName}</span>
				<button type="button" onclick={() => { attachedImageDataUrl = ''; attachedImageName = ''; }}>
					Quitar
				</button>
			{/if}
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
	.assistant-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		margin-top: 6px;
	}
	.tiny-btn {
		padding: 2px 6px;
		min-height: 22px;
		font-size: 11px;
		line-height: 1;
	}
	.composer { display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: end; }
	.model-row { grid-column: 1 / -1; align-items: center; }
	.img-name {
		display: inline-block;
		max-width: 220px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
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
