import { AppShell } from "@/components/app-shell";
import { StartAtGrocery } from "@/components/start-at-grocery";
import { ListsProvider } from "@/components/lists-provider";
import { loadLists } from "@/lib/lists";
import { createClient, hasPublicEnv } from "@/lib/supabase/server";
import type { ListsData } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let signedIn = false;
  let initial: ListsData | null = null;
  if (hasPublicEnv()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      initial = await loadLists(user.id);
      signedIn = Boolean(user);
    }
  }

  const version = process.env.APP_VERSION ?? "";
  const content = (
    <>
      <StartAtGrocery signedIn={signedIn} />
      <AppShell signedIn={Boolean(initial)} version={version}>
        {children}
      </AppShell>
    </>
  );

  return initial ? <ListsProvider initial={initial}>{content}</ListsProvider> : content;
}
