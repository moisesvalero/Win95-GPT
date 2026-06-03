import { createServerClient } from '@supabase/auth-helpers-sveltekit';
import { env as publicEnv } from '$env/dynamic/public';
import { env as privateEnv } from '$env/dynamic/private';
import { redirect, type Handle } from '@sveltejs/kit';

const SECURITY_HEADERS = {
	'X-Content-Type-Options': 'nosniff',
	'X-Frame-Options': 'SAMEORIGIN',
	'X-XSS-Protection': '1; mode=block',
	'Referrer-Policy': 'strict-origin-when-cross-origin',
	'Permissions-Policy':
		'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()',
	'Cross-Origin-Embedder-Policy': 'require-corp',
	'Cross-Origin-Opener-Policy': 'same-origin',
	'Cross-Origin-Resource-Policy': 'same-origin',
	'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload'
};

const getAllowedEmails = () => {
	const emails = new Set<string>();
	if (privateEnv.ALLOWED_EMAIL)
		emails.add(privateEnv.ALLOWED_EMAIL.trim().toLowerCase());
	if (privateEnv.GUEST_EMAIL)
		emails.add(privateEnv.GUEST_EMAIL.trim().toLowerCase());
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
	const supabaseUrl = (publicEnv.PUBLIC_SUPABASE_URL ?? '').trim();
	const supabaseAnon = (publicEnv.PUBLIC_SUPABASE_ANON_KEY ?? '').trim();

	if (!supabaseUrl || !supabaseAnon) {
		console.error(
			'[AUTH_INIT_ERROR] Missing PUBLIC_SUPABASE_URL or PUBLIC_SUPABASE_ANON_KEY',
			{
				hasUrl: Boolean(supabaseUrl),
				hasAnon: Boolean(supabaseAnon),
				path: event.url.pathname
			}
		);
		return new Response(
			'Faltan variables de entorno de Supabase: PUBLIC_SUPABASE_URL y/o PUBLIC_SUPABASE_ANON_KEY',
			{ status: 500 }
		);
	}

	event.locals.supabase = createServerClient(supabaseUrl, supabaseAnon, {
		cookies: {
			getAll: () => event.cookies.getAll(),
			setAll: (cookiesToSet) => {
				cookiesToSet.forEach(({ name, value, options }) => {
					event.cookies.set(name, value, { ...options, path: '/' });
				});
			}
		}
	});

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

	const response = await resolve(event, {
		transformPageChunk: ({ html }) => html,
		filterSerializedResponseHeaders: (name) => {
			return ['content-type', 'content-length', 'x-request-url'].includes(
				name.toLowerCase()
			);
		}
	});
	for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
		response.headers.set(key, value);
	}
	return response;
};
