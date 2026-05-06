import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const session = await locals.getSession();
	if (!session) throw redirect(303, '/login');

	const { data, error } = await locals.supabase
		.from('conversations')
		.insert({ user_id: session.user.id })
		.select('id')
		.single();

	if (error || !data) throw redirect(303, '/chat');
	throw redirect(303, `/chat/${data.id}`);
};
