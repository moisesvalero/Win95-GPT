import { createServerClient } from '@supabase/auth-helpers-sveltekit';
import { env as publicEnv } from '$env/dynamic/public';
import { env as privateEnv } from '$env/dynamic/private';
import { redirect, type Handle } from '@sveltejs/kit';

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

	if (session && session.user.email !== privateEnv.ALLOWED_EMAIL) {
		await event.locals.supabase.auth.signOut();
		throw redirect(303, '/login?error=unauthorized');
	}

	if (!session && !isLoginPage) {
		throw redirect(303, '/login');
	}

	return resolve(event);
};
