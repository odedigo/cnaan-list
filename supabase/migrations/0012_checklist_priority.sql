-- Optional priority on a checklist line. Run once in the Supabase SQL editor.

alter table public.checklist_rows
  add column if not exists priority text;

do $$
begin
  alter table public.checklist_rows
    add constraint checklist_rows_priority_check
    check (priority is null or priority in ('immediate', 'high', 'medium', 'low'));
exception
  when duplicate_object then null;
end $$;
