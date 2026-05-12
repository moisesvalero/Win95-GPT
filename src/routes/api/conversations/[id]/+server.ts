import type { RequestHandler } from './$types';

const API_SECURITY_HEADERS = {
	'X-Content-Type-Options': 'nosniff',
	'X-Frame-Options': 'SAMEORIGIN',
	'X-XSS-Protection': '1; mode=block',
	'Referrer-Policy': 'strict-origin-when-cross-origin',
	'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload'
};

export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	const session = await locals.getSession();
	if (!session) return new Response('Unauthorized', { status: 401, headers: API_SECURITY_HEADERS });

	const { title } = (await request.json()) as { title?: string };
	const safeTitle = (title ?? '').trim();
	if (!safeTitle) return new Response('Title is required', { status: 400, headers: API_SECURITY_HEADERS });

	const { error } = await locals.supabase
		.from('conversations')
		.update({ title: safeTitle, updated_at: new Date().toISOString() })
		.eq('id', params.id)
		.eq('user_id', session.user.id);

	if (error) return new Response(error.message, { status: 400, headers: API_SECURITY_HEADERS });
	return new Response('ok', { headers: API_SECURITY_HEADERS });
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	const session = await locals.getSession();
	if (!session) return new Response('Unauthorized', { status: 401, headers: API_SECURITY_HEADERS });

	const { error } = await locals.supabase
		.from('conversations')
		.delete()
		.eq('id', params.id)
		.eq('user_id', session.user.id);

	if (error) return new Response(error.message, { status: 400, headers: API_SECURITY_HEADERS });
	return new Response('ok', { headers: API_SECURITY_HEADERS });
};
