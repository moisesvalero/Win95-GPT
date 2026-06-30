<script lang="ts">
	import type { Message } from '$lib/types';
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
	let messages = $derived(initialMessages);
	let selectedModel = $state(env.PUBLIC_MODEL || 'openrouter/free');
	let useWebSearch = $state(true);
	let pendingExportFormat = $state<null | 'txt' | 'md' | 'json' | 'pdf'>(null);
	let messageExports = $state<
		Record<string, { format: 'txt' | 'md' | 'json' | 'pdf' }>
	>({});
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
		node
			.querySelectorAll('pre code')
			.forEach((block) => Prism.highlightElement(block as HTMLElement));
		return {
			update(next: string) {
				node.innerHTML = renderAssistant(next);
				node
					.querySelectorAll('pre code')
					.forEach((block) => Prism.highlightElement(block as HTMLElement));
			}
		};
	};

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

	const exportMessage = async (
		content: string,
		format: 'txt' | 'md' | 'json' | 'pdf'
	) => {
		if (format === 'txt') {
			downloadBlob(
				'respuesta.txt',
				new Blob([content], { type: 'text/plain;charset=utf-8' })
			);
			return;
		}
		if (format === 'md') {
			downloadBlob(
				'respuesta.md',
				new Blob([content], { type: 'text/markdown;charset=utf-8' })
			);
			return;
		}
		if (format === 'json') {
			const payload = JSON.stringify({ content }, null, 2);
			downloadBlob(
				'respuesta.json',
				new Blob([payload], { type: 'application/json;charset=utf-8' })
			);
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
		downloadBlob(
			'respuesta.pdf',
			new Blob([pdfByteArray], { type: 'application/pdf' })
		);
	};

	const detectRequestedExport = (
		text: string
	): null | 'txt' | 'md' | 'json' | 'pdf' => {
		const q = text.toLowerCase();
		if (/\bpdf\b/.test(q)) return 'pdf';
		if (/\bjson\b/.test(q)) return 'json';
		if (/\bmarkdown\b|\bmd\b/.test(q)) return 'md';
		if (/\btxt\b|\btexto\b/.test(q)) return 'txt';
		return null;
	};

	const exportLabel = (format: 'txt' | 'md' | 'json' | 'pdf') => {
		if (format === 'pdf') return 'Descargar PDF';
		if (format === 'json') return 'Descargar JSON';
		if (format === 'md') return 'Descargar MD';
		return 'Descargar TXT';
	};

	const onFileChange = async (event: Event) => {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		attachedImageName = file.name;
		const originalDataUrl = await new Promise<string>((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(String(reader.result ?? ''));
			reader.onerror = () => reject(new Error('No se pudo leer la imagen'));
			reader.readAsDataURL(file);
		});

		const shrinkImageDataUrl = async (dataUrl: string): Promise<string> => {
			if (!browser) return dataUrl;
			const img = await new Promise<HTMLImageElement>((resolve, reject) => {
				const el = new Image();
				el.onload = () => resolve(el);
				el.onerror = () => reject(new Error('No se pudo procesar la imagen'));
				el.src = dataUrl;
			});

			const maxDimension = 1400;
			const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
			const targetWidth = Math.max(1, Math.round(img.width * scale));
			const targetHeight = Math.max(1, Math.round(img.height * scale));
			const canvas = document.createElement('canvas');
			canvas.width = targetWidth;
			canvas.height = targetHeight;
			const ctx = canvas.getContext('2d');
			if (!ctx) return dataUrl;
			ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

			// Approx max 1.8MB base64 payload to avoid serverless size limits.
			const maxPayloadChars = 1_800_000;
			let quality = 0.85;
			let encoded = canvas.toDataURL('image/jpeg', quality);
			while (encoded.length > maxPayloadChars && quality > 0.35) {
				quality -= 0.1;
				encoded = canvas.toDataURL('image/jpeg', quality);
			}
			return encoded;
		};

		attachedImageDataUrl = await shrinkImageDataUrl(originalDataUrl);
	};

	const send = async () => {
		const content = prompt.trim();
		if ((!content && !attachedImageDataUrl) || isStreaming) return;

		isStreaming = true;
		prompt = '';
		pendingExportFormat = detectRequestedExport(content);

		const userMessage = {
			id: crypto.randomUUID(),
			conversation_id: conversationId,
			role: 'user' as const,
			content: content || `[Imagen adjunta: ${attachedImageName || 'archivo'}]`,
			created_at: new Date().toISOString()
		};
		messages = [...messages, userMessage];

		const assistantMessage: Message = {
			id: crypto.randomUUID(),
			conversation_id: conversationId,
			role: 'assistant',
			content: '',
			created_at: new Date().toISOString()
		};
		messages = [...messages, assistantMessage];

		const currentImageDataUrl = attachedImageDataUrl || null;
		const response = await fetch('/api/chat', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				conversationId,
				model: selectedModel,
				useWeb: useWebSearch,
				imageDataUrl: currentImageDataUrl,
				messages: messages.map((m) => ({ role: m.role, content: m.content }))
			})
		});

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
			if (!chunk) continue;
			finalText += chunk;
			messages = messages.map((m) =>
				m.id === assistantMessage.id ? { ...m, content: finalText } : m
			);
		}

		attachedImageDataUrl = '';
		attachedImageName = '';
		if (pendingExportFormat) {
			messageExports = {
				...messageExports,
				[assistantMessage.id]: { format: pendingExportFormat }
			};
		}
		pendingExportFormat = null;
		isStreaming = false;
	};

	$effect(() => {
		messages = [...initialMessages];
	});

	$effect(() => {
		const messageCount = messages.length;
		if (!scroller || messageCount < 0) return;
		scroller.scrollTop = scroller.scrollHeight;
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
						{#if messageExports[message.id]}
							<div class="assistant-actions">
								<button
									class="tiny-btn"
									type="button"
									onclick={() =>
										exportMessage(
											message.content,
											messageExports[message.id].format
										)}
								>
									{exportLabel(messageExports[message.id].format)}
								</button>
							</div>
						{/if}
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
				<option value="openrouter/free">OpenRouter (free)</option>
				<option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
			</select>
			<button
				type="button"
				class="web-toggle"
				class:active={useWebSearch}
				disabled={isStreaming}
				onclick={() => (useWebSearch = !useWebSearch)}
				aria-pressed={useWebSearch}
				title="Activa o desactiva la búsqueda online"
			>
				Web: {useWebSearch ? 'ON' : 'OFF'}
			</button>
		</div>
		<div class="field-row model-row">
			<label for="img">Imagen:</label>
			<input
				id="img"
				type="file"
				accept="image/*"
				onchange={onFileChange}
				disabled={isStreaming}
			/>
			{#if attachedImageName}
				<span class="img-name">{attachedImageName}</span>
				<button
					type="button"
					onclick={() => {
						attachedImageDataUrl = '';
						attachedImageName = '';
					}}
				>
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
		<button onclick={send} disabled={isStreaming || !prompt.trim()}
			>Enviar</button
		>
	</div>
</div>

<style>
	.chat-wrap {
		display: grid;
		grid-template-rows: 1fr auto;
		gap: 8px;
		height: calc(100vh - 140px);
	}
	.messages {
		overflow-y: auto;
		padding: 10px;
	}
	.row {
		display: flex;
		margin-bottom: 8px;
	}
	.row.user {
		justify-content: flex-end;
	}
	.row.assistant {
		justify-content: flex-start;
	}
	.bubble {
		max-width: 78%;
		padding: 8px;
		background: #fff;
		border: 2px solid #808080;
	}
	.row.user .bubble {
		background: #e8f4ff;
	}
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
	.composer {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 8px;
		align-items: end;
	}
	.model-row {
		grid-column: 1 / -1;
		align-items: center;
	}
	.web-toggle {
		min-width: 120px;
		font-weight: 700;
	}
	.web-toggle.active {
		border-style: inset;
		background: #dfdfdf;
	}
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
	:global(.messages code) {
		font-family: Consolas, 'Courier New', monospace;
	}
	:global(.messages p) {
		margin: 0.35rem 0;
	}
	:global(.messages h1),
	:global(.messages h2),
	:global(.messages h3),
	:global(.messages h4),
	:global(.messages h5),
	:global(.messages h6) {
		margin: 0.55rem 0 0.35rem;
		line-height: 1.2;
		overflow-wrap: anywhere;
		word-break: break-word;
	}
	:global(.messages h1) {
		font-size: 1.15rem;
	}
	:global(.messages h2) {
		font-size: 1.07rem;
	}
	:global(.messages h3) {
		font-size: 1rem;
	}
	:global(.messages h4),
	:global(.messages h5),
	:global(.messages h6) {
		font-size: 0.95rem;
	}
	:global(.messages ul),
	:global(.messages ol) {
		margin: 0.35rem 0 0.35rem 1.2rem;
		padding: 0;
	}
	:global(.messages table),
	:global(.messages img),
	:global(.messages pre),
	:global(.messages blockquote) {
		max-width: 100%;
	}
	:global(.messages *) {
		overflow-wrap: anywhere;
		word-break: break-word;
	}
	textarea {
		width: 100%;
		min-height: 68px;
		resize: vertical;
	}
	@media (max-width: 900px) {
		.composer {
			grid-template-columns: 1fr;
			align-items: stretch;
		}
		.model-row {
			gap: 4px;
			flex-wrap: wrap;
		}
		.web-toggle {
			min-width: 92px;
			padding-inline: 6px;
			font-size: 11px;
		}
		.bubble {
			max-width: 92%;
		}
	}
</style>
