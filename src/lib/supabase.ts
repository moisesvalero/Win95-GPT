import { createBrowserClient } from '@supabase/ssr';
import { env } from '$env/dynamic/public';

const required = (value: string | undefined, name: string) => {
	if (!value) {
		throw new Error(`Missing required env var: ${name}`);
	}
	return value;
};

export const createBrowserSupabaseClient = () =>
	createBrowserClient(
		required(env.PUBLIC_SUPABASE_URL, 'PUBLIC_SUPABASE_URL'),
		required(env.PUBLIC_SUPABASE_ANON_KEY, 'PUBLIC_SUPABASE_ANON_KEY')
	);
