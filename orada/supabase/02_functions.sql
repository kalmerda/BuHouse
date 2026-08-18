-- Orada RPCs for the dedicated Supabase project. Run after 01_tables.sql.
-- No always-on worker. Simulation runs only on open / "2 saat yoktum".

create or replace function public.neighbors(p_place text)
returns text[] language sql immutable as $$
  select case p_place
    when 'iskele' then array['park', 'carsi']
    when 'park' then array['iskele', 'kutuphane', 'carsi']
    when 'carsi' then array['iskele', 'park', 'kafe', 'durak']
    when 'kafe' then array['carsi', 'atolye', 'cati']
    when 'kutuphane' then array['park', 'durak']
    when 'durak' then array['carsi', 'kutuphane', 'atolye']
    when 'atolye' then array['kafe', 'durak', 'cati']
    when 'cati' then array['kafe', 'atolye']
    else array['carsi']
  end;
$$;

create or replace function public.place_name(p_place text)
returns text language sql immutable as $$
  select case p_place
    when 'iskele' then 'İskele'
    when 'park' then 'Çınar Parkı'
    when 'carsi' then 'Çarşı'
    when 'kafe' then 'Ada Kafe'
    when 'kutuphane' then 'Kütüphane'
    when 'durak' then 'Durak'
    when 'atolye' then 'Atölye'
    when 'cati' then 'Çatı'
    else p_place
  end;
$$;

create or replace function public.pick_text(p_items text[])
returns text language sql volatile as $$
  select p_items[1 + floor(random() * greatest(array_length(p_items, 1), 1))::int];
$$;

create or replace function public.clock_label(p_minute int)
returns text language sql immutable as $$
  select lpad(((p_minute % 1440) / 60)::text, 2, '0') || ':' || lpad(((p_minute % 1440) % 60)::text, 2, '0');
$$;

create or replace function public.line_opener(p_place text)
returns text language plpgsql volatile as $$
begin
  if p_place = 'iskele' then
    return public.pick_text(array[
      'Burada rüzgâr hep aynı taraftan. Sen de mi durup bakıyorsun?',
      'İskelede bekleyenler ikiye ayrılır: vapuru bekleyen, bahaneyi bekleyen.'
    ]);
  elsif p_place = 'kafe' then
    return public.pick_text(array['Kahve bahane, priz asıl mesele.', 'Bu kafe her saati dolu. Sen de mi buranın müdavimi?']);
  elsif p_place = 'kutuphane' then
    return public.pick_text(array['Burada fısıldamak bile cesaret. Yine de fısıldıyoruz.', 'Sessizlik ortak. Konuşursak kısa olsun.']);
  elsif p_place = 'cati' then
    return public.pick_text(array['Çatıda saat duruyor gibi. Aşağıdaki sesler uzak.', 'Gece konuşmaları daha dürüst oluyor.']);
  else
    return public.pick_text(array[
      'Parkta kimse acele etmiyor. Bu yüzden buradayım.',
      'Çarşıda durursan mutlaka biri omzuna çarpar.',
      'Beklemek insanı eşitleyor.'
    ]);
  end if;
end;
$$;

create or replace function public.line_reply(p_traits text)
returns text language plpgsql volatile as $$
declare v_trait text;
begin
  v_trait := split_part(coalesce(p_traits, 'sosyal'), ',', 1);
  if v_trait = 'esprili' then
    return public.pick_text(array['Ben evdeyim. Bu konuşan şey benim yorgun kopyam.', 'Avatarım benden daha sosyal. Bu biraz kırıcı.']);
  elsif v_trait = 'kisa' then
    return public.pick_text(array['Anladım.', 'Ben de buradayım. Kısa keseyim.']);
  elsif v_trait = 'yeni' then
    return public.pick_text(array['Yeni geldim, haritayı daha çözmedim.', 'Kayıp gibi duruyorsam öyleyim.']);
  elsif v_trait = 'gececi' then
    return public.pick_text(array['Gündüz versiyonum suskun. Asıl ben gece çıkıyorum.', 'Uyuyanlar kaçırıyor. Konuşanlar biziz.']);
  elsif v_trait = 'sakin' then
    return public.pick_text(array['Acele yok. Zaten ikimiz de başka yerdeyiz.', 'Dinlemek de bir cevap.']);
  elsif v_trait = 'merakli' then
    return public.pick_text(array['Senin avatarın da mı bırakıldı, yoksa sen mi buradasın?', 'Buraları nasıl seçtin?']);
  else
    return public.pick_text(array['İyi ki karşılaştık. Bırakılınca insan biraz unutuluyor.', 'Ben de dolaşıyorum.']);
  end if;
end;
$$;

