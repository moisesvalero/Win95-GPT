<script lang="ts">
	import { browser } from '$app/environment';
	import { createBrowserSupabaseClient } from '$lib/supabase';
	import { page } from '$app/stores';

	let { data, form } = $props();
	let email = $state('');
	let password = $state('');
	let confirmPassword = $state('');
	let showNewPassword = $state(false);
	let updating = $state(false);
	let updateError = $state<string | null>(null);
	let updateSuccess = $state(false);

	if (browser) {
		const hash = window.location.hash;
		if (hash.includes('type=recovery') && hash.includes('access_token=')) {
			showNewPassword = true;
		}
	}

	const handleUpdatePassword = async () => {
		if (password.length < 6) {
			updateError = 'La contraseña debe tener al menos 6 caracteres';
			return;
		}
		if (password !== confirmPassword) {
			updateError = 'Las contraseñas no coinciden';
			return;
		}

		updating = true;
		updateError = null;

		try {
			const supabase = createBrowserSupabaseClient();
			const { error } = await supabase.auth.updateUser({ password });

			if (error) {
				updateError = error.message;
			} else {
				updateSuccess = true;
			}
		} catch {
			updateError = 'Error al actualizar la contraseña';
		} finally {
			updating = false;
		}
	};
</script>

<main class="login-wrap">
	<div class="window login-window">
		<div class="title-bar">
			<div class="title-bar-text">Win95 GPT - Recuperar contraseña</div>
			<div class="title-bar-controls">
				<button aria-label="Close"></button>
			</div>
		</div>
		<div class="window-body">
			{#if updateSuccess}
				<p>Contraseña actualizada correctamente.</p>
				<div class="field-row">
					<a href="/login" class="btn-link">Volver al inicio de sesión</a>
				</div>
			{:else if showNewPassword}
				<form method="POST" onsubmit={(e) => { e.preventDefault(); handleUpdatePassword(); }}>
					<fieldset>
						<legend>Nueva contraseña</legend>

						{#if updateError}
							<p class="error">{updateError}</p>
						{/if}

						<label for="password">Nueva contraseña</label>
						<input id="password" type="password" bind:value={password} required minlength="6" />

						<label for="confirm">Confirmar contraseña</label>
						<input id="confirm" type="password" bind:value={confirmPassword} required minlength="6" />

						<div class="field-row">
							<button type="submit" disabled={updating}>
								{updating ? 'Actualizando...' : 'Actualizar contraseña'}
							</button>
						</div>
					</fieldset>
				</form>
			{:else if form?.emailSent}
				<p>Te hemos enviado un email de recuperación a tu correo. Revisa tu bandeja de entrada.</p>
				<div class="field-row">
					<a href="/login" class="btn-link">Volver al inicio de sesión</a>
				</div>
			{:else}
				<form method="POST">
					<fieldset>
						<legend>Recuperar contraseña</legend>

						{#if form?.error}
							<p class="error">{form.error}</p>
						{/if}

						<label for="email">Email</label>
						<input id="email" name="email" type="email" bind:value={email} required />
						<input type="hidden" name="email" value={email} />

						<div class="field-row">
							<button type="submit" formaction="?/reset">Enviar email de recuperación</button>
						</div>
					</fieldset>
				</form>
				<div class="field-row back-row">
					<a href="/login" class="btn-link">Volver al inicio de sesión</a>
				</div>
			{/if}
		</div>
	</div>
</main>

<style>
	.login-wrap {
		min-height: 100vh;
		display: grid;
		place-items: center;
		padding: 1rem;
	}
	.login-window {
		width: min(440px, 100%);
	}
	.window-body fieldset {
		display: grid;
		gap: 0.5rem;
	}
	.error {
		margin: 0 0 0.25rem;
		color: #8b0000;
	}
	.btn-link {
		display: inline-flex;
		align-items: center;
		padding: 4px 10px;
		border: 2px outset #c0c0c0;
		background: silver;
		color: #000;
		text-decoration: none;
		font-size: 13px;
		min-height: 22px;
	}
	.btn-link:active {
		border: 2px inset #c0c0c0;
	}
	.back-row {
		margin-top: 8px;
	}
</style>
