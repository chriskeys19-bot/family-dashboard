-- Optional practice length on a cricket reflection.
-- Existing row policies still apply. Kid tokens can only write their own rows.

alter table session_reflections
  add column if not exists duration_minutes integer;

alter table session_reflections
  drop constraint if exists session_reflections_duration_minutes_check;

alter table session_reflections
  add constraint session_reflections_duration_minutes_check
  check (duration_minutes is null or (duration_minutes > 0 and duration_minutes <= 1440));
