-- Stored daily calorie and protein totals, summed from logged meals.
-- America/Los_Angeles calendar day. Existing dashboard RLS still applies.

create table if not exists nutrition_days (
  person_id text not null references people (id),
  day date not null,
  calories numeric not null default 0,
  protein_g numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (person_id, day)
);

alter table nutrition_days enable row level security;

drop policy if exists nutrition_days_all on nutrition_days;
create policy nutrition_days_all on nutrition_days for all to authenticated
  using (public.is_dashboard_session())
  with check (public.is_dashboard_session());

revoke all on table nutrition_days from public, anon;
grant select, insert, update, delete on table nutrition_days to authenticated;
grant all on table nutrition_days to service_role;

create or replace function public.refresh_nutrition_day(p_person text, p_day date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_person is null or p_day is null then
    return;
  end if;
  insert into nutrition_days (person_id, day, calories, protein_g, updated_at)
  select p_person, p_day,
    coalesce(sum(calories), 0),
    coalesce(sum(protein_g), 0),
    now()
  from nutrition_entries
  where person_id = p_person
    and source <> 'note'
    and calories is not null
    and (eaten_at at time zone 'America/Los_Angeles')::date = p_day
  on conflict (person_id, day) do update
    set calories = excluded.calories,
        protein_g = excluded.protein_g,
        updated_at = now();
end;
$$;

create or replace function public.nutrition_entries_refresh_day()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_nutrition_day(old.person_id, (old.eaten_at at time zone 'America/Los_Angeles')::date);
    return old;
  end if;
  perform public.refresh_nutrition_day(new.person_id, (new.eaten_at at time zone 'America/Los_Angeles')::date);
  if tg_op = 'UPDATE' and (old.person_id is distinct from new.person_id
    or (old.eaten_at at time zone 'America/Los_Angeles')::date
      is distinct from (new.eaten_at at time zone 'America/Los_Angeles')::date) then
    perform public.refresh_nutrition_day(old.person_id, (old.eaten_at at time zone 'America/Los_Angeles')::date);
  end if;
  return new;
end;
$$;

drop trigger if exists nutrition_entries_day_totals on nutrition_entries;
create trigger nutrition_entries_day_totals
  after insert or update or delete on nutrition_entries
  for each row execute function public.nutrition_entries_refresh_day();

insert into nutrition_days (person_id, day, calories, protein_g, updated_at)
select person_id,
  (eaten_at at time zone 'America/Los_Angeles')::date,
  coalesce(sum(calories), 0),
  coalesce(sum(protein_g), 0),
  now()
from nutrition_entries
where source <> 'note' and calories is not null
group by person_id, (eaten_at at time zone 'America/Los_Angeles')::date
on conflict (person_id, day) do update
  set calories = excluded.calories,
      protein_g = excluded.protein_g,
      updated_at = now();

revoke all on function public.refresh_nutrition_day(text, date) from public;
grant execute on function public.refresh_nutrition_day(text, date) to service_role;
