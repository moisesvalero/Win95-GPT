import { env } from '$env/dynamic/private';
import { fail, isRedirect, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => ({
	unauthorized: url.searchParams.get('error') === 'unauthorized'
});

export const actions: Actions = {
	login: async ({ request, locals }) => {
		try {
			const data = await request.formData();
			const email = String(data.get('email') ?? '').trim().toLowerCase();
			const password = String(data.get('password') ?? '');

			if (!email || !password) {
				return fail(400, { error: 'Email y contraseña requeridos', email });
			}

			const { error } = await locals.supabase.auth.signInWithPassword({
				email,
				password
			});

			if (error) return fail(400, { error: error.message, email });
			throw redirect(303, '/chat/new');
		} catch (error) {
			if (isRedirect(error)) throw error;
			return fail(500, { error: 'Error inesperado en login' });
		}
	},
	guest: async ({ locals }) => {
		try {
			if ((env.ALLOW_GUEST_LOGIN ?? 'false').toLowerCase() !== 'true') {
				return fail(403, { error: 'Modo invitado desactivado' });
			}

			const guestEmail = (env.GUEST_EMAIL ?? '').trim().toLowerCase();
			const guestPassword = env.GUEST_PASSWORD ?? '';
			if (!guestEmail || !guestPassword) {
				return fail(500, {
					error: 'Falta configurar GUEST_EMAIL/GUEST_PASSWORD'
				});
			}

			const { error } = await locals.supabase.auth.signInWithPassword({
				email: guestEmail,
				password: guestPassword
			});
			if (error) return fail(400, { error: `Invitado no disponible: ${error.message}` });

			throw redirect(303, '/chat/new');
		} catch (error) {
			if (isRedirect(error)) throw error;
			return fail(500, { error: 'Error inesperado en login invitado' });
		}
	},
	signup: async ({ request, locals }) => {
		try {
			const data = await request.formData();
			const email = String(data.get('email') ?? '').trim().toLowerCase();
			const password = String(data.get('password') ?? '');

			if (!email || !password) {
				return fail(400, { error: 'Email y contraseña requeridos' });
			}
			if (password.length < 6) {
				return fail(400, { error: 'La contraseña debe tener al menos 6 caracteres' });
			}

			const { error } = await locals.supabase.auth.signUp({
				email,
				password
			});

			if (error) return fail(400, { error: error.message });
			return { signupSuccess: true, error: null };
		} catch (error) {
			if (isRedirect(error)) throw error;
			return fail(500, { error: 'Error al registrarse' });
		}
	}
};
