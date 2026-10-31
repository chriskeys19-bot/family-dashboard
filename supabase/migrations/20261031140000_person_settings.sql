-- Assumed body weight used for MET calorie-burn estimates.
-- Parents edit it from the This week card. 40 kg is the starting assumption.

create table if not exists person_settings (
  person_id text primary key references people (id),
  weight_kg numeric not null check (weight_kg > 10 and weight_kg < 200),
  updated_at timestamptz not null default now()
);

alter table person_settings enable row level security;

drop policy if exists person_settings_all on person_settings;
create policy person_settings_all on person_settings for all to authenticated
  using (public.is_dashboard_session())
  with check (public.is_dashboard_session());

revoke all on table person_settings from public, anon;
grant select, insert, update, delete on table person_settings to authenticated;
grant all on table person_settings to service_role;

insert into person_settings (person_id, weight_kg)
select id, 40 from people where role = 'kid'
on conflict (person_id) do nothing;
