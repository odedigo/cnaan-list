import Link from "next/link";

import { AdminAccounts } from "@/components/admin-accounts";
import { listManagedAccounts, requireAdmin } from "@/lib/admin-accounts";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const admin = await requireAdmin();
  if (!admin) {
    return (
      <main className="admin-screen">
        <p className="admin-phone">עמוד זה זמין רק במחשב</p>
        <div className="admin-desk grid min-h-dvh place-items-center px-6 text-center">
          <div>
            <p className="text-lg">אין הרשאה לצפות בעמוד זה</p>
            <Link href="/settings" className="mt-4 inline-block text-sm text-[var(--teal)]">
              חזרה להגדרות
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const loaded = await listManagedAccounts();
  if (loaded.error) {
    return (
      <main className="admin-screen">
        <p className="admin-phone">עמוד זה זמין רק במחשב</p>
        <div className="admin-desk grid min-h-dvh place-items-center px-6 text-center">
          <div>
            <p className="text-lg">{loaded.error}</p>
            <Link href="/grocery" className="mt-4 inline-block text-sm text-[var(--teal)]">
              חזרה לאפליקציה
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return <AdminAccounts selfId={admin.id} accounts={loaded.accounts} />;
}
