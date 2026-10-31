-- Monthly height and weight check-in.
-- Apply this from the Supabase SQL editor or `supabase db push`.
-- The dashboard still loads if this table is not there yet.
--
-- A kid JWT carries person_id and can read or write only that kid's rows.
-- A parent session leaves person_id blank and can see every row.

create table if not exists body_measurements (
  id text primary key default gen_random_uuid()::text,
  person_id text not null references people (id),
  measured_on date not null,
  height_cm numeric not null check (height_cm > 80 and height_cm < 230),
  weight_kg numeric not null check (weight_kg > 10 and weight_kg < 200),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists body_measurements_person_day_idx
  on body_measurements (person_id, measured_on desc, created_at desc);

alter table body_measurements enable row level security;

drop policy if exists body_measurements_all on body_measurements;
create policy body_measurements_all on body_measurements for all to authenticated
  using (
    public.is_dashboard_session()
    and (
      coalesce(auth.jwt() ->> 'person_id', '') = ''
      or person_id = (auth.jwt() ->> 'person_id')
    )
  )
  with check (
    public.is_dashboard_session()
    and (
      coalesce(auth.jwt() ->> 'person_id', '') = ''
      or person_id = (auth.jwt() ->> 'person_id')
    )
  );

revoke all on table body_measurements from public, anon;
grant select, insert, update, delete on table body_measurements to authenticated;
grant all on table body_measurements to service_role;
