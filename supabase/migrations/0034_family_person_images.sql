-- Photos for people in a family tree. Run once in the Supabase SQL editor.

create table if not exists public.family_person_images (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references public.family_trees (id) on delete cascade,
  person_xref text not null,
  content_type text not null,
  data text not null,
  thumbnail boolean not null default false,
  created_at timestamptz not null default now(),
  constraint family_person_images_xref_length check (char_length(btrim(person_xref)) between 1 and 80),
  constraint family_person_images_type_check check (content_type in ('image/webp', 'image/jpeg', 'image/png')),
  constraint family_person_images_data_length check (char_length(data) between 1 and 700000)
);

create index if not exists family_person_images_tree_person_idx
  on public.family_person_images (tree_id, person_xref, created_at);

create unique index if not exists family_person_images_one_thumbnail_idx
  on public.family_person_images (tree_id, person_xref)
  where thumbnail;

alter table public.family_person_images enable row level security;

drop policy if exists "own family person images" on public.family_person_images;
create policy "own family person images"
  on public.family_person_images for all to authenticated
  using (
    tree_id in (
      select id from public.family_trees
      where account_id in (select id from public.accounts where owner_id = auth.uid())
    )
  )
  with check (
    tree_id in (
      select id from public.family_trees
      where account_id in (select id from public.accounts where owner_id = auth.uid())
    )
  );

revoke all on public.family_person_images from anon;
grant select, insert, update, delete on public.family_person_images to authenticated;
