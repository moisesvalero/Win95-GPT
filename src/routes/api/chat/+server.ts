import type { Role } from '$lib/types';
import { openai } from '$lib/openai';
import { env as publicEnv } from '$env/dynamic/public';
import type { RequestHandler } from './$types';

interface ChatInputMessage {
	role: Role;
	content: string;
}

const ALLOWED_MINI_MODELS = new Set(['gpt-5.4-mini', 'gpt-5-mini', 'gpt-4.1-mini', 'gpt-4o-mini']);

const fetchWebContext = async (query: string): Promise<string | null> => {
	try {
		const endpoint = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
		const response = await fetch(endpoint);
		if (!response.ok) return null;
		const data = (await response.json()) as {
			AbstractText?: string;
			AbstractURL?: string;
			Heading?: string;
			RelatedTopics?: Array<{ Text?: string; FirstURL?: string; Topics?: Array<{ Text?: string; FirstURL?: string }> }>;
		};

		const lines: string[] = [];
		if (data.Heading && data.AbstractText) {
			lines.push(`- ${data.Heading}: ${data.AbstractText}${data.AbstractURL ? ` (${data.AbstractURL})` : ''}`);
		}

		const related = (data.RelatedTopics ?? [])
			.flatMap((topic) => ('Topics' in topic && topic.Topics ? topic.Topics : [topic]))
			.filter((topic) => topic.Text)
			.slice(0, 6);

		for (const topic of related) {
			lines.push(`- ${topic.Text}${topic.FirstURL ? ` (${topic.FirstURL})` : ''}`);
		}

		if (lines.length === 0) return null;
		return `Contexto web (DuckDuckGo, puede ser parcial):\n${lines.join('\n')}`;
	} catch {
		return null;
	}
};

export const POST: RequestHandler = async ({ request, locals }) => {
	const session = await locals.getSession();
	if (!session) return new Response('Unauthorized', { status: 401 });

	try {
		const { messages, conversationId, model, useWeb, imageDataUrl } = await request.json();
		const requestedModel = (model as string | undefined) || publicEnv.PUBLIC_MODEL || 'gpt-5.4-mini';
		const selectedModel = ALLOWED_MINI_MODELS.has(requestedModel) ? requestedModel : 'gpt-5.4-mini';
		const chatMessages = (messages as ChatInputMessage[]) ?? [];
		const lastUserMessage = [...chatMessages].reverse().find((message) => message.role === 'user');
		const webContext =
			useWeb && lastUserMessage?.content ? await fetchWebContext(lastUserMessage.content.slice(0, 600)) : null;

		const messagePayload: Array<{ role: Role; content: string | Array<any> }> = [...chatMessages];
		if (imageDataUrl && messagePayload.length > 0) {
			const lastIndex = messagePayload.length - 1;
			const last = messagePayload[lastIndex];
			if (last.role === 'user') {
				messagePayload[lastIndex] = {
					role: 'user',
					content: [
						{ type: 'text', text: last.content || 'Analiza la imagen.' },
						{ type: 'image_url', image_url: { url: imageDataUrl } }
					]
				};
			}
		}

		const stream = await openai.chat.completions.create({
			model: selectedModel,
			stream: true,
			messages: ([
				{
					role: 'system',
					content:
						'Eres un asistente útil. Responde en el mismo idioma en que te escriban. Si llega contexto web, úsalo y reconoce cuando sea incompleto.'
				},
				...(webContext ? [{ role: 'system' as const, content: webContext }] : []),
				...messagePayload
			] as any)
		});

		const encoder = new TextEncoder();
		const readable = new ReadableStream({
			async start(controller) {
				for await (const chunk of stream) {
					const text = chunk.choices[0]?.delta?.content || '';
					if (text) controller.enqueue(encoder.encode(text));
				}
				controller.close();
			}
		});

		return new Response(readable, {
			headers: {
				'content-type': 'text/plain; charset=utf-8',
				'x-conversation-id': conversationId ?? ''
			}
		});
	} catch {
		return new Response('No se pudo completar la búsqueda online o generar la respuesta.', { status: 500 });
	}
};

export const PUT: RequestHandler = async ({ request, locals, url }) => {
	const session = await locals.getSession();
	if (!session) return new Response('Unauthorized', { status: 401 });
	const conversationId = url.searchParams.get('id');
	if (!conversationId) return new Response('Missing conversation id', { status: 400 });

	const { role, content } = (await request.json()) as { role: Role; content: string };
	const { error } = await locals.supabase.from('messages').insert({
		conversation_id: conversationId,
		role,
		content
	});
	if (error) return new Response(error.message, { status: 400 });

	await locals.supabase
		.from('conversations')
		.update({ updated_at: new Date().toISOString() })
		.eq('id', conversationId)
		.eq('user_id', session.user.id);

	return new Response('ok');
};

export const PATCH: RequestHandler = async ({ request, locals, url }) => {
	const session = await locals.getSession();
	if (!session) return new Response('Unauthorized', { status: 401 });
	const conversationId = url.searchParams.get('id');
	if (!conversationId) return new Response('Missing conversation id', { status: 400 });
	const { title } = (await request.json()) as { title: string };

	const { error } = await locals.supabase
		.from('conversations')
		.update({ title, updated_at: new Date().toISOString() })
		.eq('id', conversationId)
		.eq('user_id', session.user.id);

	if (error) return new Response(error.message, { status: 400 });
	return new Response('ok');
};
