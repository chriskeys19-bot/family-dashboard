-- Private meal photos and the monthly Gemini cap.
-- Photos are not part of this repo. The Edge Function reads them with the service role.

create table photo_usage (
  month_key text primary key,
  photo_count integer not null default 0 check (photo_count >= 0)
);

alter table photo_usage enable row level security;
revoke all on table photo_usage from public, anon, authenticated;
grant all on table photo_usage to service_role;

-- Reserves one photo credit for the Pacific month. Returns the new count, or -1 at the cap.
create or replace function public.reserve_photo_credit(p_month text, p_cap integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  next_count integer;
begin
  if p_cap is null or p_cap < 1 then
    p_cap := 600;
  end if;
  insert into photo_usage (month_key, photo_count)
  values (p_month, 1)
  on conflict (month_key) do update
    set photo_count = photo_usage.photo_count + 1
    where photo_usage.photo_count < p_cap
  returning photo_count into next_count;
  if next_count is null then
    return -1;
  end if;
  return next_count;
end;
$$;

create or replace function public.release_photo_credit(p_month text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update photo_usage
  set photo_count = greatest(photo_count - 1, 0)
  where month_key = p_month;
end;
$$;

revoke all on function public.reserve_photo_credit(text, integer) from public, anon, authenticated;
revoke all on function public.release_photo_credit(text) from public, anon, authenticated;
grant execute on function public.reserve_photo_credit(text, integer) to service_role;
grant execute on function public.release_photo_credit(text) to service_role;

insert into storage.buckets (id, name, public)
values ('meal-photos', 'meal-photos', false)
on conflict (id) do update set public = false;

drop policy if exists meal_photos_dashboard_read on storage.objects;
drop policy if exists meal_photos_dashboard_insert on storage.objects;

create policy meal_photos_dashboard_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'meal-photos'
    and public.is_dashboard_session()
  );

create policy meal_photos_dashboard_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'meal-photos'
    and public.is_dashboard_session()
  );
