-- =============================================================================
-- Lumina Library · Supabase schema  (0001)
--
-- This replaces the Google Sheets / Apps Script data store. Run the combined
-- supabase/setup.sql once in the Supabase SQL Editor (or apply migrations 0001–0003 in order).
--
-- Design rules that carry over from the Sheets backend:
--   * Availability is DERIVED (total copies − active loans), never stored, so it
--     can never drift from the loan table.
--   * Roles live in the database and are checked by the database, never by the
--     browser.
--   * RLS is enabled with NO policies: the tables are unreachable directly with
--     the anon or authenticated key. Every read and write goes through the
--     api() function in 0002, which is the single auditable gate.
--   * Fines are simulated. Nothing here charges anybody.
-- =============================================================================

-- ----------------------------------------------------------------- enums ----
do $$ begin
  create type public.user_role as enum ('ADMIN', 'LIBRARIAN', 'FACULTY', 'STUDENT');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.account_status as enum ('ACTIVE', 'INACTIVE');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.book_status as enum ('ACTIVE', 'ARCHIVED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.loan_status as enum ('ACTIVE', 'RETURNED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.reservation_status as enum ('PENDING', 'READY', 'FULFILLED', 'CANCELLED', 'EXPIRED');
exception when duplicate_object then null; end $$;

-- -------------------------------------------------------------- sequences ---
create sequence if not exists public.user_code_seq start 1;
create sequence if not exists public.book_code_seq start 1001;
create sequence if not exists public.loan_code_seq start 1;
create sequence if not exists public.reservation_code_seq start 1;

-- --------------------------------------------------------------- profiles ---
create table if not exists public.profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  user_code        text not null unique default ('U-' || lpad(nextval('public.user_code_seq')::text, 4, '0')),
  full_name        text not null,
  email            text not null unique,
  institutional_id text not null unique,
  role             public.user_role not null default 'STUDENT',
  department       text not null default '',
  phone            text not null default '',
  account_status   public.account_status not null default 'ACTIVE',
  borrowing_limit  integer check (borrowing_limit is null or borrowing_limit between 0 and 50),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists profiles_role_idx on public.profiles (role);

-- ------------------------------------------------------------------ books ---
create table if not exists public.books (
  book_id         text primary key default ('BK-' || nextval('public.book_code_seq')::text),
  title           text not null,
  author          text not null default '',
  isbn            text not null default '',
  publisher       text not null default '',
  year            integer not null default extract(year from now())::int,
  category        text not null default 'General',
  description     text not null default '',
  shelf_location  text not null default '',
  total_copies    integer not null default 1 check (total_copies >= 0),
  record_status   public.book_status not null default 'ACTIVE',
  cover_image_url text,
  tags            text[] not null default '{}',
  added_at        timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists books_category_idx on public.books (category);

-- ------------------------------------------------------------------ loans ---
create table if not exists public.loans (
  loan_id       text primary key default ('LN-' || lpad(nextval('public.loan_code_seq')::text, 4, '0')),
  book_id       text not null references public.books (book_id) on delete restrict,
  user_id       uuid not null references public.profiles (id) on delete restrict,
  issued_by     uuid references public.profiles (id) on delete set null,
  issue_date    timestamptz not null default now(),
  due_date      timestamptz not null,
  return_date   timestamptz,
  loan_status   public.loan_status not null default 'ACTIVE',
  renewal_count integer not null default 0,
  fine_amount   numeric(10, 2) not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint loans_returned_has_date check (loan_status <> 'RETURNED' or return_date is not null)
);

create index if not exists loans_user_idx on public.loans (user_id);
create index if not exists loans_book_idx on public.loans (book_id);
-- One member can never hold two copies of the same title, and a copy is never
-- double-issued, because availability is derived from this same predicate.
create unique index if not exists loans_one_active_per_title
  on public.loans (book_id, user_id) where loan_status = 'ACTIVE';

-- ----------------------------------------------------------- reservations ---
create table if not exists public.reservations (
  reservation_id     text primary key default ('RS-' || lpad(nextval('public.reservation_code_seq')::text, 4, '0')),
  book_id            text not null references public.books (book_id) on delete restrict,
  user_id            uuid not null references public.profiles (id) on delete cascade,
  reservation_date   timestamptz not null default now(),
  queue_position     integer not null default 1,
  reservation_status public.reservation_status not null default 'PENDING',
  expiry_date        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists reservations_book_idx on public.reservations (book_id);
create unique index if not exists reservations_one_live_per_title
  on public.reservations (book_id, user_id) where reservation_status in ('PENDING', 'READY');

-- -------------------------------------------------------------- wishlists ---
create table if not exists public.wishlists (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  book_id    text not null references public.books (book_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, book_id)
);

-- ---------------------------------------------------------------- settings ---
create table if not exists public.settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------- activity log ---
create table if not exists public.activity_log (
  id            bigserial primary key,
  actor_user_id uuid references public.profiles (id) on delete set null,
  action        text not null,
  entity_type   text not null default '',
  entity_id     text not null default '',
  summary       text not null default '',
  created_at    timestamptz not null default now()
);

create index if not exists activity_log_created_idx on public.activity_log (created_at desc);

-- ---------------------------------------------------------------- triggers ---
create or replace function public.touch_updated_at()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
begin
  new.updated_at := now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['profiles', 'books', 'loans', 'reservations'] loop
    execute format('drop trigger if exists touch_%1$s on public.%1$s', t);
    execute format(
      'create trigger touch_%1$s before update on public.%1$s for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

-- Whenever a Supabase Auth user is created (sign-up, invite, or the admin helper
-- in 0002), give them a membership. The trigger is deliberately tolerant: if the
-- profile already exists — e.g. it was created first by an administrator — it
-- only links the auth id.
create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_name text := coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1));
  v_inst text := coalesce(new.raw_user_meta_data ->> 'institutional_id', split_part(new.email, '@', 1));
begin
  insert into public.profiles (id, full_name, email, institutional_id)
  values (new.id, v_name, new.email, v_inst)
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(nullif(excluded.full_name, ''), public.profiles.full_name),
        updated_at = now();
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

-- ------------------------------------------------------- settings helpers ---
create or replace function public.setting(p_key text, p_default text default null)
returns text language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select value from public.settings where key = p_key), p_default);
$$;

