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

const fetchWithTimeout = async (url: string, timeoutMs = 8000) => {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		return await fetch(url, {
			signal: controller.signal,
			headers: {
				'user-agent':
					'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147 Safari/537.36'
			}
		});
	} finally {
		clearTimeout(timer);
	}
};

const fetchWebContext = async (query: string): Promise<string | null> => {
	try {
		const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
		const searchRes = await fetchWithTimeout(searchUrl, 10000);
		if (!searchRes.ok) return null;
		const html = await searchRes.text();

		const matches = [...html.matchAll(/<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].slice(
			0,
			5
		);
		if (!matches.length) return null;

		const decode = (s: string) =>
			s
				.replace(/<[^>]+>/g, '')
				.replace(/&amp;/g, '&')
				.replace(/&quot;/g, '"')
				.replace(/&#39;/g, "'")
				.replace(/&lt;/g, '<')
				.replace(/&gt;/g, '>');

		const sources: Array<{ title: string; url: string; snippet: string }> = [];
		for (const match of matches) {
			const rawUrl = match[1];
			const title = decode(match[2]).trim();
			const url = rawUrl.startsWith('http') ? rawUrl : '';
			if (!url) continue;

			let snippet = '';
			try {
				const proxied = `https://r.jina.ai/http://${url.replace(/^https?:\/\//, '')}`;
				const pageRes = await fetchWithTimeout(proxied, 9000);
				if (pageRes.ok) {
					const text = (await pageRes.text()).replace(/\s+/g, ' ').trim();
					snippet = text.slice(0, 450);
				}
			} catch {
				snippet = '';
			}

			sources.push({ title, url, snippet });
		}

		if (!sources.length) return null;
		const lines = sources.map(
			(source, index) =>
				`[${index + 1}] ${source.title}\nURL: ${source.url}\nResumen: ${source.snippet || 'Sin resumen disponible'}`
		);
		return `Contexto web en tiempo real para "${query}":\n\n${lines.join('\n\n')}`;
	} catch {
		return null;
	}
};

export const POST: RequestHandler = async ({ request, locals }) => {
	const session = await locals.getSession();
	if (!session) return new Response('Unauthorized', { status: 401 });

	try {
		const { messages, conversationId, model, useWeb, imageDataUrl } = await request.json();
		const userEmail = (session.user.email ?? '').toLowerCase();
		const demoEmails = getDemoEmails();
		const isGuestUser = userEmail !== '' && userEmail === (privateEnv.GUEST_EMAIL ?? '').trim().toLowerCase();
		const isDemoUser = demoEmails.includes(userEmail) || isGuestUser;

		if (isDemoUser) {
			const maxPromptChars = Number(
				isGuestUser ? privateEnv.GUEST_MAX_PROMPT_CHARS ?? '700' : privateEnv.DEMO_MAX_PROMPT_CHARS ?? '1200'
			);
			const maxResponsesPerDay = Number(
				isGuestUser
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
		const webStatusNote =
			useWeb && !webContext
				? 'Búsqueda web activa, pero no se encontraron resultados útiles en esta consulta.'
				: null;

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
						'Eres un asistente útil. Responde en el mismo idioma en que te escriban. Si la búsqueda web está activa, usa siempre el contexto web recibido y cita las fuentes como [1], [2], etc cuando afirmes datos de actualidad.'
				},
				...(webStatusNote ? [{ role: 'system' as const, content: webStatusNote }] : []),
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
