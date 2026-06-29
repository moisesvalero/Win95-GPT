import { fail, isRedirect, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {};

export const actions: Actions = {
	reset: async ({ request, locals, url }) => {
		try {
			const data = await request.formData();
			const email = String(data.get('email') ?? '').trim().toLowerCase();

			if (!email) {
				return fail(400, { error: 'Email requerido', emailSent: false });
			}

			const { error } = await locals.supabase.auth.resetPasswordForEmail(
				email,
				{
					redirectTo: `${url.origin}/login/reset-password`
				}
			);

			if (error) {
				return fail(400, { error: error.message, emailSent: false });
			}

			return { emailSent: true, error: null };
		} catch (error) {
			if (isRedirect(error)) throw error;
			return fail(500, {
				error: 'Error al enviar el email de recuperación',
				emailSent: false
			});
		}
	}
};
