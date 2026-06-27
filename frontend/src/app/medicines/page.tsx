"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  Bell, Settings, Calendar, MapPin, Calculator, ShoppingCart,
  Search, Pill, Plus, Check, Loader2, AlertCircle, LayoutDashboard, PackageSearch,
} from "lucide-react";
import { api, type MedicineResult } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import DrugSafetyChat from "@/components/DrugSafetyChat";

// ── Nav items ──────────────────────────────────────────────────
const NAV_ITEMS = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard" },
  { icon: Calendar, label: "Book Appointment", href: "/appointments" },
  { icon: MapPin, label: "Find Pharmacies", href: "/location" },
  { icon: Pill, label: "Search Medicine", href: "/medicines", active: true },
  { icon: Calculator, label: "Dosage Calculator", href: "/dosage" },
  { icon: ShoppingCart, label: "View Cart", href: "/cart" },
];

// ── NavBar ─────────────────────────────────────────────────────
function NavBar() {
  return (
    <header className="bg-white border-b border-[#E6ECF7] shadow-[0_1px_12px_rgba(140,158,205,0.09)] flex items-center justify-between px-6 py-3 shrink-0 z-10">
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#5AA6E8] to-[#3A78C4] flex items-center justify-center shadow-sm shrink-0">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M12 21C12 21 3 14 3 8.5C3 5.46 5.46 3 8.5 3C10.24 3 11.91 3.81 13 5.08C14.09 3.81 15.76 3 17.5 3C20.54 3 23 5.46 23 8.5C23 14 12 21 12 21Z" fill="white" />
          </svg>
        </div>
        <span className="text-[17px] font-semibold text-[#1B2A4A] tracking-tight">AuraMed</span>
      </div>
      <div className="flex items-center gap-2">
        <button className="relative w-9 h-9 rounded-full flex items-center justify-center hover:bg-[#EAF2FF] transition-colors">
          <Bell size={18} className="text-[#6A7898]" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#4D8ED6] border-2 border-white" />
        </button>
        <button className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-[#EAF2FF] transition-colors">
          <Settings size={18} className="text-[#6A7898]" />
        </button>
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-300 to-amber-500 flex items-center justify-center text-white text-sm font-semibold">A</div>
      </div>
    </header>
  );
}

// ── Sidebar ────────────────────────────────────────────────────
function Sidebar() {
  return (
    <aside className="bg-white rounded-[22px] shadow-[0_2px_20px_rgba(140,158,205,0.11),0_1px_4px_rgba(140,158,205,0.06)] border border-[rgba(215,225,245,0.70)] w-[196px] shrink-0 flex flex-col gap-1.5 p-3">
      {NAV_ITEMS.map(({ icon: Icon, label, href, active }) => (
        <a
          key={label}
          href={href}
          className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-all group ${
            active ? "bg-[#EAF2FF] text-[#4D8ED6]" : "text-[#6A7898] hover:bg-[#EAF2FF] hover:text-[#4D8ED6]"
          }`}
        >
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
            active ? "bg-[#D5E9FF]" : "bg-[#EAF2FF] group-hover:bg-[#D5E9FF]"
          }`}>
            <Icon size={15} className="text-[#4D8ED6]" />
          </div>
          <span className={`text-[12.5px] leading-tight ${active ? "font-semibold" : "font-medium"}`}>
            {label}
          </span>
        </a>
      ))}
    </aside>
  );
}

