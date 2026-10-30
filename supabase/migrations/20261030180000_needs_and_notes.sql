-- Kid wish list and private notes.
-- Sibling privacy is a view rule: one shared dashboard session can read every row.
-- The journal export uses the service role and JOURNAL_EXPORT_TOKEN, not the anon key.

create table kid_needs (
  id text primary key default gen_random_uuid()::text,
  person_id text not null references people (id),
  item text not null,
  why text,
  needed_on date,
  link text,
  urgency text not null default 'normal' check (urgency in ('low', 'normal', 'soon')),
  status text not null default 'open' check (status in ('open', 'approved', 'not_now', 'bought')),
  parent_reply text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table kid_notes (
  id text primary key default gen_random_uuid()::text,
  person_id text not null references people (id),
  body text not null,
  mood text,
  created_at timestamptz not null default now()
);

create index kid_needs_person_idx on kid_needs (person_id, updated_at desc);
create index kid_notes_person_idx on kid_notes (person_id, created_at desc);

alter table kid_needs enable row level security;
alter table kid_notes enable row level security;

create policy kid_needs_all on kid_needs for all to authenticated
  using (public.is_dashboard_session())
  with check (public.is_dashboard_session());

create policy kid_notes_all on kid_notes for all to authenticated
  using (public.is_dashboard_session())
  with check (public.is_dashboard_session());

revoke all on table kid_needs from public, anon;
revoke all on table kid_notes from public, anon;
grant select, insert, update, delete on table kid_needs to authenticated;
grant select, insert, update, delete on table kid_notes to authenticated;
grant all on table kid_needs to service_role;
grant all on table kid_notes to service_role;
