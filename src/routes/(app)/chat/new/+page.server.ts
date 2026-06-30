import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const id = crypto.randomUUID();
	throw redirect(303, `/chat/${id}`);
};