// ── Medicine Result Card ───────────────────────────────────────
function MedicineCard({
  med, onAdd, status,
}: {
  med: MedicineResult;
  onAdd: (med: MedicineResult) => void;
  status: "idle" | "pending" | "added";
}) {
  return (
    <div className="bg-white rounded-[18px] border border-[rgba(215,225,245,0.70)] shadow-[0_2px_16px_rgba(140,158,205,0.09)] p-4 flex items-center gap-4">
      {/* Icon */}
      <div className="w-11 h-11 rounded-2xl bg-[#EAF2FF] flex items-center justify-center shrink-0">
        <Pill size={19} className="text-[#4D8ED6]" />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-semibold text-[#1B2A4A] truncate">
          {med.brand_name}
          {med.strength ? <span className="font-normal text-[#9DAABF]"> {med.strength}</span> : null}
        </p>
        <p className="text-[12px] text-[#9DAABF] mt-0.5 truncate">{med.generic_name}</p>
        {med.manufacturer_name && (
          <p className="text-[11px] text-[#B8C4D8] mt-0.5 truncate">{med.manufacturer_name}</p>
        )}
      </div>

      {/* Add to cart */}
      <button
        onClick={() => onAdd(med)}
        disabled={status !== "idle"}
        className={`flex items-center gap-1.5 px-4 py-2 text-[12.5px] font-semibold rounded-xl shrink-0 transition-all disabled:cursor-default ${
          status === "added"
            ? "bg-[#E6F7F0] text-[#22A06B]"
            : "aura-btn-primary disabled:opacity-70"
        }`}
      >
        {status === "pending" && <Loader2 size={13} className="animate-spin" />}
        {status === "added" && <Check size={13} />}
        {status === "idle" && <Plus size={13} />}
        {status === "added" ? "Added" : status === "pending" ? "Adding…" : "Add"}
      </button>
    </div>
  );
}

// ── Inner page (uses useSearchParams — needs Suspense) ─────────
function MedicinesPageInner() {
  const searchParams = useSearchParams();
  const { patient } = useAuth();

  const [query, setQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<MedicineResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusById, setStatusById] = useState<Record<number, "pending" | "added">>({});

  const runSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (trimmed.length === 0) return;
    setIsSearching(true);
    setError(null);
    setResults(null);
    try {
      const res = await api.searchMedicines(trimmed, 12);
      setResults(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed. Please try again.");
    } finally {
      setIsSearching(false);
    }
  }, []);

  // On mount: if ?q= present, prefill and auto-search
  useEffect(() => {
    const q = searchParams.get("q");
    if (q && q.trim().length > 0) {
      setQuery(q);
      runSearch(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAdd = async (med: MedicineResult) => {
    setStatusById((prev) => ({ ...prev, [med.medicine_id]: "pending" }));
    try {
      await api.addToCart({ medicine_id: med.medicine_id, count: 1, patient_id: patient?.id ?? 1 });
      setStatusById((prev) => ({ ...prev, [med.medicine_id]: "added" }));
      setTimeout(() => {
        setStatusById((prev) => {
          const next = { ...prev };
          delete next[med.medicine_id];
          return next;
        });
      }, 1600);
    } catch {
      setStatusById((prev) => {
        const next = { ...prev };
        delete next[med.medicine_id];
        return next;
      });
      setError("Couldn't add to cart. Please try again.");
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#EDF1F9] overflow-hidden">
      <NavBar />

      <div className="flex flex-1 gap-4 p-4 overflow-hidden">
        <Sidebar />

        <main className="flex-1 flex flex-col gap-4 overflow-y-auto min-w-0">
          {/* Header */}
          <div className="shrink-0">
            <h1 className="text-[20px] font-bold text-[#1B2A4A] tracking-tight">Search Medicine</h1>
            <p className="text-[12px] text-[#9DAABF] mt-0.5">
              Search by medicine name or symptom — add what you need to your cart.
            </p>
          </div>

          {/* Search bar */}
          <div className="shrink-0 flex gap-2">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9DAABF] pointer-events-none z-10" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") runSearch(query); }}
                placeholder="e.g. Napa, Paracetamol, or 'headache'…"
                className="w-full h-11 pl-9 pr-4 bg-white border border-[#E6ECF7] rounded-2xl text-[13px] text-[#1B2A4A] placeholder:text-[#9DAABF] shadow-[0_1px_8px_rgba(140,158,205,0.08)] focus:outline-none focus:border-[#4D8ED6] focus:shadow-[0_0_0_3px_rgba(77,142,214,0.10)] transition-all"
              />
            </div>
            <button
              onClick={() => runSearch(query)}
              disabled={isSearching || query.trim().length === 0}
              className="aura-btn-primary flex items-center gap-2 px-5 py-2.5 text-[13px] font-semibold disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none shrink-0"
            >
              {isSearching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
              {isSearching ? "Searching…" : "Search"}
            </button>
          </div>

          {/* Error */}
          {error && (
            <p className="text-[12px] text-[#D94F4F] flex items-center gap-1.5 shrink-0">
              <AlertCircle size={13} />
              {error}
            </p>
          )}

          {/* States */}
          {isSearching && (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center py-16">
              <Loader2 size={28} className="text-[#4D8ED6] animate-spin" />
              <p className="text-[13px] text-[#6A7898]">Searching medicines…</p>
            </div>
          )}

          {!isSearching && results && results.length === 0 && (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center py-16">
              <div className="w-14 h-14 rounded-full bg-[#EAF2FF] flex items-center justify-center">
                <PackageSearch size={24} className="text-[#B8D4F5]" />
              </div>
              <p className="text-[14px] font-semibold text-[#1B2A4A]">No medicines found</p>
              <p className="text-[12px] text-[#9DAABF] max-w-[280px] leading-relaxed">
                Try a different brand name, generic name, or symptom.
              </p>
            </div>
          )}

          {!isSearching && results && results.length > 0 && (
            <div className="flex flex-col gap-3">
              <p className="text-[11px] font-semibold text-[#9DAABF] uppercase tracking-widest shrink-0">
                {results.length} {results.length === 1 ? "result" : "results"}
              </p>
              {results.map((med) => (
                <MedicineCard
                  key={med.medicine_id}
                  med={med}
                  onAdd={handleAdd}
                  status={statusById[med.medicine_id] ?? "idle"}
                />
              ))}
            </div>
          )}

          {!isSearching && !results && !error && (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center py-16">
              <div className="w-14 h-14 rounded-full bg-[#EAF2FF] flex items-center justify-center">
                <Search size={24} className="text-[#4D8ED6]" />
              </div>
              <p className="text-[14px] font-semibold text-[#1B2A4A]">Search for a medicine</p>
              <p className="text-[12px] text-[#9DAABF] max-w-[260px] leading-relaxed">
                Type a brand name, generic name, or a symptom above and press Search.
              </p>
            </div>
          )}
        </main>
      </div>

      {/* Floating drug-safety assistant (POST /api/v1/chat/chatbot) */}
      <DrugSafetyChat />
    </div>
  );
}

// ── Page export (Suspense wrapper for useSearchParams) ─────────
export default function MedicinesPage() {
  return (
    <Suspense>
      <MedicinesPageInner />
    </Suspense>
  );
}
