# CnaanList

A mobile-first Hebrew grocery and inventory app. One login owns one inventory list and one grocery list. Several browsers can stay signed in to that same login at once, and Supabase Realtime keeps them in sync.

## Setup

1. Create a project at [supabase.com](https://supabase.com).
2. In the SQL editor, run [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) once. It creates the tables, row level security, the private `item-images` bucket, and Realtime.
3. In Authentication → URL configuration, set the site URL to `http://localhost:3000` and add these redirect URLs:
   - `http://localhost:3000/auth/callback`
   - `http://localhost:3000/auth/reset`
4. In Authentication → Providers, keep Email enabled. Turn on email confirmation, set the minimum password length to 8, and turn on leaked-password protection if the project offers it.
5. Copy `.env.example` to `.env.local` and fill in the project URL, the anon key, and the service role key. The service role key stays on the server. It is used only to resolve a username to an email at login and password reset.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. With no session, the app opens הגדרות and shows the login form. After login, a later visit opens רשימת הקניות.

## What to try

- Create an account, confirm the email, then log in from הגדרות.
- Log out and confirm the login form returns. Another browser signed into the same account stays signed in.
- Add a category with +, open it, and add a product with הוספת מוצר חדש.
- Reorder with the sliders button, then tap it again to save. Sort with the arrow button.
- On רשימת הקניות, search for an inventory product to add it. Tap a row to move it to בעגלת הקניות, and tap it there to send it back.
- Open a photo to enlarge it, and use החלפת תמונה to replace it.
- Sign the same account in on a second browser and confirm edits appear on both.
