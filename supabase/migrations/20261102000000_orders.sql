-- EMESE orders: quotes, order tracking with design approval, uniform size lists.
--
-- Visitors never read or write tables directly. Everything public goes through the
-- security-definer functions at the bottom, which only take a secret link token.
-- Staff (rows in public.staff) see and change everything through row level security.

create sequence if not exists public.order_no start 1001;

-- ------------------------------------------------------------------ staff ---
create table if not exists public.staff (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  name       text not null default '',
  created_at timestamptz not null default now()
);

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff where user_id = auth.uid());
$$;

-- ----------------------------------------------------------------- orders ---
create table if not exists public.orders (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique default ('EM' || nextval('public.order_no')::text),
  token         text not null unique default replace(gen_random_uuid()::text, '-', ''),
  status        text not null default 'new'
                check (status in ('new', 'quoted', 'proof', 'approved', 'production', 'ready', 'delivered', 'cancelled')),
  customer_name text not null check (char_length(customer_name) between 2 and 80),
  phone         text not null check (phone ~ '^[0-9+ ()-]{8,20}$'),
  company       text check (char_length(company) <= 120),
  email         text check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  city          text check (char_length(city) <= 60),
  items         jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  deadline      date,
  notes         text check (char_length(notes) <= 2000),
  lang          text not null default 'ar' check (lang in ('ar', 'en')),
  logo_path     text,
  mockup_path   text,
  estimate      jsonb,
  quote_amount  numeric(12, 2),
  quote_note    text check (char_length(quote_note) <= 2000),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists orders_status_idx on public.orders (status, created_at desc);
create index if not exists orders_phone_idx on public.orders (phone, created_at desc);

create table if not exists public.order_events (
  id         bigint generated always as identity primary key,
  order_id   uuid not null references public.orders (id) on delete cascade,
  kind       text not null check (kind in ('created', 'status', 'note', 'proof', 'approved', 'changes', 'quote')),
  status     text,
  message    text check (char_length(message) <= 2000),
  by_staff   boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists order_events_order_idx on public.order_events (order_id, created_at);

create table if not exists public.proofs (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references public.orders (id) on delete cascade,
  version          int not null default 1,
  image_path       text not null,
  note             text check (char_length(note) <= 2000),
  decision         text check (decision in ('approved', 'changes')),
  decision_comment text check (char_length(decision_comment) <= 2000),
  decided_at       timestamptz,
  created_at       timestamptz not null default now()
);
create index if not exists proofs_order_idx on public.proofs (order_id, version);

-- ------------------------------------------------------------- size lists ---
create table if not exists public.size_lists (
  id          uuid primary key default gen_random_uuid(),
  token       text not null unique default replace(gen_random_uuid()::text, '-', ''),   -- employees
  admin_token text not null unique default replace(gen_random_uuid()::text, '-', ''),   -- the client's manager
  order_id    uuid references public.orders (id) on delete set null,
  title       text not null check (char_length(title) between 2 and 120),
  company     text check (char_length(company) <= 120),
  product     text check (char_length(product) <= 80),
  sizes       text[] not null default array['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'],
  note        text check (char_length(note) <= 1000),
  open        boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.size_entries (
  id         bigint generated always as identity primary key,
  list_id    uuid not null references public.size_lists (id) on delete cascade,
  person     text not null check (char_length(person) between 2 and 80),
  size       text not null,
  qty        int not null default 1 check (qty between 1 and 50),
  note       text check (char_length(note) <= 300),
  created_at timestamptz not null default now()
);
create index if not exists size_entries_list_idx on public.size_entries (list_id, created_at);

-- ------------------------------------------------------------ bookkeeping ---
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists orders_touch on public.orders;
create trigger orders_touch before update on public.orders
  for each row execute function public.touch_updated_at();

-- a status change made by staff shows up on the customer's timeline
create or replace function public.log_status_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    insert into public.order_events (order_id, kind, status, by_staff)
    values (new.id, 'status', new.status, public.is_staff());
  end if;
  if new.quote_amount is distinct from old.quote_amount and new.quote_amount is not null then
    insert into public.order_events (order_id, kind, message, by_staff)
    values (new.id, 'quote', coalesce(new.quote_note, ''), true);
  end if;
  return new;
end $$;

drop trigger if exists orders_status_log on public.orders;
create trigger orders_status_log after update on public.orders
  for each row execute function public.log_status_change();

-- a new proof moves the order to "waiting for your approval"
create or replace function public.on_new_proof()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.order_events (order_id, kind, message, by_staff)
  values (new.order_id, 'proof', coalesce(new.note, ''), true);
  update public.orders set status = 'proof' where id = new.order_id and status <> 'proof';
  return new;
end $$;

drop trigger if exists proofs_new on public.proofs;
create trigger proofs_new after insert on public.proofs
  for each row execute function public.on_new_proof();

-- ------------------------------------------------------- row level security ---
alter table public.staff        enable row level security;
alter table public.orders       enable row level security;
alter table public.order_events enable row level security;
alter table public.proofs       enable row level security;
alter table public.size_lists   enable row level security;
alter table public.size_entries enable row level security;

drop policy if exists staff_self on public.staff;
create policy staff_self on public.staff for select to authenticated using (user_id = auth.uid() or public.is_staff());

do $$
declare t text;
begin
  foreach t in array array['orders', 'order_events', 'proofs', 'size_lists', 'size_entries'] loop
    execute format('drop policy if exists %I on public.%I', t || '_staff', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_staff()) with check (public.is_staff())',
                   t || '_staff', t);
  end loop;
end $$;

-- --------------------------------------------------------- public functions ---
-- Paths a visitor may attach: files they just uploaded under orders/<random>/.
create or replace function public.clean_upload_path(p text)
returns text language sql immutable as $$
  select case when p ~ '^orders/[0-9a-f-]{36}/[a-z0-9_-]{1,40}\.(png|jpg|jpeg|webp)$' then p end;
$$;

-- New order or quote request from the website. Returns the order code and the
-- secret tracking token (the only way to read it back).
create or replace function public.create_order(payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  o public.orders;
  v_phone text := regexp_replace(coalesce(payload ->> 'phone', ''), '[^0-9+ ()-]', '', 'g');
  v_items jsonb := coalesce(payload -> 'items', '[]'::jsonb);
begin
  if char_length(trim(coalesce(payload ->> 'customer_name', ''))) not between 2 and 80 then
    raise exception 'name_invalid';
  end if;
  if v_phone !~ '^[0-9+ ()-]{8,20}$' or length(regexp_replace(v_phone, '[^0-9]', '', 'g')) < 8 then
    raise exception 'phone_invalid';
  end if;
  if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) > 20 or length(v_items::text) > 20000 then
    raise exception 'items_invalid';
  end if;
  -- the same phone can't flood the inbox
  if (select count(*) from public.orders where phone = v_phone and created_at > now() - interval '10 minutes') >= 5 then
    raise exception 'too_many_requests';
  end if;
  insert into public.orders (customer_name, phone, company, email, city, items, deadline, notes, lang,
                             logo_path, mockup_path, estimate)
  values (
    trim(payload ->> 'customer_name'),
    v_phone,
    nullif(trim(payload ->> 'company'), ''),
    nullif(trim(payload ->> 'email'), ''),
    nullif(trim(payload ->> 'city'), ''),
    v_items,
    nullif(payload ->> 'deadline', '')::date,
    nullif(trim(payload ->> 'notes'), ''),
    case when payload ->> 'lang' = 'en' then 'en' else 'ar' end,
    public.clean_upload_path(payload ->> 'logo_path'),
    public.clean_upload_path(payload ->> 'mockup_path'),
    case when jsonb_typeof(payload -> 'estimate') = 'object' and length((payload -> 'estimate')::text) < 500
         then payload -> 'estimate' end
  )
  returning * into o;
  insert into public.order_events (order_id, kind, status) values (o.id, 'created', 'new');
  return jsonb_build_object('code', o.code, 'token', o.token);
end $$;

-- Everything the customer's tracking page shows.
create or replace function public.get_order(p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'code', o.code, 'status', o.status, 'customer_name', o.customer_name, 'company', o.company,
    'items', o.items, 'deadline', o.deadline, 'notes', o.notes, 'lang', o.lang,
    'logo_path', o.logo_path, 'mockup_path', o.mockup_path, 'estimate', o.estimate,
    'quote_amount', o.quote_amount, 'quote_note', o.quote_note,
    'created_at', o.created_at, 'updated_at', o.updated_at,
    'events', coalesce((select jsonb_agg(jsonb_build_object('kind', e.kind, 'status', e.status, 'message', e.message,
                                                            'by_staff', e.by_staff, 'at', e.created_at) order by e.created_at)
                        from public.order_events e where e.order_id = o.id), '[]'::jsonb),
    'proofs', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'version', p.version, 'image_path', p.image_path,
                                                            'note', p.note, 'decision', p.decision,
                                                            'decision_comment', p.decision_comment, 'decided_at', p.decided_at,
                                                            'at', p.created_at) order by p.version)
                        from public.proofs p where p.order_id = o.id), '[]'::jsonb)
  )
  from public.orders o
  where o.token = p_token and length(p_token) = 32;
