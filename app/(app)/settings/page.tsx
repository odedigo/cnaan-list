import { AppHeader } from "@/components/app-header";
import { SignedInSettings, SignedOutSettings } from "@/components/settings-panel";
import { hasServiceEnv } from "@/lib/supabase/admin";
import { createClient, hasPublicEnv } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  if (!hasPublicEnv()) {
    return <SignedOutSettings configured={false} authError={params.error} />;
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return <SignedOutSettings configured={hasServiceEnv()} authError={params.error} />;
  const { data: profile } = await supabase.from("profiles").select("username").eq("id", user.id).maybeSingle();
  return (
    <>
      <AppHeader title="הגדרות" actionsEnabled={false} />
      <SignedInSettings username={profile?.username ?? ""} />
    </>
  );
}
