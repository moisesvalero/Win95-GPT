import { env } from '$env/dynamic/private';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

const isAllowedLoginEmail = (email: string) => {
	const allowed = new Set<string>();
	if (env.ALLOWED_EMAIL) allowed.add(env.ALLOWED_EMAIL.trim().toLowerCase());
	for (const demoEmail of (env.DEMO_EMAILS ?? '').split(',')) {
		const clean = demoEmail.trim().toLowerCase();
		if (clean) allowed.add(clean);
	}
	return allowed.has(email.toLowerCase());
};

export const load: PageServerLoad = async ({ url }) => ({
	unauthorized: url.searchParams.get('error') === 'unauthorized'
});

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const data = await request.formData();
		const email = String(data.get('email') ?? '').trim().toLowerCase();
		const password = String(data.get('password') ?? '');

		if (!isAllowedLoginEmail(email)) {
			return fail(403, { error: 'Acceso denegado', email });
		}

		const { error } = await locals.supabase.auth.signInWithPassword({ email, password });

		if (error) {
			return fail(400, { error: error.message, email });
		}

		throw redirect(303, '/chat/new');
	},
	guest: async ({ locals }) => {
		if ((env.ALLOW_GUEST_LOGIN ?? 'false').toLowerCase() !== 'true') {
			return fail(403, { error: 'Modo invitado desactivado' });
		}

		const { error } = await locals.supabase.auth.signInAnonymously();
		if (error) {
			return fail(400, { error: error.message });
		}

		throw redirect(303, '/chat/new');
	}
};
