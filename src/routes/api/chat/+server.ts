import type { Role } from '$lib/types';
import { openai } from '$lib/openai';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	const session = await locals.getSession();
	if (!session) return new Response('Unauthorized', { status: 401 });

	const { messages, conversationId } = await request.json();
	const stream = await openai.chat.completions.create({
		model: 'gpt-5.4-mini',
		stream: true,
		messages: [
			{
				role: 'system',
				content: 'Eres un asistente útil. Responde en el mismo idioma en que te escriban.'
			},
			...messages
		]
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