$$;

-- The customer approves a proof or asks for changes.
create or replace function public.decide_proof(p_token text, p_proof uuid, p_decision text, p_comment text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  o public.orders;
  pr public.proofs;
begin
  if p_decision not in ('approved', 'changes') then raise exception 'decision_invalid'; end if;
  select * into o from public.orders where token = p_token and length(p_token) = 32;
  if o.id is null then raise exception 'not_found'; end if;
  select * into pr from public.proofs where id = p_proof and order_id = o.id;
  if pr.id is null then raise exception 'not_found'; end if;
  if pr.decision is not null then raise exception 'already_decided'; end if;
  if p_decision = 'changes' and coalesce(trim(p_comment), '') = '' then raise exception 'comment_required'; end if;
  update public.proofs set decision = p_decision, decision_comment = nullif(left(trim(p_comment), 2000), ''),
                           decided_at = now()
   where id = pr.id;
  insert into public.order_events (order_id, kind, message)
  values (o.id, p_decision, nullif(left(trim(p_comment), 2000), ''));
  if p_decision = 'approved' then
    update public.orders set status = 'approved' where id = o.id;
  end if;
  return public.get_order(p_token);
end $$;

-- An employee opens the size link: what they need to fill the form.
create or replace function public.get_size_list(p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('title', l.title, 'company', l.company, 'product', l.product, 'sizes', l.sizes,
                            'note', l.note, 'open', l.open,
                            'count', (select count(*) from public.size_entries e where e.list_id = l.id))
  from public.size_lists l where l.token = p_token and length(p_token) = 32;
$$;

create or replace function public.add_size_entry(p_token text, p_person text, p_size text, p_qty int default 1,
                                                 p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare l public.size_lists;
begin
  select * into l from public.size_lists where token = p_token and length(p_token) = 32;
  if l.id is null then raise exception 'not_found'; end if;
  if not l.open then raise exception 'closed'; end if;
  if not (p_size = any (l.sizes)) then raise exception 'size_invalid'; end if;
  if (select count(*) from public.size_entries where list_id = l.id) >= 2000 then raise exception 'list_full'; end if;
  insert into public.size_entries (list_id, person, size, qty, note)
  values (l.id, trim(p_person), p_size, coalesce(p_qty, 1), nullif(left(trim(p_note), 300), ''));
  return public.get_size_list(p_token);
end $$;

-- The client's manager sees everyone who filled the list.
create or replace function public.get_size_report(p_admin_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('title', l.title, 'company', l.company, 'product', l.product, 'sizes', l.sizes,
                            'open', l.open, 'token', l.token,
                            'entries', coalesce((select jsonb_agg(jsonb_build_object('person', e.person, 'size', e.size,
                                                                                     'qty', e.qty, 'note', e.note,
                                                                                     'at', e.created_at) order by e.created_at)
                                                 from public.size_entries e where e.list_id = l.id), '[]'::jsonb))
  from public.size_lists l where l.admin_token = p_admin_token and length(p_admin_token) = 32;
$$;

revoke all on function public.create_order(jsonb) from public;
revoke all on function public.get_order(text) from public;
revoke all on function public.decide_proof(text, uuid, text, text) from public;
revoke all on function public.get_size_list(text) from public;
revoke all on function public.add_size_entry(text, text, text, int, text) from public;
revoke all on function public.get_size_report(text) from public;
grant execute on function public.create_order(jsonb) to anon, authenticated;
grant execute on function public.get_order(text) to anon, authenticated;
grant execute on function public.decide_proof(text, uuid, text, text) to anon, authenticated;
grant execute on function public.get_size_list(text) to anon, authenticated;
grant execute on function public.add_size_entry(text, text, text, int, text) to anon, authenticated;
grant execute on function public.get_size_report(text) to anon, authenticated;
grant execute on function public.is_staff() to authenticated;

-- ---------------------------------------------------------------- storage ---
-- One public bucket. Visitors can only add images under orders/<random uuid>/ (and can't
-- list or overwrite anything); staff upload proofs and can manage every file.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('uploads', 'uploads', true, 6291456, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
                               allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists uploads_visitor_insert on storage.objects;
create policy uploads_visitor_insert on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'uploads' and public.clean_upload_path(name) is not null);

drop policy if exists uploads_staff_all on storage.objects;
create policy uploads_staff_all on storage.objects for all to authenticated
  using (bucket_id = 'uploads' and public.is_staff())
  with check (bucket_id = 'uploads' and public.is_staff());
