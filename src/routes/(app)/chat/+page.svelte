<div class="window welcome">
	<div class="window-body">
		<p>Inicia una nueva conversación desde el botón "Nuevo chat".</p>
		<p>También puedes abrir una conversación existente desde el panel izquierdo.</p>
		<div class="field-row">
			<button type="button" class="new-chat-btn" onclick={() => window.location.assign('/chat/new')}>
				📄 Nuevo chat
			</button>
		</div>
	</div>
</div>

<style>
	.welcome {
		height: calc(100dvh - 140px);
		overflow: auto;
	}
	.new-chat-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		min-height: 30px;
		padding: 4px 10px;
		border: 2px outset #c0c0c0;
		background: silver;
		color: #000;
		text-decoration: none;
		font-weight: 700;
	}
	.new-chat-btn:active {
		border: 2px inset #c0c0c0;
	}
	@media (max-width: 900px) {
		.new-chat-btn {
			width: 100%;
		}
	}
</style>
