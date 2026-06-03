import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	build: {
		chunkSizeWarningLimit: 700
	},
	plugins: [sveltekit()]
});
