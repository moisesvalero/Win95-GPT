import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = async () => {
	return new Response('ok');
};