create or replace function public.setting_int(p_key text, p_default integer)
returns integer language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(nullif(regexp_replace(coalesce(public.setting(p_key, null), ''), '[^0-9\-]', '', 'g'), '')::int, p_default);
$$;

-- ------------------------------------------------------ availability maths ---
-- The single source of truth for "how many can I borrow right now".
create or replace function public.book_availability(p_book_id text)
returns table (total integer, on_loan integer, available integer)
language sql stable security definer set search_path = public, pg_temp as $$
  select b.total_copies::int,
         coalesce(l.n, 0)::int,
         greatest(0, b.total_copies - coalesce(l.n, 0))::int
  from public.books b
  left join (
    select book_id, count(*)::int as n
    from public.loans
    where loan_status = 'ACTIVE'
    group by book_id
  ) l on l.book_id = b.book_id
  where b.book_id = p_book_id;
$$;

create or replace function public.overdue_days(p_due timestamptz)
returns integer language sql stable as $$
  -- Fines follow the library's India/Calcutta calendar day, not the database UTC day.
  select greatest(0, timezone('Asia/Kolkata', now())::date - timezone('Asia/Kolkata', p_due)::date);
$$;

create or replace function public.fine_per_day()
returns numeric language sql stable security definer set search_path = public, pg_temp as $$
  select public.setting_int('fine_per_day', 5)::numeric;
$$;

-- ------------------------------------------------------------------ ledger ---
create or replace function public.log_activity(
  p_actor uuid, p_action text, p_entity_type text, p_entity_id text, p_summary text
) returns void language sql security definer set search_path = public, pg_temp as $$
  insert into public.activity_log (actor_user_id, action, entity_type, entity_id, summary)
  values (p_actor, p_action, p_entity_type, p_entity_id, p_summary);
$$;

-- Initial policy values, matching the prior backend. They are inserted only if
-- absent so re-running this seed never overwrites an administrator's settings.
insert into public.settings (key, value) values
  ('library_name', 'Lumina Central Library'),
  ('loan_duration_days', '14'),
  ('max_renewals', '2'),
  ('renewal_extension_days', '14'),
  ('fine_per_day', '5'),
  ('student_borrow_limit', '4'),
  ('faculty_borrow_limit', '8'),
  ('reservation_hold_days', '3'),
  ('allow_self_checkout', 'false'),
  ('block_issue_on_unpaid_fines', 'false'),
  ('fine_block_threshold', '100')
on conflict (key) do nothing;

-- =========================================================== RLS posture ====
-- Deliberately no policies: `anon` and `authenticated` cannot touch these tables
-- directly. Reads and writes go through lumina_api() (security definer) in 0002, which
-- checks auth.uid(), role and account status on every call. This means a leaked
-- anon key cannot enumerate members, loans or fines.
alter table public.profiles     enable row level security;
alter table public.books        enable row level security;
alter table public.loans        enable row level security;
alter table public.reservations enable row level security;
alter table public.wishlists    enable row level security;
alter table public.settings     enable row level security;
alter table public.activity_log enable row level security;

revoke all on public.profiles, public.books, public.loans, public.reservations,
               public.wishlists, public.settings, public.activity_log
  from anon, authenticated;

-- service_role is used only by the private Supabase Edge Function for account
-- administration. Its key must never be placed in the frontend or shared here.
grant all on public.profiles, public.books, public.loans, public.reservations,
            public.wishlists, public.settings, public.activity_log
  to service_role;

grant usage, select on all sequences in schema public to service_role;

-- These helpers are for the SECURITY DEFINER API in migration 0002 only. Never
-- expose them as independent PostgREST RPCs.
revoke execute on function public.touch_updated_at() from public, anon, authenticated;
revoke execute on function public.handle_new_auth_user() from public, anon, authenticated;
revoke execute on function public.setting(text, text) from public, anon, authenticated;
revoke execute on function public.setting_int(text, integer) from public, anon, authenticated;
revoke execute on function public.book_availability(text) from public, anon, authenticated;
revoke execute on function public.overdue_days(timestamptz) from public, anon, authenticated;
revoke execute on function public.fine_per_day() from public, anon, authenticated;
revoke execute on function public.log_activity(uuid, text, text, text, text) from public, anon, authenticated;
