import { createServerClient } from '@supabase/auth-helpers-sveltekit';
import { env as publicEnv } from '$env/dynamic/public';
import { env as privateEnv } from '$env/dynamic/private';
import { redirect, type Handle } from '@sveltejs/kit';

const getAllowedEmails = () => {
	const emails = new Set<string>();
	if (privateEnv.ALLOWED_EMAIL) emails.add(privateEnv.ALLOWED_EMAIL.trim().toLowerCase());
	if (privateEnv.GUEST_EMAIL) emails.add(privateEnv.GUEST_EMAIL.trim().toLowerCase());
	const demoEmails = (privateEnv.DEMO_EMAILS ?? '')
		.split(',')
		.map((email) => email.trim().toLowerCase())
		.filter(Boolean);
	for (const email of demoEmails) emails.add(email);
	const aliasEntries = (privateEnv.USER_ALIAS_MAP ?? '')
		.split(',')
		.map((part) => part.trim())
		.filter(Boolean);
	for (const entry of aliasEntries) {
		const [, emailRaw] = entry.split(':');
		const email = (emailRaw ?? '').trim().toLowerCase();
		if (email) emails.add(email);
	}
	return emails;
};

export const handle: Handle = async ({ event, resolve }) => {
	if (!publicEnv.PUBLIC_SUPABASE_URL || !publicEnv.PUBLIC_SUPABASE_ANON_KEY) {
		return new Response(
			'Faltan variables de entorno de Supabase: PUBLIC_SUPABASE_URL y/o PUBLIC_SUPABASE_ANON_KEY',
			{ status: 500 }
		);
	}

	event.locals.supabase = createServerClient(
		publicEnv.PUBLIC_SUPABASE_URL,
		publicEnv.PUBLIC_SUPABASE_ANON_KEY,
		{
			cookies: {
				getAll: () => event.cookies.getAll(),
				setAll: (cookiesToSet) => {
					cookiesToSet.forEach(({ name, value, options }) => {
						event.cookies.set(name, value, { ...options, path: '/' });
					});
				}
			}
		}
	);

	event.locals.getSession = async () => {
		const {
			data: { session }
		} = await event.locals.supabase.auth.getSession();
		return session;
	};

	const session = await event.locals.getSession();
	const isLoginPage = event.url.pathname.startsWith('/login');
	const allowedEmails = getAllowedEmails();

	if (session && !allowedEmails.has((session.user.email ?? '').toLowerCase())) {
		await event.locals.supabase.auth.signOut();
		throw redirect(303, '/login?error=unauthorized');
	}

	if (!session && !isLoginPage) {
		throw redirect(303, '/login');
	}

	return resolve(event);
};
