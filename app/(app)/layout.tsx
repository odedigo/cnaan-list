import { BottomNav } from "@/components/bottom-nav";
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

  const content = (
    <>
      <div className="pb-24">{children}</div>
      <BottomNav signedIn={signedIn} />
    </>
  );

  return initial ? <ListsProvider initial={initial}>{content}</ListsProvider> : content;
}
