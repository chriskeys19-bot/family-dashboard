-- How a run felt, and cricket notes tied to a check-off.

alter table training_entries
  add column if not exists feel smallint check (feel between 1 and 5);

create table session_reflections (
  id text primary key default gen_random_uuid()::text,
  completion_id text references completions (id) on delete set null,
  person_id text not null references people (id),
  event_id text not null,
  occurrence_on date not null,
  kind text not null check (kind in ('practice', 'game')),
  session_type text,
  focus text[] not null default '{}',
  focus_note text,
  learned text,
  feel smallint check (feel between 1 and 5),
  notes text,
  batted boolean not null default false,
  runs integer,
  balls integer,
  bowled boolean not null default false,
  overs numeric,
  wickets integer,
  catches integer,
  updated_at timestamptz not null default now(),
  unique (person_id, event_id, occurrence_on)
);

create index session_reflections_person_day_idx on session_reflections (person_id, occurrence_on);

alter table session_reflections enable row level security;

create policy reflections_all on session_reflections for all to authenticated
  using (public.is_dashboard_session())
  with check (public.is_dashboard_session());

revoke all on table session_reflections from public, anon;
grant select, insert, update, delete on table session_reflections to authenticated;
grant all on table session_reflections to service_role;
