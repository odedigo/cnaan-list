import { SignedOutSettings } from "@/components/settings-panel";
import { hasServiceEnv } from "@/lib/supabase/admin";
import { createClient, hasPublicEnv } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  const version = process.env.APP_VERSION ?? "";
  if (!hasPublicEnv()) {
    return <SignedOutSettings configured={false} authError={params.error} version={version} />;
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return <SignedOutSettings configured={hasServiceEnv()} authError={params.error} version={version} />;
  return null;
}
