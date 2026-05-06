import type { Role } from '$lib/types';
import { openai } from '$lib/openai';
import { env as publicEnv } from '$env/dynamic/public';
import { env as privateEnv } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

interface ChatInputMessage {
	role: Role;
	content: string;
}

const ALLOWED_MINI_MODELS = new Set(['gpt-5.4-mini', 'gpt-4o-mini']);

const getDemoEmails = () =>
	(privateEnv.DEMO_EMAILS ?? '')
		.split(',')
		.map((email) => email.trim().toLowerCase())
		.filter(Boolean);

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
		try {
			const liteUrl = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
			const html = await (await fetch(liteUrl)).text();
			const matches = [...html.matchAll(/<a rel="nofollow" href="([^"]+)">([^<]+)<\/a>/g)].slice(0, 6);
			if (!matches.length) return null;
			const lines = matches.map((m) => `- ${m[2]} (${m[1]})`);
			return `Contexto web (DuckDuckGo Lite):\n${lines.join('\n')}`;
		} catch {
			return null;
		}
	}
};

export const POST: RequestHandler = async ({ request, locals }) => {
	const session = await locals.getSession();
	if (!session) return new Response('Unauthorized', { status: 401 });

	try {
		const { messages, conversationId, model, useWeb, imageDataUrl } = await request.json();
		const userEmail = (session.user.email ?? '').toLowerCase();
		const demoEmails = getDemoEmails();
		const isAnonymousGuest = !session.user.email;
		const isDemoUser = demoEmails.includes(userEmail) || isAnonymousGuest;

		if (isDemoUser) {
			const maxPromptChars = Number(
				isAnonymousGuest ? privateEnv.GUEST_MAX_PROMPT_CHARS ?? '700' : privateEnv.DEMO_MAX_PROMPT_CHARS ?? '1200'
			);
			const maxResponsesPerDay = Number(
				isAnonymousGuest
					? privateEnv.GUEST_MAX_RESPONSES_PER_DAY ?? '8'
					: privateEnv.DEMO_MAX_RESPONSES_PER_DAY ?? '20'
			);
			const today = new Date();
			today.setHours(0, 0, 0, 0);
			const todayIso = today.toISOString();

			const latestUserPrompt = [...((messages as ChatInputMessage[]) ?? [])]
				.reverse()
				.find((message) => message.role === 'user')?.content;
			if (latestUserPrompt && latestUserPrompt.length > maxPromptChars) {
				return new Response(
					`Cuenta demo: máximo ${maxPromptChars} caracteres por mensaje para controlar coste.`,
					{ status: 429 }
				);
			}

			const { count: responsesToday, error: usageError } = await locals.supabase
				.from('messages')
				.select('id, conversations!inner(user_id)', { count: 'exact', head: true })
				.eq('role', 'assistant')
				.eq('conversations.user_id', session.user.id)
				.gte('created_at', todayIso);

			if (!usageError && (responsesToday ?? 0) >= maxResponsesPerDay) {
				return new Response(
					`Cuenta demo: límite diario alcanzado (${maxResponsesPerDay} respuestas). Vuelve mañana.`,
					{
						status: 429
					}
				);
			}
		}

		const requestedModel = (model as string | undefined) || publicEnv.PUBLIC_MODEL || 'gpt-5.4-mini';
		let selectedModel = ALLOWED_MINI_MODELS.has(requestedModel) ? requestedModel : 'gpt-5.4-mini';
		if (imageDataUrl && selectedModel !== 'gpt-4o-mini') {
			selectedModel = 'gpt-4o-mini';
		}
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
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Error interno';
		return new Response(`No se pudo completar la búsqueda online o generar la respuesta: ${message}`, {
			status: 500
		});
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
