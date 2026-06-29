import { env } from '$env/dynamic/private';
import type { Role } from '$lib/types';

type ContentPart =
	| { type: 'text'; text: string }
	| { type: 'image_url'; image_url: { url: string } };

export interface AIMessage {
	role: Role | 'system';
	content: string | ContentPart[];
}

interface AIOptions {
	model: string;
	messages: AIMessage[];
	signal?: AbortSignal;
}

const ALLOWED_MODELS = new Set(['openrouter/free', 'gemini-2.5-flash']);

const VISION_MODELS = new Set(['openrouter/free', 'gemini-2.5-flash']);

export function isAllowedModel(model: string): boolean {
	return ALLOWED_MODELS.has(model);
}

export function isVisionModel(model: string): boolean {
	return VISION_MODELS.has(model);
}

export function getDefaultModel(): string {
	return 'openrouter/free';
}

function getApiKey(model: string): string {
	if (model.startsWith('gemini-')) return env.GEMINI_API_KEY ?? '';
	return env.OPENROUTER_API_KEY ?? '';
}

async function* streamOpenRouter(
	model: string,
	messages: AIMessage[],
	signal?: AbortSignal
): AsyncGenerator<string> {
	const response = await fetch(
		'https://openrouter.ai/api/v1/chat/completions',
		{
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${getApiKey(model)}`,
				'HTTP-Referer': 'https://win95-gpt.vercel.app'
			},
			body: JSON.stringify({ model, messages, stream: true }),
			signal
		}
	);

	if (!response.ok) {
		const err = await response.text();
		throw new Error(`OpenRouter error ${response.status}: ${err}`);
	}

	const reader = response.body?.getReader();
	if (!reader) throw new Error('No response body');

	const decoder = new TextDecoder();
	let buffer = '';

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;

		buffer += decoder.decode(value, { stream: true });
		const lines = buffer.split('\n');
		buffer = lines.pop() ?? '';

		for (const line of lines) {
			if (!line.startsWith('data: ')) continue;
			const data = line.slice(6).trim();
			if (data === '[DONE]') return;

			try {
				const parsed = JSON.parse(data);
				const text = parsed.choices?.[0]?.delta?.content ?? '';
				if (text) yield text;
			} catch {
				// skip malformed chunk
			}
		}
	}
}

function convertToGeminiParts(
	content: string | ContentPart[]
): Array<{ text?: string; inline_data?: { mime_type: string; data: string } }> {
	if (typeof content === 'string') {
		return [{ text: content }];
	}
	return content.map((part) => {
		if (part.type === 'text') return { text: part.text };
		const match = part.image_url.url.match(/^data:(image\/\w+);base64,(.+)$/);
		if (match) {
			return { inline_data: { mime_type: match[1], data: match[2] } };
		}
		return { text: '[Imagen no soportada]' };
	});
}

async function* streamGemini(
	model: string,
	messages: AIMessage[],
	signal?: AbortSignal
): AsyncGenerator<string> {
	const systemMessage = messages.find((m) => m.role === 'system');
	const nonSystemMessages = messages.filter((m) => m.role !== 'system');

	const contents: Array<{
		role: string;
		parts: Array<{
			text?: string;
			inline_data?: { mime_type: string; data: string };
		}>;
	}> = [];

	for (const msg of nonSystemMessages) {
		const parts = convertToGeminiParts(msg.content);
		if (parts.length === 0) continue;
		contents.push({
			role: msg.role === 'assistant' ? 'model' : 'user',
			parts
		});
	}

	const body: Record<string, unknown> = { contents };
	if (systemMessage && typeof systemMessage.content === 'string') {
		body.system_instruction = { parts: [{ text: systemMessage.content }] };
	}

	const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${getApiKey(model)}`;

	const response = await fetch(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
		signal
	});

	if (!response.ok) {
		const err = await response.text();
		throw new Error(`Gemini error ${response.status}: ${err}`);
	}

	const reader = response.body?.getReader();
	if (!reader) throw new Error('No response body');

	const decoder = new TextDecoder();
	let buffer = '';

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;

		buffer += decoder.decode(value, { stream: true });
		const lines = buffer.split('\n');
		buffer = lines.pop() ?? '';

		for (const line of lines) {
			if (!line.startsWith('data: ')) continue;
			const data = line.slice(6).trim();
			if (!data) continue;

			try {
				const parsed = JSON.parse(data);
				const text =
					parsed.candidates?.[0]?.content?.parts
						?.map((p: { text?: string }) => p.text ?? '')
						.join('') ?? '';
				if (text) yield text;
			} catch {
				// skip malformed chunk
			}
		}
	}
}

export function streamAI(options: AIOptions): AsyncGenerator<string> {
	const { model, messages, signal } = options;
	const provider = model.startsWith('gemini-') ? 'gemini' : 'openrouter';

	if (provider === 'gemini') {
		return streamGemini(model, messages, signal);
	}
	return streamOpenRouter(model, messages, signal);
}
