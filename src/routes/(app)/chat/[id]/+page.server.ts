import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const session = await locals.getSession();
	if (!session) throw error(401, 'Unauthorized');

	const { data: conversation } = await locals.supabase
		.from('conversations')
		.select('*')
		.eq('id', params.id)
		.eq('user_id', session.user.id)
		.single();

	if (!conversation) throw error(404, 'Conversación no encontrada');

	const { data: messages } = await locals.supabase
		.from('messages')
		.select('*')
		.eq('conversation_id', params.id)
		.order('created_at', { ascending: true });

	return { conversation, messages: messages ?? [] };
};
