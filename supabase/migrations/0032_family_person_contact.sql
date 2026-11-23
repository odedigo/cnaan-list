-- Address, city, country, and email from GEDCOM. Run once in the Supabase SQL editor.

alter table public.family_people add column if not exists address text not null default '';
alter table public.family_people add column if not exists city text not null default '';
alter table public.family_people add column if not exists country text not null default '';
alter table public.family_people add column if not exists email text not null default '';

alter table public.family_people drop constraint if exists family_people_address_length;
alter table public.family_people
  add constraint family_people_address_length check (char_length(address) <= 500);

alter table public.family_people drop constraint if exists family_people_city_length;
alter table public.family_people
  add constraint family_people_city_length check (char_length(city) <= 120);

alter table public.family_people drop constraint if exists family_people_country_length;
alter table public.family_people
  add constraint family_people_country_length check (char_length(country) <= 120);

alter table public.family_people drop constraint if exists family_people_email_length;
alter table public.family_people
  add constraint family_people_email_length check (char_length(email) <= 200);
