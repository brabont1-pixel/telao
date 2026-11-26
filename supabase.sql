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
  content text not null default '',
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
  -- a conta oficial do Telão cria o próprio perfil (ver v6.9)
  if coalesce(current_setting('telao.skip_profile', true), '') = '1' then return new; end if;
  base := regexp_replace(lower(coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1))), '[^a-z0-9_]', '', 'g');
  if char_length(base) < 3 then base := base || 'user'; end if;
  base := left(base, 20);
  final := base;
  while exists (select 1 from public.profiles p where p.username = final) loop
    n := n + 1; final := base || n;
  end loop;
  begin
    insert into public.profiles (id, username, display_name, avatar_color, avatar_url)
    values (new.id, final,
            left(coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''),
                          nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
                          nullif(trim(new.raw_user_meta_data->>'name'), ''), final), 32),
            colors[1 + floor(random() * array_length(colors, 1))::int],
            nullif(new.raw_user_meta_data->>'avatar_url', ''));
  exception when others then
    -- nunca deixa o cadastro (e o login com Google) falhar por causa do perfil
    insert into public.profiles (id, username, display_name, avatar_color)
    values (new.id, 'user' || substr(replace(new.id::text, '-', ''), 1, 10), 'Novo usuário', '#ff6b4a')
    on conflict (id) do nothing;
  end;
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

drop function if exists public.join_server(text);
create or replace function public.join_server(p_code text, p_accept boolean default false) returns uuid
language plpgsql security definer set search_path = public as $$
declare sid uuid;
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;
  select id into sid from servers where invite_code = lower(trim(p_code));
  if sid is null then raise exception 'Convite inválido'; end if;
  if exists (select 1 from server_bans where server_id = sid and user_id = auth.uid()) then raise exception 'Você foi banido desse servidor'; end if;
  -- v6.15: servidor com regras: quem é novo precisa aceitar antes de entrar
  if not p_accept and not exists (select 1 from server_members where server_id = sid and user_id = auth.uid())
     and exists (select 1 from servers where id = sid and coalesce((to_jsonb(servers)->>'rules_on')::boolean, false)) then
    raise exception 'RULES_REQUIRED:%', sid;
  end if;
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
  if not public.has_perm(p_server, 2) then raise exception 'Sem permissão'; end if;
  update servers set invite_code = code where id = p_server;
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
                                where b in ('staff','dev','mod','bug1','bug2','evento','apoiador','verificado'))
  where id = p_user;
  perform set_config('telao.priv_ok', '', true);
  return (select badges from profiles where id = p_user);
end $$;


-- =====================================================================
-- VERSÃO 3: anexos, respostas, reações, fixar, status, cargos, tópicos
-- =====================================================================
alter table public.messages add column if not exists attachments jsonb not null default '[]'::jsonb;
alter table public.messages add column if not exists reply_to uuid references public.messages(id) on delete set null;
alter table public.messages add column if not exists pinned boolean not null default false;
alter table public.messages drop constraint if exists messages_content_check;
alter table public.messages drop constraint if exists messages_content_ck;
alter table public.messages add constraint messages_content_ck check (
  char_length(content) <= 4000 and jsonb_typeof(attachments) = 'array' and jsonb_array_length(attachments) <= 10
  and (char_length(trim(content)) > 0 or jsonb_array_length(attachments) > 0));
create index if not exists messages_pinned_idx on public.messages (channel_id) where pinned;

create table if not exists public.message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 32),
  channel_id uuid,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);
create index if not exists reactions_channel_idx on public.message_reactions (channel_id);

alter table public.profiles add column if not exists status text not null default 'online';
alter table public.profiles drop constraint if exists profiles_status_ck;
alter table public.profiles add constraint profiles_status_ck check (status in ('online','idle','dnd','invisible'));
alter table public.profiles add column if not exists custom_status text check (char_length(custom_status) <= 80);
alter table public.profiles add column if not exists custom_emoji text check (char_length(custom_emoji) <= 16);

-- versão 4: perfil mais personalizável
alter table public.profiles add column if not exists pronouns text check (char_length(pronouns) <= 30);
alter table public.profiles add column if not exists links jsonb not null default '[]'::jsonb;
alter table public.profiles drop constraint if exists profiles_links_ck;
alter table public.profiles add constraint profiles_links_ck check (jsonb_typeof(links) = 'array' and jsonb_array_length(links) <= 5);
alter table public.profiles add column if not exists shown_badges text[];
alter table public.profiles add column if not exists profile_fx text;
alter table public.profiles add column if not exists avatar_ring text;
alter table public.profiles add column if not exists name_style text;

alter table public.servers add column if not exists icon_url text;
alter table public.servers add column if not exists description text check (char_length(description) <= 200);
alter table public.channels add column if not exists topic text check (char_length(topic) <= 300);
alter table public.channels add column if not exists category text check (char_length(category) <= 40);

-- cargos: 1 canais · 2 servidor · 4 expulsar · 8 mensagens · 16 cargos · 32 administrador
create table if not exists public.server_roles (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 32),
  color text not null default '#99aab5',
  position int not null default 0,
  perms int not null default 0,
  hoist boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.member_roles (
  server_id uuid not null,
  user_id uuid not null,
  role_id uuid not null references public.server_roles(id) on delete cascade,
  primary key (user_id, role_id),
  foreign key (server_id, user_id) references public.server_members(server_id, user_id) on delete cascade
);

create or replace function public.has_perm(sid uuid, p_perm int) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from servers where id = sid and owner_id = auth.uid())
      or exists (select 1 from member_roles mr join server_roles r on r.id = mr.role_id
                 where mr.server_id = sid and mr.user_id = auth.uid() and ((r.perms & p_perm) <> 0 or (r.perms & 32) <> 0));
$$;
create or replace function public.is_server_owner(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from servers where id = sid and owner_id = auth.uid());
$$;
create or replace function public.can_access_message(mid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.can_access_channel((select channel_id from messages where id = mid));
$$;
create or replace function public.can_manage_channel_msgs(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from channels c where c.id = cid and (
    (c.server_id is not null and public.has_perm(c.server_id, 8)) or (c.kind = 'dm' and auth.uid() in (c.dm_a, c.dm_b))));
$$;

-- reação guarda o canal (para o tempo real)
create or replace function public.reaction_fill() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.channel_id := (select channel_id from messages where id = new.message_id);
  new.user_id := auth.uid();
  return new;
end $$;
drop trigger if exists reaction_fill on public.message_reactions;
create trigger reaction_fill before insert on public.message_reactions for each row execute function public.reaction_fill();

-- cargos: só o dono dá poderes de administrador / gerenciar cargos
create or replace function public.role_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'server_roles' then
    if not public.is_server_owner(new.server_id) and (new.perms & 48) <> 0 then
      raise exception 'Só o dono pode dar Administrador ou Gerenciar cargos';
    end if;
    if tg_op = 'UPDATE' then new.server_id := old.server_id; end if;
  else
    if not public.is_server_owner(new.server_id)
       and exists (select 1 from server_roles where id = new.role_id and (perms & 48) <> 0) then
      raise exception 'Só o dono pode dar esse cargo';
    end if;
    if not exists (select 1 from server_roles where id = new.role_id and server_id = new.server_id) then
      raise exception 'Cargo de outro servidor';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists role_guard on public.server_roles;
create trigger role_guard before insert or update on public.server_roles for each row execute function public.role_guard();
drop trigger if exists role_guard on public.member_roles;
create trigger role_guard before insert on public.member_roles for each row execute function public.role_guard();

create or replace function public.pin_message(p_id uuid, p_pin boolean) returns void
language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  select channel_id into cid from messages where id = p_id;
  if cid is null or not public.can_manage_channel_msgs(cid) then raise exception 'Sem permissão para fixar'; end if;
  perform set_config('telao.pin_ok', '1', true);
  update messages set pinned = p_pin where id = p_id;
  perform set_config('telao.pin_ok', '', true);
end $$;

-- ---------- Segurança (RLS) ----------
alter table public.profiles       enable row level security;
alter table public.servers        enable row level security;
alter table public.server_members enable row level security;
alter table public.channels       enable row level security;
alter table public.messages       enable row level security;
alter table public.friendships    enable row level security;
alter table public.payments       enable row level security;
alter table public.message_reactions enable row level security;
alter table public.server_roles   enable row level security;
alter table public.member_roles   enable row level security;

drop policy if exists "ver reacoes" on public.message_reactions;
create policy "ver reacoes" on public.message_reactions for select to authenticated using (public.can_access_message(message_id));
drop policy if exists "reagir" on public.message_reactions;
create policy "reagir" on public.message_reactions for insert to authenticated with check (public.can_access_message(message_id));
drop policy if exists "tirar reacao" on public.message_reactions;
create policy "tirar reacao" on public.message_reactions for delete to authenticated using (user_id = auth.uid());

drop policy if exists "ver cargos" on public.server_roles;
create policy "ver cargos" on public.server_roles for select to authenticated using (public.is_member(server_id));
drop policy if exists "criar cargos" on public.server_roles;
create policy "criar cargos" on public.server_roles for insert to authenticated with check (public.has_perm(server_id, 16));
drop policy if exists "editar cargos" on public.server_roles;
create policy "editar cargos" on public.server_roles for update to authenticated using (public.has_perm(server_id, 16) and (public.is_server_owner(server_id) or (perms & 48) = 0));
drop policy if exists "apagar cargos" on public.server_roles;
create policy "apagar cargos" on public.server_roles for delete to authenticated using (public.has_perm(server_id, 16) and (public.is_server_owner(server_id) or (perms & 48) = 0));

drop policy if exists "ver cargos dos membros" on public.member_roles;
create policy "ver cargos dos membros" on public.member_roles for select to authenticated using (public.is_member(server_id));
drop policy if exists "dar cargo" on public.member_roles;
create policy "dar cargo" on public.member_roles for insert to authenticated with check (public.has_perm(server_id, 16));
drop policy if exists "tirar cargo" on public.member_roles;
create policy "tirar cargo" on public.member_roles for delete to authenticated using (
  public.has_perm(server_id, 16) and (public.is_server_owner(server_id) or not exists (select 1 from public.server_roles r where r.id = role_id and (r.perms & 48) <> 0)));

drop policy if exists "ver meus pagamentos" on public.payments;
create policy "ver meus pagamentos" on public.payments for select to authenticated using (user_id = auth.uid() or public.is_admin_user());

drop policy if exists "perfis visiveis" on public.profiles;
create policy "perfis visiveis" on public.profiles for select to authenticated using (true);
drop policy if exists "editar meu perfil" on public.profiles;
create policy "editar meu perfil" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "ver meus servidores" on public.servers;
create policy "ver meus servidores" on public.servers for select to authenticated using (public.is_member(id));
drop policy if exists "dono edita servidor" on public.servers;
create policy "dono edita servidor" on public.servers for update to authenticated using (public.has_perm(id, 2));
drop policy if exists "dono apaga servidor" on public.servers;
create policy "dono apaga servidor" on public.servers for delete to authenticated using (owner_id = auth.uid());

drop policy if exists "ver membros" on public.server_members;
create policy "ver membros" on public.server_members for select to authenticated using (public.is_member(server_id));
drop policy if exists "sair ou expulsar" on public.server_members;
create policy "sair ou expulsar" on public.server_members for delete to authenticated using (
  (user_id = auth.uid() and role <> 'owner')
  or (public.has_perm(server_id, 4) and role <> 'owner' and user_id <> auth.uid())
);

drop policy if exists "ver canais" on public.channels;
create policy "ver canais" on public.channels for select to authenticated using (public.can_access_channel(id));
drop policy if exists "dono cria canal" on public.channels;
create policy "dono cria canal" on public.channels for insert to authenticated with check (kind in ('text','voice') and public.has_perm(server_id, 1));
drop policy if exists "dono edita canal" on public.channels;
create policy "dono edita canal" on public.channels for update to authenticated using (kind in ('text','voice') and public.has_perm(server_id, 1));
drop policy if exists "dono apaga canal" on public.channels;
create policy "dono apaga canal" on public.channels for delete to authenticated using (kind in ('text','voice') and public.has_perm(server_id, 1));

drop policy if exists "ler mensagens" on public.messages;
create policy "ler mensagens" on public.messages for select to authenticated using (public.can_access_channel(channel_id));
drop policy if exists "enviar mensagens" on public.messages;
create policy "enviar mensagens" on public.messages for insert to authenticated with check (author_id = auth.uid() and public.can_access_channel(channel_id));
drop policy if exists "editar minhas mensagens" on public.messages;
create policy "editar minhas mensagens" on public.messages for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());
drop policy if exists "apagar mensagens" on public.messages;
create policy "apagar mensagens" on public.messages for delete to authenticated using (
  author_id = auth.uid() or exists (select 1 from public.channels c where c.id = channel_id and c.server_id is not null and public.has_perm(c.server_id, 8))
);

drop policy if exists "ver amizades" on public.friendships;
create policy "ver amizades" on public.friendships for select to authenticated using (auth.uid() in (requester, addressee));
drop policy if exists "aceitar amizade" on public.friendships;
create policy "aceitar amizade" on public.friendships for update to authenticated using (addressee = auth.uid()) with check (addressee = auth.uid() and status = 'accepted');
drop policy if exists "desfazer amizade" on public.friendships;
create policy "desfazer amizade" on public.friendships for delete to authenticated using (auth.uid() in (requester, addressee));


-- =====================================================================
-- v5: IMPULSOS (boost) de servidor, FICHAS, LOJA TELÃO e PRESENTES
-- =====================================================================
alter table public.profiles add column if not exists fichas int not null default 0;
alter table public.profiles add column if not exists streak int not null default 0;
alter table public.profiles add column if not exists last_daily date;
alter table public.profiles add column if not exists equipped jsonb not null default '{}'::jsonb;
alter table public.servers add column if not exists banner_url text;
alter table public.servers add column if not exists accent text check (accent ~ '^#[0-9a-fA-F]{6}$');

-- cada assinante do Telão+ tem 3 impulsos (slots 1..3); só troca depois de 7 dias
create table if not exists public.server_boosts (
  user_id uuid not null references public.profiles(id) on delete cascade,
  slot int not null check (slot between 1 and 3),
  server_id uuid not null references public.servers(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, slot)
);
create index if not exists server_boosts_server_idx on public.server_boosts (server_id);

