import { cookies } from "next/headers";

import { AppShell } from "@/components/app-shell";
import { StartAtGrocery } from "@/components/start-at-grocery";
import { ListsProvider } from "@/components/lists-provider";

export const dynamic = "force-dynamic";

function hasSession(all: { name: string }[]) {
  return all.some((cookie) => cookie.name.startsWith("sb-") && cookie.name.includes("auth-token"));
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const version = process.env.APP_VERSION ?? "";
  const cookieStore = await cookies();
  const signedIn = hasSession(cookieStore.getAll());
  const content = (
    <>
      <StartAtGrocery signedIn={signedIn} />
      <AppShell signedIn={signedIn} version={version}>
        {children}
      </AppShell>
    </>
  );

  return signedIn ? <ListsProvider>{content}</ListsProvider> : content;
}
