-- Allow יום פטירה on events. Run once in the Supabase SQL editor.
-- Safe when the events table is not there yet, or the new type is already allowed.

do $$
begin
  if to_regclass('public.events') is null then
    return;
  end if;
  alter table public.events drop constraint if exists events_kind_check;
  alter table public.events
    add constraint events_kind_check check (kind in ('birthday', 'anniversary', 'death', 'passing', 'other'));
end $$;
