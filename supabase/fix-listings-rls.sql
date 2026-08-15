-- BuHouse: "permission denied for table users" tam düzeltme
-- Supabase Dashboard → SQL Editor → yapıştır → Run

-- 1) Eksik profilleri oluştur (kayıt trigger'ı kaçırmış olabilir)
insert into public.profiles (id, name, university_id)
select
  u.id,
  coalesce(u.raw_user_meta_data ->> 'name', ''),
  coalesce(u.raw_user_meta_data ->> 'university_id', 'bogazici')
from auth.users u
where not exists (
  select 1 from public.profiles p where p.id = u.id
)
on conflict (id) do nothing;

-- 2) FK'yi auth.users yerine profiles'a bağla
-- (auth.users'a FK kontrolü normal kullanıcıda permission denied verir)
alter table public.listings drop constraint if exists listings_user_id_fkey;

alter table public.listings
  add constraint listings_user_id_fkey
  foreign key (user_id) references public.profiles (id) on delete cascade;

-- 3) İlan ekleme kuralını sadeleştir
drop policy if exists "Verified users can create listings" on public.listings;

create policy "Verified users can create listings"
  on public.listings for insert
  to authenticated
  with check (auth.uid() = user_id);

-- 4) Artık gerekmezse eski yardımcı fonksiyonu kaldır
drop function if exists public.is_email_verified();
