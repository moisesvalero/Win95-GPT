import {
	streamAI,
	isAllowedModel,
	isVisionModel,
	getDefaultModel
} from '$lib/ai';
import { checkRateLimit } from '$lib/rate-limit';
import { env as publicEnv } from '$env/dynamic/public';
import type { RequestHandler } from './$types';
import type { AIMessage } from '$lib/ai';

const API_SECURITY_HEADERS = {
	'X-Content-Type-Options': 'nosniff',
	'X-Frame-Options': 'SAMEORIGIN',
	'X-XSS-Protection': '1; mode=block',
	'Referrer-Policy': 'strict-origin-when-cross-origin',
	'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload'
};

interface ChatInputMessage {
	role: 'user' | 'assistant' | 'system';
	content: string;
}

const FORCE_WEB_QUERY_REGEX =
	/\b(busca|buscar|búscame|investiga|internet|online|web|hoy|ayer|último|ultima|ultimo|actual|resultado|marcador|noticia|news)\b/i;

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

const fetchJsonWithTimeout = async <T>(
	url: string,
	timeoutMs = 8000
): Promise<T | null> => {
	try {
		const res = await fetchWithTimeout(url, timeoutMs);
		if (!res.ok) return null;
		return (await res.json()) as T;
	} catch {
		return null;
	}
};

const fetchTextWithTimeout = async (
	url: string,
	timeoutMs = 8000
): Promise<string | null> => {
	try {
		const res = await fetchWithTimeout(url, timeoutMs);
		if (!res.ok) return null;
		return await res.text();
	} catch {
		return null;
	}
};

