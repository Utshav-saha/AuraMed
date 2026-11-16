"use client";

import { useState, type ReactNode, type FormEvent } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, Pill, MapPin, ShoppingBag, Calculator, CalendarDays, LogOut, Search, ChevronDown } from "lucide-react";
import { useRequireAuth } from "@/lib/auth-context";
import { ChatProvider } from "./ChatContext";
import DrugSafetyChat from "./DrugSafetyChat";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/medicines", label: "Medicines", icon: Pill },
  { href: "/location", label: "Pharmacies", icon: MapPin },
  { href: "/cart", label: "Cart", icon: ShoppingBag },
  { href: "/dosage", label: "Dosage", icon: Calculator },
  { href: "/appointments", label: "Doctors", icon: CalendarDays },
];

function Logo() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2.5">
      <span className="w-7 h-7 rounded-md bg-green text-paper grid place-items-center font-display text-base leading-none">℞</span>
      <span className="font-display text-lg tracking-tight">AuraMed</span>
    </Link>
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  const { patient, user, ready, token, logout } = useRequireAuth();
  const path = usePathname();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [menu, setMenu] = useState(false);

  if (!ready || !token) {
    return <div className="min-h-screen grid place-items-center text-ink-3 text-sm">Loading…</div>;
  }

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    if (q.trim()) router.push(`/medicines?q=${encodeURIComponent(q.trim())}`);
  };

  const initial = (patient?.name ?? user?.email ?? "?").charAt(0).toUpperCase();

  return (
    <ChatProvider>
      <div className="min-h-screen flex">
        {/* desktop sidebar */}
        <aside className="hidden md:flex w-56 shrink-0 flex-col border-r border-line bg-sheet sticky top-0 h-screen">
          <div className="h-14 px-5 flex items-center border-b border-line">
            <Logo />
          </div>
          <nav className="p-3 flex-1 space-y-0.5">
            {NAV.map(({ href, label, icon: Icon }) => {
              const active = path === href || path.startsWith(href + "/");
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-2.5 h-9 px-2.5 rounded-md text-sm transition-colors ${
                    active ? "bg-green-soft text-green font-medium" : "text-ink-2 hover:bg-paper hover:text-ink"
                  }`}
                >
                  <Icon size={16} strokeWidth={active ? 2.2 : 1.8} />
                  {label}
                </Link>
              );
            })}
          </nav>
          <div className="p-3 border-t border-line text-[11px] text-ink-3 leading-relaxed">
            Reminders are sent to <span className="text-ink-2">{user?.email}</span>
          </div>
        </aside>

        <div className="flex-1 min-w-0 flex flex-col">
          <header className="h-14 sticky top-0 z-30 bg-paper/90 backdrop-blur border-b border-line flex items-center gap-3 px-4 md:px-6">
            <div className="md:hidden">
              <Logo />
            </div>
            <form onSubmit={onSearch} className="hidden sm:flex flex-1 max-w-md relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search medicine, generic or symptom"
                className="input pl-9 h-9 bg-sheet"
              />
            </form>
            <div className="ml-auto relative">
              <button onClick={() => setMenu((v) => !v)} className="flex items-center gap-2 h-9 pl-1 pr-2 rounded-md hover:bg-paper-2">
                <span className="w-7 h-7 rounded-full bg-ink text-paper grid place-items-center text-xs font-medium">{initial}</span>
                <span className="hidden sm:block text-sm max-w-[120px] truncate">{patient?.name ?? user?.email}</span>
                <ChevronDown size={14} className="text-ink-3" />
              </button>
              {menu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
                  <div className="absolute right-0 mt-1 z-20 w-56 sheet shadow-lg p-1 text-sm">
                    <div className="px-3 py-2 border-b border-line mb-1">
                      <div className="font-medium truncate">{patient?.name}</div>
                      <div className="text-xs text-ink-3 truncate">{user?.email}</div>
                    </div>
                    <button onClick={logout} className="w-full flex items-center gap-2 px-3 h-9 rounded-md hover:bg-paper text-left">
                      <LogOut size={15} /> Sign out
                    </button>
                  </div>
                </>
              )}
            </div>
          </header>

          <main className="flex-1 px-4 md:px-6 py-5 md:py-8 pb-24 md:pb-10 max-w-6xl w-full mx-auto">{children}</main>
        </div>

        {/* mobile bottom tabs */}
        <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-sheet border-t border-line grid grid-cols-6 h-16 pb-[env(safe-area-inset-bottom)]">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = path === href || path.startsWith(href + "/");
            return (
              <Link key={href} href={href} className={`flex flex-col items-center justify-center gap-1 text-[10px] ${active ? "text-green" : "text-ink-3"}`}>
                <Icon size={19} strokeWidth={active ? 2.2 : 1.8} />
                {label}
              </Link>
            );
          })}
        </nav>

        <DrugSafetyChat />
      </div>
    </ChatProvider>
  );
}
