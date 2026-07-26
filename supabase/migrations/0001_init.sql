-- novelfriend 初始表结构
-- 每张业务表都带 user_id，并启用 Row Level Security。

create extension if not exists vector;

-- ---------------------------------------------------------------- profiles

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);

-- 注册后自动建立 profile
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------- provider_settings

create table if not exists public.provider_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  base_url text not null,
  encrypted_api_key text not null,
  chat_model text not null,
  embedding_model text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

-- ------------------------------------------------------------------- books

create table if not exists public.books (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  author text,
  file_path text,
  status text not null default 'uploaded'
    check (status in ('uploaded', 'processing', 'ready', 'failed')),
  error_message text,
  chapter_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists books_user_id_idx on public.books (user_id, created_at desc);

-- ---------------------------------------------------------------- chapters

create table if not exists public.chapters (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  chapter_index integer not null,
  title text not null,
  content text not null,
  created_at timestamptz not null default now(),
  unique (book_id, chapter_index)
);

create index if not exists chapters_book_idx on public.chapters (book_id, chapter_index);

-- ------------------------------------------------------------------ chunks

create table if not exists public.chunks (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books (id) on delete cascade,
  chapter_id uuid not null references public.chapters (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  chapter_index integer not null,
  chunk_index integer not null,
  content text not null,
  embedding vector(1536),
  created_at timestamptz not null default now()
);

-- 无剧透检索先按 (book, chapter_index) 过滤，所以这个索引是关键
create index if not exists chunks_scope_idx
  on public.chunks (user_id, book_id, chapter_index);

create index if not exists chunks_embedding_idx
  on public.chunks using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- -------------------------------------------------------- reading_progress

create table if not exists public.reading_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  book_id uuid not null references public.books (id) on delete cascade,
  chapter_index integer not null default 1,
  updated_at timestamptz not null default now(),
  unique (user_id, book_id)
);

-- ----------------------------------------------------------- conversations

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  book_id uuid not null references public.books (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  reader_chapter_snapshot integer,
  citations_json jsonb,
  created_at timestamptz not null default now()
);

create index if not exists messages_conversation_idx
  on public.messages (conversation_id, created_at);

-- --------------------------------------------------------------------- RLS

alter table public.profiles          enable row level security;
alter table public.provider_settings enable row level security;
alter table public.books             enable row level security;
alter table public.chapters          enable row level security;
alter table public.chunks            enable row level security;
alter table public.reading_progress  enable row level security;
alter table public.conversations     enable row level security;
alter table public.messages          enable row level security;

drop policy if exists profiles_self on public.profiles;
create policy profiles_self on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists provider_settings_self on public.provider_settings;
create policy provider_settings_self on public.provider_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists books_self on public.books;
create policy books_self on public.books
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists chapters_self on public.chapters;
create policy chapters_self on public.chapters
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists chunks_self on public.chunks;
create policy chunks_self on public.chunks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists reading_progress_self on public.reading_progress;
create policy reading_progress_self on public.reading_progress
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists conversations_self on public.conversations;
create policy conversations_self on public.conversations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists messages_self on public.messages;
create policy messages_self on public.messages
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ----------------------------------------------------------------- storage

insert into storage.buckets (id, name, public)
values ('novels', 'novels', false)
on conflict (id) do nothing;

-- 路径约定 {user_id}/{book_id}/原文件名
drop policy if exists novels_self on storage.objects;
create policy novels_self on storage.objects
  for all
  using (bucket_id = 'novels' and auth.uid()::text = (storage.foldername(name))[1])
  with check (bucket_id = 'novels' and auth.uid()::text = (storage.foldername(name))[1]);
