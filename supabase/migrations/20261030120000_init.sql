-- Home Board schema. Kid-vs-parent filtering is a view choice in the app.
-- Server-side protection is the shared dashboard session: row access requires a
-- JWT whose dashboard_access claim is true (minted by the auth-gate function).
-- The anon key alone cannot read or write these tables.

create table people (
  id text primary key,
  name text not null,
  role text not null check (role in ('parent', 'kid')),
  sort_order integer not null
);

create table categories (
  id text primary key,
  label text not null,
  color text not null,
  icon text not null default 'book',
  sort_order integer not null,
  visible_to_kids boolean not null default true
);

create table events (
  id text primary key default gen_random_uuid()::text,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  all_day boolean not null default false,
  multi_day boolean not null default false,
  location text,
  people text[] not null default '{}',
  category_id text not null references categories (id),
  status text not null check (status in ('confirmed', 'potential', 'not_picked', 'requested')),
  source text,
  notes text,
  created_at timestamptz not null default now(),
  constraint events_time_order check (ends_at > starts_at),
  constraint events_people_nonempty check (cardinality(people) > 0)
);

create table nutrition_entries (
  id text primary key default gen_random_uuid()::text,
  person_id text not null references people (id),
  eaten_at timestamptz not null,
  meal text not null check (meal in ('breakfast', 'lunch', 'dinner', 'snack')),
  description text not null,
  items jsonb not null default '[]'::jsonb,
  calories numeric,
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  is_estimate boolean not null default true,
  note text,
  source text not null default 'note' check (source in ('fdc', 'note', 'photo')),
  photo_path text,
  created_at timestamptz not null default now()
);

comment on column nutrition_entries.photo_path is
  'Reserved for a future photo-to-nutrition add-on. The app does not upload photos.';
comment on column nutrition_entries.source is
  'fdc = USDA estimate, note = plain text with no macros, photo = future vision add-on.';

create table training_entries (
  id text primary key default gen_random_uuid()::text,
  person_id text not null references people (id),
  trained_on date not null,
  session_type text not null check (session_type in ('intervals', 'tempo', 'easy', 'race')),
  distance_m numeric not null check (distance_m > 0),
  distance_input numeric,
  distance_unit text check (distance_unit in ('m', 'mi')),
  duration_seconds integer not null check (duration_seconds > 0),
  note text,
  created_at timestamptz not null default now()
);

create table event_requests (
  id text primary key default gen_random_uuid()::text,
  person_id text not null references people (id),
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location text,
  notes text,
  category_id text not null default 'social' references categories (id),
  status text not null default 'requested' check (status in ('requested', 'handled')),
  handled_at timestamptz,
  created_at timestamptz not null default now(),
  constraint event_requests_time_order check (ends_at > starts_at)
);

create table food_memory (
  id text primary key default gen_random_uuid()::text,
  person_id text not null references people (id),
  query_norm text not null,
  fdc_id text not null,
  label text not null,
  calories numeric,
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  basis text,
  basis_grams numeric,
  piece_grams numeric,
  updated_at timestamptz not null default now(),
  unique (person_id, query_norm)
);

create index events_range_idx on events (starts_at, ends_at);
create index events_category_idx on events (category_id);
create index nutrition_person_time_idx on nutrition_entries (person_id, eaten_at);
create index training_person_date_idx on training_entries (person_id, trained_on desc);
create index event_requests_status_idx on event_requests (status, starts_at);

create or replace function public.is_dashboard_session()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'dashboard_access', '') = 'true';
$$;

revoke all on function public.is_dashboard_session() from public;
grant execute on function public.is_dashboard_session() to authenticated, service_role;

alter table people enable row level security;
alter table categories enable row level security;
alter table events enable row level security;
alter table nutrition_entries enable row level security;
alter table training_entries enable row level security;
alter table event_requests enable row level security;
alter table food_memory enable row level security;

-- No policies for anon. Authenticated access still requires the dashboard claim,
-- so a normal Supabase Auth user cannot read the family tables.

create policy people_select on people for select to authenticated
  using (public.is_dashboard_session());

create policy categories_all on categories for all to authenticated
  using (public.is_dashboard_session())
  with check (public.is_dashboard_session());

create policy events_all on events for all to authenticated
  using (public.is_dashboard_session())
  with check (public.is_dashboard_session());

create policy nutrition_all on nutrition_entries for all to authenticated
  using (public.is_dashboard_session())
  with check (public.is_dashboard_session());

create policy training_all on training_entries for all to authenticated
  using (public.is_dashboard_session())
  with check (public.is_dashboard_session());

create policy requests_all on event_requests for all to authenticated
  using (public.is_dashboard_session())
  with check (public.is_dashboard_session());

create policy memory_all on food_memory for all to authenticated
  using (public.is_dashboard_session())
  with check (public.is_dashboard_session());

revoke all on table people from public, anon;
revoke all on table categories from public, anon;
revoke all on table events from public, anon;
revoke all on table nutrition_entries from public, anon;
revoke all on table training_entries from public, anon;
revoke all on table event_requests from public, anon;
revoke all on table food_memory from public, anon;

grant select on table people to authenticated;
grant select, insert, update, delete on table categories to authenticated;
grant select, insert, update, delete on table events to authenticated;
grant select, insert, update, delete on table nutrition_entries to authenticated;
grant select, insert, update, delete on table training_entries to authenticated;
grant select, insert, update, delete on table event_requests to authenticated;
grant select, insert, update, delete on table food_memory to authenticated;

grant all on table people to service_role;
grant all on table categories to service_role;
grant all on table events to service_role;
grant all on table nutrition_entries to service_role;
grant all on table training_entries to service_role;
grant all on table event_requests to service_role;
grant all on table food_memory to service_role;
