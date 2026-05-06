import { env } from '$env/dynamic/private';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => ({
	unauthorized: url.searchParams.get('error') === 'unauthorized'
});

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const data = await request.formData();
		const email = String(data.get('email') ?? '').trim();
		const password = String(data.get('password') ?? '');

		if (email !== env.ALLOWED_EMAIL) {
			return fail(403, { error: 'Acceso denegado', email });
		}

		const { error } = await locals.supabase.auth.signInWithPassword({ email, password });

		if (error) {
			return fail(400, { error: error.message, email });
		}

		throw redirect(303, '/chat/new');
	}
};
