-- Completions, optional daily-content bank, and the private family photo bucket.
-- family-banner.jpg is NOT part of this repo and must not be added to the Pages site.

create table completions (
  id text primary key default gen_random_uuid()::text,
  person_id text not null references people (id),
  item_type text not null check (item_type in ('event', 'request', 'nutrition', 'training')),
  item_id text not null,
  occurrence_on date not null,
  completed_at timestamptz,
  unique (person_id, item_type, item_id, occurrence_on)
);

create index completions_person_day_idx on completions (person_id, occurrence_on);

create table daily_content (
  id text primary key default gen_random_uuid()::text,
  list_key text not null check (list_key in ('kid_quotes', 'jokes', 'parent_quotes', 'calm', 'tips')),
  sort_order integer not null,
  body text not null,
  attribution text,
  unique (list_key, sort_order)
);

comment on table daily_content is
  'Optional copy of site/data/boost.json. When this table has rows, the app uses them instead of the bundled bank.';

alter table completions enable row level security;
alter table daily_content enable row level security;

create policy completions_all on completions for all to authenticated
  using (public.is_dashboard_session())
  with check (public.is_dashboard_session());

create policy daily_content_read on daily_content for select to authenticated
  using (public.is_dashboard_session());

revoke all on table completions from public, anon;
revoke all on table daily_content from public, anon;
grant select, insert, update, delete on table completions to authenticated;
grant select on table daily_content to authenticated;
grant all on table completions to service_role;
grant all on table daily_content to service_role;

-- Private bucket. The Storage UI upload uses the project owner, not the family password.
insert into storage.buckets (id, name, public)
values ('family-media', 'family-media', false)
on conflict (id) do update set public = false;

drop policy if exists family_media_dashboard_read on storage.objects;
create policy family_media_dashboard_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'family-media'
    and public.is_dashboard_session()
  );
