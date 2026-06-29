<script lang="ts">
	let { data, form } = $props();
	let mode = $state<'login' | 'signup'>('login');
	let email = $state('');
	let password = $state('');
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
			<div class="tab-bar">
				<button
					class="tab"
					class:active={mode === 'login'}
					onclick={() => (mode = 'login')}
				>
					Iniciar sesión
				</button>
				<button
					class="tab"
					class:active={mode === 'signup'}
					onclick={() => (mode = 'signup')}
				>
					Registrarse
				</button>
			</div>

			{#if mode === 'login'}
				<form method="POST" class="login-form">
					<fieldset>
						<legend>Iniciar sesión</legend>

						{#if data.unauthorized}
							<p class="error">Acceso denegado</p>
						{/if}
						{#if form?.error && !form.signupSuccess}
							<p class="error">{form.error}</p>
						{/if}

						<label for="email">Email</label>
						<input id="email" name="email" type="email" bind:value={email} required />

						<label for="password">Contraseña</label>
						<input id="password" name="password" type="password" bind:value={password} required />

						<div class="field-row">
							<button type="submit" formaction="?/login">Entrar</button>
						</div>
						<div class="field-row forgot-row">
							<a href="/login/reset-password" class="forgot-link">¿Olvidaste tu contraseña?</a>
						</div>
						<div class="field-row guest-row">
							<button type="submit" formaction="?/guest" formnovalidate>
								Entrar como Invitado
							</button>
						</div>
					</fieldset>
				</form>
			{:else}
				<form method="POST" class="login-form">
					<fieldset>
						<legend>Crear cuenta</legend>

						{#if form?.signupSuccess}
							<p class="success">
								Cuenta creada. Revisa tu email para confirmar el registro y luego inicia sesión.
							</p>
						{:else}
							{#if form?.error}
								<p class="error">{form.error}</p>
							{/if}

							<label for="signup-email">Email</label>
							<input id="signup-email" name="email" type="email" required />

							<label for="signup-password">Contraseña (mín. 6 caracteres)</label>
							<input id="signup-password" name="password" type="password" required minlength="6" />

							<div class="field-row">
								<button type="submit" formaction="?/signup">Crear cuenta</button>
							</div>
						{/if}
					</fieldset>
				</form>
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
	.login-form fieldset {
		display: grid;
		gap: 0.5rem;
	}
	.error {
		margin: 0 0 0.25rem;
		color: #8b0000;
	}
	.success {
		margin: 0 0 0.25rem;
		color: #006400;
	}
	.tab-bar {
		display: flex;
		margin-bottom: 8px;
	}
	.tab {
		flex: 1;
		padding: 4px 8px;
		border: 2px outset #c0c0c0;
		background: silver;
		cursor: pointer;
		font-size: 13px;
	}
	.tab.active {
		border: 2px inset #c0c0c0;
		background: #dfdfdf;
		font-weight: 700;
	}
	.forgot-row {
		margin-top: 6px;
		justify-content: center;
	}
	.forgot-link {
		color: #00e;
		font-size: 12px;
	}
	.guest-row {
		justify-content: center;
	}
</style>
