# Win95 GPT (SvelteKit 5 + Supabase)

Chat privado estilo Windows 95/98 con SvelteKit 5 (Runes), Supabase Auth + DB y streaming con OpenAI.

## Requisitos

- Node.js 18+
- Proyecto Supabase
- Clave OpenAI

## Variables de entorno

Copia `.env.example` a `.env` y configura:

- `PUBLIC_SUPABASE_URL`
- `PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `ALLOWED_EMAIL` (email único permitido)

## SQL en Supabase

Ejecuta este esquema en el SQL Editor:

```sql
create table conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  title text not null default 'Nueva conversación',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete cascade not null,
  role text check (role in ('user', 'assistant', 'system')) not null,
  content text not null,
  created_at timestamptz default now()
);

alter table conversations enable row level security;
alter table messages enable row level security;

create policy "own conversations" on conversations
  for all using (auth.uid() = user_id);

create policy "own messages" on messages
  for all using (
    conversation_id in (
      select id from conversations where user_id = auth.uid()
    )
  );

create index on messages(conversation_id, created_at);
```

## Desarrollo

```bash
npm install
npm run dev
```

## Flujo principal

- Auth privada en `hooks.server.ts` (solo `ALLOWED_EMAIL`).
- Sidebar + taskbar Win95 en `src/routes/(app)/+layout.svelte`.
- Chat persistente y streaming en `src/routes/(app)/chat/[id]/+page.svelte` + `src/routes/api/chat/+server.ts`.
