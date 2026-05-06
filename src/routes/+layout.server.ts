import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	const session = await locals.getSession();

	if (!session && !url.pathname.startsWith('/login')) {
		throw redirect(303, '/login');
	}

	return { session, origin: url.origin };
};
