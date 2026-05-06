import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	const session = await locals.getSession();
	if (!session) return new Response('Unauthorized', { status: 401 });

	const { title } = (await request.json()) as { title?: string };
	const safeTitle = (title ?? '').trim();
	if (!safeTitle) return new Response('Title is required', { status: 400 });

	const { error } = await locals.supabase
		.from('conversations')
		.update({ title: safeTitle, updated_at: new Date().toISOString() })
		.eq('id', params.id)
		.eq('user_id', session.user.id);

	if (error) return new Response(error.message, { status: 400 });
	return new Response('ok');
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	const session = await locals.getSession();
	if (!session) return new Response('Unauthorized', { status: 401 });

	const { error } = await locals.supabase
		.from('conversations')
		.delete()
		.eq('id', params.id)
		.eq('user_id', session.user.id);

	if (error) return new Response(error.message, { status: 400 });
	return new Response('ok');
};