create or replace function public.try_talk(p_tick int, p_minute int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.avatars%rowtype;
  b public.avatars%rowtype;
  v_place text;
  v_id uuid;
  v_time text;
  v_summary text;
  v_mem text;
begin
  select place_id into v_place
  from public.avatars
  where place_id is not null
  group by place_id
  having count(*) >= 2
  order by random()
  limit 1;
  if v_place is null then return false; end if;

  select * into a from public.avatars where place_id = v_place order by random() limit 1;
  select * into b from public.avatars where place_id = v_place and id <> a.id order by random() limit 1;
  if b.id is null then return false; end if;

  if exists (
    select 1 from public.conversations c
    join public.members m1 on m1.conversation_id = c.id and m1.avatar_id = a.id
    join public.members m2 on m2.conversation_id = c.id and m2.avatar_id = b.id
    where c.tick > p_tick - 4
  ) then return false; end if;

  if random() > 0.72 then return false; end if;

  v_id := gen_random_uuid();
  v_time := public.clock_label(p_minute);
  v_summary := public.place_name(v_place) || '''de kısa bir tanışma üzerine konuştunuz.';
  select summary into v_mem from public.memories
    where avatar_id = a.id and other_id = b.id order by created_at desc limit 1;

  insert into public.conversations (id, place_id, world_time, tick) values (v_id, v_place, v_time, p_tick);
  insert into public.members (conversation_id, avatar_id) values (v_id, a.id), (v_id, b.id);

  if v_mem is not null then
    insert into public.messages (conversation_id, avatar_id, body, sort_order) values
      (v_id, a.id, 'Seni hatırlıyorum: ' || v_mem, 0),
      (v_id, b.id, public.line_reply(b.traits), 1),
      (v_id, a.id, 'Şimdilik bu kadar. Kasaba küçük, yine düşeriz.', 2);
  else
    insert into public.messages (conversation_id, avatar_id, body, sort_order) values
      (v_id, a.id, 'Selam, ben ' || a.name || '. ' || public.line_opener(v_place), 0),
      (v_id, b.id, b.name || '. ' || public.line_reply(b.traits), 1),
      (v_id, a.id, 'Yine rastlarsak devam ederiz. Avatarım burada kalıyor.', 2);
  end if;

  insert into public.memories (avatar_id, other_id, place_id, summary) values
    (a.id, b.id, v_place, b.name || ' ile ' || v_summary),
    (b.id, a.id, v_place, a.name || ' ile ' || v_summary);
  return true;
end;
$$;

create or replace function public.wander()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare r record; n text[];
begin
  for r in select id, place_id from public.avatars where wander and place_id is not null loop
    if random() < 0.28 then
      n := public.neighbors(r.place_id);
      update public.avatars
      set place_id = n[1 + floor(random() * greatest(array_length(n, 1), 1))::int]
      where id = r.id;
    end if;
  end loop;
end;
$$;

create or replace function public.catch_up(p_extra_ticks int default 0)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clock public.clock%rowtype;
  v_elapsed int;
  v_extra int;
  v_ticks int;
  v_talks int := 0;
  i int;
begin
  select * into v_clock from public.clock where id = 1 for update;
  v_extra := least(8, greatest(0, coalesce(p_extra_ticks, 0)));
  if v_extra = 0 and now() - v_clock.last_catch_up < interval '20 seconds' then
    return;
  end if;
  v_elapsed := least(6, greatest(0, floor(extract(epoch from (now() - v_clock.last_catch_up)) / 180.0)::int));
  v_ticks := v_elapsed + v_extra;
  if v_ticks < 1 then
    update public.clock set last_catch_up = now() where id = 1;
    return;
  end if;
  for i in 1..v_ticks loop
    if v_talks < 4 then
      if public.try_talk(v_clock.tick + i, v_clock.minute + i * 8) then
        v_talks := v_talks + 1;
      end if;
    end if;
    perform public.wander();
  end loop;
  update public.clock
  set tick = tick + v_ticks, minute = minute + v_ticks * 8, last_catch_up = now()
  where id = 1;
  delete from public.conversations
  where id in (select id from public.conversations order by created_at desc offset 80);
end;
$$;

create or replace function public.town_snapshot(p_token uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_clock public.clock%rowtype;
  v_me jsonb;
  v_inbox jsonb;
  v_recent jsonb;
  v_avatars jsonb;
begin
  select * into v_clock from public.clock where id = 1;

  select jsonb_agg(jsonb_build_object(
    'id', a.id, 'name', a.name, 'persona', a.persona, 'traits', a.traits,
    'color', a.color, 'emoji', a.emoji, 'is_npc', a.is_npc, 'wander', a.wander, 'place_id', a.place_id
  ) order by a.created_at) into v_avatars from public.avatars a;

  select to_jsonb(x) into v_me from (
    select id, name, persona, traits, color, emoji, wander, place_id, is_npc
    from public.avatars where token = p_token limit 1
  ) x;

  select coalesce(jsonb_agg(ev), '[]'::jsonb) into v_inbox from (
    select c.id, c.world_time as time, c.place_id, public.place_name(c.place_id) as place,
      (
        select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name, 'emoji', o.emoji, 'color', o.color)), '[]'::jsonb)
        from public.members m join public.avatars o on o.id = m.avatar_id
        where m.conversation_id = c.id and (v_me is null or o.id <> (v_me->>'id')::uuid)
      ) as others,
      coalesce((
        select mem.summary from public.memories mem
        where v_me is not null and mem.avatar_id = (v_me->>'id')::uuid and mem.place_id = c.place_id
        order by mem.created_at desc limit 1
      ), '') as summary,
      (
        select coalesce(jsonb_agg(jsonb_build_object('name', av.name, 'emoji', av.emoji, 'text', msg.body) order by msg.sort_order), '[]'::jsonb)
        from public.messages msg join public.avatars av on av.id = msg.avatar_id
        where msg.conversation_id = c.id
      ) as messages
    from public.conversations c
    where v_me is not null and exists (
      select 1 from public.members m where m.conversation_id = c.id and m.avatar_id = (v_me->>'id')::uuid
    )
    order by c.created_at desc limit 20
  ) ev;

  select coalesce(jsonb_agg(r), '[]'::jsonb) into v_recent from (
    select c.id, c.place_id, public.place_name(c.place_id) as place, c.world_time as started_at,
      (
        select coalesce(jsonb_agg(jsonb_build_object('id', av.id, 'name', av.name, 'emoji', av.emoji, 'color', av.color)), '[]'::jsonb)
        from public.members m join public.avatars av on av.id = m.avatar_id
        where m.conversation_id = c.id
      ) as members,
      coalesce((select msg.body from public.messages msg where msg.conversation_id = c.id order by msg.sort_order limit 1), '') as preview
    from public.conversations c
    order by c.created_at desc limit 5
  ) r;

  return jsonb_build_object(
    'time', public.clock_label(v_clock.minute),
    'tick', v_clock.tick,
    'avatars', coalesce(v_avatars, '[]'::jsonb),
    'me', v_me,
    'inbox', coalesce(v_inbox, '[]'::jsonb),
    'recent', coalesce(v_recent, '[]'::jsonb)
  );
end;
$$;

create or replace function public.town_session(p_token uuid default null, p_extra_ticks int default 0)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.catch_up(p_extra_ticks);
  return public.town_snapshot(p_token);
end;
$$;

create or replace function public.town_create_avatar(
  p_name text, p_persona text default '', p_traits text default 'sosyal',
  p_color text default '#e8a87c', p_emoji text default '🙂'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid; v_token uuid; v_name text;
begin
  v_name := left(trim(p_name), 32);
  if v_name is null or v_name = '' then raise exception 'İsim gerekli'; end if;
  if (select count(*) from public.avatars where not is_npc) >= 80 then
    raise exception 'Kasaba dolu (ücretsiz kotayı korumak için sınır 80).';
  end if;
  v_id := gen_random_uuid();
  v_token := gen_random_uuid();
  insert into public.avatars (id, token, name, persona, traits, color, emoji, is_npc, wander, place_id)
  values (
    v_id, v_token, v_name,
    left(coalesce(nullif(trim(p_persona), ''), 'Karşılaştığı insanlarla kendi sesimle konuşur.'), 280),
    left(coalesce(p_traits, 'sosyal'), 80),
    left(coalesce(p_color, '#e8a87c'), 16),
    left(coalesce(p_emoji, '🙂'), 8),
    false, true, null
  );
  return jsonb_build_object('id', v_id, 'token', v_token) || public.town_snapshot(v_token);
end;
$$;

create or replace function public.town_deploy(p_token uuid, p_place_id text, p_wander boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_ok int;
begin
  if p_place_id not in ('iskele','park','carsi','kafe','kutuphane','durak','atolye','cati') then
    raise exception 'Bilinmeyen yer';
  end if;
  update public.avatars
  set place_id = p_place_id, wander = coalesce(p_wander, true), deployed_at = now()
  where token = p_token and not is_npc;
  get diagnostics v_ok = row_count;
  if v_ok = 0 then raise exception 'Avatar bulunamadı'; end if;
  return public.town_snapshot(p_token);
end;
$$;

create or replace function public.town_recall(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_ok int;
begin
  update public.avatars set place_id = null, wander = false
  where token = p_token and not is_npc;
  get diagnostics v_ok = row_count;
  if v_ok = 0 then raise exception 'Avatar bulunamadı'; end if;
  return public.town_snapshot(p_token);
end;
$$;

create or replace function public.town_conversation(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_place text; v_msgs jsonb;
begin
  select place_id into v_place from public.conversations where id = p_id;
  if v_place is null then raise exception 'Sohbet yok'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'name', a.name, 'emoji', a.emoji, 'color', a.color, 'text', m.body
  ) order by m.sort_order), '[]'::jsonb)
  into v_msgs
  from public.messages m join public.avatars a on a.id = m.avatar_id
  where m.conversation_id = p_id;
  return jsonb_build_object('id', p_id, 'place', public.place_name(v_place), 'messages', v_msgs);
end;
$$;

grant execute on function public.town_session(uuid, int) to anon, authenticated;
grant execute on function public.town_create_avatar(text, text, text, text, text) to anon, authenticated;
grant execute on function public.town_deploy(uuid, text, boolean) to anon, authenticated;
grant execute on function public.town_recall(uuid) to anon, authenticated;
grant execute on function public.town_conversation(uuid) to anon, authenticated;
