-- =====================================================================
-- TELÃO — banco de dados (cole TUDO isso no Supabase > SQL Editor > Run)
-- =====================================================================

-- ---------- Tabelas ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null check (username ~ '^[a-z0-9_]{3,24}$'),
  display_name text not null check (char_length(display_name) between 1 and 32),
  avatar_color text not null default '#5865f2',
  created_at timestamptz not null default now()
);
alter table public.profiles add column if not exists bio text not null default '' check (char_length(bio) <= 190);
-- perfil personalizado + Telão+
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists banner_url text;
alter table public.profiles add column if not exists banner_color text;
alter table public.profiles add column if not exists theme_a text;
alter table public.profiles add column if not exists theme_b text;
alter table public.profiles add column if not exists house text check (house in ('chama','raio','onda'));
alter table public.profiles add column if not exists is_admin boolean not null default false;
alter table public.profiles add column if not exists plan_until timestamptz;
alter table public.profiles add column if not exists plus_months int not null default 0;
alter table public.profiles add column if not exists badges text[] not null default '{}';

create table if not exists public.payments (
  id text primary key,
  user_id uuid references public.profiles(id) on delete set null,
  amount numeric,
  status text,
  provider text not null default 'mercadopago',
  created_at timestamptz not null default now()
);

create table if not exists public.servers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  invite_code text unique not null default substr(md5(random()::text || clock_timestamp()::text), 1, 8),
  icon_color text not null default '#5865f2',
  created_at timestamptz not null default now()
);

create table if not exists public.server_members (
  server_id uuid not null references public.servers(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','member')),
  joined_at timestamptz not null default now(),
  primary key (server_id, user_id)
);

create table if not exists public.channels (
  id uuid primary key default gen_random_uuid(),
  server_id uuid references public.servers(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  kind text not null check (kind in ('text','voice','dm')),
  position int not null default 0,
  dm_a uuid references public.profiles(id) on delete cascade,
  dm_b uuid references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  check ( (kind = 'dm' and server_id is null and dm_a is not null and dm_b is not null)
       or (kind <> 'dm' and server_id is not null) )
);
create unique index if not exists channels_dm_unique on public.channels (dm_a, dm_b) where kind = 'dm';
create index if not exists channels_server_idx on public.channels (server_id, position);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels(id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 2000),
  created_at timestamptz not null default now(),
  edited_at timestamptz
);
create index if not exists messages_channel_idx on public.messages (channel_id, created_at desc);

create table if not exists public.friendships (
  requester uuid not null references public.profiles(id) on delete cascade,
  addressee uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted')),
  created_at timestamptz not null default now(),
  primary key (requester, addressee),
  check (requester <> addressee)
);

-- ---------- Funções auxiliares (permissões) ----------
create or replace function public.is_member(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from server_members where server_id = sid and user_id = auth.uid());
$$;

create or replace function public.can_access_channel(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from channels c
    where c.id = cid and (
      (c.server_id is not null and exists (select 1 from server_members m where m.server_id = c.server_id and m.user_id = auth.uid()))
      or auth.uid() in (c.dm_a, c.dm_b)
    )
  );
$$;

create or replace function public.shares_server(other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from server_members a join server_members b on a.server_id = b.server_id
    where a.user_id = auth.uid() and b.user_id = other
  );
$$;

-- ---------- Perfil criado automaticamente no cadastro ----------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  base text; final text; n int := 0;
  colors text[] := array['#5865f2','#eb459e','#3ba55c','#faa61a','#ed4245','#f47b67','#1abc9c','#9b59b6'];
begin
  base := regexp_replace(lower(coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1))), '[^a-z0-9_]', '', 'g');
  if char_length(base) < 3 then base := base || 'user'; end if;
  base := left(base, 20);
  final := base;
  while exists (select 1 from profiles where username = final) loop
    n := n + 1; final := base || n;
  end loop;
  insert into profiles (id, username, display_name, avatar_color)
  values (new.id, final,
          left(coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''),
                        nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
                        nullif(trim(new.raw_user_meta_data->>'name'), ''), final), 32),
          colors[1 + floor(random() * array_length(colors, 1))::int]);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Ações (RPC) ----------