create or replace function public.server_boost_count(sid uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from server_boosts b where b.server_id = sid and public.has_plus(b.user_id);
$$;
-- níveis: 1 = 2 impulsos, 2 = 5 impulsos, 3 = 9 impulsos
create or replace function public.server_level(sid uuid) returns int
language sql stable security definer set search_path = public as $$
  select case when n >= 9 then 3 when n >= 5 then 2 when n >= 2 then 1 else 0 end
  from (select public.server_boost_count(sid) n) x;
$$;

create or replace function public.boost_server(p_server uuid, p_slot int) returns void
language plpgsql security definer set search_path = public as $$
declare old_row server_boosts;
begin
  if not public.has_plus(auth.uid()) then raise exception 'Impulsos são do Telão+'; end if;
  if p_slot not between 1 and 3 then raise exception 'Impulso inválido'; end if;
  if not public.is_member(p_server) then raise exception 'Você não está nesse servidor'; end if;
  select * into old_row from server_boosts where user_id = auth.uid() and slot = p_slot;
  if found then
    if old_row.server_id = p_server then return; end if;
    if old_row.created_at > now() - interval '7 days' then
      raise exception 'Esse impulso só pode ser trocado em %', to_char(old_row.created_at + interval '7 days', 'DD/MM "às" HH24:MI');
    end if;
    update server_boosts set server_id = p_server, created_at = now() where user_id = auth.uid() and slot = p_slot;
  else
    insert into server_boosts (user_id, slot, server_id) values (auth.uid(), p_slot, p_server);
  end if;
end $$;

create or replace function public.unboost_server(p_slot int) returns void
language plpgsql security definer set search_path = public as $$
declare c timestamptz;
begin
  select created_at into c from server_boosts where user_id = auth.uid() and slot = p_slot;
  if c is null then return; end if;
  if c > now() - interval '7 days' then
    raise exception 'Esse impulso só pode ser retirado em %', to_char(c + interval '7 days', 'DD/MM "às" HH24:MI');
  end if;
  delete from server_boosts where user_id = auth.uid() and slot = p_slot;
end $$;

-- link de convite personalizado (nível 3)
create or replace function public.set_vanity(p_server uuid, p_code text) returns text
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm(p_server, 2) then raise exception 'Sem permissão'; end if;
  if public.server_level(p_server) < 3 then raise exception 'Convite personalizado libera no nível 3'; end if;
  p_code := lower(trim(p_code));
  if p_code !~ '^[a-z0-9-]{3,20}$' then raise exception 'Use 3 a 20 letras, números ou hífen'; end if;
  if exists (select 1 from servers where invite_code = p_code and id <> p_server) then raise exception 'Esse convite já existe'; end if;
  perform set_config('telao.priv_ok', '1', true);
  update servers set invite_code = p_code where id = p_server;
  perform set_config('telao.priv_ok', '', true);
  return p_code;
end $$;

-- ---------- Loja Telão ----------
create table if not exists public.shop_items (
  id text primary key,
  kind text not null check (kind in ('deco','entrance','soundpack','title','card','plus')),
  name text not null,
  price int not null check (price >= 0),
  plus_only boolean not null default false,
  data jsonb not null default '{}'::jsonb,
  active boolean not null default true
);
insert into public.shop_items (id, kind, name, price, plus_only, data) values
  ('deco_neon',     'deco', 'Neon Pulsante',      400, false, '{}'),
  ('deco_gato',     'deco', 'Orelhinhas de Gato', 350, false, '{}'),
  ('deco_coroa',    'deco', 'Coroa de Pixel',     600, false, '{}'),
  ('deco_fogo',     'deco', 'Fogueira',           700, false, '{}'),
  ('deco_chuva',    'deco', 'Nuvem de Chuva',     450, false, '{}'),
  ('deco_estrelas', 'deco', 'Halo de Estrelas',   550, false, '{}'),
  ('deco_folhas',   'deco', 'Folhagem Tropical',  500, false, '{}'),
  ('deco_holo',     'deco', 'Holograma',          900, true,  '{}'),
  ('ent_samba',     'entrance', 'Bateria de Escola de Samba', 500, false, '{}'),
  ('ent_plantao',   'entrance', 'Plantão Urgente',            450, false, '{}'),
  ('ent_moeda',     'entrance', 'Moedinha 8-bit',             300, false, '{}'),
  ('ent_cosmico',   'entrance', 'Chegada Cósmica',            650, false, '{}'),
  ('ent_trombeta',  'entrance', 'Trombeta Real',              550, true,  '{}'),
  ('sp_zueira',     'soundpack', 'Pacote Zueira',   400, false, '{}'),
  ('sp_arcade',     'soundpack', 'Pacote Fliperama',350, false, '{}'),
  ('sp_cinema',     'soundpack', 'Pacote Cinema',   350, false, '{}'),
  ('tt_madrugada',  'title', 'Lenda da Madrugada', 200, false, '{}'),
  ('tt_mute',       'title', 'Rei do Mute',        200, false, '{}'),
  ('tt_cinefilo',   'title', 'Cinéfilo de Sofá',   200, false, '{}'),
  ('tt_lagado',     'title', 'Sempre Lagado',      200, false, '{}'),
  ('tt_dj',         'title', 'DJ da Call',         250, false, '{}'),
  ('tt_fundador',   'title', 'Fundador de Telão',  800, true,  '{}'),
  ('cd_por_do_sol', 'card', 'Pôr do Sol na Laje', 450, false, '{}'),
  ('cd_aurora',     'card', 'Aurora',             500, false, '{}'),
  ('cd_vapor',      'card', 'Vaporwave',          500, false, '{}'),
  ('cd_mata',       'card', 'Mata Atlântica',     450, false, '{}'),
  ('cd_galaxia',    'card', 'Galáxia',            750, true,  '{}'),
  ('plus_7',        'plus', 'Telão+ por 7 dias',  3000, false, '{"days":7}')
on conflict (id) do update set kind = excluded.kind, name = excluded.name, price = excluded.price, plus_only = excluded.plus_only, data = excluded.data;

create table if not exists public.inventory (
  user_id uuid not null references public.profiles(id) on delete cascade,
  item_id text not null references public.shop_items(id) on delete cascade,
  from_user uuid references public.profiles(id) on delete set null,
  acquired_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

create table if not exists public.gifts (
  id uuid primary key default gen_random_uuid(),
  from_user uuid references public.profiles(id) on delete set null,
  to_user uuid not null references public.profiles(id) on delete cascade,
  item_id text references public.shop_items(id) on delete set null,
  plus_days int not null default 0,
  note text check (char_length(note) <= 140),
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);

-- fichas diárias: 50 + 10 por dia seguido (máx. +100); Telão+ ganha em dobro
create or replace function public.claim_daily() returns jsonb
language plpgsql security definer set search_path = public as $$
declare p profiles; today date := (now() at time zone 'America/Sao_Paulo')::date; st int; gain int;
begin
  select * into p from profiles where id = auth.uid() for update;
  if p.last_daily = today then raise exception 'Você já pegou as fichas de hoje. Volte amanhã!'; end if;
  st := case when p.last_daily = today - 1 then p.streak + 1 else 1 end;
  gain := 50 + least(st - 1, 10) * 10;
  if public.has_plus(p.id) then gain := gain * 2; end if;
  perform set_config('telao.priv_ok', '1', true);
  update profiles set fichas = fichas + gain, streak = st, last_daily = today where id = p.id;
  perform set_config('telao.priv_ok', '', true);
  return jsonb_build_object('gain', gain, 'streak', st, 'fichas', p.fichas + gain);
end $$;

create or replace function public.grant_item(p_user uuid, p_item text, p_from uuid) returns void
language plpgsql security definer set search_path = public as $$
declare it shop_items;
begin
  select * into it from shop_items where id = p_item;
  if it.kind = 'plus' then
    perform set_config('telao.priv_ok', '1', true);
    update profiles set plan_until = greatest(coalesce(plan_until, now()), now()) + make_interval(days => (it.data->>'days')::int) where id = p_user;
    perform set_config('telao.priv_ok', '', true);
  else
    insert into inventory (user_id, item_id, from_user) values (p_user, p_item, p_from) on conflict do nothing;
  end if;
end $$;
revoke execute on function public.grant_item(uuid, text, uuid) from public, anon, authenticated;

create or replace function public.buy_item(p_item text) returns int
language plpgsql security definer set search_path = public as $$
declare it shop_items; bal int;
begin
  select * into it from shop_items where id = p_item and active;
  if not found then raise exception 'Item não existe'; end if;
  if it.plus_only and not public.has_plus(auth.uid()) then raise exception 'Item exclusivo do Telão+'; end if;
  if it.kind <> 'plus' and exists (select 1 from inventory where user_id = auth.uid() and item_id = p_item) then raise exception 'Você já tem esse item'; end if;
  select fichas into bal from profiles where id = auth.uid() for update;
  if bal < it.price then raise exception 'Fichas insuficientes (faltam %)', it.price - bal; end if;
  perform set_config('telao.priv_ok', '1', true);
  update profiles set fichas = fichas - it.price where id = auth.uid();
  perform set_config('telao.priv_ok', '', true);
  perform public.grant_item(auth.uid(), p_item, null);
  return bal - it.price;
end $$;

-- presente: quem dá paga em fichas; chega como cartão na DM. Admin pode dar Telão+ de graça.
create or replace function public.send_gift(p_to uuid, p_item text, p_note text, p_plus_days int default 0) returns uuid
language plpgsql security definer set search_path = public as $$
declare it shop_items; bal int; gid uuid; cid uuid;
begin
  if p_to = auth.uid() then raise exception 'Presente é pra outra pessoa 😄'; end if;
  if not exists (select 1 from profiles where id = p_to) then raise exception 'Pessoa não encontrada'; end if;
  if coalesce(p_plus_days, 0) > 0 then
    if not public.is_admin_user() then raise exception 'Presentear Telão+ com dinheiro ainda não está ativo'; end if;
    p_plus_days := least(p_plus_days, 365);
    p_item := null;
  else
    select * into it from shop_items where id = p_item and active;
    if not found then raise exception 'Item não existe'; end if;
    if it.kind <> 'plus' and exists (select 1 from inventory where user_id = p_to and item_id = p_item) then raise exception 'Essa pessoa já tem esse item'; end if;
    select fichas into bal from profiles where id = auth.uid() for update;
    if bal < it.price then raise exception 'Fichas insuficientes (faltam %)', it.price - bal; end if;
    perform set_config('telao.priv_ok', '1', true);
    update profiles set fichas = fichas - it.price where id = auth.uid();
    perform set_config('telao.priv_ok', '', true);
  end if;
  insert into gifts (from_user, to_user, item_id, plus_days, note) values (auth.uid(), p_to, p_item, coalesce(p_plus_days, 0), left(p_note, 140)) returning id into gid;
  cid := public.open_dm(p_to);
  insert into messages (channel_id, author_id, content, attachments)
    values (cid, auth.uid(), '', jsonb_build_array(jsonb_build_object('type', 'gift', 'gift', gid)));
  return gid;
end $$;

create or replace function public.claim_gift(p_gift uuid) returns text
language plpgsql security definer set search_path = public as $$
declare g gifts;
begin
  select * into g from gifts where id = p_gift for update;
  if not found or g.to_user <> auth.uid() then raise exception 'Esse presente não é seu'; end if;
  if g.claimed_at is not null then raise exception 'Presente já aberto'; end if;
  update gifts set claimed_at = now() where id = p_gift;
  if g.plus_days > 0 then
    perform set_config('telao.priv_ok', '1', true);
    update profiles set plan_until = greatest(coalesce(plan_until, now()), now()) + make_interval(days => g.plus_days) where id = g.to_user;
    perform set_config('telao.priv_ok', '', true);
    return 'plus';
  end if;
  if g.item_id is not null then perform public.grant_item(g.to_user, g.item_id, g.from_user); end if;
  return coalesce(g.item_id, '');
end $$;

-- equipar: só o que você tem (e Telão+ para itens exclusivos)
create or replace function public.equip_item(p_kind text, p_item text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare eq jsonb;
begin
  if p_kind not in ('deco','entrance','soundpack','title','card') then raise exception 'Tipo inválido'; end if;
  if p_item is not null then
    if not exists (select 1 from inventory i join shop_items s on s.id = i.item_id where i.user_id = auth.uid() and i.item_id = p_item and s.kind = p_kind)
      and not public.is_admin_user() then raise exception 'Você não tem esse item'; end if;
    if exists (select 1 from shop_items where id = p_item and plus_only) and not public.has_plus(auth.uid()) then raise exception 'Item exclusivo do Telão+'; end if;
  end if;
  select equipped into eq from profiles where id = auth.uid();
  eq := case when p_item is null then coalesce(eq, '{}'::jsonb) - p_kind else jsonb_set(coalesce(eq, '{}'::jsonb), array[p_kind], to_jsonb(p_item)) end;
  perform set_config('telao.priv_ok', '1', true);
  update profiles set equipped = eq where id = auth.uid();
  perform set_config('telao.priv_ok', '', true);
  return eq;
end $$;

create or replace function public.admin_give_fichas(p_user uuid, p_amount int) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_admin_user() then raise exception 'Só admin'; end if;
  perform set_config('telao.priv_ok', '1', true);
  update profiles set fichas = greatest(0, fichas + p_amount) where id = p_user returning fichas into n;
  perform set_config('telao.priv_ok', '', true);
  return n;
end $$;

alter table public.server_boosts enable row level security;
alter table public.shop_items    enable row level security;
alter table public.inventory     enable row level security;
alter table public.gifts         enable row level security;
drop policy if exists "ver impulsos" on public.server_boosts;
create policy "ver impulsos" on public.server_boosts for select to authenticated using (true);
drop policy if exists "ver loja" on public.shop_items;
create policy "ver loja" on public.shop_items for select to authenticated using (true);
drop policy if exists "ver inventario" on public.inventory;
create policy "ver inventario" on public.inventory for select to authenticated using (true);
drop policy if exists "ver presentes" on public.gifts;
create policy "ver presentes" on public.gifts for select to authenticated using (auth.uid() in (from_user, to_user));


-- =====================================================================
-- v5: MODERAÇÃO (castigo no chat, silenciar/ensurdecer na call, banir)
-- permissões novas: 64 = Moderar membros · 128 = Banir membros
-- =====================================================================
alter table public.server_members add column if not exists timeout_until timestamptz;
alter table public.server_members add column if not exists voice_muted boolean not null default false;
alter table public.server_members add column if not exists voice_deafened boolean not null default false;
create table if not exists public.server_bans (
  server_id uuid not null references public.servers(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  banned_by uuid references public.profiles(id) on delete set null,
  reason text check (char_length(reason) <= 200),
  created_at timestamptz not null default now(),
  primary key (server_id, user_id)
);
alter table public.server_bans enable row level security;
drop policy if exists "ver banidos" on public.server_bans;
create policy "ver banidos" on public.server_bans for select to authenticated using (public.has_perm(server_id, 128) or public.has_perm(server_id, 4));

-- quem pode moderar quem: ninguém mexe no dono, e só o dono mexe em administradores
create or replace function public.can_moderate(sid uuid, target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select target <> auth.uid()
     and not exists (select 1 from servers where id = sid and owner_id = target)
     and (public.is_server_owner(sid) or not exists (
          select 1 from member_roles mr join server_roles r on r.id = mr.role_id
          where mr.server_id = sid and mr.user_id = target and (r.perms & 32) <> 0));
$$;
create or replace function public.is_timed_out(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from server_members where server_id = sid and user_id = auth.uid() and timeout_until > now());
$$;
create or replace function public.moderate_member(p_server uuid, p_user uuid, p_timeout_minutes int default null, p_vmute boolean default null, p_vdeaf boolean default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm(p_server, 64) then raise exception 'Você não tem permissão de moderar'; end if;
  if not public.can_moderate(p_server, p_user) then raise exception 'Você não pode moderar essa pessoa'; end if;
  update server_members set
    timeout_until = case when p_timeout_minutes is null then timeout_until when p_timeout_minutes <= 0 then null else now() + make_interval(mins => least(p_timeout_minutes, 40320)) end,
    voice_muted = coalesce(p_vmute, voice_muted),
    voice_deafened = coalesce(p_vdeaf, voice_deafened)
  where server_id = p_server and user_id = p_user;
end $$;
create or replace function public.ban_member(p_server uuid, p_user uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm(p_server, 128) then raise exception 'Você não tem permissão de banir'; end if;
  if not public.can_moderate(p_server, p_user) then raise exception 'Você não pode banir essa pessoa'; end if;
  insert into server_bans (server_id, user_id, banned_by, reason) values (p_server, p_user, auth.uid(), left(p_reason, 200))
    on conflict (server_id, user_id) do update set reason = excluded.reason, banned_by = excluded.banned_by, created_at = now();
  delete from member_roles where server_id = p_server and user_id = p_user;
  delete from server_members where server_id = p_server and user_id = p_user;
end $$;
create or replace function public.unban_member(p_server uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm(p_server, 128) then raise exception 'Você não tem permissão'; end if;
  delete from server_bans where server_id = p_server and user_id = p_user;
end $$;
-- castigo bloqueia mensagens e reações; expulsar respeita a hierarquia
drop policy if exists "enviar mensagens" on public.messages;
create policy "enviar mensagens" on public.messages for insert to authenticated with check (author_id = auth.uid() and public.can_access_channel(channel_id)
  and not exists (select 1 from public.channels c where c.id = channel_id and c.server_id is not null and public.is_timed_out(c.server_id)));
drop policy if exists "reagir" on public.message_reactions;
create policy "reagir" on public.message_reactions for insert to authenticated with check (public.can_access_message(message_id)
  and not exists (select 1 from public.messages m join public.channels c on c.id = m.channel_id where m.id = message_id and c.server_id is not null and public.is_timed_out(c.server_id)));
drop policy if exists "sair ou expulsar" on public.server_members;
create policy "sair ou expulsar" on public.server_members for delete to authenticated using (
  (user_id = auth.uid() and role <> 'owner')
  or (public.has_perm(server_id, 4) and role <> 'owner' and user_id <> auth.uid() and public.can_moderate(server_id, user_id)));
-- expulsar também pode ser feito por RPC (e não deixa expulsar administradores sem ser o dono)
create or replace function public.kick_member(p_server uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm(p_server, 4) then raise exception 'Você não tem permissão de expulsar'; end if;
  if not public.can_moderate(p_server, p_user) then raise exception 'Você não pode expulsar essa pessoa'; end if;
  delete from member_roles where server_id = p_server and user_id = p_user;
  delete from server_members where server_id = p_server and user_id = p_user;
end $$;


-- =====================================================================
-- v6: CONEXÕES (Spotify), ATIVIDADE NO PERFIL e EVENTOS DE SERVIDOR
-- =====================================================================
alter table public.profiles add column if not exists activity jsonb;
alter table public.profiles drop constraint if exists profiles_activity_ck;
alter table public.profiles add constraint profiles_activity_ck check (activity is null or (jsonb_typeof(activity) = 'object' and pg_column_size(activity) < 4000));

-- configurações do app que o admin muda pelo painel (ex.: Client ID do Spotify, que é público)
create table if not exists public.app_config (key text primary key, value text, updated_at timestamptz not null default now());
alter table public.app_config enable row level security;
drop policy if exists "ler config" on public.app_config;
create policy "ler config" on public.app_config for select to anon, authenticated using (true);
drop policy if exists "admin grava config" on public.app_config;
create policy "admin grava config" on public.app_config for all to authenticated using (public.is_admin_user()) with check (public.is_admin_user());

-- contas vinculadas: o token só o próprio dono enxerga
create table if not exists public.connections (
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (provider in ('spotify')),
  account_name text,
  refresh_token text,
  show_activity boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (user_id, provider)
);
alter table public.connections enable row level security;
drop policy if exists "minhas conexoes" on public.connections;
create policy "minhas conexoes" on public.connections for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- eventos
create table if not exists public.server_events (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers(id) on delete cascade,
  channel_id uuid references public.channels(id) on delete set null,
  title text not null check (char_length(title) between 1 and 80),
  description text check (char_length(description) <= 600),
  starts_at timestamptz not null,
  ends_at timestamptz,
  cover_color text,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists server_events_idx on public.server_events (server_id, starts_at);
create table if not exists public.event_rsvps (
  event_id uuid not null references public.server_events(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
alter table public.server_events enable row level security;
alter table public.event_rsvps enable row level security;
-- 256 = Gerenciar eventos
drop policy if exists "ver eventos" on public.server_events;
create policy "ver eventos" on public.server_events for select to authenticated using (public.is_member(server_id));
drop policy if exists "criar eventos" on public.server_events;
create policy "criar eventos" on public.server_events for insert to authenticated with check (public.has_perm(server_id, 256) or public.has_perm(server_id, 2));
drop policy if exists "editar eventos" on public.server_events;
create policy "editar eventos" on public.server_events for update to authenticated using (public.has_perm(server_id, 256) or public.has_perm(server_id, 2) or created_by = auth.uid());
drop policy if exists "apagar eventos" on public.server_events;
create policy "apagar eventos" on public.server_events for delete to authenticated using (public.has_perm(server_id, 256) or public.has_perm(server_id, 2) or created_by = auth.uid());
drop policy if exists "ver interessados" on public.event_rsvps;
create policy "ver interessados" on public.event_rsvps for select to authenticated using (exists (select 1 from public.server_events e where e.id = event_id and public.is_member(e.server_id)));
drop policy if exists "marcar interesse" on public.event_rsvps;
create policy "marcar interesse" on public.event_rsvps for insert to authenticated with check (user_id = auth.uid() and exists (select 1 from public.server_events e where e.id = event_id and public.is_member(e.server_id)));
drop policy if exists "tirar interesse" on public.event_rsvps;
create policy "tirar interesse" on public.event_rsvps for delete to authenticated using (user_id = auth.uid());


-- =====================================================================
-- v6.4: SEGURANÇA, CANAIS CONFIGURÁVEIS e RESTRIÇÃO DE IDADE
-- =====================================================================
alter table public.profiles add column if not exists birthdate date;
alter table public.profiles add column if not exists share_block_until timestamptz;
alter table public.servers add column if not exists nsfw boolean not null default false;
alter table public.servers add column if not exists verify_level int not null default 0 check (verify_level between 0 and 3);
alter table public.channels add column if not exists nsfw boolean not null default false;
alter table public.channels add column if not exists slowmode int not null default 0 check (slowmode between 0 and 21600);
alter table public.channels add column if not exists readonly boolean not null default false;
alter table public.channels add column if not exists allowed_roles uuid[];
alter table public.channels add column if not exists user_limit int not null default 0 check (user_limit between 0 and 99);
alter table public.channels add column if not exists bitrate int not null default 96 check (bitrate between 32 and 510);
alter table public.channels add column if not exists video_quality text not null default 'auto' check (video_quality in ('auto','720p','1080p'));
alter table public.channels add column if not exists no_links boolean not null default false;
alter table public.channels add column if not exists no_media boolean not null default false;
alter table public.channels add column if not exists ptt_only boolean not null default false;
alter table public.channels add column if not exists no_camera boolean not null default false;
alter table public.channels add column if not exists no_screen boolean not null default false;

-- idade: a data de nascimento é definida uma vez só (mínimo 13 anos)
create or replace function public.is_adult(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select birthdate <= (current_date - interval '18 years')::date from profiles where id = uid), false);
$$;
create or replace function public.set_birthdate(p_date date) returns boolean
language plpgsql security definer set search_path = public as $$
declare cur date;
begin
  select birthdate into cur from profiles where id = auth.uid();
  if cur is not null then raise exception 'A data de nascimento já foi definida e não pode ser trocada'; end if;
  if p_date > (current_date - interval '13 years')::date then raise exception 'O Telão é para maiores de 13 anos'; end if;
  if p_date < date '1900-01-01' then raise exception 'Data inválida'; end if;
  perform set_config('telao.priv_ok', '1', true);
  update profiles set birthdate = p_date where id = auth.uid();
  perform set_config('telao.priv_ok', '', true);
  return public.is_adult(auth.uid());
end $$;

-- ver o canal (canais privados por cargo) x acessar o conteúdo (+18)
create or replace function public.can_view_channel(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from channels c
    where c.id = cid and (
      auth.uid() in (c.dm_a, c.dm_b)
      or (c.server_id is not null and exists (select 1 from server_members m where m.server_id = c.server_id and m.user_id = auth.uid())
          and (c.allowed_roles is null or cardinality(c.allowed_roles) = 0
               or exists (select 1 from servers s where s.id = c.server_id and s.owner_id = auth.uid())
               or public.has_perm(c.server_id, 32)
               or exists (select 1 from member_roles mr where mr.server_id = c.server_id and mr.user_id = auth.uid() and mr.role_id = any(c.allowed_roles))))
    )
  );
$$;
create or replace function public.can_access_channel(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.can_view_channel(cid) and not exists (
    select 1 from channels c left join servers s on s.id = c.server_id
    where c.id = cid and (c.nsfw or coalesce(s.nsfw, false)) and not public.is_adult(auth.uid()));
$$;
drop policy if exists "ver canais" on public.channels;
create policy "ver canais" on public.channels for select to authenticated using (
  (kind = 'dm' and auth.uid() in (dm_a, dm_b))
  or (server_id is not null and public.is_member(server_id) and (
      allowed_roles is null or cardinality(allowed_roles) = 0 or public.is_server_owner(server_id) or public.has_perm(server_id, 32)
      or exists (select 1 from public.member_roles mr where mr.server_id = channels.server_id and mr.user_id = auth.uid() and mr.role_id = any(channels.allowed_roles)))));

-- regras ao mandar mensagem: modo lento, só leitura, sem links/mídia e anti-spam
create or replace function public.message_rules() returns trigger
language plpgsql security definer set search_path = public as $$
declare c channels; mod boolean; last_at timestamptz; recent int;
begin
  select * into c from channels where id = new.channel_id;
  if c.kind = 'dm' and new.author_id <> '7e1a0000-0000-4000-a000-000000000001'::uuid and '7e1a0000-0000-4000-a000-000000000001'::uuid in (c.dm_a, c.dm_b) then
    raise exception 'A conta oficial do Telão não responde mensagens.';
  end if;
  mod := c.server_id is not null and (public.has_perm(c.server_id, 1) or public.has_perm(c.server_id, 8));
  -- anti-spam para todo mundo: no máximo 8 mensagens em 10 segundos
  select count(*) into recent from messages where author_id = new.author_id and created_at > now() - interval '10 seconds';
  if recent >= 8 and new.author_id <> '7e1a0000-0000-4000-a000-000000000001'::uuid then raise exception 'Calma! Você está mandando mensagens rápido demais.'; end if;
  perform public.check_custom_emojis(new.content, new.channel_id, new.author_id);
  if c.server_id is null or mod then return new; end if;
  -- nível de verificação do servidor
  declare vl int; begin
    select verify_level into vl from servers where id = c.server_id;
    if vl >= 1 and exists (select 1 from profiles where id = new.author_id and created_at > now() - interval '5 minutes') then raise exception 'Este servidor pede que sua conta tenha mais de 5 minutos para falar.'; end if;
    if vl >= 2 and exists (select 1 from server_members where server_id = c.server_id and user_id = new.author_id and joined_at > now() - interval '10 minutes') then raise exception 'Este servidor pede que você esteja aqui há mais de 10 minutos para falar.'; end if;
    if vl >= 3 and not exists (select 1 from auth.mfa_factors f where f.user_id = new.author_id and f.status = 'verified') then raise exception 'Este servidor pede a verificação em duas etapas ligada (Configurações → Segurança).'; end if;
  end;
  if c.readonly then raise exception 'Este canal é só para leitura.'; end if;
  if c.slowmode > 0 then
    select max(created_at) into last_at from messages where channel_id = new.channel_id and author_id = new.author_id;
    if last_at is not null and last_at > now() - make_interval(secs => c.slowmode) then
      raise exception 'Modo lento: espere % s para mandar outra mensagem.', ceil(extract(epoch from (last_at + make_interval(secs => c.slowmode) - now())))::int;
    end if;
  end if;
  if c.no_links and new.content ~* '(https?://|www\.)' then raise exception 'Links não são permitidos neste canal.'; end if;
  if c.no_media and jsonb_array_length(coalesce(new.attachments, '[]'::jsonb)) > 0
     and exists (select 1 from jsonb_array_elements(new.attachments) a where coalesce(a->>'type', '') not in ('poll')) then
    raise exception 'Arquivos e imagens não são permitidos neste canal.';
  end if;
  return new;
end $$;
drop trigger if exists message_rules on public.messages;
create trigger message_rules before insert on public.messages for each row execute function public.message_rules();

-- moderação automática da tela: registra e, depois de 2 casos em 24 h, bloqueia compartilhar por 24 h
create table if not exists public.safety_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('screen_nsfw','camera_nsfw','image_nsfw')),
  server_id uuid references public.servers(id) on delete set null,
  channel_id uuid references public.channels(id) on delete set null,
  score real,
  created_at timestamptz not null default now()
);
alter table public.safety_events enable row level security;
drop policy if exists "admin ve eventos" on public.safety_events;
create policy "admin ve eventos" on public.safety_events for select to authenticated using (public.is_admin_user() or user_id = auth.uid() or (server_id is not null and public.has_perm(server_id, 64)));
create or replace function public.report_nsfw(p_kind text, p_channel uuid, p_score real) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare sid uuid; n int; until_ts timestamptz;
begin
  select server_id into sid from channels where id = p_channel;
  insert into safety_events (user_id, kind, server_id, channel_id, score) values (auth.uid(), p_kind, sid, p_channel, p_score);
  select count(*) into n from safety_events where user_id = auth.uid() and kind in ('screen_nsfw','camera_nsfw') and created_at > now() - interval '24 hours';
  if n >= 2 then
    until_ts := now() + interval '24 hours';
    perform set_config('telao.priv_ok', '1', true);
    update profiles set share_block_until = until_ts where id = auth.uid();
    perform set_config('telao.priv_ok', '', true);
  end if;
  return until_ts;
end $$;


-- =====================================================================
-- v6.5: PRIVACIDADE DE DM, COMUNIDADES, TAGS DE SERVIDOR, AVISOS DO TELÃO e EMOJIS DE SERVIDOR
-- =====================================================================
-- quem pode me mandar mensagem: 'all' (qualquer um), 'servers' (quem está num servidor comigo), 'friends' (só amigos)
alter table public.profiles add column if not exists dm_privacy text not null default 'servers' check (dm_privacy in ('all','servers','friends'));
alter table public.channels add column if not exists dm_status text not null default 'ok' check (dm_status in ('ok','pending'));
alter table public.channels add column if not exists dm_requester uuid references public.profiles(id) on delete set null;

create or replace function public.open_dm(p_user uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare a uuid; b uuid; cid uuid; fr boolean; priv text;
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;
  if p_user = auth.uid() then raise exception 'Não dá para mandar mensagem para você mesmo'; end if;
  if exists (select 1 from friendships where status = 'blocked' and ((requester = p_user and addressee = auth.uid()) or (requester = auth.uid() and addressee = p_user))) then
    raise exception 'Não é possível mandar mensagem para essa pessoa';
  end if;
  fr := exists (select 1 from friendships where status = 'accepted'
                and ((requester = auth.uid() and addressee = p_user) or (requester = p_user and addressee = auth.uid())));
  a := least(auth.uid(), p_user); b := greatest(auth.uid(), p_user);
  select id into cid from channels where kind = 'dm' and dm_a = a and dm_b = b;
  if cid is not null then
    if fr then update channels set dm_status = 'ok' where id = cid and dm_status <> 'ok'; end if;
    return cid;
  end if;
  if not fr then
    select dm_privacy into priv from profiles where id = p_user;
    if priv = 'friends' then raise exception 'Essa pessoa só recebe mensagens de amigos. Mande um pedido de amizade.'; end if;
    if priv = 'servers' and not public.shares_server(p_user) then raise exception 'Vocês precisam estar num mesmo servidor (ou ser amigos) para conversar.'; end if;
  end if;
  insert into channels (name, kind, dm_a, dm_b, dm_status, dm_requester)
    values ('dm', 'dm', a, b, case when fr then 'ok' else 'pending' end, case when fr then null else auth.uid() end) returning id into cid;
  return cid;
end $$;
create or replace function public.answer_dm_request(p_channel uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare c channels;
begin
  select * into c from channels where id = p_channel and kind = 'dm';
  if not found or auth.uid() not in (c.dm_a, c.dm_b) or c.dm_requester = auth.uid() then raise exception 'Solicitação não encontrada'; end if;
  if p_accept then update channels set dm_status = 'ok' where id = p_channel;
  else delete from channels where id = p_channel; end if;
end $$;
-- ao virarem amigos, a solicitação vira conversa normal
create or replace function public.friend_dm_ok() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'accepted' then
    update channels set dm_status = 'ok' where kind = 'dm' and dm_status = 'pending'
      and dm_a = least(new.requester, new.addressee) and dm_b = greatest(new.requester, new.addressee);
  end if;
  return new;
end $$;
drop trigger if exists friend_dm_ok on public.friendships;
create trigger friend_dm_ok after insert or update on public.friendships for each row execute function public.friend_dm_ok();

-- servidores da comunidade (aparecem em "Explorar")
alter table public.servers add column if not exists is_public boolean not null default false;
alter table public.servers add column if not exists topic_tags text[];
alter table public.servers add column if not exists public_since timestamptz;
create or replace function public.discover_servers(p_q text default null, p_tag text default null) returns table (
  id uuid, name text, description text, icon_url text, icon_color text, banner_url text, accent text, topic_tags text[], members bigint, online_hint bigint, is_member boolean, boosts int, nsfw boolean)
language sql stable security definer set search_path = public as $$
  select s.id, s.name, s.description, s.icon_url, s.icon_color, s.banner_url, s.accent, s.topic_tags,
         (select count(*) from server_members m where m.server_id = s.id) as members, 0::bigint,
         exists (select 1 from server_members m where m.server_id = s.id and m.user_id = auth.uid()),
         public.server_boost_count(s.id), s.nsfw
  from servers s
  where s.is_public
    and not exists (select 1 from server_bans b where b.server_id = s.id and b.user_id = auth.uid())
    and (p_q is null or s.name ilike '%' || p_q || '%' or s.description ilike '%' || p_q || '%')
    and (p_tag is null or p_tag = any(s.topic_tags))
  order by (select count(*) from server_members m where m.server_id = s.id) desc, s.public_since desc nulls last
  limit 60;
$$;
drop function if exists public.join_public_server(uuid);
create or replace function public.join_public_server(p_server uuid, p_accept boolean default false) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from servers where id = p_server and is_public) then raise exception 'Esse servidor não está aberto para a comunidade'; end if;
  if exists (select 1 from server_bans where server_id = p_server and user_id = auth.uid()) then raise exception 'Você foi banido desse servidor'; end if;
  if not p_accept and not exists (select 1 from server_members where server_id = p_server and user_id = auth.uid())
     and exists (select 1 from servers where id = p_server and coalesce((to_jsonb(servers)->>'rules_on')::boolean, false)) then
    raise exception 'RULES_REQUIRED:%', p_server;
  end if;
  insert into server_members (server_id, user_id, role) values (p_server, auth.uid(), 'member') on conflict do nothing;
  return p_server;
end $$;

-- tag do servidor (nível 2 de impulsos): até 4 letras + um símbolo; membros mostram ao lado do nome em todo o Telão
alter table public.servers add column if not exists tag text check (tag ~ '^[A-Za-z0-9]{2,4}$');
alter table public.servers add column if not exists tag_badge text check (char_length(tag_badge) <= 16);
alter table public.profiles add column if not exists guild_tag jsonb;
create or replace function public.use_server_tag(p_server uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t jsonb;
begin
  if p_server is null then t := null;
  else
    if not public.is_member(p_server) then raise exception 'Você precisa estar no servidor'; end if;
    if public.server_level(p_server) < 2 then raise exception 'A tag libera quando o servidor chega no nível 2'; end if;
    select jsonb_build_object('sid', id, 'tag', tag, 'badge', tag_badge, 'name', name) into t from servers where id = p_server and tag is not null;
    if t is null then raise exception 'Esse servidor ainda não criou uma tag'; end if;
  end if;
  perform set_config('telao.priv_ok', '1', true);
  update profiles set guild_tag = t where id = auth.uid();
  perform set_config('telao.priv_ok', '', true);
  return t;
end $$;
create or replace function public.sync_server_tag() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('telao.priv_ok', '1', true);
  if tg_table_name = 'servers' then
    if new.tag is distinct from old.tag or new.tag_badge is distinct from old.tag_badge or new.name is distinct from old.name then
      update profiles set guild_tag = case when new.tag is null then null else jsonb_build_object('sid', new.id, 'tag', new.tag, 'badge', new.tag_badge, 'name', new.name) end
        where guild_tag->>'sid' = new.id::text;
    end if;
  else
    update profiles set guild_tag = null where id = old.user_id and guild_tag->>'sid' = old.server_id::text;
  end if;
  perform set_config('telao.priv_ok', '', true);
  return coalesce(new, old);
end $$;
drop trigger if exists sync_tag_srv on public.servers;
create trigger sync_tag_srv after update on public.servers for each row execute function public.sync_server_tag();
drop trigger if exists sync_tag_mem on public.server_members;
create trigger sync_tag_mem after delete on public.server_members for each row execute function public.sync_server_tag();

-- avisos do Telão (novidades e anúncios do dono), com caixa de notificações para todo mundo
create table if not exists public.app_notices (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'announce' check (kind in ('update','announce','event')),
  title text not null check (char_length(title) between 1 and 120),
  body text check (char_length(body) <= 4000),
  link text,
  version text,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.app_notices enable row level security;
drop policy if exists "todos leem avisos" on public.app_notices;
create policy "todos leem avisos" on public.app_notices for select to authenticated using (true);
drop policy if exists "admin publica avisos" on public.app_notices;
create policy "admin publica avisos" on public.app_notices for all to authenticated using (public.is_admin_user()) with check (public.is_admin_user());
alter table public.profiles add column if not exists notices_read_at timestamptz;

-- emojis do servidor (estáticos e animados)
create table if not exists public.server_emojis (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers(id) on delete cascade,
  name text not null check (name ~ '^[a-z0-9_]{2,32}$'),
  url text not null,
  animated boolean not null default false,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (server_id, name)
);
alter table public.server_emojis enable row level security;
drop policy if exists "ver emojis" on public.server_emojis;
create policy "ver emojis" on public.server_emojis for select to authenticated using (true);
-- 512 = Gerenciar emojis
drop policy if exists "criar emojis" on public.server_emojis;
create policy "criar emojis" on public.server_emojis for insert to authenticated with check ((public.has_perm(server_id, 512) or public.has_perm(server_id, 2))
  and (select count(*) from public.server_emojis e where e.server_id = server_emojis.server_id and e.animated = server_emojis.animated) < 50 + 25 * public.server_level(server_id));
drop policy if exists "editar emojis" on public.server_emojis;
create policy "editar emojis" on public.server_emojis for update to authenticated using (public.has_perm(server_id, 512) or public.has_perm(server_id, 2));
drop policy if exists "apagar emojis" on public.server_emojis;
create policy "apagar emojis" on public.server_emojis for delete to authenticated using (public.has_perm(server_id, 512) or public.has_perm(server_id, 2));
alter table public.message_reactions drop constraint if exists message_reactions_emoji_check;
alter table public.message_reactions add constraint message_reactions_emoji_check check (char_length(emoji) between 1 and 80);
-- usar emoji de outro servidor (ou em DM) é do Telão+, e só de servidores em que a pessoa está
create or replace function public.check_custom_emojis(p_text text, p_channel uuid, p_author uuid) returns void
language plpgsql stable security definer set search_path = public as $$
declare m text[]; es uuid; cs uuid;
begin
  if p_text is null or position('<' in p_text) = 0 then return; end if;
  select server_id into cs from channels where id = p_channel;
  for m in select regexp_matches(p_text, '<a?:[a-z0-9_]{2,32}:([0-9a-f-]{36})>', 'g') loop
    select server_id into es from server_emojis where id = m[1]::uuid;
    if es is null then raise exception 'Esse emoji não existe mais.'; end if;
    if cs is distinct from es then
      if not public.has_plus(p_author) then raise exception 'Usar emojis de outros servidores é do Telão+.'; end if;
      if not exists (select 1 from server_members where server_id = es and user_id = p_author) then raise exception 'Você precisa estar no servidor desse emoji para usar.'; end if;
    end if;
  end loop;
end $$;
create or replace function public.reaction_emoji_rules() returns trigger
language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  if new.emoji like 'opt:%' then return new; end if;
  select channel_id into cid from messages where id = new.message_id;
  perform public.check_custom_emojis(new.emoji, cid, auth.uid());
  return new;
end $$;
drop trigger if exists reaction_emoji_rules on public.message_reactions;
create trigger reaction_emoji_rules before insert on public.message_reactions for each row execute function public.reaction_emoji_rules();


-- novidades desta versão (aparece em Novidades para todo mundo, uma vez só)
insert into public.app_notices (kind, title, body, version)
select 'update', 'Chegou a versão 6.5 do Telão',
'- **Solicitações de mensagem:** escolha em Configurações → Privacidade quem pode te mandar mensagem. Quem não é amigo cai numa caixa separada.
- **Comunidades:** servidores abertos aparecem em Explorar (ícone de globo na barra) e ganham um selo.
- **Tag do servidor:** servidores nível 2 criam uma tag que os membros mostram ao lado do nome.
- **Emojis de servidor**, estáticos e animados. Com o Telão+ dá para usar em qualquer lugar.
- **Novidades:** este sininho, com as atualizações e anúncios do Telão.', '6.5'
where not exists (select 1 from public.app_notices where version = '6.5');


-- =====================================================================
-- v6.6: TELÃO BOT DE MÚSICA (fila sincronizada por canal de voz)
-- =====================================================================
create table if not exists public.voice_music (
  channel_id uuid primary key references public.channels(id) on delete cascade,
  current jsonb,
  queue jsonb not null default '[]'::jsonb,
  repeat_mode text not null default 'off' check (repeat_mode in ('off','one','all')),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.voice_music enable row level security;
drop policy if exists "ver musica" on public.voice_music;
create policy "ver musica" on public.voice_music for select to authenticated using (public.can_access_channel(channel_id));
-- só dá para mexer pela função abaixo (que usa o relógio do servidor para todo mundo ficar no mesmo ponto)
create or replace function public.music_control(p_channel uuid, p_action text, p_arg jsonb default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r voice_music; nowms bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint; t jsonb; q jsonb; pos bigint;
  rad boolean; srv uuid; modr boolean; votes jsonb; nlis int; need int;
begin
  if not public.can_access_channel(p_channel) or not exists (select 1 from channels where id = p_channel and kind in ('voice','dm')) then
    raise exception 'Você não tem acesso a este canal de voz';
  end if;
  insert into voice_music (channel_id) values (p_channel) on conflict do nothing;
  select * into r from voice_music where channel_id = p_channel for update;
  q := coalesce(r.queue, '[]'::jsonb);
  -- v6.15: rádio do servidor: qualquer um pede música; pausar/pular direto só a moderação (os outros votam)
  select coalesce((to_jsonb(c)->>'radio')::boolean, false), c.server_id into rad, srv from channels c where c.id = p_channel;
  modr := srv is null or public.has_perm(srv, 1) or public.has_perm(srv, 8);
  if rad and not modr then
    if p_action in ('pause', 'resume', 'seek', 'shuffle', 'loop', 'stop', 'skip') then raise exception 'Na rádio, só a moderação faz isso. Vote para pular a música.'; end if;
    if p_action = 'add' and (select count(*) from jsonb_array_elements(q) x where x->>'by' = auth.uid()::text) >= 3 then
      raise exception 'Você já tem 3 músicas na fila da rádio. Espere elas tocarem.';
    end if;
    if p_action = 'remove' and not exists (select 1 from jsonb_array_elements(q) x where x->>'key' = p_arg->>'key' and x->>'by' = auth.uid()::text) then
      raise exception 'Você só pode tirar da fila as músicas que você pediu.';
    end if;
  end if;
  if p_action = 'vote' then
    if r.current is null or r.current->>'key' is distinct from p_arg->>'key' then return jsonb_build_object('now', nowms, 'state', to_jsonb(r)); end if;
    votes := coalesce(r.current->'votes', '[]'::jsonb);
    if not votes ? auth.uid()::text then votes := votes || to_jsonb(auth.uid()::text); end if;
    select count(distinct user_id) into nlis from voice_sessions where channel_id = p_channel and last_seen > now() - interval '2 minutes';
    need := greatest(1, ceil(greatest(nlis, 1) / 2.0)::int);
    if jsonb_array_length(votes) >= need or r.current->>'by' = auth.uid()::text then p_action := 'skip';
    else
      r.current := r.current || jsonb_build_object('votes', votes, 'need', need);
      update voice_music set current = r.current, updated_by = auth.uid(), updated_at = now() where channel_id = p_channel returning * into r;
      return jsonb_build_object('now', nowms, 'state', to_jsonb(r));
    end if;
  end if;
  if p_action = 'add' then
    if jsonb_array_length(q) >= 100 then raise exception 'A fila já tem 100 músicas'; end if;
    t := p_arg || jsonb_build_object('key', md5(random()::text || clock_timestamp()::text), 'by', auth.uid());
    if r.current is null then r.current := t || jsonb_build_object('started_at', nowms, 'paused_at', null);
    else q := q || jsonb_build_array(t); end if;
  elsif p_action in ('skip', 'next') then
    if p_action = 'next' and (r.current is null or r.current->>'key' is distinct from p_arg->>'key') then
      return jsonb_build_object('now', nowms, 'state', to_jsonb(r));   -- outro aparelho já avançou
    end if;
    if p_action = 'next' and r.repeat_mode = 'one' and r.current is not null then
      r.current := r.current || jsonb_build_object('started_at', nowms, 'paused_at', null);
    else
      if r.repeat_mode = 'all' and r.current is not null then q := q || jsonb_build_array(r.current - 'started_at' - 'paused_at'); end if;
      if jsonb_array_length(q) > 0 then r.current := (q->0) || jsonb_build_object('started_at', nowms, 'paused_at', null); q := q - 0;
      else r.current := null; end if;
    end if;
  elsif p_action = 'pause' then
    if r.current is not null and r.current->>'paused_at' is null then r.current := r.current || jsonb_build_object('paused_at', nowms); end if;
  elsif p_action = 'resume' then
    if r.current is not null and r.current->>'paused_at' is not null then
      r.current := r.current || jsonb_build_object('started_at', (r.current->>'started_at')::bigint + (nowms - (r.current->>'paused_at')::bigint), 'paused_at', null);
    end if;
  elsif p_action = 'seek' then
    pos := greatest(0, (p_arg->>'sec')::numeric * 1000)::bigint;
    if r.current is not null then
      r.current := r.current || jsonb_build_object('started_at', coalesce((r.current->>'paused_at')::bigint, nowms) - pos);
    end if;
  elsif p_action = 'remove' then
    select coalesce(jsonb_agg(x), '[]'::jsonb) into q from jsonb_array_elements(q) x where x->>'key' <> p_arg->>'key';
  elsif p_action = 'shuffle' then
    select coalesce(jsonb_agg(x order by random()), '[]'::jsonb) into q from jsonb_array_elements(q) x;
  elsif p_action = 'loop' then
    r.repeat_mode := coalesce(p_arg->>'mode', 'off');
  elsif p_action = 'stop' then
    r.current := null; q := '[]'::jsonb;
  elsif p_action = 'sync' then
    null;
  else
    raise exception 'Ação inválida';
  end if;
  update voice_music set current = r.current, queue = q, repeat_mode = r.repeat_mode, updated_by = auth.uid(), updated_at = now() where channel_id = p_channel
    returning * into r;
  return jsonb_build_object('now', nowms, 'state', to_jsonb(r));
end $$;


-- =====================================================================
-- v6.8: GRUPOS DE DM, TEMPO EM CALL e ESTATÍSTICAS DO SERVIDOR
-- =====================================================================
alter table public.channels drop constraint if exists channels_kind_check;
alter table public.channels add constraint channels_kind_check check (kind in ('text','voice','dm','group'));
alter table public.channels drop constraint if exists channels_check;
alter table public.channels add constraint channels_check check (
  (kind = 'dm' and server_id is null and dm_a is not null and dm_b is not null)
  or (kind = 'group' and server_id is null)
  or (kind in ('text','voice') and server_id is not null));
alter table public.channels add column if not exists owner_id uuid references public.profiles(id) on delete set null;
alter table public.channels add column if not exists icon_url text;
create table if not exists public.group_members (
  channel_id uuid not null references public.channels(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  added_by uuid references public.profiles(id) on delete set null,
  joined_at timestamptz not null default now(),
  primary key (channel_id, user_id)
);
create index if not exists group_members_user_idx on public.group_members (user_id);
create or replace function public.is_group_member(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from group_members where channel_id = cid and user_id = auth.uid());
$$;
alter table public.group_members enable row level security;
drop policy if exists "ver membros do grupo" on public.group_members;
create policy "ver membros do grupo" on public.group_members for select to authenticated using (public.is_group_member(channel_id));

-- grupos entram nas regras de acesso
create or replace function public.can_view_channel(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from channels c
    where c.id = cid and (
      auth.uid() in (c.dm_a, c.dm_b)
      or (c.kind = 'group' and exists (select 1 from group_members g where g.channel_id = c.id and g.user_id = auth.uid()))
      or (c.server_id is not null and exists (select 1 from server_members m where m.server_id = c.server_id and m.user_id = auth.uid())
          and (c.allowed_roles is null or cardinality(c.allowed_roles) = 0
               or exists (select 1 from servers s where s.id = c.server_id and s.owner_id = auth.uid())
               or public.has_perm(c.server_id, 32)
               or exists (select 1 from member_roles mr where mr.server_id = c.server_id and mr.user_id = auth.uid() and mr.role_id = any(c.allowed_roles))))
    )
  );
$$;
drop policy if exists "ver canais" on public.channels;
create policy "ver canais" on public.channels for select to authenticated using (
  (kind = 'dm' and auth.uid() in (dm_a, dm_b))
  or (kind = 'group' and public.is_group_member(id))
  or (server_id is not null and public.is_member(server_id) and (
      allowed_roles is null or cardinality(allowed_roles) = 0 or public.is_server_owner(server_id) or public.has_perm(server_id, 32)
      or exists (select 1 from public.member_roles mr where mr.server_id = channels.server_id and mr.user_id = auth.uid() and mr.role_id = any(channels.allowed_roles)))));

-- criar e mexer no grupo (até 10 pessoas; só dá para colocar amigos)
create or replace function public.are_friends(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from friendships where status = 'accepted' and ((requester = a and addressee = b) or (requester = b and addressee = a)));
$$;
create or replace function public.create_group(p_users uuid[], p_name text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid; u uuid; n int;
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;
  p_users := array(select distinct x from unnest(p_users) x where x <> auth.uid());
  n := coalesce(array_length(p_users, 1), 0);
  if n < 2 then raise exception 'Escolha pelo menos 2 amigos (para 1 pessoa, use a conversa normal).'; end if;
  if n > 9 then raise exception 'O grupo pode ter no máximo 10 pessoas.'; end if;
  foreach u in array p_users loop
    if not public.are_friends(auth.uid(), u) then raise exception 'Só dá para colocar amigos no grupo.'; end if;
  end loop;
  insert into channels (name, kind, owner_id) values (left(coalesce(nullif(trim(p_name), ''), 'Grupo'), 40), 'group', auth.uid()) returning id into cid;
  insert into group_members (channel_id, user_id, added_by) values (cid, auth.uid(), auth.uid());
  insert into group_members (channel_id, user_id, added_by) select cid, x, auth.uid() from unnest(p_users) x;
  return cid;
end $$;
create or replace function public.group_add(p_channel uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_group_member(p_channel) then raise exception 'Você não está nesse grupo'; end if;
  if not public.are_friends(auth.uid(), p_user) then raise exception 'Só dá para adicionar amigos.'; end if;
  if (select count(*) from group_members where channel_id = p_channel) >= 10 then raise exception 'O grupo já tem 10 pessoas.'; end if;
  insert into group_members (channel_id, user_id, added_by) values (p_channel, p_user, auth.uid()) on conflict do nothing;
end $$;
create or replace function public.group_remove(p_channel uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare own uuid; nxt uuid;
begin
  select owner_id into own from channels where id = p_channel and kind = 'group';
  if p_user <> auth.uid() and own is distinct from auth.uid() then raise exception 'Só o dono do grupo pode tirar pessoas'; end if;
  delete from group_members where channel_id = p_channel and user_id = p_user;
  if not exists (select 1 from group_members where channel_id = p_channel) then delete from channels where id = p_channel; return; end if;
  if own = p_user then
    select user_id into nxt from group_members where channel_id = p_channel order by joined_at limit 1;
    update channels set owner_id = nxt where id = p_channel;
  end if;
end $$;
create or replace function public.group_update(p_channel uuid, p_name text, p_icon text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_group_member(p_channel) then raise exception 'Você não está nesse grupo'; end if;
  update channels set name = left(coalesce(nullif(trim(p_name), ''), name), 40), icon_url = coalesce(p_icon, icon_url) where id = p_channel and kind = 'group';
end $$;

-- tempo em call (cada aparelho avisa a cada minuto enquanto está na chamada)
create table if not exists public.voice_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  channel_id uuid references public.channels(id) on delete set null,
  server_id uuid references public.servers(id) on delete cascade,
  started_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);
create index if not exists voice_sessions_srv_idx on public.voice_sessions (server_id, started_at);
alter table public.voice_sessions enable row level security;
drop policy if exists "minhas sessoes" on public.voice_sessions;
create policy "minhas sessoes" on public.voice_sessions for select to authenticated using (user_id = auth.uid());
create or replace function public.voice_ping(p_session uuid, p_channel uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare sid uuid; id_ uuid;
begin
  if p_session is not null then
    update voice_sessions set last_seen = now() where id = p_session and user_id = auth.uid() and last_seen > now() - interval '5 minutes' returning id into id_;
    if id_ is not null then return id_; end if;
  end if;
  if not public.can_access_channel(p_channel) then return null; end if;
  select server_id into sid from channels where id = p_channel;
  insert into voice_sessions (user_id, channel_id, server_id) values (auth.uid(), p_channel, sid) returning id into id_;
  return id_;
end $$;

-- estatísticas do servidor (só membros veem)
create or replace function public.server_stats(p_server uuid, p_days int default 30) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare since timestamptz := now() - make_interval(days => least(greatest(p_days, 1), 365)); r jsonb;
begin
  if not public.is_member(p_server) then raise exception 'Só membros veem as estatísticas'; end if;
  with msgs as (
    select m.author_id, m.created_at, m.channel_id from messages m join channels c on c.id = m.channel_id
    where c.server_id = p_server and m.created_at >= since and public.can_view_channel(c.id)
  ), vs as (
    select user_id, channel_id, started_at, greatest(0, extract(epoch from (last_seen - started_at)) / 60) mins from voice_sessions
    where server_id = p_server and started_at >= since
  )
  select jsonb_build_object(
    'days', p_days,
    'messages', (select count(*) from msgs),
    'members', (select count(*) from server_members where server_id = p_server),
    'new_members', (select count(*) from server_members where server_id = p_server and joined_at >= since),
    'voice_minutes', (select coalesce(round(sum(mins)), 0) from vs),
    'top_chatters', coalesce((select jsonb_agg(x order by n desc) from (select author_id uid, count(*) n from msgs group by 1 order by 2 desc limit 10) x), '[]'),
    'top_voice', coalesce((select jsonb_agg(x order by mins desc) from (select user_id uid, round(sum(mins)) mins from vs group by 1 having sum(mins) >= 1 order by 2 desc limit 10) x), '[]'),
    'top_channels', coalesce((select jsonb_agg(x order by n desc) from (select channel_id cid, count(*) n from msgs group by 1 order by 2 desc limit 6) x), '[]'),
    'heat', coalesce((select jsonb_agg(jsonb_build_array(d, h, n)) from (
        select extract(dow from created_at at time zone 'America/Sao_Paulo')::int d, extract(hour from created_at at time zone 'America/Sao_Paulo')::int h, count(*) n from msgs group by 1, 2) x), '[]'),
    'voice_heat', coalesce((select jsonb_agg(jsonb_build_array(h, round(m))) from (
        select extract(hour from started_at at time zone 'America/Sao_Paulo')::int h, sum(mins) m from vs group by 1) x), '[]'),
    'per_day', coalesce((select jsonb_agg(jsonb_build_array(d, n) order by d) from (
        select (created_at at time zone 'America/Sao_Paulo')::date d, count(*) n from msgs group by 1) x), '[]')
  ) into r;
  return r;
end $$;


-- =====================================================================
-- v6.9: BOAS-VINDAS DO TELÃO, MODO PALCO, JOGOS NA CHAMADA (e fim do filtro anti-nudez)
-- =====================================================================
-- conta oficial "Telão" (não faz login: não tem senha). Ela manda a DM de boas-vindas.
create or replace function public.telao_bot() returns uuid language sql immutable as $$ select '7e1a0000-0000-4000-a000-000000000001'::uuid $$;
do $$
declare uname text := 'telao';
begin
  begin
    if not exists (select 1 from auth.users where id = public.telao_bot()) then
      perform set_config('telao.skip_profile', '1', true);
      begin
        insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
          confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current, phone_change, phone_change_token, reauthentication_token)
        values (public.telao_bot(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'oficial@telao.invalid', '', now(),
          '{"provider":"email","providers":["email"]}', '{"username":"telao","display_name":"Telão"}', now(), now(), '', '', '', '', '', '', '', '');
      exception when undefined_column then
        insert into auth.users (id, email, raw_user_meta_data) values (public.telao_bot(), 'oficial@telao.invalid', '{"username":"telao","display_name":"Telão"}');
      end;
      perform set_config('telao.skip_profile', '', true);
    end if;
    if exists (select 1 from public.profiles p where p.username = 'telao' and p.id <> public.telao_bot()) then uname := 'telao_oficial'; end if;
    insert into public.profiles (id, username, display_name, avatar_color, avatar_url)
    values (public.telao_bot(), uname, 'Telão', '#ff2e9a', '/icons/icon-512.png')
    on conflict (id) do nothing;
    perform set_config('telao.priv_ok', '1', true);
    update public.profiles set display_name = 'Telão', avatar_url = '/icons/icon-512.png', avatar_color = '#ff2e9a' where id = public.telao_bot();
    perform set_config('telao.priv_ok', '', true);
  exception when others then
    perform set_config('telao.skip_profile', '', true);
    raise notice 'Não deu para criar a conta oficial do Telão agora (%). O resto do script continua normalmente.', sqlerrm;
  end;
  -- fim do filtro anti-nudez: ninguém fica mais bloqueado de transmitir
  perform set_config('telao.priv_ok', '1', true);
  update public.profiles set share_block_until = null where share_block_until is not null;
  perform set_config('telao.priv_ok', '', true);
end $$;

-- DM de boas-vindas (uma vez por conta)
create or replace function public.send_welcome(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare bot uuid := public.telao_bot(); cid uuid; nm text;
begin
  if p_user = bot or not exists (select 1 from profiles where id = bot) then return; end if;
  if exists (select 1 from channels where kind = 'dm' and dm_a = least(bot, p_user) and dm_b = greatest(bot, p_user)) then return; end if;
  insert into channels (name, kind, dm_a, dm_b, dm_status) values ('dm', 'dm', least(bot, p_user), greatest(bot, p_user), 'ok') returning id into cid;
  select display_name into nm from profiles where id = p_user;
  insert into messages (channel_id, author_id, content, attachments)
  values (cid, bot, 'Bem-vindo(a) ao Telão, ' || coalesce(nm, '') || '! 🎉', jsonb_build_array(jsonb_build_object('type', 'welcome', 'name', nm)));
end $$;
revoke execute on function public.send_welcome(uuid) from public, anon, authenticated;
create or replace function public.welcome_new_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin perform public.send_welcome(new.id); exception when others then null; end;  -- nunca atrapalha o cadastro
  return new;
end $$;
drop trigger if exists welcome_new_profile on public.profiles;
create trigger welcome_new_profile after insert on public.profiles for each row execute function public.welcome_new_profile();
-- só o dono do Telão: manda as boas-vindas para todas as contas que ainda não receberam
create or replace function public.send_welcome_all() returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  if not public.is_admin_user() and coalesce(current_setting('request.jwt.claims', true), '') <> '' then raise exception 'Só o dono do Telão'; end if;
  for r in select id from profiles where id <> public.telao_bot() loop
    if not exists (select 1 from channels where kind = 'dm' and dm_a = least(public.telao_bot(), r.id) and dm_b = greatest(public.telao_bot(), r.id)) then
      perform public.send_welcome(r.id); n := n + 1;
    end if;
  end loop;
  return n;
end $$;
-- o dono do Telão recebe a dele agora, para ver como ficou
do $$ begin perform public.send_welcome(u.id) from auth.users u where u.email = 'brabont1@gmail.com'; exception when others then null; end $$;

-- a conta oficial não recebe respostas nem pedidos de amizade
create or replace function public.no_bot_friends() returns trigger language plpgsql as $$
begin
  if public.telao_bot() in (new.requester, new.addressee) then raise exception 'A conta oficial do Telão não aceita amizades.'; end if;
  return new;
end $$;
drop trigger if exists no_bot_friends on public.friendships;
create trigger no_bot_friends before insert on public.friendships for each row execute function public.no_bot_friends();

-- ---------- modo palco (canal de voz em que só quem está no palco fala) ----------
alter table public.channels add column if not exists stage boolean not null default false;
alter table public.channels add column if not exists stage_topic text check (stage_topic is null or char_length(stage_topic) <= 120);
create table if not exists public.stage_queue (
  channel_id uuid not null references public.channels(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null check (status in ('hand','speaker')),
  created_at timestamptz not null default now(),
  primary key (channel_id, user_id)
);
alter table public.stage_queue enable row level security;
drop policy if exists "ver palco" on public.stage_queue;
create policy "ver palco" on public.stage_queue for select to authenticated using (public.can_access_channel(channel_id));
create or replace function public.stage_mod(p_channel uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from channels c join servers s on s.id = c.server_id where c.id = p_channel
    and (s.owner_id = auth.uid() or public.has_perm(c.server_id, 64) or public.has_perm(c.server_id, 1)));
$$;
-- p_status: 'hand' (levantar a mão, só para si), 'speaker' (subir no palco, só moderador), null (sair / tirar)
create or replace function public.stage_set(p_channel uuid, p_user uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.can_access_channel(p_channel) or not exists (select 1 from channels where id = p_channel and stage) then raise exception 'Este canal não é um palco'; end if;
  if p_status is null then
    if p_user <> auth.uid() and not public.stage_mod(p_channel) then raise exception 'Só moderadores tiram pessoas do palco'; end if;
    delete from stage_queue where channel_id = p_channel and user_id = p_user;
  elsif p_status = 'hand' then
    if p_user <> auth.uid() then raise exception 'Só dá para levantar a sua mão'; end if;
    insert into stage_queue (channel_id, user_id, status) values (p_channel, p_user, 'hand') on conflict (channel_id, user_id) do nothing;
  elsif p_status = 'speaker' then
    if not public.stage_mod(p_channel) then raise exception 'Só moderadores chamam para o palco'; end if;
    insert into stage_queue (channel_id, user_id, status) values (p_channel, p_user, 'speaker')
      on conflict (channel_id, user_id) do update set status = 'speaker', created_at = now();
  else raise exception 'status inválido'; end if;
end $$;

-- ---------- jogos na chamada: ranking por servidor ----------
create table if not exists public.game_scores (
  server_id uuid not null references public.servers(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  game text not null check (game in ('rabisco','quiz','provavel')),
  points bigint not null default 0,
  wins int not null default 0,
  played int not null default 0,
  last_at timestamptz,
  primary key (server_id, user_id, game)
);
alter table public.game_scores enable row level security;
drop policy if exists "ver ranking" on public.game_scores;
create policy "ver ranking" on public.game_scores for select to authenticated using (public.is_member(server_id));
create or replace function public.game_report(p_channel uuid, p_game text, p_points int, p_won boolean) returns void
language plpgsql security definer set search_path = public as $$
declare sid uuid; last timestamptz;
begin
  select server_id into sid from channels where id = p_channel;
  if sid is null then return; end if;                        -- chamada de DM/grupo não entra no ranking
  if not public.is_member(sid) then raise exception 'Você não está nesse servidor'; end if;
  select last_at into last from game_scores where server_id = sid and user_id = auth.uid() and game = p_game;
  if last is not null and last > now() - interval '45 seconds' then return; end if;   -- uma partida por vez
  insert into game_scores (server_id, user_id, game, points, wins, played, last_at)
  values (sid, auth.uid(), p_game, least(greatest(coalesce(p_points, 0), 0), 6000), case when p_won then 1 else 0 end, 1, now())
  on conflict (server_id, user_id, game) do update set points = game_scores.points + excluded.points, wins = game_scores.wins + excluded.wins,
    played = game_scores.played + 1, last_at = now();
end $$;


-- =====================================================================
-- v6.10: FECHAR CONVERSA (sem apagar) e AVISOS PELA CONTA OFICIAL
-- =====================================================================
-- cada pessoa pode tirar uma DM/grupo da lista; volta sozinha quando chega mensagem nova
create table if not exists public.dm_closed (
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  channel_id uuid not null references public.channels(id) on delete cascade,
  closed_at timestamptz not null default now(),
  primary key (user_id, channel_id)
);
alter table public.dm_closed enable row level security;
drop policy if exists "minhas conversas fechadas" on public.dm_closed;
create policy "minhas conversas fechadas" on public.dm_closed for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.can_view_channel(channel_id));
create or replace function public.reopen_dm() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from dm_closed where channel_id = new.channel_id;
  return new;
end $$;
drop trigger if exists reopen_dm on public.messages;
create trigger reopen_dm after insert on public.messages for each row execute function public.reopen_dm();

-- aviso do dono do Telão: chega na DM da conta oficial de todo mundo
create or replace function public.admin_broadcast(p_title text, p_body text default null, p_link text default null) returns int
language plpgsql security definer set search_path = public as $$
declare bot uuid := public.telao_bot(); r record; cid uuid; n int := 0;
begin
  if not public.is_admin_user() and coalesce(current_setting('request.jwt.claims', true), '') <> '' then raise exception 'Só o dono do Telão pode mandar avisos'; end if;
  if not exists (select 1 from profiles where id = bot) then raise exception 'A conta oficial do Telão ainda não existe (rode o supabase.sql)'; end if;
  if coalesce(trim(p_title), '') = '' then raise exception 'Escreva um título'; end if;
  for r in select id from profiles where id <> bot loop
    select id into cid from channels where kind = 'dm' and dm_a = least(bot, r.id) and dm_b = greatest(bot, r.id);
    if cid is null then
      insert into channels (name, kind, dm_a, dm_b, dm_status) values ('dm', 'dm', least(bot, r.id), greatest(bot, r.id), 'ok') returning id into cid;
    end if;
    insert into messages (channel_id, author_id, content, attachments)
    values (cid, bot, left(trim(p_title), 300), jsonb_build_array(jsonb_build_object('type', 'announce', 'title', left(trim(p_title), 120), 'body', left(p_body, 3500), 'link', nullif(trim(coalesce(p_link, '')), ''))));
    n := n + 1;
  end loop;
  return n;
end $$;


-- ---------- impulsos ilimitados para o dono do Telão ----------
alter table public.server_boosts drop constraint if exists server_boosts_slot_check;
alter table public.server_boosts add constraint server_boosts_slot_check check (slot between 1 and 999);
create or replace function public.boost_server(p_server uuid, p_slot int) returns void
language plpgsql security definer set search_path = public as $$
declare old_row server_boosts; adm boolean := public.is_admin_user(); maxs int;
begin
  if not public.has_plus(auth.uid()) then raise exception 'Impulsos são do Telão+'; end if;
  maxs := 3; if adm then maxs := 999; end if;
  if p_slot < 1 or p_slot > maxs then raise exception 'Impulso inválido'; end if;
  if not public.is_member(p_server) then raise exception 'Você não está nesse servidor'; end if;
  select * into old_row from server_boosts where user_id = auth.uid() and slot = p_slot;
  if found then
    if old_row.server_id = p_server then return; end if;
    if old_row.created_at > now() - interval '7 days' and not adm then
      raise exception 'Esse impulso só pode ser trocado em %', to_char(old_row.created_at + interval '7 days', 'DD/MM "às" HH24:MI');
    end if;
    update server_boosts set server_id = p_server, created_at = now() where user_id = auth.uid() and slot = p_slot;
  else
    insert into server_boosts (user_id, slot, server_id) values (auth.uid(), p_slot, p_server);
  end if;
end $$;
create or replace function public.unboost_server(p_slot int) returns void
language plpgsql security definer set search_path = public as $$
declare c timestamptz;
begin
  select created_at into c from server_boosts where user_id = auth.uid() and slot = p_slot;
  if c is null then return; end if;
  if c > now() - interval '7 days' and not public.is_admin_user() then
    raise exception 'Esse impulso só pode ser retirado em %', to_char(c + interval '7 days', 'DD/MM "às" HH24:MI');
  end if;
  delete from server_boosts where user_id = auth.uid() and slot = p_slot;
end $$;
-- dono do Telão: põe ou tira vários impulsos de uma vez num servidor
create or replace function public.admin_boost(p_server uuid, p_delta int) returns int
language plpgsql security definer set search_path = public as $$
declare i int; s int;
begin
  if not public.is_admin_user() then raise exception 'Só o dono do Telão'; end if;
  if not public.is_member(p_server) then raise exception 'Você não está nesse servidor'; end if;
  if p_delta > 0 then
    for i in 1..least(p_delta, 50) loop
      select min(g) into s from generate_series(1, 999) g where not exists (select 1 from server_boosts b where b.user_id = auth.uid() and b.slot = g);
      if s is null then exit; end if;
      insert into server_boosts (user_id, slot, server_id) values (auth.uid(), s, p_server);
    end loop;
  elsif p_delta < 0 then
    delete from server_boosts where (user_id, slot) in (
      select user_id, slot from server_boosts where user_id = auth.uid() and server_id = p_server order by slot desc limit -p_delta);
  end if;
  return (select count(*) from server_boosts where user_id = auth.uid() and server_id = p_server);
end $$;

-- ---------- categorias de verdade (criar vazia, renomear, reordenar, excluir) ----------
create table if not exists public.server_categories (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  position int not null default 0,
  created_at timestamptz not null default now(),
  unique (server_id, name)
);
alter table public.server_categories enable row level security;
drop policy if exists "ver categorias" on public.server_categories;
create policy "ver categorias" on public.server_categories for select to authenticated using (public.is_member(server_id));
-- as categorias que já existiam (no nome dos canais) viram categorias de verdade
insert into public.server_categories (server_id, name, position)
select server_id, category, (row_number() over (partition by server_id order by min(position)))::int
from public.channels where server_id is not null and category is not null group by server_id, category
on conflict (server_id, name) do nothing;

create or replace function public.category_save(p_server uuid, p_old text, p_new text, p_kind text default null) returns void
language plpgsql security definer set search_path = public as $$
declare nn text := left(trim(coalesce(p_new, '')), 40); pos int;
begin
  if not public.has_perm(p_server, 1) then raise exception 'Você não pode gerenciar canais'; end if;
  if nn = '' then raise exception 'Dê um nome para a categoria'; end if;
  if p_old is distinct from nn and exists (select 1 from server_categories where server_id = p_server and lower(name) = lower(nn)) then raise exception 'Já existe uma categoria com esse nome'; end if;
  if p_old is null then
    select coalesce(max(position), 0) + 1 into pos from server_categories where server_id = p_server;
    insert into server_categories (server_id, name, position) values (p_server, nn, pos);
    -- renomear o grupo automático ("Canais de texto"/"Canais de voz") transforma ele em categoria
    if p_kind in ('text','voice') then update channels set category = nn where server_id = p_server and category is null and kind = p_kind; end if;
  else
    update server_categories set name = nn where server_id = p_server and name = p_old;
    if not found then insert into server_categories (server_id, name, position) values (p_server, nn, 0); end if;
    update channels set category = nn where server_id = p_server and category = p_old;
  end if;
end $$;
create or replace function public.category_delete(p_server uuid, p_name text, p_delete_channels boolean default false) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm(p_server, 1) then raise exception 'Você não pode gerenciar canais'; end if;
  if p_delete_channels then delete from channels where server_id = p_server and category = p_name;
  else update channels set category = null where server_id = p_server and category = p_name; end if;
  delete from server_categories where server_id = p_server and name = p_name;
end $$;
-- nova ordem das categorias e dos canais (arrastar e soltar)
create or replace function public.layout_save(p_server uuid, p_cats text[], p_channels uuid[], p_channel_cats text[]) returns void
language plpgsql security definer set search_path = public as $$
declare i int;
begin
  if not public.has_perm(p_server, 1) then raise exception 'Você não pode gerenciar canais'; end if;
  if p_cats is not null then
    for i in 1..coalesce(array_length(p_cats, 1), 0) loop
      update server_categories set position = i where server_id = p_server and name = p_cats[i];
    end loop;
  end if;
  if p_channels is not null then
    for i in 1..coalesce(array_length(p_channels, 1), 0) loop
      update channels set position = i, category = nullif(p_channel_cats[i], '') where id = p_channels[i] and server_id = p_server;
    end loop;
  end if;
end $$;
-- duplicar canal (com todas as configurações, sem as mensagens)
create or replace function public.channel_duplicate(p_channel uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare c channels; nid uuid;
begin
  select * into c from channels where id = p_channel;
  if c.server_id is null or not public.has_perm(c.server_id, 1) then raise exception 'Você não pode gerenciar canais'; end if;
  insert into channels (server_id, name, kind, position, category, topic, nsfw, slowmode, readonly, allowed_roles, user_limit, bitrate, video_quality,
                        no_links, no_media, ptt_only, no_camera, no_screen, stage, stage_topic)
  values (c.server_id, left(c.name || case when c.kind = 'text' then '-copia' else ' (cópia)' end, 40), c.kind, c.position, c.category, c.topic, c.nsfw, c.slowmode, c.readonly,
          c.allowed_roles, c.user_limit, c.bitrate, c.video_quality, c.no_links, c.no_media, c.ptt_only, c.no_camera, c.no_screen, c.stage, c.stage_topic)
  returning id into nid;
  return nid;
end $$;


-- =====================================================================
-- v6.14: BACKUP DE SERVIDOR (baixar, copiar para outro, criar a partir de um arquivo)
-- só o dono do servidor ou quem tem Administrador (32)
-- =====================================================================
create or replace function public.server_admin(p_server uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_server_owner(p_server) or public.has_perm(p_server, 32);
$$;

create or replace function public.server_backup(p_server uuid, p_messages boolean default false) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare srv jsonb; r jsonb;
begin
  if not public.server_admin(p_server) then raise exception 'Só administradores do servidor podem fazer backup'; end if;
  select to_jsonb(s) - 'id' - 'owner_id' - 'invite_code' - 'created_at' - 'public_since' - 'vanity' into srv from servers s where id = p_server;
  select jsonb_build_object(
    'telao_backup', 1,
    'exported_at', now(),
    'server', srv,
    'roles', coalesce((select jsonb_agg((to_jsonb(x) - 'server_id' - 'created_at') order by x.position) from server_roles x where x.server_id = p_server), '[]'),
    'categories', coalesce((select jsonb_agg(jsonb_build_object('name', c.name, 'position', c.position) order by c.position) from server_categories c where c.server_id = p_server), '[]'),
    'channels', coalesce((select jsonb_agg((to_jsonb(c) - 'server_id' - 'created_at' - 'dm_a' - 'dm_b' - 'dm_status' - 'dm_requester' - 'owner_id' - 'icon_url') order by c.position) from channels c where c.server_id = p_server), '[]'),
    'emojis', coalesce((select jsonb_agg(jsonb_build_object('name', e.name, 'url', e.url, 'animated', e.animated)) from server_emojis e where e.server_id = p_server), '[]'),
    'messages', case when p_messages then coalesce((
      select jsonb_object_agg(cid, msgs) from (
        select c.id::text cid, (select jsonb_agg(jsonb_build_object('author', coalesce(p.display_name, 'alguém'), 'content', m.content, 'attachments', m.attachments, 'at', m.created_at) order by m.created_at)
          from (select * from messages mm where mm.channel_id = c.id order by mm.created_at desc limit 500) m left join profiles p on p.id = m.author_id) msgs
        from channels c where c.server_id = p_server and c.kind = 'text') t where msgs is not null), '{}') else null end
  ) into r;
  return r;
end $$;

-- p_mode 'replace': apaga canais, categorias, cargos e emojis do servidor e coloca os do backup
create or replace function public.server_restore(p_server uuid, p_backup jsonb, p_messages boolean default false, p_settings boolean default true) returns jsonb
language plpgsql security definer set search_path = public as $$
declare owner_ boolean := public.is_server_owner(p_server); rmap jsonb := '{}'; cmap jsonb := '{}'; x jsonb; nid uuid; base jsonb; ch channels;
  n_ch int := 0; n_role int := 0; n_emo int := 0; n_msg int := 0; ar uuid[]; bot uuid := public.telao_bot(); m jsonb; srvkeep jsonb;
begin
  if not public.server_admin(p_server) then raise exception 'Só administradores do servidor podem restaurar backup'; end if;
  if coalesce((p_backup->>'telao_backup')::int, 0) <> 1 then raise exception 'Esse arquivo não é um backup do Telão'; end if;
  if jsonb_typeof(p_backup->'channels') = 'array' and jsonb_array_length(p_backup->'channels') > 300 or jsonb_typeof(p_backup->'roles') = 'array' and jsonb_array_length(p_backup->'roles') > 150 then raise exception 'Backup grande demais'; end if;

  -- limpa o que existe hoje
  delete from channels where server_id = p_server;
  delete from server_categories where server_id = p_server;
  delete from server_roles where server_id = p_server;
  delete from server_emojis where server_id = p_server;

  -- configurações do servidor (sem dono, convite, endereço, tag e vitrine da comunidade)
  if p_settings and p_backup ? 'server' then
    select to_jsonb(s) into srvkeep from servers s where id = p_server;
    update servers set
      name = left(coalesce(nullif(p_backup->'server'->>'name', ''), name), 40),
      description = case when p_backup->'server' ? 'description' then left(p_backup->'server'->>'description', 200) else description end,
      icon_url = case when p_backup->'server' ? 'icon_url' then p_backup->'server'->>'icon_url' else icon_url end,
      banner_url = case when p_backup->'server' ? 'banner_url' then p_backup->'server'->>'banner_url' else banner_url end,
      icon_color = coalesce(nullif(p_backup->'server'->>'icon_color', ''), icon_color),
      accent = case when (p_backup->'server'->>'accent') ~ '^#[0-9a-fA-F]{6}$' then p_backup->'server'->>'accent' else accent end,
      nsfw = coalesce((p_backup->'server'->>'nsfw')::boolean, nsfw),
      verify_level = least(greatest(coalesce((p_backup->'server'->>'verify_level')::int, verify_level), 0), 3)
    where id = p_server;
  end if;

  -- cargos (quem não é o dono não cria cargo com Administrador/Gerenciar cargos)
  for x in select * from jsonb_array_elements(case when jsonb_typeof(p_backup->'roles') = 'array' then p_backup->'roles' else '[]'::jsonb end) loop
    insert into server_roles (server_id, name, color, position, perms, hoist)
    values (p_server, left(coalesce(x->>'name', 'cargo'), 32), coalesce(x->>'color', '#99aab5'), coalesce((x->>'position')::int, 0),
            case when owner_ then coalesce((x->>'perms')::int, 0) else coalesce((x->>'perms')::int, 0) & ~48 end, coalesce((x->>'hoist')::boolean, true))
    returning id into nid;
    rmap := rmap || jsonb_build_object(x->>'id', nid); n_role := n_role + 1;
  end loop;

  -- categorias
  insert into server_categories (server_id, name, position)
  select p_server, left(e->>'name', 40), coalesce((e->>'position')::int, 0) from jsonb_array_elements(case when jsonb_typeof(p_backup->'categories') = 'array' then p_backup->'categories' else '[]'::jsonb end) e
  where coalesce(e->>'name', '') <> '' on conflict (server_id, name) do nothing;

  -- canais: primeiro sem as regras (para as mensagens antigas entrarem), depois com tudo
  for x in select * from jsonb_array_elements(case when jsonb_typeof(p_backup->'channels') = 'array' then p_backup->'channels' else '[]'::jsonb end) loop
    if coalesce(x->>'kind', '') not in ('text', 'voice') then continue; end if;
    select array_agg((rmap->>r)::uuid) into ar from jsonb_array_elements_text(case when jsonb_typeof(x->'allowed_roles') = 'array' then x->'allowed_roles' else '[]'::jsonb end) r where rmap ? r;
    -- campos que faltarem (ex.: templates do Discord) ficam com o padrão
    base := '{"position":0,"nsfw":false,"slowmode":0,"readonly":false,"user_limit":0,"bitrate":96,"video_quality":"auto","no_links":false,"no_media":false,"ptt_only":false,"no_camera":false,"no_screen":false,"stage":false,"radio":false,"plaza":false}'::jsonb
      || jsonb_strip_nulls(x - 'id' - 'allowed_roles') || jsonb_build_object('id', gen_random_uuid(), 'server_id', p_server, 'created_at', now(),
      'slowmode', 0, 'readonly', false, 'no_links', false, 'no_media', false, 'allowed_roles', null, 'dm_a', null, 'dm_b', null, 'owner_id', null, 'dm_status', 'ok', 'dm_requester', null);
    ch := jsonb_populate_record(null::channels, base);
    ch.name := left(coalesce(ch.name, 'canal'), 40);
    insert into channels select ch.*;
    cmap := cmap || jsonb_build_object(x->>'id', ch.id); n_ch := n_ch + 1;
    -- mensagens antigas: entram pela conta oficial, com o nome de quem escreveu (ninguém é imitado)
    if p_messages and p_backup->'messages' ? (x->>'id') and exists (select 1 from profiles where id = bot) then
      for m in select * from jsonb_array_elements(case when jsonb_typeof(p_backup->'messages'->(x->>'id')) = 'array' then p_backup->'messages'->(x->>'id') else '[]'::jsonb end) loop
        insert into messages (channel_id, author_id, content, attachments, created_at)
        values (ch.id, bot, left('**' || coalesce(m->>'author', 'alguém') || '** · ' || to_char(coalesce((m->>'at')::timestamptz, now()) at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') || E'\n' || coalesce(m->>'content', ''), 4000),
                coalesce(m->'attachments', '[]'), coalesce((m->>'at')::timestamptz, now()));
        n_msg := n_msg + 1;
      end loop;
    end if;
    update channels set slowmode = least(greatest(coalesce((x->>'slowmode')::int, 0), 0), 21600), readonly = coalesce((x->>'readonly')::boolean, false),
      no_links = coalesce((x->>'no_links')::boolean, false), no_media = coalesce((x->>'no_media')::boolean, false),
      allowed_roles = case when cardinality(ar) > 0 then ar else null end
    where id = ch.id;
  end loop;

  -- emojis
  for x in select * from jsonb_array_elements(case when jsonb_typeof(p_backup->'emojis') = 'array' then p_backup->'emojis' else '[]'::jsonb end) loop
    begin
      insert into server_emojis (server_id, name, url, animated) values (p_server, x->>'name', x->>'url', coalesce((x->>'animated')::boolean, false));
      n_emo := n_emo + 1;
    exception when others then null;   -- passou do limite do nível ou nome repetido
    end;
  end loop;
  return jsonb_build_object('channels', n_ch, 'roles', n_role, 'emojis', n_emo, 'messages', n_msg);
end $$;

-- v6.14: preferências pessoais que viajam entre aparelhos (ordem e pastas dos servidores na barra)
create table if not exists public.user_prefs (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  rail jsonb not null default '[]' check (jsonb_typeof(rail) = 'array' and pg_column_size(rail) < 60000),
  updated_at timestamptz not null default now()
);
alter table public.user_prefs enable row level security;
drop policy if exists "prefs own read" on public.user_prefs;
create policy "prefs own read" on public.user_prefs for select using (user_id = auth.uid());
drop policy if exists "prefs own insert" on public.user_prefs;
create policy "prefs own insert" on public.user_prefs for insert with check (user_id = auth.uid());
drop policy if exists "prefs own update" on public.user_prefs;
create policy "prefs own update" on public.user_prefs for update using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update on public.user_prefs to authenticated;

-- =====================================================================
-- v6.15: RÁDIO, CLIPES DA SEMANA, MURAL, CONQUISTAS, ANIVERSÁRIOS, RETROSPECTIVA, JOGOS e REGRAS DA COMUNIDADE
-- =====================================================================
alter table public.channels add column if not exists radio boolean not null default false;
alter table public.servers add column if not exists rules_on boolean not null default false;
alter table public.servers add column if not exists rules_text text check (rules_text is null or char_length(rules_text) <= 4000);
alter table public.server_members add column if not exists rules_accepted_at timestamptz;
alter table public.profiles add column if not exists bday_show boolean not null default false;
alter table public.profiles add column if not exists bday_greeted int;
create index if not exists messages_author_idx on public.messages (author_id, created_at);
create index if not exists reactions_user_idx on public.message_reactions (user_id);

-- regras antes de entrar: quem ainda não é membro vê nome, ícone e o texto
create or replace function public.server_rules_preview(p_server uuid default null, p_code text default null) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', s.id, 'name', s.name, 'icon_url', s.icon_url, 'icon_color', s.icon_color, 'rules_on', s.rules_on, 'rules_text', s.rules_text,
    'members', (select count(*) from server_members m where m.server_id = s.id))
  from servers s
  where (p_server is not null and s.id = p_server and (s.is_public or public.is_member(s.id)))
     or (p_code is not null and s.invite_code = lower(trim(p_code)))
  limit 1;
$$;
-- marca quando a pessoa aceitou (o join chama com p_accept = true)
create or replace function public.mark_rules_accepted() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from servers where id = new.server_id and rules_on) then new.rules_accepted_at := now(); end if;
  return new;
end $$;
drop trigger if exists mark_rules_accepted on public.server_members;
create trigger mark_rules_accepted before insert on public.server_members for each row execute function public.mark_rules_accepted();

-- clipes da semana (votos = quantas pessoas reagiram)
create or replace function public.server_top_clips(p_server uuid, p_week int default 0) returns table (
  message_id uuid, channel_id uuid, author_id uuid, content text, attachments jsonb, created_at timestamptz, votes int, mine boolean)
language plpgsql stable security definer set search_path = public as $$
declare w0 timestamptz := date_trunc('week', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo' - make_interval(weeks => greatest(p_week, 0));
begin
  if not public.is_member(p_server) then raise exception 'Só membros veem os clipes do servidor'; end if;
  return query
  select m.id, m.channel_id, m.author_id, m.content, m.attachments, m.created_at,
    (select count(distinct r.user_id)::int from message_reactions r where r.message_id = m.id and r.emoji not like 'opt:%'),
    exists (select 1 from message_reactions r where r.message_id = m.id and r.user_id = auth.uid() and r.emoji = '🔥')
  from messages m join channels c on c.id = m.channel_id
  where c.server_id = p_server and m.created_at >= w0 and m.created_at < w0 + interval '7 days'
    and public.can_access_channel(c.id)
    and exists (select 1 from jsonb_array_elements(case when jsonb_typeof(m.attachments) = 'array' then m.attachments else '[]'::jsonb end) a
                where (a->>'clip')::boolean is true or (a->>'type') like 'video/%')
  order by 7 desc, m.created_at desc
  limit 30;
end $$;

-- mural do servidor: mensagens marcadas com ⭐
create or replace function public.server_wall(p_server uuid, p_before timestamptz default null) returns table (
  message_id uuid, channel_id uuid, author_id uuid, content text, attachments jsonb, created_at timestamptz, stars int, starred_at timestamptz, mine boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_member(p_server) then raise exception 'Só membros veem o mural'; end if;
  return query
  select m.id, m.channel_id, m.author_id, m.content, m.attachments, m.created_at, st.n, st.last, st.mine
  from (select r.message_id, count(*)::int n, max(r.created_at) last, bool_or(r.user_id = auth.uid()) mine
        from message_reactions r join channels c on c.id = r.channel_id
        where c.server_id = p_server and r.emoji = '⭐' group by r.message_id) st
  join messages m on m.id = st.message_id
  where public.can_access_channel(m.channel_id) and (p_before is null or st.last < p_before)
  order by st.last desc
  limit 40;
end $$;

-- tempo jogando (o app do Windows detecta o jogo aberto)
create table if not exists public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  game text not null check (char_length(game) between 1 and 60),
  started_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);
create index if not exists game_sessions_user_idx on public.game_sessions (user_id, started_at);
alter table public.game_sessions enable row level security;
drop policy if exists "meus jogos" on public.game_sessions;
create policy "meus jogos" on public.game_sessions for select to authenticated using (user_id = auth.uid());
create or replace function public.game_ping(p_session uuid, p_game text) returns uuid
language plpgsql security definer set search_path = public as $$
declare id_ uuid;
begin
  if auth.uid() is null or coalesce(trim(p_game), '') = '' then return null; end if;
  if p_session is not null then
    update game_sessions set last_seen = now() where id = p_session and user_id = auth.uid() and game = left(trim(p_game), 60) and last_seen > now() - interval '5 minutes' returning id into id_;
    if id_ is not null then return id_; end if;
  end if;
  insert into game_sessions (user_id, game) values (auth.uid(), left(trim(p_game), 60)) returning id into id_;
  return id_;
end $$;

-- conquistas: números de cada pessoa (calculados na hora)
create or replace function public.user_achievements(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'voice_min', coalesce((select sum(extract(epoch from (last_seen - started_at)) / 60)::int from voice_sessions where user_id = p_user), 0),
    'game_min', coalesce((select sum(extract(epoch from (last_seen - started_at)) / 60)::int from game_sessions where user_id = p_user), 0),
    'messages', (select count(*) from messages where author_id = p_user),
    'friends', (select count(*) from friendships where status = 'accepted' and p_user in (requester, addressee)),
    'servers_owned', (select count(*) from servers where owner_id = p_user),
    'servers', (select count(*) from server_members where user_id = p_user),
    'game_wins', coalesce((select sum(wins) from game_scores where user_id = p_user), 0),
    'clips', (select count(*) from messages m where m.author_id = p_user and m.attachments @> '[{"clip": true}]'),
    'reacts_got', (select count(*) from message_reactions r join messages m on m.id = r.message_id where m.author_id = p_user and r.user_id <> p_user),
    'stars_got', (select count(*) from message_reactions r join messages m on m.id = r.message_id where m.author_id = p_user and r.emoji = '⭐' and r.user_id <> p_user),
    'streak', coalesce((select streak from profiles where id = p_user), 0),
    'first_in', (select count(*) from server_members sm where sm.user_id = p_user and sm.role <> 'owner'
                 and not exists (select 1 from server_members o where o.server_id = sm.server_id and o.role <> 'owner' and o.joined_at < sm.joined_at)),
    'boosts', (select count(*) from server_boosts where user_id = p_user),
    'since', (select created_at from profiles where id = p_user));
$$;

-- aniversários: quem mostra o aniversário e faz hoje (horário de Brasília)
create or replace function public.bday_today(d date) returns boolean
language sql stable as $$
  select d is not null and (
    to_char(d, 'MM-DD') = to_char((now() at time zone 'America/Sao_Paulo')::date, 'MM-DD')
    or (to_char(d, 'MM-DD') = '02-29' and to_char((now() at time zone 'America/Sao_Paulo')::date, 'MM-DD') = '02-28'
        and not (extract(year from now())::int % 4 = 0 and (extract(year from now())::int % 100 <> 0 or extract(year from now())::int % 400 = 0))));
$$;
create or replace function public.server_birthdays(p_server uuid) returns setof uuid
language sql stable security definer set search_path = public as $$
  select p.id from server_members m join profiles p on p.id = m.user_id
  where m.server_id = p_server and public.is_member(p_server) and p.bday_show and public.bday_today(p.birthdate);
$$;
create or replace function public.friends_birthdays() returns setof uuid
language sql stable security definer set search_path = public as $$
  select p.id from friendships f join profiles p on p.id = case when f.requester = auth.uid() then f.addressee else f.requester end
  where f.status = 'accepted' and auth.uid() in (f.requester, f.addressee) and p.bday_show and public.bday_today(p.birthdate);
$$;
-- parabéns da conta oficial, uma vez por ano
create or replace function public.birthday_greet() returns boolean
language plpgsql security definer set search_path = public as $$
declare bot uuid := public.telao_bot(); me profiles; cid uuid; y int := extract(year from now() at time zone 'America/Sao_Paulo')::int;
begin
  select * into me from profiles where id = auth.uid();
  if me.id is null or not public.bday_today(me.birthdate) or coalesce(me.bday_greeted, 0) >= y or not exists (select 1 from profiles where id = bot) then return false; end if;
  update profiles set bday_greeted = y where id = me.id;
  select id into cid from channels where kind = 'dm' and dm_a = least(bot, me.id) and dm_b = greatest(bot, me.id);
  if cid is null then insert into channels (name, kind, dm_a, dm_b, dm_status) values ('dm', 'dm', least(bot, me.id), greatest(bot, me.id), 'ok') returning id into cid; end if;
  delete from dm_closed where channel_id = cid and user_id = me.id;
  insert into messages (channel_id, author_id, content, attachments)
  values (cid, bot, '🎂 Feliz aniversário, ' || me.display_name || '!', jsonb_build_array(jsonb_build_object('type', 'announce', 'title', '🎂 Feliz aniversário, ' || left(me.display_name, 60) || '!',
    'body', 'Hoje o dia é seu! A galera do Telão te deseja tudo de bom. 🎉' || E'\n\n' || 'Hoje você aparece com o selo 🎂 de aniversariante nos servidores.')));
  return true;
end $$;

-- retrospectiva do ano
create or replace function public.my_wrapped(p_year int default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); y int := coalesce(p_year, extract(year from now() at time zone 'America/Sao_Paulo')::int);
  a timestamptz := make_timestamptz(y, 1, 1, 0, 0, 0, 'America/Sao_Paulo'); b timestamptz := make_timestamptz(y + 1, 1, 1, 0, 0, 0, 'America/Sao_Paulo'); r jsonb;
begin
  if me is null then raise exception 'Entre na sua conta'; end if;
  select jsonb_build_object(
    'year', y,
    'voice_min', coalesce((select sum(extract(epoch from (last_seen - started_at)) / 60)::int from voice_sessions where user_id = me and started_at >= a and started_at < b), 0),
    'longest_call', coalesce((select max(extract(epoch from (last_seen - started_at)) / 60)::int from voice_sessions where user_id = me and started_at >= a and started_at < b), 0),
    'messages', (select count(*) from messages where author_id = me and created_at >= a and created_at < b),
    'days', (select count(distinct d) from (select (created_at at time zone 'America/Sao_Paulo')::date d from messages where author_id = me and created_at >= a and created_at < b
                                            union select (started_at at time zone 'America/Sao_Paulo')::date from voice_sessions where user_id = me and started_at >= a and started_at < b) x),
    'hour', (select extract(hour from created_at at time zone 'America/Sao_Paulo')::int from messages where author_id = me and created_at >= a and created_at < b group by 1 order by count(*) desc limit 1),
    'top_server', (select jsonb_build_object('id', s.id, 'name', s.name, 'icon_url', s.icon_url, 'icon_color', s.icon_color, 'n', x.n) from (
        select c.server_id sid, count(*) n from messages m join channels c on c.id = m.channel_id where m.author_id = me and c.server_id is not null and m.created_at >= a and m.created_at < b group by 1 order by 2 desc limit 1) x join servers s on s.id = x.sid),
    'top_channel', (select jsonb_build_object('name', c.name, 'server', s.name, 'n', count(*)) from messages m join channels c on c.id = m.channel_id join servers s on s.id = c.server_id
        where m.author_id = me and m.created_at >= a and m.created_at < b and c.kind = 'text' group by c.id, c.name, s.name order by count(*) desc limit 1),
    'top_friend', (select jsonb_build_object('id', o, 'n', n) from (
        select case when c.dm_a = me then c.dm_b else c.dm_a end o, count(*) n from messages m join channels c on c.id = m.channel_id
        where c.kind = 'dm' and me in (c.dm_a, c.dm_b) and m.created_at >= a and m.created_at < b and public.telao_bot() not in (c.dm_a, c.dm_b) group by 1 order by 2 desc limit 1) x),
    'top_emoji', (select jsonb_build_object('e', emoji, 'n', count(*)) from message_reactions where user_id = me and emoji not like 'opt:%' and created_at >= a and created_at < b group by emoji order by count(*) desc limit 1),
    'reacts_got', (select count(*) from message_reactions r join messages m on m.id = r.message_id where m.author_id = me and r.user_id <> me and r.created_at >= a and r.created_at < b),
    'clips', (select count(*) from messages where author_id = me and created_at >= a and created_at < b and attachments @> '[{"clip": true}]'),
    'new_friends', (select count(*) from friendships where status = 'accepted' and me in (requester, addressee) and created_at >= a and created_at < b),
    'top_game', (select jsonb_build_object('name', game, 'min', sum(extract(epoch from (last_seen - started_at)) / 60)::int) from game_sessions
        where user_id = me and started_at >= a and started_at < b group by game order by sum(last_seen - started_at) desc limit 1),
    'game_wins', coalesce((select sum(wins) from game_scores where user_id = me and last_at >= a and last_at < b), 0),
    'joined', (select count(*) from server_members where user_id = me and joined_at >= a and joined_at < b)
  ) into r;
  return r;
end $$;

grant execute on function public.server_rules_preview(uuid, text), public.server_top_clips(uuid, int), public.server_wall(uuid, timestamptz), public.game_ping(uuid, text),
  public.user_achievements(uuid), public.server_birthdays(uuid), public.friends_birthdays(), public.birthday_greet(), public.my_wrapped(int) to authenticated;

insert into public.app_notices (kind, title, body, version)
select 'update', 'Chegou a versão 6.15 do Telão',
'- **📻 Rádio do servidor:** canais de voz com música que todo mundo pede e ouve junto. Vote para pular.
- **📺 Assistir juntos melhorou:** fila de vídeos, passa sozinho para o próximo, velocidade sincronizada, e quem entra depois já cai no vídeo.
- **🎬 Clipes da semana:** vote com 🔥 nos melhores clipes do servidor e assista todos juntos na call.
- **⭐ Mural do servidor:** guarde os melhores prints, memes e frases (menu da mensagem → Pôr no mural).
- **🏅 Conquistas** no perfil, **🎂 aniversários** (ative em Perfil) e a sua **🎬 Retrospectiva do ano** (clique no seu nome lá embaixo).
- **🎮 Jogando agora:** no app do Windows, o jogo aberto aparece sozinho no seu perfil.
- Servidores da comunidade podem pedir para quem entra **aceitar as regras**.', '6.15'
where not exists (select 1 from public.app_notices where version = '6.15');

-- v6.19: cartão de convite no chat (qualquer pessoa logada com o código vê o básico do servidor)
create or replace function public.invite_preview(p_code text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', s.id, 'name', s.name, 'description', left(s.description, 300), 'icon_url', s.icon_url, 'icon_color', s.icon_color,
    'banner_url', s.banner_url, 'accent', s.accent, 'created_at', s.created_at, 'is_public', s.is_public, 'rules_on', coalesce(s.rules_on, false),
    'level', public.server_level(s.id),
    'members', (select count(*) from server_members m where m.server_id = s.id),
    'member_ids', (select coalesce(jsonb_agg(m.user_id), '[]'::jsonb) from (select user_id from server_members where server_id = s.id limit 3000) m),
    'in_call', (select count(distinct v.user_id) from voice_sessions v where v.server_id = s.id and v.last_seen > now() - interval '2 minutes'),
    'is_member', exists (select 1 from server_members m where m.server_id = s.id and m.user_id = auth.uid()),
    'banned', exists (select 1 from server_bans b where b.server_id = s.id and b.user_id = auth.uid()))
  from servers s where auth.uid() is not null and s.invite_code = lower(trim(p_code)) limit 1;
$$;
grant execute on function public.invite_preview(text) to authenticated;

-- =====================================================================
-- v6.21: FEED DE CLIPES (estilo Medal) e PRAÇA DO SERVIDOR
-- =====================================================================
alter table public.channels add column if not exists plaza boolean not null default false;

create table if not exists public.feed_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  video_url text not null check (video_url ~ '^https://'),
  thumb_url text check (thumb_url is null or thumb_url ~ '^https://'),
  title text not null check (char_length(title) between 1 and 100),
  game text check (game is null or char_length(game) <= 60),
  duration real,
  start_at real not null default 0,
  w int, h int,
  visibility text not null default 'public' check (visibility in ('public', 'friends')),
  views int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.feed_posts add column if not exists start_at real not null default 0;
create index if not exists feed_posts_created_idx on public.feed_posts (created_at desc);
create index if not exists feed_posts_user_idx on public.feed_posts (user_id, created_at desc);
create table if not exists public.feed_likes (
  post_id uuid not null references public.feed_posts(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create table if not exists public.feed_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.feed_posts(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists feed_comments_post_idx on public.feed_comments (post_id, created_at);
create table if not exists public.feed_views (
  post_id uuid not null references public.feed_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key (post_id, user_id)
);
create table if not exists public.follows (
  follower uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  followee uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower, followee),
  check (follower <> followee)
);
create or replace function public.can_see_post(p feed_posts) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (p.visibility = 'public' or p.user_id = auth.uid() or public.are_friends(p.user_id, auth.uid()) or public.is_admin_user());
$$;
alter table public.feed_posts enable row level security;
alter table public.feed_likes enable row level security;
alter table public.feed_comments enable row level security;
alter table public.feed_views enable row level security;
alter table public.follows enable row level security;
drop policy if exists "feed ver" on public.feed_posts;
create policy "feed ver" on public.feed_posts for select to authenticated using (public.can_see_post(feed_posts));
drop policy if exists "feed postar" on public.feed_posts;
create policy "feed postar" on public.feed_posts for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "feed editar" on public.feed_posts;
create policy "feed editar" on public.feed_posts for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "feed apagar" on public.feed_posts;
create policy "feed apagar" on public.feed_posts for delete to authenticated using (user_id = auth.uid() or public.is_admin_user());
drop policy if exists "likes ver" on public.feed_likes;
create policy "likes ver" on public.feed_likes for select to authenticated using (true);
drop policy if exists "likes dar" on public.feed_likes;
create policy "likes dar" on public.feed_likes for insert to authenticated with check (user_id = auth.uid() and exists (select 1 from feed_posts p where p.id = post_id and public.can_see_post(p)));
drop policy if exists "likes tirar" on public.feed_likes;
create policy "likes tirar" on public.feed_likes for delete to authenticated using (user_id = auth.uid());
drop policy if exists "coment ver" on public.feed_comments;
create policy "coment ver" on public.feed_comments for select to authenticated using (exists (select 1 from feed_posts p where p.id = post_id and public.can_see_post(p)));
drop policy if exists "coment fazer" on public.feed_comments;
create policy "coment fazer" on public.feed_comments for insert to authenticated with check (user_id = auth.uid() and exists (select 1 from feed_posts p where p.id = post_id and public.can_see_post(p)));
drop policy if exists "coment apagar" on public.feed_comments;
create policy "coment apagar" on public.feed_comments for delete to authenticated using (user_id = auth.uid() or public.is_admin_user() or exists (select 1 from feed_posts p where p.id = post_id and p.user_id = auth.uid()));
drop policy if exists "seguir ver" on public.follows;
create policy "seguir ver" on public.follows for select to authenticated using (true);
drop policy if exists "seguir" on public.follows;
create policy "seguir" on public.follows for insert to authenticated with check (follower = auth.uid());
drop policy if exists "deixar de seguir" on public.follows;
create policy "deixar de seguir" on public.follows for delete to authenticated using (follower = auth.uid());
grant select, insert, update, delete on public.feed_posts, public.feed_likes, public.feed_comments, public.follows to authenticated;
-- ninguém mexe nas visualizações direto
create or replace function public.feed_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and (new.views is distinct from old.views or new.user_id is distinct from old.user_id or new.video_url is distinct from old.video_url or new.created_at is distinct from old.created_at)
     and current_setting('telao.feed_ok', true) is distinct from '1' then
    raise exception 'Só dá para mudar título, jogo e quem vê.';
  end if;
  if tg_op = 'INSERT' then new.views := 0; new.created_at := now(); end if;
  return new;
end $$;
drop trigger if exists feed_guard on public.feed_posts;
create trigger feed_guard before insert or update on public.feed_posts for each row execute function public.feed_guard();
-- no máximo 30 clipes por dia por pessoa
create or replace function public.feed_rate() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from feed_posts where user_id = new.user_id and created_at > now() - interval '1 day') >= 30 then raise exception 'Você já postou 30 clipes hoje. Volte amanhã!'; end if;
  return new;
end $$;
drop trigger if exists feed_rate on public.feed_posts;
create trigger feed_rate before insert on public.feed_posts for each row execute function public.feed_rate();

create or replace function public.feed_view(p_post uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  insert into feed_views (post_id, user_id) values (p_post, auth.uid()) on conflict do nothing;
  if found then perform set_config('telao.feed_ok', '1', true); update feed_posts set views = views + 1 where id = p_post; end if;
end $$;

-- lista do feed: p_tab = 'top' (em alta), 'new' (recentes), 'following' (quem eu sigo), 'user' (de uma pessoa)
drop function if exists public.feed_list(text, uuid, text, int);
create or replace function public.feed_list(p_tab text default 'top', p_user uuid default null, p_game text default null, p_offset int default 0)
returns table (id uuid, user_id uuid, video_url text, thumb_url text, title text, game text, duration real, start_at real, w int, h int, visibility text, views int, created_at timestamptz,
  likes int, comments int, liked boolean, following boolean)
language sql stable security definer set search_path = public as $$
  select p.id, p.user_id, p.video_url, p.thumb_url, p.title, p.game, p.duration, p.start_at, p.w, p.h, p.visibility, p.views, p.created_at,
    (select count(*)::int from feed_likes l where l.post_id = p.id),
    (select count(*)::int from feed_comments c where c.post_id = p.id),
    exists (select 1 from feed_likes l where l.post_id = p.id and l.user_id = auth.uid()),
    exists (select 1 from follows f where f.follower = auth.uid() and f.followee = p.user_id)
  from feed_posts p
  where public.can_see_post(p)
    and (p_tab <> 'following' or exists (select 1 from follows f where f.follower = auth.uid() and f.followee = p.user_id))
    and (p_tab <> 'user' or p.user_id = p_user)
    and (p_game is null or p.game ilike p_game)
  order by case when p_tab = 'top' then
      ((select count(*) from feed_likes l where l.post_id = p.id) * 3 + (select count(*) from feed_comments c where c.post_id = p.id) * 2 + p.views * 0.2 + 1)
      / power(extract(epoch from (now() - p.created_at)) / 3600 + 2, 1.3) end desc nulls last,
    p.created_at desc
  limit 24 offset greatest(0, p_offset);
$$;
create or replace function public.feed_profile(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'clips', (select count(*) from feed_posts p where p.user_id = p_user and public.can_see_post(p)),
    'followers', (select count(*) from follows where followee = p_user),
    'following', (select count(*) from follows where follower = p_user),
    'likes', (select count(*) from feed_likes l join feed_posts p on p.id = l.post_id where p.user_id = p_user),
    'i_follow', exists (select 1 from follows where follower = auth.uid() and followee = p_user));
$$;
grant execute on function public.feed_view(uuid), public.feed_list(text, uuid, text, int), public.feed_profile(uuid) to authenticated;

-- v6.21: jogos novos no ranking
alter table public.game_scores drop constraint if exists game_scores_game_check;
alter table public.game_scores add constraint game_scores_game_check check (game in ('rabisco','quiz','provavel','stop','quemsou','truco','forca','naval','musica','telefone'));

-- =====================================================================
-- v6.23: FEED COM ATÉ 5 CLIPES POR POST e SELO DE VERIFICADO (100 seguidores)
-- =====================================================================
alter table public.feed_posts add column if not exists media jsonb not null default '[]'::jsonb;
alter table public.feed_posts add column if not exists pinned boolean not null default false;
alter table public.feed_posts add column if not exists pinned_comment uuid;
alter table public.feed_posts drop constraint if exists feed_posts_media_check;
alter table public.feed_posts add constraint feed_posts_media_check check (jsonb_typeof(media) = 'array' and jsonb_array_length(media) <= 5);
create or replace function public.is_verified(u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select 'verificado' = any(badges) or is_admin from profiles where id = u), false);
$$;
-- ganhou 100 seguidores: selo de verificado (fica para sempre)
create or replace function public.follows_verify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from follows where followee = new.followee) >= 100
     and not exists (select 1 from profiles where id = new.followee and 'verificado' = any(badges)) then
    perform set_config('telao.priv_ok', '1', true);
    update profiles set badges = array_append(badges, 'verificado') where id = new.followee;
    perform set_config('telao.priv_ok', '', true);
  end if;
  return new;
end $$;
drop trigger if exists follows_verify on public.follows;
create trigger follows_verify after insert on public.follows for each row execute function public.follows_verify();
-- regras extras do feed: verificado posta até 60 por dia, fixa até 3 clipes e fixa comentário
create or replace function public.feed_rate() returns trigger language plpgsql security definer set search_path = public as $$
declare lim int := case when public.is_verified(new.user_id) then 60 else 30 end;
begin
  if (select count(*) from feed_posts where user_id = new.user_id and created_at > now() - interval '1 day') >= lim then
    raise exception 'Você já postou % clipes hoje. Volte amanhã!', lim;
  end if;
  return new;
end $$;
create or replace function public.feed_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and (new.views is distinct from old.views or new.user_id is distinct from old.user_id or new.video_url is distinct from old.video_url
       or new.created_at is distinct from old.created_at or new.media is distinct from old.media)
     and current_setting('telao.feed_ok', true) is distinct from '1' then
    raise exception 'Só dá para mudar título, jogo e quem vê.';
  end if;
  if (tg_op = 'INSERT' and new.pinned) or (tg_op = 'UPDATE' and new.pinned and not old.pinned) then
    if not public.is_verified(new.user_id) then raise exception 'Fixar clipes no perfil é para criadores verificados (100 seguidores).'; end if;
    if (select count(*) from feed_posts where user_id = new.user_id and pinned and id <> new.id) >= 3 then raise exception 'Você já tem 3 clipes fixados. Desafixe um antes.'; end if;
  end if;
  if new.pinned_comment is distinct from (case when tg_op = 'UPDATE' then old.pinned_comment end) and new.pinned_comment is not null then
    if not public.is_verified(new.user_id) then raise exception 'Fixar comentário é para criadores verificados (100 seguidores).'; end if;
    if not exists (select 1 from feed_comments c where c.id = new.pinned_comment and c.post_id = new.id) then raise exception 'Comentário não encontrado.'; end if;
  end if;
  if tg_op = 'INSERT' then
    new.views := 0; new.created_at := now();
    if jsonb_array_length(new.media) = 0 then new.media := jsonb_build_array(jsonb_build_object('url', new.video_url, 'thumb', new.thumb_url, 'start', new.start_at, 'dur', new.duration, 'w', new.w, 'h', new.h)); end if;
    if exists (select 1 from jsonb_array_elements(new.media) m where coalesce(m->>'url', '') !~ '^https://') then raise exception 'Link de vídeo inválido.'; end if;
    new.video_url := new.media->0->>'url';
  end if;
  return new;
end $$;

drop function if exists public.feed_list(text, uuid, text, int);
create or replace function public.feed_list(p_tab text default 'top', p_user uuid default null, p_game text default null, p_offset int default 0)
returns table (id uuid, user_id uuid, video_url text, thumb_url text, title text, game text, duration real, start_at real, w int, h int, visibility text, views int, created_at timestamptz,
  likes int, comments int, liked boolean, following boolean, media jsonb, pinned boolean, pinned_comment uuid, verified boolean)
language sql stable security definer set search_path = public as $$
  select p.id, p.user_id, p.video_url, p.thumb_url, p.title, p.game, p.duration, p.start_at, p.w, p.h, p.visibility, p.views, p.created_at,
    (select count(*)::int from feed_likes l where l.post_id = p.id),
    (select count(*)::int from feed_comments c where c.post_id = p.id),
    exists (select 1 from feed_likes l where l.post_id = p.id and l.user_id = auth.uid()),
    exists (select 1 from follows f where f.follower = auth.uid() and f.followee = p.user_id),
    p.media, p.pinned, p.pinned_comment, public.is_verified(p.user_id)
  from feed_posts p
  where public.can_see_post(p)
    and (p_tab <> 'following' or exists (select 1 from follows f where f.follower = auth.uid() and f.followee = p.user_id))
    and (p_tab <> 'user' or p.user_id = p_user)
    and (p_game is null or p.game ilike p_game)
  order by case when p_tab = 'user' then p.pinned end desc nulls last,
    case when p_tab = 'top' then
      ((select count(*) from feed_likes l where l.post_id = p.id) * 3 + (select count(*) from feed_comments c where c.post_id = p.id) * 2 + p.views * 0.2 + 1)
      * (case when public.is_verified(p.user_id) then 1.3 else 1 end)
      / power(extract(epoch from (now() - p.created_at)) / 3600 + 2, 1.3) end desc nulls last,
    p.created_at desc
  limit 24 offset greatest(0, p_offset);
$$;
create or replace function public.feed_profile(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'clips', (select count(*) from feed_posts p where p.user_id = p_user and public.can_see_post(p)),
    'followers', (select count(*) from follows where followee = p_user),
    'following', (select count(*) from follows where follower = p_user),
    'likes', (select count(*) from feed_likes l join feed_posts p on p.id = l.post_id where p.user_id = p_user),
    'i_follow', exists (select 1 from follows where follower = auth.uid() and followee = p_user),
    'verified', public.is_verified(p_user));
$$;
-- painel de criador (só verificado vê o próprio)
create or replace function public.feed_creator_stats() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if not public.is_verified(me) then raise exception 'O painel de criador é para quem é verificado (100 seguidores).'; end if;
  return jsonb_build_object(
    'views', coalesce((select sum(views) from feed_posts where user_id = me), 0),
    'likes', (select count(*) from feed_likes l join feed_posts p on p.id = l.post_id where p.user_id = me),
    'comments', (select count(*) from feed_comments c join feed_posts p on p.id = c.post_id where p.user_id = me),
    'followers', (select count(*) from follows where followee = me),
    'new_followers_7d', (select count(*) from follows where followee = me and created_at > now() - interval '7 days'),
    'views_7d', (select count(*) from feed_views v join feed_posts p on p.id = v.post_id where p.user_id = me and p.created_at > now() - interval '7 days'),
    'top', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (select p.id, p.title, p.views, (select count(*) from feed_likes l where l.post_id = p.id) likes
              from feed_posts p where p.user_id = me order by p.views desc, p.created_at desc limit 5) x));
end $$;
grant execute on function public.is_verified(uuid), public.feed_creator_stats() to authenticated;

-- =====================================================================
-- v6.25: BLOQUEAR PESSOAS
-- Quem foi bloqueado não consegue te mandar DM, pedido de amizade nem começar conversa nova.
-- Nada avisa a pessoa bloqueada além de "não é possível mandar mensagem".
-- =====================================================================
create table if not exists public.user_blocks (
  blocker uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  blocked uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);
alter table public.user_blocks enable row level security;
drop policy if exists "meus bloqueios" on public.user_blocks;
create policy "meus bloqueios" on public.user_blocks for select to authenticated using (blocker = auth.uid());
drop policy if exists "bloquear" on public.user_blocks;
create policy "bloquear" on public.user_blocks for insert to authenticated with check (blocker = auth.uid());
drop policy if exists "desbloquear" on public.user_blocks;
create policy "desbloquear" on public.user_blocks for delete to authenticated using (blocker = auth.uid());

create or replace function public.is_blocked_between(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from user_blocks where (blocker = a and blocked = b) or (blocker = b and blocked = a));
$$;
-- bloquear também desfaz a amizade / pedido pendente
create or replace function public.user_blocks_after() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.blocked = '7e1a0000-0000-4000-a000-000000000001'::uuid then raise exception 'Não dá para bloquear a conta oficial do Telão.'; end if;
  delete from friendships where (requester = new.blocker and addressee = new.blocked) or (requester = new.blocked and addressee = new.blocker);
  return new;
end $$;
drop trigger if exists user_blocks_after on public.user_blocks;
create trigger user_blocks_after after insert on public.user_blocks for each row execute function public.user_blocks_after();

-- DM: nenhuma das duas pessoas manda mensagem enquanto houver bloqueio
create or replace function public.msg_block_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare c channels;
begin
  select * into c from channels where id = new.channel_id;
  if c.kind = 'dm' and public.is_blocked_between(c.dm_a, c.dm_b) then
    raise exception 'Não é possível mandar mensagem para essa pessoa.';
  end if;
  return new;
end $$;
drop trigger if exists msg_block_guard on public.messages;
create trigger msg_block_guard before insert on public.messages for each row execute function public.msg_block_guard();
-- conversa nova e pedido de amizade também não
create or replace function public.dm_block_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'dm' and public.is_blocked_between(new.dm_a, new.dm_b) then raise exception 'Não é possível mandar mensagem para essa pessoa.'; end if;
  return new;
end $$;
drop trigger if exists dm_block_guard on public.channels;
create trigger dm_block_guard before insert on public.channels for each row execute function public.dm_block_guard();
create or replace function public.friend_block_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_blocked_between(new.requester, new.addressee) then raise exception 'Não é possível adicionar essa pessoa.'; end if;
  return new;
end $$;
drop trigger if exists friend_block_guard on public.friendships;
create trigger friend_block_guard before insert or update on public.friendships for each row execute function public.friend_block_guard();
grant select, insert, delete on public.user_blocks to authenticated;
grant execute on function public.is_blocked_between(uuid, uuid) to authenticated;

-- =====================================================================
-- v6.27: SONS DO SERVIDOR (soundboard) e DENÚNCIAS
-- =====================================================================
create table if not exists public.server_sounds (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 24),
  emoji text check (emoji is null or char_length(emoji) <= 8),
  url text not null check (url ~ '^https://'),
  volume real not null default 1 check (volume between 0.1 and 1),
  created_by uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists server_sounds_srv on public.server_sounds (server_id);
alter table public.server_sounds enable row level security;
drop policy if exists "membros veem sons" on public.server_sounds;
create policy "membros veem sons" on public.server_sounds for select to authenticated using (public.is_member(server_id));
drop policy if exists "quem gerencia emojis envia sons" on public.server_sounds;
create policy "quem gerencia emojis envia sons" on public.server_sounds for insert to authenticated
  with check (created_by = auth.uid() and (public.has_perm(server_id, 512) or public.has_perm(server_id, 2)));
drop policy if exists "quem gerencia emojis muda sons" on public.server_sounds;
create policy "quem gerencia emojis muda sons" on public.server_sounds for update to authenticated
  using (public.has_perm(server_id, 512) or public.has_perm(server_id, 2)) with check (public.has_perm(server_id, 512) or public.has_perm(server_id, 2));
drop policy if exists "quem gerencia emojis apaga sons" on public.server_sounds;
create policy "quem gerencia emojis apaga sons" on public.server_sounds for delete to authenticated
  using (public.has_perm(server_id, 512) or public.has_perm(server_id, 2));
create or replace function public.server_sounds_limit() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from server_sounds where server_id = new.server_id) >= 24 then raise exception 'Este servidor já tem 24 sons. Apague um antes.'; end if;
  return new;
end $$;
drop trigger if exists server_sounds_limit on public.server_sounds;
create trigger server_sounds_limit before insert on public.server_sounds for each row execute function public.server_sounds_limit();
grant select, insert, update, delete on public.server_sounds to authenticated;

create table if not exists public.message_reports (
  id uuid primary key default gen_random_uuid(),
  message_id uuid references public.messages(id) on delete set null,
  server_id uuid references public.servers(id) on delete cascade,
  channel_id uuid,
  reporter uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  content text,
  attachments jsonb,
  reason text not null check (reason in ('spam','ofensa','assedio','nsfw','golpe','outro')),
  details text check (details is null or char_length(details) <= 500),
  status text not null default 'open' check (status in ('open','resolved','dismissed')),
  action text,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists message_reports_once on public.message_reports (message_id, reporter);
create index if not exists message_reports_srv on public.message_reports (server_id, status, created_at desc);
alter table public.message_reports enable row level security;
create or replace function public.can_mod_reports(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case when sid is null then public.is_admin_user() else public.has_perm(sid, 8) or public.has_perm(sid, 64) end;
$$;
drop policy if exists "ver denúncias" on public.message_reports;
create policy "ver denúncias" on public.message_reports for select to authenticated
  using (reporter = auth.uid() or public.can_mod_reports(server_id));
drop policy if exists "denunciar" on public.message_reports;
create policy "denunciar" on public.message_reports for insert to authenticated with check (reporter = auth.uid());
-- quem denuncia só manda message_id, motivo e detalhes; o resto vem do banco (foto da mensagem na hora)
create or replace function public.message_reports_fill() returns trigger
language plpgsql security definer set search_path = public as $$
declare m messages; c channels;
begin
  new.reporter := auth.uid();
  select * into m from messages where id = new.message_id;
  if m.id is null or not public.can_access_channel(m.channel_id) then raise exception 'Mensagem não encontrada.'; end if;
  if m.author_id = auth.uid() then raise exception 'Você não pode denunciar a própria mensagem.'; end if;
  if (select count(*) from message_reports where reporter = auth.uid() and created_at > now() - interval '1 day') >= 20 then
    raise exception 'Você já fez muitas denúncias hoje. Tente amanhã.';
  end if;
  select * into c from channels where id = m.channel_id;
  new.server_id := c.server_id; new.channel_id := m.channel_id; new.author_id := m.author_id;
  new.content := left(m.content, 4000);
  new.attachments := (select to_jsonb(m) -> 'attachments');
  new.status := 'open'; new.action := null; new.resolved_by := null; new.resolved_at := null; new.created_at := now();
  return new;
end $$;
drop trigger if exists message_reports_fill on public.message_reports;
create trigger message_reports_fill before insert on public.message_reports for each row execute function public.message_reports_fill();
create or replace function public.resolve_report(p_id uuid, p_status text, p_action text default null) returns void
language plpgsql security definer set search_path = public as $$
declare r message_reports;
begin
  select * into r from message_reports where id = p_id;
  if r.id is null then raise exception 'Denúncia não encontrada.'; end if;
  if not public.can_mod_reports(r.server_id) then raise exception 'Sem permissão.'; end if;
  if p_status not in ('open','resolved','dismissed') then raise exception 'Status inválido.'; end if;
  -- resolve todas as denúncias da mesma mensagem de uma vez
  update message_reports set status = p_status, action = left(p_action, 60),
    resolved_by = case when p_status = 'open' then null else auth.uid() end,
    resolved_at = case when p_status = 'open' then null else now() end
  where (r.message_id is not null and message_id = r.message_id) or id = r.id;
end $$;
grant select, insert on public.message_reports to authenticated;
grant execute on function public.can_mod_reports(uuid), public.resolve_report(uuid, text, text) to authenticated;

-- v6.27: jogos novos no ranking
alter table public.game_scores drop constraint if exists game_scores_game_check;
alter table public.game_scores add constraint game_scores_game_check check (game in ('rabisco','quiz','provavel','stop','quemsou','truco','forca','naval','musica','telefone'));

-- =====================================================================
-- v6.30: FIXAR CONVERSAS (DMs e grupos no topo da lista, até 10)
-- =====================================================================
create table if not exists public.dm_pins (
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  channel_id uuid not null references public.channels(id) on delete cascade,
  pinned_at timestamptz not null default now(),
  primary key (user_id, channel_id)
);
alter table public.dm_pins enable row level security;
drop policy if exists "minhas conversas fixadas" on public.dm_pins;
create policy "minhas conversas fixadas" on public.dm_pins for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.can_view_channel(channel_id));
create or replace function public.dm_pins_limit() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from dm_pins where user_id = new.user_id) >= 10 then raise exception 'Você já tem 10 conversas fixadas. Desafixe uma antes.'; end if;
  return new;
end $$;
drop trigger if exists dm_pins_limit on public.dm_pins;
create trigger dm_pins_limit before insert on public.dm_pins for each row execute function public.dm_pins_limit();
grant select, insert, update, delete on public.dm_pins to authenticated;

-- =====================================================================
-- v6.31: SALVOS, MÚSICA DO PERFIL, ANIVERSÁRIOS DO SERVIDOR, BICHINHO DO SERVIDOR e CARTÃO DE ESTATÍSTICAS
-- =====================================================================
-- mensagens salvas (só você vê; guarda uma cópia para não sumir se apagarem)
create table if not exists public.saved_messages (
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  message_id uuid not null,
  channel_id uuid,
  author_id uuid,
  content text,
  attachments jsonb,
  msg_at timestamptz,
  note text check (note is null or char_length(note) <= 200),
  saved_at timestamptz not null default now(),
  primary key (user_id, message_id)
);
alter table public.saved_messages enable row level security;
drop policy if exists "meus salvos" on public.saved_messages;
create policy "meus salvos" on public.saved_messages for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create or replace function public.saved_fill() returns trigger language plpgsql security definer set search_path = public as $$
declare m messages;
begin
  new.user_id := auth.uid();
  select * into m from messages where id = new.message_id;
  if m.id is null or not public.can_access_channel(m.channel_id) then raise exception 'Mensagem não encontrada.'; end if;
  if (select count(*) from saved_messages where user_id = auth.uid()) >= 500 then raise exception 'Você já tem 500 mensagens salvas. Apague algumas antes.'; end if;
  new.channel_id := m.channel_id; new.author_id := m.author_id; new.content := left(m.content, 4000);
  new.attachments := (select to_jsonb(m) -> 'attachments'); new.msg_at := m.created_at; new.saved_at := now();
  return new;
end $$;
drop trigger if exists saved_fill on public.saved_messages;
create trigger saved_fill before insert on public.saved_messages for each row execute function public.saved_fill();
grant select, insert, update, delete on public.saved_messages to authenticated;

-- música do perfil (trecho de 30 s da busca do iTunes)
alter table public.profiles add column if not exists theme_song jsonb;
alter table public.profiles drop constraint if exists profiles_theme_song_check;
alter table public.profiles add constraint profiles_theme_song_check check (theme_song is null or (jsonb_typeof(theme_song) = 'object'
  and coalesce(theme_song->>'preview', '') ~ '^https://[a-z0-9.-]*(mzstatic\.com|itunes\.apple\.com|apple\.com|supabase\.co/storage/)' and char_length(theme_song::text) < 1200));

-- aniversários do servidor: calendário e parabéns automático no dia
alter table public.servers add column if not exists bday_on boolean not null default true;
alter table public.servers add column if not exists bday_channel uuid;
create table if not exists public.server_bday_posts (
  server_id uuid not null references public.servers(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  year int not null,
  primary key (server_id, user_id, year)
);
alter table public.server_bday_posts enable row level security;
create or replace function public.server_bday_calendar(p_server uuid) returns table (user_id uuid, month int, day int)
language sql stable security definer set search_path = public as $$
  select p.id, extract(month from p.birthdate)::int, extract(day from p.birthdate)::int
  from server_members m join profiles p on p.id = m.user_id
  where m.server_id = p_server and public.is_member(p_server) and p.bday_show and p.birthdate is not null
  order by 2, 3;
$$;
-- qualquer membro que abre o servidor no dia dispara (uma vez por pessoa por ano)
create or replace function public.server_bday_announce(p_server uuid) returns int
language plpgsql security definer set search_path = public as $$
declare s servers; cid uuid; y int := extract(year from now() at time zone 'America/Sao_Paulo')::int; r record; n int := 0;
begin
  if not public.is_member(p_server) then return 0; end if;
  select * into s from servers where id = p_server;
  if s.id is null or not s.bday_on then return 0; end if;
  cid := s.bday_channel;
  if cid is null or not exists (select 1 from channels where id = cid and server_id = p_server and kind = 'text') then
    select id into cid from channels where server_id = p_server and kind = 'text' order by position, created_at limit 1;
  end if;
  if cid is null then return 0; end if;
  for r in select p.id, p.display_name, p.username from server_members m join profiles p on p.id = m.user_id
           where m.server_id = p_server and p.bday_show and public.bday_today(p.birthdate)
             and not exists (select 1 from server_bday_posts b where b.server_id = p_server and b.user_id = p.id and b.year = y) loop
    insert into server_bday_posts values (p_server, r.id, y) on conflict do nothing;
    if found then
      insert into messages (channel_id, author_id, content, attachments)
      values (cid, public.telao_bot(), '🎂 Hoje é aniversário de @' || r.username || '! Deixa um parabéns aí 🎉',
        jsonb_build_array(jsonb_build_object('type', 'bday', 'user_id', r.id, 'name', left(r.display_name, 60))));
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

-- bichinho do servidor: cresce com a galera conversando, em call e fazendo carinho; definha se o servidor ficar parado
alter table public.servers add column if not exists pet_on boolean not null default false;   -- v6.32: o bichinho é opcional
create table if not exists public.server_pets (
  server_id uuid primary key references public.servers(id) on delete cascade,
  name text not null default 'Telinho' check (char_length(name) between 1 and 20),
  species text not null default 'slime' check (species in ('slime','gato','dragao','robo','fantasma','pato')),
  color text not null default '#ff2e9a' check (color ~ '^#[0-9a-fA-F]{6}$'),
  xp int not null default 0,
  last_active timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table public.server_pets enable row level security;
drop policy if exists "membros veem o bichinho" on public.server_pets;
create policy "membros veem o bichinho" on public.server_pets for select to authenticated using (public.is_member(server_id));
create table if not exists public.pet_contrib (
  server_id uuid not null references public.servers(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  day date not null default (now() at time zone 'America/Sao_Paulo')::date,
  msg_xp int not null default 0,
  voice_xp int not null default 0,
  petted boolean not null default false,
  last_voice timestamptz,
  primary key (server_id, user_id, day)
);
alter table public.pet_contrib add column if not exists last_voice timestamptz;
alter table public.pet_contrib enable row level security;
drop policy if exists "membros veem quem cuida" on public.pet_contrib;
create policy "membros veem quem cuida" on public.pet_contrib for select to authenticated using (public.is_member(server_id));
create or replace function public.pet_add(p_server uuid, p_user uuid, p_kind text, p_xp int) returns int
language plpgsql security definer set search_path = public as $$
declare d date := (now() at time zone 'America/Sao_Paulo')::date; got int := 0;
begin
  insert into server_pets (server_id) values (p_server) on conflict do nothing;
  insert into pet_contrib (server_id, user_id, day) values (p_server, p_user, d) on conflict do nothing;
  if p_kind = 'msg' then
    update pet_contrib set msg_xp = msg_xp + p_xp where server_id = p_server and user_id = p_user and day = d and msg_xp + p_xp <= 40;
    if found then got := p_xp; end if;
  elsif p_kind = 'voice' then
    update pet_contrib set voice_xp = voice_xp + p_xp where server_id = p_server and user_id = p_user and day = d and voice_xp + p_xp <= 60;
    if found then got := p_xp; end if;
  elsif p_kind = 'pet' then
    update pet_contrib set petted = true where server_id = p_server and user_id = p_user and day = d and not petted;
    if found then got := p_xp; end if;
  end if;
  update server_pets set xp = xp + got, last_active = now() where server_id = p_server;
  return got;
end $$;
revoke execute on function public.pet_add(uuid, uuid, text, int) from public, anon, authenticated;
create or replace function public.pet_on_message() returns trigger language plpgsql security definer set search_path = public as $$
declare sid uuid;
begin
  select server_id into sid from channels where id = new.channel_id;
  if sid is not null and new.author_id <> public.telao_bot() and exists (select 1 from servers where id = sid and pet_on) then
    begin perform public.pet_add(sid, new.author_id, 'msg', 1); exception when others then null; end;
  end if;
  return new;
end $$;
drop trigger if exists pet_on_message on public.messages;
create trigger pet_on_message after insert on public.messages for each row execute function public.pet_on_message();
-- a cada 5 min em call: +5 (só conta se você está mesmo numa call daquele servidor)
create or replace function public.pet_voice_tick(p_server uuid) returns int
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from voice_sessions where user_id = auth.uid() and server_id = p_server and last_seen > now() - interval '3 minutes') then return 0; end if;
  if not exists (select 1 from servers where id = p_server and pet_on) then return 0; end if;
  -- no máximo uma vez a cada 4 min
  insert into pet_contrib (server_id, user_id) values (p_server, auth.uid()) on conflict do nothing;
  if exists (select 1 from pet_contrib where server_id = p_server and user_id = auth.uid() and day = (now() at time zone 'America/Sao_Paulo')::date
             and last_voice > now() - interval '4 minutes') then return 0; end if;
  update pet_contrib set last_voice = now() where server_id = p_server and user_id = auth.uid() and day = (now() at time zone 'America/Sao_Paulo')::date;
  return public.pet_add(p_server, auth.uid(), 'voice', 5);
end $$;
create or replace function public.pet_pet(p_server uuid) returns int
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_member(p_server) then raise exception 'Você não é deste servidor.'; end if;
  if not exists (select 1 from servers where id = p_server and pet_on) then raise exception 'O bichinho está desligado neste servidor.'; end if;
  return public.pet_add(p_server, auth.uid(), 'pet', 5);
end $$;
create or replace function public.pet_get(p_server uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p server_pets; d date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if not public.is_member(p_server) then raise exception 'Você não é deste servidor.'; end if;
  insert into server_pets (server_id) values (p_server) on conflict do nothing;
  select * into p from server_pets where server_id = p_server;
  return to_jsonb(p) || jsonb_build_object(
    'pet_on', (select pet_on from servers where id = p_server),
    'petted_today', coalesce((select petted from pet_contrib where server_id = p_server and user_id = auth.uid() and day = d), false),
    'today_xp', coalesce((select sum(msg_xp + voice_xp + case when petted then 5 else 0 end) from pet_contrib where server_id = p_server and day = d), 0),
    'top', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (select user_id, sum(msg_xp + voice_xp + case when petted then 5 else 0 end)::int xp
             from pet_contrib where server_id = p_server and day > d - 30 group by user_id order by 2 desc limit 5) x));
end $$;
create or replace function public.pet_config(p_server uuid, p_name text, p_species text, p_color text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm(p_server, 2) then raise exception 'Só quem gerencia o servidor muda o bichinho.'; end if;
  insert into server_pets (server_id) values (p_server) on conflict do nothing;
  update server_pets set name = coalesce(nullif(trim(p_name), ''), name), species = coalesce(p_species, species), color = coalesce(p_color, color) where server_id = p_server;
end $$;

-- cartão de estatísticas (últimos N dias ou desde sempre)
create or replace function public.my_stats(p_days int default 30) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); a timestamptz := case when p_days is null or p_days <= 0 then '2000-01-01'::timestamptz else now() - make_interval(days => p_days) end; r jsonb;
begin
  if me is null then raise exception 'Entre na sua conta'; end if;
  select jsonb_build_object(
    'days_range', p_days,
    'voice_min', coalesce((select sum(extract(epoch from (last_seen - started_at)) / 60)::int from voice_sessions where user_id = me and started_at >= a), 0),
    'messages', (select count(*) from messages where author_id = me and created_at >= a),
    'days', (select count(distinct d) from (select (created_at at time zone 'America/Sao_Paulo')::date d from messages where author_id = me and created_at >= a
                                            union select (started_at at time zone 'America/Sao_Paulo')::date from voice_sessions where user_id = me and started_at >= a) x),
    'top_game', (select jsonb_build_object('name', game, 'min', sum(extract(epoch from (last_seen - started_at)) / 60)::int) from game_sessions
        where user_id = me and started_at >= a group by game order by sum(last_seen - started_at) desc limit 1),
    'top_server', (select jsonb_build_object('name', s.name, 'n', x.n) from (select c.server_id sid, count(*) n from messages m join channels c on c.id = m.channel_id
        where m.author_id = me and c.server_id is not null and m.created_at >= a group by 1 order by 2 desc limit 1) x join servers s on s.id = x.sid),
    'top_friend', (select jsonb_build_object('id', o, 'n', n) from (select case when c.dm_a = me then c.dm_b else c.dm_a end o, count(*) n from messages m join channels c on c.id = m.channel_id
        where c.kind = 'dm' and me in (c.dm_a, c.dm_b) and m.created_at >= a and public.telao_bot() not in (c.dm_a, c.dm_b) group by 1 order by 2 desc limit 1) x),
    'reacts_got', (select count(*) from message_reactions r join messages m on m.id = r.message_id where m.author_id = me and r.user_id <> me and r.created_at >= a),
    'game_wins', coalesce((select sum(wins) from game_scores where user_id = me and last_at >= a), 0),
    'clips', (select count(*) from messages where author_id = me and created_at >= a and attachments @> '[{"clip": true}]'),
    'since', (select created_at from profiles where id = me)
  ) into r;
  return r;
end $$;
grant execute on function public.server_bday_calendar(uuid), public.server_bday_announce(uuid), public.pet_voice_tick(uuid), public.pet_pet(uuid),
  public.pet_get(uuid), public.pet_config(uuid, text, text, text), public.my_stats(int) to authenticated;

-- =====================================================================
-- v6.37: REGISTRO DE AUDITORIA DO SERVIDOR
-- Tudo é gravado pelo próprio banco (gatilhos), então ninguém consegue esconder ou inventar registro.
-- Quem vê: dono, Administrador e quem tem a permissão nova "Ver registro de auditoria" (1024).
-- Guarda 90 dias.
-- =====================================================================
create table if not exists public.server_audit (
  id bigint generated always as identity primary key,
  server_id uuid not null references public.servers(id) on delete cascade,
  actor uuid references public.profiles(id) on delete set null,
  action text not null,
  target_type text,
  target_id uuid,
  target_name text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists server_audit_srv on public.server_audit (server_id, created_at desc);
alter table public.server_audit enable row level security;
drop policy if exists "ver auditoria" on public.server_audit;
create policy "ver auditoria" on public.server_audit for select to authenticated using (public.has_perm(server_id, 1024));
grant select on public.server_audit to authenticated;

create or replace function public.audit_add(p_server uuid, p_action text, p_type text, p_id uuid, p_name text, p_details jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_server is null or not exists (select 1 from servers where id = p_server) then return; end if;
  insert into server_audit (server_id, actor, action, target_type, target_id, target_name, details)
  values (p_server, auth.uid(), p_action, p_type, p_id, left(p_name, 120), coalesce(p_details, '{}'::jsonb));
  if random() < 0.02 then delete from server_audit where server_id = p_server and created_at < now() - interval '90 days'; end if;
exception when others then null;   -- registro nunca pode travar a ação de verdade
end $$;
revoke execute on function public.audit_add(uuid, text, text, uuid, text, jsonb) from public, anon, authenticated;

-- o que mudou entre a linha antiga e a nova (ignorando campos que mudam sozinhos)
create or replace function public.audit_diff(o jsonb, n jsonb, skip text[]) returns jsonb
language sql immutable as $$
  select coalesce(jsonb_object_agg(k, jsonb_build_object('de', o -> k, 'para', n -> k)), '{}'::jsonb)
  from jsonb_object_keys(n) k
  where not (k = any(skip)) and (o -> k) is distinct from (n -> k);
$$;
create or replace function public.audit_uname(u uuid) returns text language sql stable security definer set search_path = public as $$
  select coalesce(display_name, username) from profiles where id = u;
$$;

create or replace function public.audit_trg() returns trigger
language plpgsql security definer set search_path = public as $$
declare o jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end; n jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  r jsonb := coalesce(n, o); sid uuid; d jsonb; me uuid := auth.uid(); cname text; rname text;
begin
  if tg_table_name = 'servers' then
    if tg_op <> 'UPDATE' then return null; end if;
    d := public.audit_diff(o, n, array['invite_code','public_since','owner_id','created_at']);
    if d = '{}'::jsonb then return null; end if;
    perform public.audit_add(new.id, 'server_update', 'server', new.id, new.name, d);
    if old.invite_code is distinct from new.invite_code then perform public.audit_add(new.id, 'invite_reset', 'server', new.id, new.name, '{}'); end if;
    if old.owner_id is distinct from new.owner_id then perform public.audit_add(new.id, 'owner_transfer', 'member', new.owner_id, public.audit_uname(new.owner_id), jsonb_build_object('de', public.audit_uname(old.owner_id))); end if;
  elsif tg_table_name = 'channels' then
    sid := (r ->> 'server_id')::uuid; if sid is null then return null; end if;
    if tg_op = 'INSERT' then perform public.audit_add(sid, 'channel_create', 'channel', new.id, new.name, jsonb_build_object('tipo', new.kind));
    elsif tg_op = 'DELETE' then perform public.audit_add(sid, 'channel_delete', 'channel', old.id, old.name, jsonb_build_object('tipo', old.kind));
    else
      d := public.audit_diff(o, n, array['position','created_at']);
      if d <> '{}'::jsonb then perform public.audit_add(sid, 'channel_update', 'channel', new.id, new.name, d); end if;
    end if;
  elsif tg_table_name = 'server_categories' then
    sid := (r ->> 'server_id')::uuid;
    if tg_op = 'INSERT' then perform public.audit_add(sid, 'category_create', 'category', null, r ->> 'name', '{}');
    elsif tg_op = 'DELETE' then perform public.audit_add(sid, 'category_delete', 'category', null, r ->> 'name', '{}');
    else d := public.audit_diff(o, n, array['position','created_at']); if d <> '{}'::jsonb then perform public.audit_add(sid, 'category_update', 'category', null, r ->> 'name', d); end if; end if;
  elsif tg_table_name = 'server_roles' then
    sid := (r ->> 'server_id')::uuid;
    if tg_op = 'INSERT' then perform public.audit_add(sid, 'role_create', 'role', (r->>'id')::uuid, r ->> 'name', '{}');
    elsif tg_op = 'DELETE' then perform public.audit_add(sid, 'role_delete', 'role', (r->>'id')::uuid, r ->> 'name', '{}');
    else d := public.audit_diff(o, n, array['position','created_at']); if d <> '{}'::jsonb then perform public.audit_add(sid, 'role_update', 'role', (r->>'id')::uuid, r ->> 'name', d); end if; end if;
  elsif tg_table_name = 'member_roles' then
    sid := (r ->> 'server_id')::uuid;
    select name into rname from server_roles where id = (r ->> 'role_id')::uuid;
    perform public.audit_add(sid, case when tg_op = 'INSERT' then 'member_role_add' else 'member_role_remove' end, 'member', (r->>'user_id')::uuid,
      public.audit_uname((r->>'user_id')::uuid), jsonb_build_object('cargo', rname));
  elsif tg_table_name = 'server_members' then
    sid := (r ->> 'server_id')::uuid;
    if tg_op = 'INSERT' then perform public.audit_add(sid, 'member_join', 'member', new.user_id, public.audit_uname(new.user_id), '{}');
    elsif tg_op = 'DELETE' then
      if me is not null and me <> old.user_id then
        if not exists (select 1 from server_bans b where b.server_id = sid and b.user_id = old.user_id) then
          perform public.audit_add(sid, 'member_kick', 'member', old.user_id, public.audit_uname(old.user_id), '{}'); end if;
      else perform public.audit_add(sid, 'member_leave', 'member', old.user_id, public.audit_uname(old.user_id), '{}'); end if;
    else
      if old.timeout_until is distinct from new.timeout_until then
        perform public.audit_add(sid, case when new.timeout_until is not null and new.timeout_until > now() then 'member_timeout' else 'member_timeout_end' end,
          'member', new.user_id, public.audit_uname(new.user_id), jsonb_build_object('ate', new.timeout_until)); end if;
      if old.voice_muted is distinct from new.voice_muted then perform public.audit_add(sid, case when new.voice_muted then 'voice_mute' else 'voice_unmute' end, 'member', new.user_id, public.audit_uname(new.user_id), '{}'); end if;
      if old.voice_deafened is distinct from new.voice_deafened then perform public.audit_add(sid, case when new.voice_deafened then 'voice_deafen' else 'voice_undeafen' end, 'member', new.user_id, public.audit_uname(new.user_id), '{}'); end if;
      if (to_jsonb(old) ->> 'nickname') is distinct from (to_jsonb(new) ->> 'nickname') then perform public.audit_add(sid, 'member_nick', 'member', new.user_id, public.audit_uname(new.user_id),
        jsonb_build_object('de', to_jsonb(old) ->> 'nickname', 'para', to_jsonb(new) ->> 'nickname')); end if;
    end if;
  elsif tg_table_name = 'server_bans' then
    sid := (r ->> 'server_id')::uuid;
    perform public.audit_add(sid, case when tg_op = 'INSERT' then 'member_ban' else 'member_unban' end, 'member', (r->>'user_id')::uuid,
      public.audit_uname((r->>'user_id')::uuid), case when tg_op = 'INSERT' then jsonb_build_object('motivo', r ->> 'reason') else '{}'::jsonb end);
  elsif tg_table_name = 'messages' then
    select c.server_id, c.name into sid, cname from channels c where c.id = (r ->> 'channel_id')::uuid;
    if sid is null then return null; end if;
    if tg_op = 'DELETE' then
      if me is not null and me <> old.author_id then
        perform public.audit_add(sid, 'message_delete', 'member', old.author_id, public.audit_uname(old.author_id), jsonb_build_object('canal', cname, 'texto', left(old.content, 200))); end if;
    elsif old.pinned is distinct from new.pinned then
      perform public.audit_add(sid, case when new.pinned then 'message_pin' else 'message_unpin' end, 'member', new.author_id, public.audit_uname(new.author_id), jsonb_build_object('canal', cname, 'texto', left(new.content, 200)));
    end if;
  elsif tg_table_name in ('server_emojis', 'server_sounds', 'server_events', 'server_stickers') then
    sid := (r ->> 'server_id')::uuid;
    perform public.audit_add(sid, replace(replace(replace(replace(tg_table_name, 'server_', ''), 'emojis', 'emoji'), 'sounds', 'sound'), 'stickers', 'sticker') || '_' || case tg_op when 'INSERT' then 'create' when 'DELETE' then 'delete' else 'update' end,
      tg_table_name, (r->>'id')::uuid, coalesce(r ->> 'name', r ->> 'title'), '{}');
  end if;
  return null;
end $$;
do $$ declare t text; begin
  foreach t in array array['servers','channels','server_categories','server_roles','member_roles','server_members','server_bans','server_emojis','server_sounds','server_events'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists audit_trg on public.%I', t);
      execute format('create trigger audit_trg after insert or update or delete on public.%I for each row execute function public.audit_trg()', t);
    end if;
  end loop;
  -- mensagens: só apagar (por outra pessoa) e fixar
  drop trigger if exists audit_trg on public.messages;
  create trigger audit_trg after update of pinned or delete on public.messages for each row execute function public.audit_trg();
end $$;
-- ações que não passam pelo banco (desconectar/mover alguém da call): o app registra, mas só quem tem a permissão consegue
create or replace function public.audit_voice(p_server uuid, p_action text, p_target uuid, p_channel uuid default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_action not in ('voice_disconnect', 'voice_move') then raise exception 'Ação inválida.'; end if;
  if not public.has_perm(p_server, 64) then raise exception 'Sem permissão.'; end if;
  perform public.audit_add(p_server, p_action, 'member', p_target, public.audit_uname(p_target),
    case when p_channel is not null then jsonb_build_object('canal', (select name from channels where id = p_channel and server_id = p_server)) else '{}'::jsonb end);
end $$;
create or replace function public.resolve_report(p_id uuid, p_status text, p_action text default null) returns void
language plpgsql security definer set search_path = public as $$
declare r message_reports;
begin
  select * into r from message_reports where id = p_id;
  if r.id is null then raise exception 'Denúncia não encontrada.'; end if;
  if not public.can_mod_reports(r.server_id) then raise exception 'Sem permissão.'; end if;
  if p_status not in ('open','resolved','dismissed') then raise exception 'Status inválido.'; end if;
  -- resolve todas as denúncias da mesma mensagem de uma vez
  update message_reports set status = p_status, action = left(p_action, 60),
    resolved_by = case when p_status = 'open' then null else auth.uid() end,
    resolved_at = case when p_status = 'open' then null else now() end
  where (r.message_id is not null and message_id = r.message_id) or id = r.id;
  if r.server_id is not null and p_status <> 'open' then
    perform public.audit_add(r.server_id, 'report_' || p_status, 'member', r.author_id, public.audit_uname(r.author_id), jsonb_build_object('acao', p_action, 'motivo', r.reason));
  end if;
end $$;
grant execute on function public.audit_voice(uuid, text, uuid, uuid) to authenticated;

-- impede trocar campos sensíveis via update
create or replace function public.guard_updates() returns trigger
language plpgsql as $$
begin
  if tg_table_name = 'messages' then
    new.channel_id := old.channel_id; new.author_id := old.author_id; new.created_at := old.created_at; new.reply_to := old.reply_to;
    if coalesce(current_setting('telao.pin_ok', true), '') <> '1' then new.pinned := old.pinned; end if;
    -- mudar só os anexos (ex.: a transcrição de um áudio) não marca como "editado"
    if new.content is distinct from old.content then new.edited_at := now();
    else new.edited_at := old.edited_at; end if;
  elsif tg_table_name = 'servers' then
    new.owner_id := old.owner_id;
    if coalesce(current_setting('telao.priv_ok', true), '') <> '1' and not public.is_privileged() then
      -- vantagens dos impulsos
      if new.invite_code is distinct from old.invite_code and new.invite_code !~ '^[0-9a-f]{8}$' then new.invite_code := old.invite_code; end if;
      if new.icon_url is distinct from old.icon_url and new.icon_url ~* '\.gif($|\?)' and public.server_level(old.id) < 1 then new.icon_url := old.icon_url; end if;
      if new.accent is distinct from old.accent and new.accent is not null and public.server_level(old.id) < 1 then new.accent := old.accent; end if;
      if new.banner_url is distinct from old.banner_url and new.banner_url is not null and public.server_level(old.id) < 2 then new.banner_url := old.banner_url; end if;
      if (new.tag is distinct from old.tag or new.tag_badge is distinct from old.tag_badge) and new.tag is not null and public.server_level(old.id) < 2 then new.tag := old.tag; new.tag_badge := old.tag_badge; end if;
      if new.is_public and not old.is_public then new.public_since := now(); end if;
    end if;
  elsif tg_table_name = 'friendships' then
    new.requester := old.requester; new.addressee := old.addressee;
  elsif tg_table_name = 'profiles' then
    new.id := old.id;
    if coalesce(current_setting('telao.username_ok', true), '') <> '1' then new.username := old.username; end if;
    if not public.is_privileged() then
      new.is_admin := old.is_admin; new.plan_until := old.plan_until; new.plus_months := old.plus_months; new.badges := old.badges;
      new.fichas := old.fichas; new.streak := old.streak; new.last_daily := old.last_daily; new.equipped := old.equipped;
      new.birthdate := old.birthdate; new.share_block_until := old.share_block_until; new.guild_tag := old.guild_tag;
      -- recursos do Telão+ só para quem tem o plano
      if not public.has_plus(old.id) then
        if new.banner_url is distinct from old.banner_url and new.banner_url is not null then new.banner_url := old.banner_url; end if;
        if new.avatar_url is distinct from old.avatar_url and new.avatar_url ~* '\.gif($|\?)' then new.avatar_url := old.avatar_url; end if;
        if new.theme_a is distinct from old.theme_a and new.theme_a is not null then new.theme_a := old.theme_a; end if;
        if new.theme_b is distinct from old.theme_b and new.theme_b is not null then new.theme_b := old.theme_b; end if;
        if new.profile_fx is distinct from old.profile_fx and new.profile_fx is not null then new.profile_fx := old.profile_fx; end if;
        if new.avatar_ring is distinct from old.avatar_ring and new.avatar_ring is not null then new.avatar_ring := old.avatar_ring; end if;
        if new.name_style is distinct from old.name_style and new.name_style is not null then new.name_style := old.name_style; end if;
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
  begin alter publication supabase_realtime add table public.message_reactions; exception when others then null; end;
  begin alter publication supabase_realtime add table public.server_roles; exception when others then null; end;
  begin alter publication supabase_realtime add table public.member_roles; exception when others then null; end;
  begin alter publication supabase_realtime add table public.server_boosts; exception when others then null; end;
  begin alter publication supabase_realtime add table public.server_events; exception when others then null; end;
  begin alter publication supabase_realtime add table public.event_rsvps; exception when others then null; end;
  begin alter publication supabase_realtime add table public.app_notices; exception when others then null; end;
  begin alter publication supabase_realtime add table public.server_emojis; exception when others then null; end;
  begin alter publication supabase_realtime add table public.voice_music; exception when others then null; end;
  begin alter publication supabase_realtime add table public.group_members; exception when others then null; end;
  begin alter publication supabase_realtime add table public.stage_queue; exception when others then null; end;
  begin alter publication supabase_realtime add table public.dm_closed; exception when others then null; end;
  begin alter publication supabase_realtime add table public.server_categories; exception when others then null; end;
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

-- anexos do chat (fotos, vídeos, áudios, arquivos) — até 25 MB
insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', true, 26214400)
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit;
drop policy if exists "telao anexos ler" on storage.objects;
create policy "telao anexos ler" on storage.objects for select using (bucket_id = 'attachments');
drop policy if exists "telao anexos enviar" on storage.objects;
create policy "telao anexos enviar" on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "telao anexos apagar" on storage.objects;
create policy "telao anexos apagar" on storage.objects for delete to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);

-- =====================================================================
-- v6.26: PERMISSÕES DAS CATEGORIAS (quem vê e quem escreve, por cargo)
-- =====================================================================
alter table public.server_categories add column if not exists allowed_roles uuid[];  -- quem vê (vazio = todo mundo)
alter table public.server_categories add column if not exists send_roles uuid[];     -- quem escreve nos canais de texto (vazio = todo mundo que vê)

-- a pessoa tem algum desses cargos? (lista vazia = libera; dono e administrador sempre passam)
create or replace function public.role_match(sid uuid, roles uuid[]) returns boolean
language sql stable security definer set search_path = public as $$
  select roles is null or cardinality(roles) = 0
      or exists (select 1 from servers s where s.id = sid and s.owner_id = auth.uid())
      or exists (select 1 from member_roles mr join server_roles r on r.id = mr.role_id
                 where mr.server_id = sid and mr.user_id = auth.uid() and (r.perms & 32) <> 0)
      or exists (select 1 from member_roles mr where mr.server_id = sid and mr.user_id = auth.uid() and mr.role_id = any(roles));
$$;

-- ver o canal = ser do servidor + passar no cargo do canal + passar no cargo da categoria
create or replace function public.can_view_channel(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from channels c
    where c.id = cid and (
      auth.uid() in (c.dm_a, c.dm_b)
      or (c.server_id is not null
          and exists (select 1 from server_members m where m.server_id = c.server_id and m.user_id = auth.uid())
          and public.role_match(c.server_id, c.allowed_roles)
          and (c.category is null or public.role_match(c.server_id,
                 (select sc.allowed_roles from server_categories sc where sc.server_id = c.server_id and sc.name = c.category))))
    )
  );
$$;
drop policy if exists "ver canais" on public.channels;
create policy "ver canais" on public.channels for select to authenticated using (
  (kind = 'dm' and auth.uid() in (dm_a, dm_b)) or (server_id is not null and public.can_view_channel(id)));

-- categoria escondida: some da lista para quem não tem o cargo
drop policy if exists "ver categorias" on public.server_categories;
create policy "ver categorias" on public.server_categories for select to authenticated
  using (public.is_member(server_id) and public.role_match(server_id, allowed_roles));

-- escrever: se a categoria limita quem escreve, só esses cargos (moderação sempre pode)
create or replace function public.message_category_rules() returns trigger
language plpgsql security definer set search_path = public as $$
declare c channels; roles uuid[];
begin
  select * into c from channels where id = new.channel_id;
  if c.server_id is null or c.category is null then return new; end if;
  if public.has_perm(c.server_id, 1) or public.has_perm(c.server_id, 8) then return new; end if;
  select send_roles into roles from server_categories where server_id = c.server_id and name = c.category;
  if not public.role_match(c.server_id, roles) then
    raise exception 'Nesta categoria só alguns cargos podem escrever.';
  end if;
  return new;
end $$;
drop trigger if exists message_category_rules on public.messages;
create trigger message_category_rules before insert on public.messages for each row execute function public.message_category_rules();

-- salvar as permissões (só quem gerencia canais; cargos têm que ser do mesmo servidor)
create or replace function public.category_perms_save(p_server uuid, p_name text, p_view uuid[], p_send uuid[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm(p_server, 1) then raise exception 'Você não pode gerenciar canais'; end if;
  if exists (select 1 from unnest(coalesce(p_view, '{}') || coalesce(p_send, '{}')) r(id)
             where not exists (select 1 from server_roles sr where sr.id = r.id and sr.server_id = p_server)) then
    raise exception 'Cargo de outro servidor';
  end if;
  update server_categories
     set allowed_roles = case when cardinality(p_view) > 0 then p_view else null end,
         send_roles    = case when cardinality(p_send) > 0 then p_send else null end
   where server_id = p_server and name = p_name;
  if not found then raise exception 'Categoria não encontrada'; end if;
end $$;
grant execute on function public.category_perms_save(uuid, text, uuid[], uuid[]) to authenticated;
grant execute on function public.role_match(uuid, uuid[]) to authenticated;

-- quem escreve em cada categoria (o app usa para desligar a caixa de mensagem)
create or replace function public.my_category_access(p_server uuid) returns table(name text, can_send boolean)
language sql stable security definer set search_path = public as $$
  select sc.name, (public.has_perm(p_server, 1) or public.has_perm(p_server, 8) or public.role_match(p_server, sc.send_roles))
  from server_categories sc where sc.server_id = p_server and public.is_member(p_server) and public.role_match(p_server, sc.allowed_roles);
$$;
grant execute on function public.my_category_access(uuid) to authenticated;

-- =====================================================================
-- v6.39: FIGURINHAS, @cargo e @aqui, BUSCA AVANÇADA, PÁGINA PÚBLICA DO SERVIDOR, JOGOS NOVOS
-- =====================================================================
-- figurinhas do servidor (stickers grandes, PNG/GIF/WEBP)
create table if not exists public.server_stickers (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 30),
  url text not null check (url ~ '^https://'),
  animated boolean not null default false,
  created_by uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists server_stickers_srv on public.server_stickers (server_id);
alter table public.server_stickers enable row level security;
drop policy if exists "membros veem figurinhas" on public.server_stickers;
create policy "membros veem figurinhas" on public.server_stickers for select to authenticated using (public.is_member(server_id));
drop policy if exists "quem gerencia emojis envia figurinhas" on public.server_stickers;
create policy "quem gerencia emojis envia figurinhas" on public.server_stickers for insert to authenticated
  with check (created_by = auth.uid() and (public.has_perm(server_id, 512) or public.has_perm(server_id, 2)));
drop policy if exists "quem gerencia emojis muda figurinhas" on public.server_stickers;
create policy "quem gerencia emojis muda figurinhas" on public.server_stickers for update to authenticated
  using (public.has_perm(server_id, 512) or public.has_perm(server_id, 2)) with check (public.has_perm(server_id, 512) or public.has_perm(server_id, 2));
drop policy if exists "quem gerencia emojis apaga figurinhas" on public.server_stickers;
create policy "quem gerencia emojis apaga figurinhas" on public.server_stickers for delete to authenticated
  using (public.has_perm(server_id, 512) or public.has_perm(server_id, 2));
create or replace function public.server_stickers_limit() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from server_stickers where server_id = new.server_id) >= 60 then raise exception 'Este servidor já tem 60 figurinhas. Apague uma antes.'; end if;
  return new;
end $$;
drop trigger if exists server_stickers_limit on public.server_stickers;
create trigger server_stickers_limit before insert on public.server_stickers for each row execute function public.server_stickers_limit();
grant select, insert, update, delete on public.server_stickers to authenticated;
drop trigger if exists audit_trg on public.server_stickers;
create trigger audit_trg after insert or update or delete on public.server_stickers for each row execute function public.audit_trg();

-- @todos, @aqui e @cargo: só quem tem a permissão 2048 usa @todos/@aqui; e tem limite anti-spam
create table if not exists public.mention_log (
  user_id uuid not null,
  server_id uuid not null,
  at timestamptz not null default now()
);
create index if not exists mention_log_user on public.mention_log (user_id, server_id, at desc);
alter table public.mention_log enable row level security;
create or replace function public.mass_mention_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare sid uuid; mass boolean; rping boolean; n int;
begin
  if auth.uid() is null or new.content is null or new.content = '' then return new; end if;
  mass := new.content ~* '(^|\s)@(todos|everyone|aqui|here)\M';
  rping := new.content ~ '<@&[0-9a-f-]{36}>';
  if not mass and not rping then return new; end if;
  select server_id into sid from channels where id = new.channel_id;
  if sid is null then return new; end if;
  if mass and not public.has_perm(sid, 2048) then
    raise exception 'Só quem tem a permissão "Mencionar @todos, @aqui e cargos" pode usar @todos e @aqui neste servidor.';
  end if;
  if not public.has_perm(sid, 32) then
    select count(*) into n from mention_log where user_id = auth.uid() and server_id = sid and at > now() - interval '10 minutes';
    if n >= (case when public.has_perm(sid, 2048) then 10 else 4 end) then
      raise exception 'Calma! Você já chamou muita gente nos últimos minutos. Espere um pouco para mencionar de novo.';
    end if;
  end if;
  insert into mention_log (user_id, server_id) values (auth.uid(), sid);
  if random() < 0.05 then delete from mention_log where at < now() - interval '1 day'; end if;
  return new;
end $$;
drop trigger if exists mass_mention_guard on public.messages;
create trigger mass_mention_guard before insert on public.messages for each row execute function public.mass_mention_guard();

-- busca avançada: o banco filtra; a permissão de ler continua a mesma (RLS das mensagens)
create or replace function public.search_messages(p_server uuid, p_channel uuid, p_q text, p_author uuid, p_from timestamptz, p_to timestamptz,
  p_has text, p_mention text, p_pinned boolean, p_off int default 0)
returns setof public.messages language sql stable set search_path = public as $$
  select m.* from messages m
  where (p_channel is null or m.channel_id = p_channel)
    and (p_server is null or m.channel_id in (select c.id from channels c where c.server_id = p_server))
    and (p_channel is not null or p_server is not null)
    and (coalesce(p_q, '') = '' or m.content ilike '%' || replace(replace(p_q, '%', ''), '_', '') || '%')
    and (p_author is null or m.author_id = p_author)
    and (p_from is null or m.created_at >= p_from)
    and (p_to is null or m.created_at < p_to)
    and (coalesce(p_mention, '') = '' or m.content ilike '%@' || p_mention || '%')
    and (p_pinned is not true or m.pinned)
    and (p_has is null
      or (p_has = 'image' and exists (select 1 from jsonb_array_elements(m.attachments) a where a ->> 'type' like 'image/%'))
      or (p_has = 'video' and exists (select 1 from jsonb_array_elements(m.attachments) a where a ->> 'type' like 'video/%'))
      or (p_has = 'audio' and exists (select 1 from jsonb_array_elements(m.attachments) a where a ->> 'type' like 'audio/%'))
      or (p_has = 'file' and exists (select 1 from jsonb_array_elements(m.attachments) a where a ? 'url' and coalesce(a ->> 'type', '') !~ '^(image|video|audio)/' and a ->> 'type' <> 'sticker'))
      or (p_has = 'sticker' and exists (select 1 from jsonb_array_elements(m.attachments) a where a ->> 'type' = 'sticker'))
      or (p_has = 'link' and m.content ~* 'https?://'))
  order by m.created_at desc
  limit 40 offset greatest(0, least(coalesce(p_off, 0), 2000));
$$;
grant execute on function public.search_messages(uuid, uuid, text, uuid, timestamptz, timestamptz, text, text, boolean, int) to authenticated;

-- página pública do servidor: telao.../s/nome-bonito (ou /s/CODIGO-DO-CONVITE)
alter table public.servers add column if not exists slug text;
do $$ begin
  alter table public.servers drop constraint if exists servers_slug_check;
  alter table public.servers add constraint servers_slug_check check (slug is null or (slug ~ '^[a-z0-9][a-z0-9-]{2,23}$' and slug !~ '^[0-9a-f]{8}$'));
end $$;
create unique index if not exists servers_slug_uq on public.servers (lower(slug)) where slug is not null;
-- "visto agora há pouco" (só para contar quem está online na página pública; não aparece para ninguém)
create table if not exists public.user_seen (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  at timestamptz not null default now()
);
alter table public.user_seen enable row level security;
create or replace function public.touch_seen() returns void language sql security definer set search_path = public as $$
  insert into user_seen (user_id, at) values (auth.uid(), now())
  on conflict (user_id) do update set at = now() where user_seen.at < now() - interval '90 seconds';
$$;
grant execute on function public.touch_seen() to authenticated;
create or replace function public.server_public(p_id text) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s servers;
begin
  if p_id is null or char_length(p_id) > 40 then return null; end if;
  select * into s from servers where (slug is not null and lower(slug) = lower(p_id)) or invite_code = lower(p_id) limit 1;
  if s.id is null then return null; end if;
  return jsonb_build_object(
    'name', s.name, 'description', s.description, 'icon_url', s.icon_url, 'banner_url', s.banner_url, 'accent', s.accent, 'icon_color', s.icon_color,
    'tag', s.tag, 'slug', s.slug, 'invite', s.invite_code, 'since', s.created_at,
    'members', (select count(*) from server_members where server_id = s.id),
    'online', (select count(*) from server_members sm join user_seen u on u.user_id = sm.user_id where sm.server_id = s.id and u.at > now() - interval '5 minutes'),
    'in_call', (select count(distinct v.user_id) from voice_sessions v join channels c on c.id = v.channel_id where c.server_id = s.id and v.last_seen > now() - interval '2 minutes'),
    'channels', (select coalesce(jsonb_agg(x.name order by x.position), '[]') from (select name, position from channels where server_id = s.id and kind = 'text' and coalesce(nsfw, false) = false
                 and not exists (select 1 from server_categories sc where sc.server_id = s.id and sc.name = channels.category and sc.allowed_roles is not null) order by position limit 6) x)
  );
end $$;
grant execute on function public.server_public(text) to anon, authenticated;

-- jogos novos no ranking
alter table public.game_scores drop constraint if exists game_scores_game_check;
alter table public.game_scores add constraint game_scores_game_check check (game in ('rabisco','quiz','provavel','stop','quemsou','truco','forca','naval','musica','telefone','domino','uno','mimica','velha'));

-- =====================================================================
-- VIRAR ADMIN: troque o e-mail abaixo pelo SEU e rode só esta linha
-- (ou deixe aqui: se o e-mail não existir, não acontece nada)
-- =====================================================================
update public.profiles set is_admin = true
where id = (select id from auth.users where email = 'brabont1@gmail.com');
