<script lang="ts">
	let { data, form } = $props();
	const emailValue = $derived(typeof form === 'object' && form && 'email' in form ? String(form.email ?? '') : '');
</script>

<main class="login-wrap">
	<div class="window login-window">
		<div class="title-bar">
			<div class="title-bar-text">Win95 GPT - Acceso</div>
			<div class="title-bar-controls">
				<button aria-label="Close"></button>
			</div>
		</div>
		<div class="window-body">
			<form method="POST" class="login-form">
				<fieldset>
					<legend>Iniciar sesión</legend>

					{#if data.unauthorized}
						<p class="error">Acceso denegado</p>
					{/if}
					{#if form?.error}
						<p class="error">{form.error}</p>
					{/if}

					<label for="email">Email (admin)</label>
					<input id="email" name="email" type="email" value={emailValue} required />

					<label for="password">Contraseña</label>
					<input id="password" name="password" type="password" required />

					<div class="field-row">
						<button type="submit">Entrar como Admin</button>
						<button type="submit" formaction="?/guest">Entrar como Invitado</button>
					</div>
				</fieldset>
			</form>
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
	.login-form fieldset {
		display: grid;
		gap: 0.5rem;
	}
	.error {
		margin: 0 0 0.25rem;
		color: #8b0000;
	}
</style>