create or replace function public.create_server(p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare sid uuid;
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;
  insert into servers (name, owner_id, icon_color)
  values (left(trim(p_name), 40), auth.uid(),
          (array['#5865f2','#eb459e','#3ba55c','#faa61a','#ed4245','#1abc9c','#9b59b6'])[1 + floor(random()*7)::int])
  returning id into sid;
  insert into server_members (server_id, user_id, role) values (sid, auth.uid(), 'owner');
  insert into channels (server_id, name, kind, position) values
    (sid, 'geral', 'text', 0), (sid, 'Geral', 'voice', 1), (sid, 'Telão', 'voice', 2);
  return sid;
end $$;

create or replace function public.join_server(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare sid uuid;
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;
  select id into sid from servers where invite_code = lower(trim(p_code));
  if sid is null then raise exception 'Convite inválido'; end if;
  insert into server_members (server_id, user_id) values (sid, auth.uid()) on conflict do nothing;
  return sid;
end $$;

create or replace function public.send_friend_request(p_username text) returns text
language plpgsql security definer set search_path = public as $$
declare target uuid;
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;
  select id into target from profiles where username = lower(trim(p_username));
  if target is null then raise exception 'Usuário não encontrado'; end if;
  if target = auth.uid() then raise exception 'Você não pode se adicionar'; end if;
  if exists (select 1 from friendships where requester = auth.uid() and addressee = target) then
    return (select status from friendships where requester = auth.uid() and addressee = target);
  end if;
  if exists (select 1 from friendships where requester = target and addressee = auth.uid()) then
    update friendships set status = 'accepted' where requester = target and addressee = auth.uid();
    return 'accepted';
  end if;
  insert into friendships (requester, addressee) values (auth.uid(), target);
  return 'pending';
end $$;

create or replace function public.open_dm(p_user uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare a uuid; b uuid; cid uuid;
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;
  if not exists (select 1 from friendships where status = 'accepted'
                 and ((requester = auth.uid() and addressee = p_user) or (requester = p_user and addressee = auth.uid()))) then
    raise exception 'Vocês precisam ser amigos';
  end if;
  a := least(auth.uid(), p_user); b := greatest(auth.uid(), p_user);
  select id into cid from channels where kind = 'dm' and dm_a = a and dm_b = b;
  if cid is null then
    insert into channels (name, kind, dm_a, dm_b) values ('dm', 'dm', a, b) returning id into cid;
  end if;
  return cid;
end $$;

create or replace function public.regenerate_invite(p_server uuid) returns text
language plpgsql security definer set search_path = public as $$
declare code text := substr(md5(random()::text || clock_timestamp()::text), 1, 8);
begin
  update servers set invite_code = code where id = p_server and owner_id = auth.uid();
  if not found then raise exception 'Só o dono pode fazer isso'; end if;
  return code;
end $$;


-- ---------- Conta: trocar nome de usuário e excluir conta ----------
create or replace function public.set_username(p_username text) returns text
language plpgsql security definer set search_path = public as $$
declare u text := lower(trim(p_username));
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;
  if u !~ '^[a-z0-9_]{3,24}$' then raise exception 'Use de 3 a 24 caracteres: letras minúsculas, números e _'; end if;
  if exists (select 1 from profiles where username = u and id <> auth.uid()) then raise exception 'Esse nome de usuário já está em uso'; end if;
  perform set_config('telao.username_ok', '1', true);
  update profiles set username = u where id = auth.uid();
  perform set_config('telao.username_ok', '', true);
  return u;
end $$;

create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;
  delete from auth.users where id = auth.uid();
end $$;


-- ---------- Telão+ e admin ----------
create or replace function public.is_privileged() returns boolean
language sql stable as $$
  select coalesce(current_setting('telao.priv_ok', true), '') = '1'
      or coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb->>'role' = 'service_role'
      or coalesce(current_setting('request.jwt.claims', true), '') = '';   -- SQL Editor do painel
$$;

create or replace function public.is_admin_user() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from profiles where id = auth.uid()), false);
$$;

create or replace function public.has_plus(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin or (plan_until is not null and plan_until > now()) from profiles where id = uid), false);
$$;

