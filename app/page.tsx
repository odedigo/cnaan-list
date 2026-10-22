import { redirect } from "next/navigation";

import { createClient, hasPublicEnv } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  if (!hasPublicEnv()) redirect("/settings");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  redirect(user ? "/grocery" : "/settings");
}
