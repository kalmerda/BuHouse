-- Orada schema for a SEPARATE Supabase project (not BuHouse).
-- SQL Editor'da önce bu dosya, sonra 02_functions.sql.

create table if not exists public.clock (
  id int primary key check (id = 1),
  minute int not null default 840,
  tick int not null default 0,
  last_catch_up timestamptz not null default now()
);

insert into public.clock (id) values (1)
on conflict (id) do nothing;

create table if not exists public.avatars (
  id uuid primary key default gen_random_uuid(),
  token uuid unique,
  name text not null,
  persona text not null default '',
  traits text not null default '',
  color text not null,
  emoji text not null,
  is_npc boolean not null default false,
  wander boolean not null default true,
  place_id text,
  deployed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists avatars_place_idx on public.avatars (place_id);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  place_id text not null,
  world_time text not null,
  tick int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  avatar_id uuid not null references public.avatars (id) on delete cascade
);

create index if not exists members_avatar_idx on public.members (avatar_id);
create index if not exists members_conv_idx on public.members (conversation_id);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  avatar_id uuid not null references public.avatars (id) on delete cascade,
  body text not null,
  sort_order int not null default 0
);

create index if not exists messages_conv_idx on public.messages (conversation_id);

create table if not exists public.memories (
  id uuid primary key default gen_random_uuid(),
  avatar_id uuid not null references public.avatars (id) on delete cascade,
  other_id uuid not null references public.avatars (id) on delete cascade,
  place_id text not null,
  summary text not null,
  created_at timestamptz not null default now()
);

create index if not exists memories_pair_idx on public.memories (avatar_id, other_id);

alter table public.clock enable row level security;
alter table public.avatars enable row level security;
alter table public.conversations enable row level security;
alter table public.members enable row level security;
alter table public.messages enable row level security;
alter table public.memories enable row level security;

insert into public.avatars (name, persona, traits, color, emoji, is_npc, wander, place_id, deployed_at)
select * from (
  values
    ('Deniz', 'Meraklı, kitap okur, soru sorar, yumuşak konuşur.', 'merakli,sakin,sosyal', '#5ec2c7', '🌊', true, true, 'kutuphane', now()),
    ('Mert', 'Esprili, kahve bağımlısı, kalabalıktan çekinmez.', 'esprili,sosyal,gececi', '#d4a574', '☕', true, true, 'kafe', now()),
    ('Ece', 'Sakin, gözlemci, kısa ve net konuşur.', 'sakin,kisa,merakli', '#e08bb0', '📷', true, true, 'park', now()),
    ('Baran', 'Yeni gelmiş, insan tanımak istiyor, biraz çekingen.', 'yeni,sosyal,merakli', '#7eb37a', '🎒', true, true, 'carsi', now()),
    ('Leyla', 'Gece kuşu, müzik konuşur, samimi ve uzun anlatır.', 'gececi,sosyal,esprili', '#9b8cff', '🌙', true, true, 'cati', now()),
    ('Can', 'Sabahçı, spor, pratik cümleler.', 'kisa,sosyal,sakin', '#f0a05a', '🏃', true, true, 'iskele', now()),
    ('Ayşe', 'Yüksek lisans, biraz yorgun, zekice ve dürüst.', 'sakin,kisa,merakli', '#c97b63', '📚', true, true, 'kutuphane', now()),
    ('Rüzgar', 'Her köşeyi sorar, turist gibi, heyecanlı.', 'yeni,merakli,sosyal', '#6aa6e8', '🗺️', true, true, 'iskele', now())
) as seed(name, persona, traits, color, emoji, is_npc, wander, place_id, deployed_at)
where not exists (select 1 from public.avatars where is_npc);
