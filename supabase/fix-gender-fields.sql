-- BuHouse: aranan cinsiyet serbest metin alanı
-- Supabase Dashboard → SQL Editor → YENİ sorgu → yapıştır → Run

-- 1) Aranan cinsiyet sütunu (ilan kartında herkese görünür)
alter table public.listings
  add column if not exists gender_preference text;

-- 2) Eski kadın/erkek kısıtını kaldır (varsa)
do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select c.conname
    from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    join pg_namespace n on t.relnamespace = n.oid
    where n.nspname = 'public'
      and t.relname = 'listings'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%gender%'
  loop
    execute format('alter table public.listings drop constraint if exists %I', constraint_name);
  end loop;
end $$;

-- 3) Eski gender sütunu varsa okunabilir metne çevir ve tercih alanına kopyala
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'listings'
      and column_name = 'gender'
  ) then
    update public.listings
    set gender = case
      when gender = 'female' then 'Kadın öğrenci'
      when gender = 'male' then 'Erkek öğrenci'
      else gender
    end
    where gender in ('female', 'male');

    update public.listings
    set gender_preference = gender
    where coalesce(gender_preference, '') = ''
      and coalesce(gender, '') <> '';
  end if;
end $$;
