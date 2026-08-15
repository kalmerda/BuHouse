-- Yaş → sınıf alanı
-- Supabase SQL Editor'da ayrı sorgu olarak çalıştır.

alter table public.listings
  add column if not exists class_year text;

alter table public.listings
  drop column if exists age;
