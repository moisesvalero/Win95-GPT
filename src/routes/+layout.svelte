<script lang="ts">
	import '../app.css';
	import { browser } from '$app/environment';
	let { data, children } = $props();
	const ogImage = $derived(`${data.origin}/og/share-preview.png`);
	const ogUrl = $derived(data.origin);

	type DeferredPrompt = Event & {
		prompt: () => Promise<void>;
		userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
	};

	let showInstallPopup = $state(false);
	let isIos = $state(false);
	let installPrompt = $state<DeferredPrompt | null>(null);

	const isStandalone = () =>
		window.matchMedia('(display-mode: standalone)').matches || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

	const detectMobile = () => {
		const ua = navigator.userAgent.toLowerCase();
		isIos = /iphone|ipad|ipod/.test(ua);
		return /iphone|ipad|ipod|android|mobile/.test(ua) || window.innerWidth < 900;
	};

	const closeInstallPopup = () => {
		showInstallPopup = false;
		localStorage.setItem('win95-pwa-popup-dismissed', '1');
	};

	const triggerInstall = async () => {
		if (!installPrompt) return;
		await installPrompt.prompt();
		const choice = await installPrompt.userChoice;
		if (choice.outcome === 'accepted') showInstallPopup = false;
	};

	if (browser) {
		const mobileNow = detectMobile();
		const dismissed = localStorage.getItem('win95-pwa-popup-dismissed') === '1';
		if (mobileNow && !isStandalone() && !dismissed) showInstallPopup = true;

		window.addEventListener('resize', detectMobile);
		window.addEventListener('beforeinstallprompt', (event) => {
			event.preventDefault();
			installPrompt = event as DeferredPrompt;
			const mobile = detectMobile();
			if (mobile && !isStandalone()) showInstallPopup = true;
		});
	}
</script>

<svelte:head>
	<title>Win95 GPT</title>
	<meta name="description" content="Clon estilo Windows 95/98 con chat IA, búsqueda online y modo invitado." />
	<meta property="og:type" content="website" />
	<meta property="og:title" content="Win95 GPT" />
	<meta
		property="og:description"
		content="Clon estilo Windows 95/98 con chat IA, búsqueda online y modo invitado."
	/>
	<meta property="og:url" content={ogUrl} />
	<meta property="og:image" content={ogImage} />
	<meta property="og:image:width" content="1024" />
	<meta property="og:image:height" content="576" />
	<meta property="og:image:alt" content="Win95 GPT preview" />
	<meta property="twitter:card" content="summary_large_image" />
	<meta property="twitter:title" content="Win95 GPT" />
	<meta
		property="twitter:description"
		content="Clon estilo Windows 95/98 con chat IA, búsqueda online y modo invitado."
	/>
	<meta property="twitter:image" content={ogImage} />
</svelte:head>

{@render children()}

{#if showInstallPopup}
	<div class="install-overlay">
		<div class="window install-window">
			<div class="title-bar">
				<div class="title-bar-text">Instalar Win95 GPT</div>
				<div class="title-bar-controls">
					<button aria-label="Close" onclick={closeInstallPopup}></button>
				</div>
			</div>
			<div class="window-body">
				<p><strong>Mejor experiencia en móvil:</strong> instala esta app como PWA.</p>
				{#if installPrompt}
					<div class="field-row">
						<button onclick={triggerInstall}>Instalar ahora</button>
						<button onclick={closeInstallPopup}>Más tarde</button>
					</div>
				{:else if isIos}
					<p>En iPhone/iPad: pulsa <strong>Compartir</strong> y luego <strong>Añadir a pantalla de inicio</strong>.</p>
					<div class="field-row">
						<button onclick={closeInstallPopup}>Entendido</button>
					</div>
				{:else}
					<p>Abre el menú del navegador y pulsa <strong>Instalar app</strong> o <strong>Añadir a pantalla de inicio</strong>.</p>
					<div class="field-row">
						<button onclick={closeInstallPopup}>Entendido</button>
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.install-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.35);
		display: grid;
		place-items: center;
		z-index: 9999;
		padding: 12px;
	}
	.install-window {
		width: min(430px, 100%);
	}
</style>
