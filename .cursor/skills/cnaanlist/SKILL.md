---
name: cnaanlist
description: >-
  Guides changes to CnaanList, the Hebrew RTL grocery and inventory app on
  Supabase. All UI follows Hebrew right-to-left layout. Use when editing this
  repo's UI, auth, grocery sync, inventory, stores, settings, checklists,
  navigation, images, or Supabase schema.
---

# CnaanList

Hebrew RTL Next.js App Router app (`lang=he`, `dir=rtl`). One account has one inventory list and one grocery list. Nothing is shared across accounts. The app column is `max-w-[480px]`.

## Hebrew RTL

This is a Hebrew right-to-left app. Every screen, dialog, label, and control follows that direction.

- UI copy is Hebrew. Labels and text align to the right. Use `text-start`. `text-end` aligns to the physical left.
- The start side is the physical right. Place a checkbox, radio, or leading icon on the right of its label. The label continues to the left.
- Do not set `dir=ltr` on a Hebrew row to copy a left-to-right mockup. A control on the left of a screenshot is on the end side.
- Use logical properties (`ps`, `pe`, `start`, `end`, `margin-inline`) for Hebrew layout. Physical `left` and `right` are only for the documented `dir=ltr` exceptions.
- Header chrome and the bottom nav are `dir=ltr`. Nothing else is.

## Leave alone unless asked

- Do not edit `docs/cnaanlist-plan.md` or expand the README.
- Do not print `.env.local` values, service-role keys, or tokens. Do not commit secrets.
- Do not commit unless asked.
- Do not reseed or overwrite live store colors or names.
- Keep the image-search control hidden. Do not re-enable Google Custom Search or re-run `scripts/import-images.ts`.
- The `item-images` bucket allows only `image/webp`, `image/jpeg`, and `image/png`.

## Auth and environments

- Login accepts a username or an email, plus a password. A username is resolved with the service-role RPC `email_for_username`, then `signInWithPassword`.
- Logout only deletes cookies whose names start with `sb-`. It must not call `auth.signOut`. Other devices stay signed in.
- `PRODUCTION === "true"` selects `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Any other value selects the `_DEV` pair. `next.config.ts` inlines `PRODUCTION` for the browser. Restart the dev server after changing it.
- Session refresh is `proxy.ts` exporting `proxy`. Do not add `middleware.ts` beside it. `lib/supabase/middleware.ts` is only the helper.
- Schema changes are SQL files the user runs in the Supabase SQL editor. The service role cannot run DDL. This project has no Supabase CLI.

## Navigation

Signed-in grocery, inventory, lists, and settings are switched in `components/app-shell.tsx`. The layout is `force-dynamic`, so a Next.js history call refetches it.

- Capture the native `pushState` and `replaceState` in `useLayoutEffect` and use those. Next.js patches the methods.
- An installed app (`display-mode: standalone` or `navigator.standalone`) uses `replaceState` so `history.length` stays 1. Closing needs that single entry.
- `/lists` returns null; the shell renders `ChecklistPage`. Signed-in `/settings` returns null; the shell renders `SignedInSettings`, and that screen unmounts when the path leaves `/settings`.
- Grocery, inventory, and lists stay mounted after the 250ms warm. Swipe only between grocery and inventory.
- Bottom nav order, visually left to right: `/inventory` רשימת מוצרים, `/grocery` עגלת קניות, `/lists` רשימות, `/settings` הגדרות. The grocery badge is `grocery.length`, including purchased lines.

## Grocery

Marking an item purchased, or moving it back, updates the list on screen first and talks to the server after that.

1. `rememberPendingGrocery` for that item.
2. `flushSync` the `checked` change on grocery state so the row leaves or re-enters its category before any request.
3. Call `syncPendingGrocery` without awaiting it. Skip the network when `navigator.onLine` is false. Pending changes stay in `localStorage` under `cnaanlist-grocery-pending:${accountId}`.

`mergePendingGrocery` must overlay those pending checks on every refetch. A realtime refetch of `grocery_items` must not move the row back. Realtime also refetches categories, items, checklist rows, and stores. Skip refetch while an import or reorder is in progress.

An inventory click toggles grocery membership. The teal card (`bg-[#d7efe9]`) means the product is on the grocery list, including a purchased line.

## Inventory, stores, and local settings

- Insert a new category or product at the Hebrew alphabetical index among its siblings (`nameInsertIndex`). Do not re-sort the whole list, and do not re-sort on rename.
- One store per account has `protected` set. It cannot be deleted. When store badges are on, show that store's current name too.
- `cnaanlist-show-store-badge`: missing or any value other than `"0"` means on. The same flag controls inventory and grocery badges.
- `cnaanlist-single-open-category` uses the same default-on pattern. Inventory treats a category as expanded when `collapsed[id] === false`.
- These flags live in `localStorage` only. Write them and dispatch the matching event so both lists update.

## UI

- In a client component, `"use client"` is the first line. The file comment comes immediately after it.
- Native selects get their chevron from `app/globals.css` (`appearance: none`, arrow `1rem` from the physical left, `padding-inline-end: 2.75rem`). Do not add a second chevron. Use `ps-3` on a select, not `px-3`, or the end padding is lost.
- Tailwind v4 does not emit every utility. Use an inline `borderColor` of `#000` for a true black border. Prefer an inline style when a spacing or overlay utility may not be emitted.
- Product images are stored at `${accountId}/{items|categories}/${id}/${uuid}.webp|jpg` in the private `item-images` bucket. Deleting a product deletes the row first (grocery lines cascade), then the storage objects, the `cnaanlist-images` Cache API entry, and any blob URLs.

## Verify

After a UI change, exercise the changed flow in the browser. Grocery, inventory, and lists can all be in the accessibility tree while hidden. Click the one whose box has a non-zero size. Do not leave the page offline or with `fetch` replaced.
