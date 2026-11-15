-- Drop a stored image link from events, if the first events script already added it.
-- Run once in the Supabase SQL editor. Safe when the table or column is already gone.

do $$
begin
  if to_regclass('public.events') is null then
    return;
  end if;
  alter table public.events drop constraint if exists events_image_url_check;
  alter table public.events drop column if exists image_url;
end $$;