const decodeHtml = (s: string) =>
	s
		.replace(/<[^>]+>/g, '')
		.replace(/&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.trim();

const normalizeDuckDuckGoUrl = (rawHref: string): string | null => {
	if (!rawHref) return null;
	try {
		const decoded = decodeURIComponent(rawHref);
		if (decoded.startsWith('http://') || decoded.startsWith('https://'))
			return decoded;
		if (decoded.startsWith('//')) return `https:${decoded}`;

		if (decoded.startsWith('/l/?')) {
			const u = new URL(`https://duckduckgo.com${decoded}`);
			const uddg = u.searchParams.get('uddg');
			if (uddg) {
				const target = decodeURIComponent(uddg);
				if (target.startsWith('http://') || target.startsWith('https://'))
					return target;
			}
		}

		if (decoded.startsWith('/')) return null;
	} catch {
		return null;
	}
	return null;
};

const extractSearchResults = (
	html: string
): Array<{ title: string; url: string }> => {
	const results: Array<{ title: string; url: string }> = [];

	const primary = [
		...html.matchAll(
			/<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
		)
	];
	for (const match of primary) {
		const url = normalizeDuckDuckGoUrl(match[1]);
		const title = decodeHtml(match[2]);
		if (!url || !title) continue;
		results.push({ title, url });
		if (results.length >= 8) return results;
	}

	const fallback = [
		...html.matchAll(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)
	];
	for (const match of fallback) {
		if (results.length >= 8) break;
		const url = normalizeDuckDuckGoUrl(match[1]);
		const title = decodeHtml(match[2]);
		if (!url || !title) continue;
		if (results.some((r) => r.url === url)) continue;
		if (/duckduckgo\.com\/(html|lite|about|privacy|settings)/i.test(url))
			continue;
		results.push({ title, url });
	}

	return results;
};

const fetchWebContext = async (query: string): Promise<string | null> => {
	try {
		const sources: Array<{ title: string; url: string; snippet: string }> = [];

		// 0) Google News RSS search
		const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=es&gl=ES&ceid=ES:es`;
		const rssText = await fetchTextWithTimeout(rssUrl, 9000);
		if (rssText) {
			const items = [...rssText.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(
				0,
				6
			);
			for (const itemMatch of items) {
				const item = itemMatch[1];
				const title = decodeHtml(
					item.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? ''
				);
				const rawLink = decodeHtml(
					item.match(/<link>([\s\S]*?)<\/link>/i)?.[1] ?? ''
				);
				const snippet = decodeHtml(
					item.match(/<description>([\s\S]*?)<\/description>/i)?.[1] ?? ''
				).slice(0, 450);
				const url =
					rawLink.startsWith('http://') || rawLink.startsWith('https://')
						? rawLink
						: '';
				if (!title || !url) continue;
				sources.push({ title, url, snippet });
				if (sources.length >= 5) break;
			}
		}

		// 1) DuckDuckGo Instant Answer API
		type DdgTopic = { Text?: string; FirstURL?: string; Topics?: DdgTopic[] };
		type DdgInstant = {
			AbstractText?: string;
			AbstractURL?: string;
			Heading?: string;
			RelatedTopics?: DdgTopic[];
		};
		const instantUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
		const instant = await fetchJsonWithTimeout<DdgInstant>(instantUrl, 9000);
		if (instant) {
			if (instant.AbstractText?.trim() && instant.AbstractURL?.trim()) {
				sources.push({
					title: instant.Heading?.trim() || 'DuckDuckGo Instant Answer',
					url: instant.AbstractURL.trim(),
					snippet: instant.AbstractText.trim().slice(0, 450)
				});
			}

			const flattenTopics = (topics: DdgTopic[] = []): DdgTopic[] => {
				const flat: DdgTopic[] = [];
				for (const topic of topics) {
					if (topic.Topics?.length) flat.push(...flattenTopics(topic.Topics));
					else flat.push(topic);
				}
				return flat;
			};

			const related = flattenTopics(instant.RelatedTopics ?? [])
				.filter((topic) => topic.Text && topic.FirstURL)
				.slice(0, 4);

			for (const topic of related) {
				sources.push({
					title: 'DuckDuckGo Related',
					url: topic.FirstURL as string,
					snippet: (topic.Text as string).slice(0, 450)
				});
			}
		}

		// 2) DuckDuckGo HTML/Lite scraping
		const candidateUrls = [
			`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
			`https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`
		];

		let extracted: Array<{ title: string; url: string }> = [];
		for (const searchUrl of candidateUrls) {
			try {
				const searchRes = await fetchWithTimeout(searchUrl, 10000);
				if (!searchRes.ok) continue;
				const html = await searchRes.text();
				extracted = extractSearchResults(html);
				if (extracted.length) break;
			} catch {
				// try next provider
			}
		}
		for (const entry of extracted.slice(0, 5)) {
			const { title, url } = entry;
			if (sources.some((s) => s.url === url)) continue;

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

		// 3) Wikipedia API como fallback
		if (!sources.length) {
			type WikiSearchItem = { title: string; snippet: string; pageid: number };
			type WikiSearchResponse = {
				query?: { search?: WikiSearchItem[] };
			};
			const wikiUrl = `https://es.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&utf8=1&origin=*`;
			const wiki = await fetchJsonWithTimeout<WikiSearchResponse>(
				wikiUrl,
				9000
			);
			const wikiResults = wiki?.query?.search?.slice(0, 5) ?? [];
			for (const item of wikiResults) {
				sources.push({
					title: `Wikipedia: ${item.title}`,
					url: `https://es.wikipedia.org/?curid=${item.pageid}`,
					snippet: decodeHtml(item.snippet).slice(0, 450)
				});
			}
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

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	const ip = getClientAddress();
	const { allowed, remaining, resetIn } = checkRateLimit(ip);
	if (!allowed) {
		return new Response(
			`Demasiadas solicitudes. Intenta de nuevo en ${Math.ceil(resetIn / 1000)} segundos.`,
			{
				status: 429,
				headers: {
					'Retry-After': String(Math.ceil(resetIn / 1000)),
					...API_SECURITY_HEADERS
				}
			}
		);
	}

	try {
		const { messages, conversationId, model, useWeb, imageDataUrl } =
			await request.json();

		const requestedModel =
			(model as string | undefined) ||
			publicEnv.PUBLIC_MODEL ||
			getDefaultModel();
		let selectedModel = isAllowedModel(requestedModel)
			? requestedModel
			: getDefaultModel();
		if (imageDataUrl && !isVisionModel(selectedModel)) {
			selectedModel = getDefaultModel();
		}
		const chatMessages = (messages as ChatInputMessage[]) ?? [];
		const lastUserMessage = [...chatMessages]
			.reverse()
			.find((message) => message.role === 'user');
		const lastPrompt = lastUserMessage?.content ?? '';
		const forcedByPrompt = FORCE_WEB_QUERY_REGEX.test(lastPrompt);
		const shouldUseWeb = Boolean(useWeb) || forcedByPrompt;
		const webContext =
			shouldUseWeb && lastPrompt
				? await fetchWebContext(lastPrompt.slice(0, 600))
				: null;
		const webStatusNote = shouldUseWeb
			? webContext
				? 'Búsqueda web activa: tienes contexto online real en los mensajes de sistema. Debes usarlo y citar fuentes [1], [2], etc.'
				: 'Búsqueda web activa, pero las fuentes públicas no respondieron en este intento. Continúa respondiendo con tu conocimiento general y sugiere reintentar la búsqueda si se requieren datos en tiempo real.'
			: null;

		const messagePayload: AIMessage[] = chatMessages.map((message) => ({
			role: message.role,
			content: message.content
		}));
		if (imageDataUrl && messagePayload.length > 0) {
			const lastUserIndex = [...messagePayload]
				.map((message, index) => ({ message, index }))
				.reverse()
				.find((entry) => entry.message.role === 'user')?.index;
			if (typeof lastUserIndex === 'number') {
				const lastUser = messagePayload[lastUserIndex];
				messagePayload[lastUserIndex] = {
					role: 'user',
					content: [
						{
							type: 'text',
							text: String(lastUser.content || 'Analiza la imagen.')
						},
						{ type: 'image_url', image_url: { url: imageDataUrl } }
					]
				};
			}
		}

		const stream = streamAI({
			model: selectedModel,
			messages: [
				{
					role: 'system',
					content:
						'Eres un asistente útil. Responde en el mismo idioma en que te escriban. Si la búsqueda web está activa, usa siempre el contexto web recibido y cita las fuentes como [1], [2], etc cuando afirmes datos de actualidad. Nunca digas que no puedes buscar en internet si has recibido contexto web.'
				},
				...(webStatusNote
					? [{ role: 'system' as const, content: webStatusNote }]
					: []),
				...(webContext
					? [{ role: 'system' as const, content: webContext }]
					: []),
				...messagePayload
			]
		});

		const encoder = new TextEncoder();
		const readable = new ReadableStream({
			async start(controller) {
				try {
					for await (const chunk of stream) {
						if (chunk) controller.enqueue(encoder.encode(chunk));
					}
				} catch (err) {
					const message =
						err instanceof Error ? err.message : 'Error en streaming';
					controller.enqueue(encoder.encode(`\n\nError: ${message}`));
				} finally {
					controller.close();
				}
			}
		});

		return new Response(readable, {
			headers: {
				'content-type': 'text/plain; charset=utf-8',
				'x-conversation-id': conversationId ?? '',
				...API_SECURITY_HEADERS
			}
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Error interno';
		return new Response(
			`No se pudo completar la búsqueda online o generar la respuesta: ${message}`,
			{
				status: 500,
				headers: API_SECURITY_HEADERS
			}
		);
	}
};