create or replace function public.admin_set_plus(p_user uuid, p_days int) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare r timestamptz;
begin
  if not (public.is_admin_user() or public.is_privileged()) then raise exception 'Só o admin pode fazer isso'; end if;
  perform set_config('telao.priv_ok', '1', true);
  if p_days <= 0 then
    update profiles set plan_until = null where id = p_user;
  else
    update profiles set plan_until = greatest(coalesce(plan_until, now()), now()) + make_interval(days => p_days),
                        plus_months = plus_months + greatest(1, p_days / 30)
    where id = p_user;
  end if;
  perform set_config('telao.priv_ok', '', true);
  select plan_until into r from profiles where id = p_user;
  return r;
end $$;

create or replace function public.admin_set_badges(p_user uuid, p_badges text[]) returns text[]
language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_admin_user() or public.is_privileged()) then raise exception 'Só o admin pode fazer isso'; end if;
  perform set_config('telao.priv_ok', '1', true);
  update profiles set badges = (select coalesce(array_agg(distinct b), '{}') from unnest(p_badges) b
                                where b in ('staff','dev','mod','bug1','bug2','evento','apoiador'))
  where id = p_user;
  perform set_config('telao.priv_ok', '', true);
  return (select badges from profiles where id = p_user);
end $$;

-- ---------- Segurança (RLS) ----------
alter table public.profiles       enable row level security;
alter table public.servers        enable row level security;
alter table public.server_members enable row level security;
alter table public.channels       enable row level security;
alter table public.messages       enable row level security;
alter table public.friendships    enable row level security;
alter table public.payments       enable row level security;

drop policy if exists "ver meus pagamentos" on public.payments;
create policy "ver meus pagamentos" on public.payments for select to authenticated using (user_id = auth.uid() or public.is_admin_user());

drop policy if exists "perfis visiveis" on public.profiles;
create policy "perfis visiveis" on public.profiles for select to authenticated using (true);
drop policy if exists "editar meu perfil" on public.profiles;
create policy "editar meu perfil" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "ver meus servidores" on public.servers;
create policy "ver meus servidores" on public.servers for select to authenticated using (public.is_member(id));
drop policy if exists "dono edita servidor" on public.servers;
create policy "dono edita servidor" on public.servers for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "dono apaga servidor" on public.servers;
create policy "dono apaga servidor" on public.servers for delete to authenticated using (owner_id = auth.uid());

drop policy if exists "ver membros" on public.server_members;
create policy "ver membros" on public.server_members for select to authenticated using (public.is_member(server_id));
drop policy if exists "sair ou expulsar" on public.server_members;
create policy "sair ou expulsar" on public.server_members for delete to authenticated using (
  (user_id = auth.uid() and role <> 'owner')
  or exists (select 1 from public.servers s where s.id = server_id and s.owner_id = auth.uid() and user_id <> auth.uid())
);

drop policy if exists "ver canais" on public.channels;
create policy "ver canais" on public.channels for select to authenticated using (public.can_access_channel(id));
drop policy if exists "dono cria canal" on public.channels;
create policy "dono cria canal" on public.channels for insert to authenticated with check (
  kind in ('text','voice') and exists (select 1 from public.servers s where s.id = server_id and s.owner_id = auth.uid())
);
drop policy if exists "dono edita canal" on public.channels;
create policy "dono edita canal" on public.channels for update to authenticated using (
  kind in ('text','voice') and exists (select 1 from public.servers s where s.id = server_id and s.owner_id = auth.uid())
);
drop policy if exists "dono apaga canal" on public.channels;
create policy "dono apaga canal" on public.channels for delete to authenticated using (
  kind in ('text','voice') and exists (select 1 from public.servers s where s.id = server_id and s.owner_id = auth.uid())
);

drop policy if exists "ler mensagens" on public.messages;
create policy "ler mensagens" on public.messages for select to authenticated using (public.can_access_channel(channel_id));
drop policy if exists "enviar mensagens" on public.messages;
create policy "enviar mensagens" on public.messages for insert to authenticated with check (author_id = auth.uid() and public.can_access_channel(channel_id));
drop policy if exists "editar minhas mensagens" on public.messages;
create policy "editar minhas mensagens" on public.messages for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());
drop policy if exists "apagar mensagens" on public.messages;
create policy "apagar mensagens" on public.messages for delete to authenticated using (
  author_id = auth.uid()
  or exists (select 1 from public.channels c join public.servers s on s.id = c.server_id where c.id = channel_id and s.owner_id = auth.uid())
);

