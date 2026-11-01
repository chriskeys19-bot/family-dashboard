-- Per-person sign-in. Apply this in the SQL editor. Do not use db push:
-- this project has no schema_migrations table.
--
-- auth-gate mints one of:
--   parent: dashboard_access=true, dashboard_role='parent'
--   kid:    dashboard_access=true, dashboard_role='kid', person_id='<kid id>'
-- Tokens minted before this change have no dashboard_role. They came from the
-- shared parent password, so they keep parent access until they expire.
-- A kid token can read and write only rows for that person_id.

create or replace function public.dashboard_role()
returns text
language sql
stable
as $$
  select case
    when coalesce(auth.jwt() ->> 'dashboard_access', '') <> 'true' then null
    else coalesce(nullif(auth.jwt() ->> 'dashboard_role', ''), 'parent')
  end;
$$;

create or replace function public.is_parent_session()
returns boolean
language sql
stable
as $$
  select coalesce(public.dashboard_role() = 'parent', false);
$$;

create or replace function public.session_person_id()
returns text
language sql
stable
as $$
  select case when public.dashboard_role() = 'kid'
    then nullif(auth.jwt() ->> 'person_id', '') end;
$$;

create or replace function public.can_access_person(p_person text)
returns boolean
language sql
stable
as $$
  select public.is_parent_session()
    or (public.session_person_id() is not null and p_person = public.session_person_id());
$$;

revoke all on function public.dashboard_role() from public;
revoke all on function public.is_parent_session() from public;
revoke all on function public.session_person_id() from public;
revoke all on function public.can_access_person(text) from public;
grant execute on function public.dashboard_role() to authenticated, service_role;
grant execute on function public.is_parent_session() to authenticated, service_role;
grant execute on function public.session_person_id() to authenticated, service_role;
grant execute on function public.can_access_person(text) to authenticated, service_role;

drop policy if exists people_select on people;
create policy people_select on people for select to authenticated
  using (public.is_parent_session() or role = 'parent' or id = public.session_person_id());

drop policy if exists categories_all on categories;
drop policy if exists categories_read on categories;
drop policy if exists categories_write on categories;
create policy categories_read on categories for select to authenticated
  using (public.is_dashboard_session());
create policy categories_write on categories for all to authenticated
  using (public.is_parent_session())
  with check (public.is_parent_session());

drop policy if exists events_all on events;
drop policy if exists events_read on events;
drop policy if exists events_write on events;
create policy events_read on events for select to authenticated
  using (public.is_parent_session()
    or (public.session_person_id() is not null and public.session_person_id() = any (people)));
create policy events_write on events for all to authenticated
  using (public.is_parent_session())
  with check (public.is_parent_session());

drop policy if exists nutrition_all on nutrition_entries;
create policy nutrition_all on nutrition_entries for all to authenticated
  using (public.can_access_person(person_id))
  with check (public.can_access_person(person_id));

drop policy if exists nutrition_days_all on nutrition_days;
create policy nutrition_days_all on nutrition_days for all to authenticated
  using (public.can_access_person(person_id))
  with check (public.can_access_person(person_id));

drop policy if exists training_all on training_entries;
create policy training_all on training_entries for all to authenticated
  using (public.can_access_person(person_id))
  with check (public.can_access_person(person_id));

drop policy if exists requests_all on event_requests;
create policy requests_all on event_requests for all to authenticated
  using (public.can_access_person(person_id))
  with check (public.can_access_person(person_id));

drop policy if exists memory_all on food_memory;
create policy memory_all on food_memory for all to authenticated
  using (public.can_access_person(person_id))
  with check (public.can_access_person(person_id));

drop policy if exists completions_all on completions;
create policy completions_all on completions for all to authenticated
  using (public.can_access_person(person_id))
  with check (public.can_access_person(person_id));

drop policy if exists reflections_all on session_reflections;
create policy reflections_all on session_reflections for all to authenticated
  using (public.can_access_person(person_id))
  with check (public.can_access_person(person_id));

drop policy if exists kid_needs_all on kid_needs;
create policy kid_needs_all on kid_needs for all to authenticated
  using (public.can_access_person(person_id))
  with check (public.can_access_person(person_id));

drop policy if exists kid_notes_all on kid_notes;
create policy kid_notes_all on kid_notes for all to authenticated
  using (public.can_access_person(person_id))
  with check (public.can_access_person(person_id));

drop policy if exists person_settings_all on person_settings;
create policy person_settings_all on person_settings for all to authenticated
  using (public.can_access_person(person_id))
  with check (public.can_access_person(person_id));

drop policy if exists body_measurements_all on body_measurements;
create policy body_measurements_all on body_measurements for all to authenticated
  using (public.can_access_person(person_id))
  with check (public.can_access_person(person_id));

drop policy if exists meal_photos_dashboard_read on storage.objects;
drop policy if exists meal_photos_dashboard_insert on storage.objects;
create policy meal_photos_dashboard_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'meal-photos'
    and public.can_access_person((storage.foldername(name))[1])
  );
create policy meal_photos_dashboard_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'meal-photos'
    and public.can_access_person((storage.foldername(name))[1])
  );
