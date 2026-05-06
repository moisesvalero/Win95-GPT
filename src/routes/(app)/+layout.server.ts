import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	const session = await locals.getSession();

	const { data: conversations } = await locals.supabase
		.from('conversations')
		.select('*')
		.order('updated_at', { ascending: false });

	return { session, conversations: conversations ?? [] };
};
