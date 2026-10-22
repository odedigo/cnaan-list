"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { GroceryIcon, ProductsIcon, SettingsIcon } from "@/components/icons";
import { useListsOptional } from "@/components/lists-provider";

const tabs = [
  { href: "/inventory", label: "רשימת מוצרים", icon: ProductsIcon },
  { href: "/grocery", label: "רשימת קניות", icon: GroceryIcon },
  { href: "/settings", label: "הגדרות", icon: SettingsIcon },
] as const;

export function BottomNav({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname();
  const lists = useListsOptional();
  const groceryCount = lists?.grocery.length ?? 0;
  return (
    <nav
      dir="ltr"
      className="fixed bottom-0 left-1/2 z-50 flex w-full max-w-[480px] -translate-x-1/2 border-t border-neutral-200 bg-white pb-[env(safe-area-inset-bottom)]"
      aria-label="ניווט ראשי"
    >
      {tabs.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        const href = signedIn || tab.href === "/settings" ? tab.href : "/settings";
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={href}
            className={`flex flex-1 flex-col items-center gap-1 py-2 text-[11px] ${active ? "text-black" : "text-neutral-400"}`}
            aria-current={active ? "page" : undefined}
            aria-label={tab.href === "/grocery" && groceryCount > 0 ? `${tab.label}, ${groceryCount}` : undefined}
          >
            <span className="relative">
              <Icon className="size-6" />
              {tab.href === "/grocery" && groceryCount > 0 ? (
                <span className="absolute -top-1.5 -end-2 min-w-4 rounded-full bg-neutral-200 px-1 text-center text-[10px] font-semibold leading-4 text-neutral-600">
                  {groceryCount > 99 ? "99+" : groceryCount}
                </span>
              ) : null}
            </span>
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
