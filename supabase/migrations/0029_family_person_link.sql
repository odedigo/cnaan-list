-- Links the same person across family trees. People who share a link_id are one person. Run once in the Supabase SQL editor.

alter table public.family_people add column if not exists link_id uuid;

create index if not exists family_people_link_idx on public.family_people (account_id, link_id) where link_id is not null;
