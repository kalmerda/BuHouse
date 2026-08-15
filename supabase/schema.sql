-- BuHouse — Supabase schema
-- Supabase Dashboard → SQL Editor'da çalıştır.

-- ---------------------------------------------------------------------------
-- Profiles (auth.users ile eşleşir)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '',
  university_id text not null default 'bogazici',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Profiles are viewable by everyone"
  on public.profiles for select
  using (true);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Yeni kayıt → profil oluştur + domain kontrolü
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  email_domain text;
begin
  email_domain := split_part(new.email, '@', 2);

  if email_domain not in ('std.bogazici.edu.tr', 'bogazici.edu.tr') then
    raise exception 'Sadece Boğaziçi e-posta adresleri kabul edilir.';
  end if;

  insert into public.profiles (id, name, university_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', ''),
    coalesce(new.raw_user_meta_data ->> 'university_id', 'bogazici')
  );

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Listings
-- ---------------------------------------------------------------------------
create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null default '',
  class_year text,
  type text not null check (type in ('seeking', 'offering', 'items')),
  item_category text,
  city text not null default 'İstanbul',
  university text not null default 'Boğaziçi Üniversitesi',
  district text not null,
  budget numeric not null default 0,
  title text not null,
  description text not null,
  whatsapp text not null,
  photos text[] not null default '{}',
  move_in date,
  preferences text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists listings_created_at_idx on public.listings (created_at desc);
create index if not exists listings_university_idx on public.listings (university);
create index if not exists listings_type_idx on public.listings (type);
create index if not exists listings_district_idx on public.listings (district);

alter table public.listings enable row level security;

create policy "Listings are viewable by everyone"
  on public.listings for select
  using (true);

create policy "Verified users can create listings"
  on public.listings for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update own listings"
  on public.listings for update
  using (auth.uid() = user_id);

create policy "Users can delete own listings"
  on public.listings for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Storage: listing-photos bucket
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'listing-photos',
  'listing-photos',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Public read listing photos"
  on storage.objects for select
  using (bucket_id = 'listing-photos');

create policy "Auth users upload to own folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'listing-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users delete own listing photos"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'listing-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
