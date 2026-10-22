-- Category colors are generated hex values. Existing named colors are kept as the same hues.

update public.categories
set color = case lower(color)
  when 'blue' then '#2563EB'
  when 'orange' then '#F97316'
  when 'green' then '#16A34A'
  when 'purple' then '#7C3AED'
  when 'red' then '#E11D48'
  when 'teal' then '#0F766E'
  else upper(color)
end
where color !~ '^#[0-9A-Fa-f]{6}$';

alter table public.categories drop constraint if exists categories_color_check;
alter table public.categories drop constraint if exists categories_color_hex;
alter table public.categories alter column color set default '#2563EB';
alter table public.categories
  add constraint categories_color_hex check (color ~ '^#[0-9A-Fa-f]{6}$');