drop policy if exists "ver amizades" on public.friendships;
create policy "ver amizades" on public.friendships for select to authenticated using (auth.uid() in (requester, addressee));
drop policy if exists "aceitar amizade" on public.friendships;
create policy "aceitar amizade" on public.friendships for update to authenticated using (addressee = auth.uid()) with check (addressee = auth.uid() and status = 'accepted');
drop policy if exists "desfazer amizade" on public.friendships;
create policy "desfazer amizade" on public.friendships for delete to authenticated using (auth.uid() in (requester, addressee));

-- impede trocar campos sensíveis via update
create or replace function public.guard_updates() returns trigger
language plpgsql as $$
begin
  if tg_table_name = 'messages' then
    new.channel_id := old.channel_id; new.author_id := old.author_id; new.created_at := old.created_at; new.edited_at := now();
  elsif tg_table_name = 'servers' then
    new.owner_id := old.owner_id;
  elsif tg_table_name = 'friendships' then
    new.requester := old.requester; new.addressee := old.addressee;
  elsif tg_table_name = 'profiles' then
    new.id := old.id;
    if coalesce(current_setting('telao.username_ok', true), '') <> '1' then new.username := old.username; end if;
    if not public.is_privileged() then
      new.is_admin := old.is_admin; new.plan_until := old.plan_until; new.plus_months := old.plus_months; new.badges := old.badges;
      -- recursos do Telão+ só para quem tem o plano
      if not public.has_plus(old.id) then
        if new.banner_url is distinct from old.banner_url and new.banner_url is not null then new.banner_url := old.banner_url; end if;
        if new.avatar_url is distinct from old.avatar_url and new.avatar_url ~* '\.gif($|\?)' then new.avatar_url := old.avatar_url; end if;
        if new.theme_a is distinct from old.theme_a and new.theme_a is not null then new.theme_a := old.theme_a; end if;
        if new.theme_b is distinct from old.theme_b and new.theme_b is not null then new.theme_b := old.theme_b; end if;
      end if;
    end if;
  elsif tg_table_name = 'channels' then
    new.server_id := old.server_id; new.kind := old.kind; new.dm_a := old.dm_a; new.dm_b := old.dm_b;
  end if;
  return new;
end $$;
drop trigger if exists guard_messages on public.messages;
create trigger guard_messages before update on public.messages for each row execute function public.guard_updates();
drop trigger if exists guard_servers on public.servers;
create trigger guard_servers before update on public.servers for each row execute function public.guard_updates();
drop trigger if exists guard_friendships on public.friendships;
create trigger guard_friendships before update on public.friendships for each row execute function public.guard_updates();
drop trigger if exists guard_profiles on public.profiles;
create trigger guard_profiles before update on public.profiles for each row execute function public.guard_updates();
drop trigger if exists guard_channels on public.channels;
create trigger guard_channels before update on public.channels for each row execute function public.guard_updates();

-- ---------- Tempo real ----------
do $$
begin
  begin alter publication supabase_realtime add table public.messages;    exception when others then null; end;
  begin alter publication supabase_realtime add table public.channels;    exception when others then null; end;
  begin alter publication supabase_realtime add table public.friendships; exception when others then null; end;
  begin alter publication supabase_realtime add table public.server_members; exception when others then null; end;
  begin alter publication supabase_realtime add table public.servers;     exception when others then null; end;
  begin alter publication supabase_realtime add table public.profiles;    exception when others then null; end;
end $$;

-- ---------- Arquivos (avatar, banner, GIF) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 8388608, array['image/png','image/jpeg','image/gif','image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "telao media ler" on storage.objects;
create policy "telao media ler" on storage.objects for select using (bucket_id = 'media');
drop policy if exists "telao media enviar" on storage.objects;
create policy "telao media enviar" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "telao media trocar" on storage.objects;
create policy "telao media trocar" on storage.objects for update to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "telao media apagar" on storage.objects;
create policy "telao media apagar" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);

-- =====================================================================
-- VIRAR ADMIN: troque o e-mail abaixo pelo SEU e rode só esta linha
-- (ou deixe aqui: se o e-mail não existir, não acontece nada)
-- =====================================================================
update public.profiles set is_admin = true
where id = (select id from auth.users where email = 'SEU_EMAIL_AQUI@gmail.com');
