/// <reference lib="webworker" />
import { build, files, version } from '$service-worker';

const CACHE = `win95-gpt-${version}`;
const ASSETS = [...build, ...files];

self.addEventListener('install', (event) => {
	event.waitUntil(
		(async () => {
			const cache = await caches.open(CACHE);
			await cache.addAll(ASSETS);
		})()
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			const keys = await caches.keys();
			await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
		})()
	);
});

self.addEventListener('fetch', (event) => {
	if (event.request.method !== 'GET') return;

	event.respondWith(
		(async () => {
			try {
				const network = await fetch(event.request);
				const cache = await caches.open(CACHE);
				cache.put(event.request, network.clone());
				return network;
			} catch {
				const cached = await caches.match(event.request);
				return cached ?? new Response('Offline', { status: 503, statusText: 'Offline' });
			}
		})()
	);
});
