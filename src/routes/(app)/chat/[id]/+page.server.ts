import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	return { conversation: { id: params.id }, messages: [] };
};
