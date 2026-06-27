"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Bell, Settings, Calendar, MapPin, Calculator, ShoppingCart,
  LayoutDashboard, Pill, Loader2, AlertCircle, Sigma,
} from "lucide-react";
import { api } from "@/lib/api";
import { loadEnrichedPrescriptions, type EnrichedPrescription } from "@/lib/data";
import { useAuth } from "@/lib/auth-context";

const NAV_ITEMS = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard" },
  { icon: Calendar, label: "Book Appointment", href: "/appointments" },
  { icon: MapPin, label: "Find Pharmacies", href: "/location" },
  { icon: Pill, label: "Search Medicine", href: "/medicines" },
  { icon: Calculator, label: "Dosage Calculator", href: "/dosage", active: true },
  { icon: ShoppingCart, label: "View Cart", href: "/cart" },
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

type Totals = { medicine_id: number; total_dosage: number; brand_name: string }[];

export default function DosagePage() {
  const { patient } = useAuth();
  const patientId = patient?.id ?? 1; // placeholder fallback for guest mode

  const [prescriptions, setPrescriptions] = useState<EnrichedPrescription[]>([]);
  const [selected, setSelected] = useState<number | "all">("all");
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadEnrichedPrescriptions(patientId)
      .then((list) => { if (!cancelled) setPrescriptions(list); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [patientId]);

  // The items to total, based on the selected prescription (or all of them).
  const activeItems = useMemo(() => {
    const source =
      selected === "all"
        ? prescriptions
        : prescriptions.filter((p) => p.prescription_id === selected);
    return source.flatMap((p) => p.items);
  }, [prescriptions, selected]);

  // Map medicine_id → brand name for labelling the totals.
  const nameById = useMemo(() => {
    const m = new Map<number, string>();
    prescriptions.forEach((p) => p.items.forEach((it) => m.set(it.medicine_id, it.brand_name)));
    return m;
  }, [prescriptions]);

  const calculate = useCallback(async () => {
    if (activeItems.length === 0) { setTotals([]); return; }
    setCalculating(true);
    setError(null);
    try {
      const res = await api.calculateDosage(
        activeItems.map((it) => ({
          medicine_id: it.medicine_id,
          dosage_instruction: it.dosage_instruction,
          duration: it.duration,
        }))
      );
      setTotals(
        res.total_dosages.map((t) => ({
          ...t,
          brand_name: nameById.get(t.medicine_id) ?? `Medicine #${t.medicine_id}`,
        }))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't calculate dosage.");
      setTotals(null);
    } finally {
      setCalculating(false);
    }
  }, [activeItems, nameById]);

  // Recalculate whenever the selection (or loaded data) changes.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- effect-driven recalculation
    if (!loading) calculate();
  }, [loading, calculate]);

  return (
    <div className="flex flex-col h-screen bg-[#EDF1F9] overflow-hidden">
      <NavBar />

      <div className="flex flex-1 gap-4 p-4 overflow-hidden">
        <Sidebar />

        <main className="flex-1 flex flex-col gap-4 overflow-y-auto min-w-0">
          {/* Header */}
          <div className="shrink-0">
            <h1 className="text-[20px] font-bold text-[#1B2A4A] tracking-tight">Dosage Calculator</h1>
            <p className="text-[12px] text-[#9DAABF] mt-0.5">
              Total units needed per medicine across your prescription{selected === "all" ? "s" : ""}.
            </p>
          </div>

          {/* Prescription selector */}
          {!loading && prescriptions.length > 0 && (
            <div className="shrink-0 flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setSelected("all")}
                className={`px-3.5 py-2 rounded-xl text-[12px] font-semibold transition-colors ${
                  selected === "all"
                    ? "bg-[#4D8ED6] text-white shadow-sm"
                    : "bg-white border border-[#E6ECF7] text-[#6A7898] hover:border-[#B8D4F5]"
                }`}
              >
                All prescriptions
              </button>
              {prescriptions.map((p) => (
                <button
                  key={p.prescription_id}
                  onClick={() => setSelected(p.prescription_id)}
                  className={`px-3.5 py-2 rounded-xl text-[12px] font-medium transition-colors ${
                    selected === p.prescription_id
                      ? "bg-[#4D8ED6] text-white shadow-sm"
                      : "bg-white border border-[#E6ECF7] text-[#6A7898] hover:border-[#B8D4F5]"
                  }`}
                >
                  {p.disease_diagnosis} · {formatDate(p.prescribed_at)}
                </button>
              ))}
            </div>
          )}

          {error && (
            <p className="text-[12px] text-[#D94F4F] flex items-center gap-1.5 shrink-0">
              <AlertCircle size={13} />
              {error}
            </p>
          )}

          {/* States */}
          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center py-16">
              <Loader2 size={26} className="text-[#4D8ED6] animate-spin" />
              <p className="text-[13px] text-[#6A7898]">Loading prescriptions…</p>
            </div>
          ) : prescriptions.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center py-16">
              <div className="w-14 h-14 rounded-full bg-[#EAF2FF] flex items-center justify-center">
                <Calculator size={24} className="text-[#B8D4F5]" />
              </div>
              <p className="text-[14px] font-semibold text-[#1B2A4A]">No prescriptions to calculate</p>
              <p className="text-[12px] text-[#9DAABF] max-w-[280px] leading-relaxed">
                Scan a prescription from the dashboard to calculate how many units you&apos;ll need.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-[22px] shadow-[0_2px_20px_rgba(140,158,205,0.11),0_1px_4px_rgba(140,158,205,0.06)] border border-[rgba(215,225,245,0.70)] p-5 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <p className="text-[10.5px] font-semibold text-[#9DAABF] uppercase tracking-widest">
                  Units required
                </p>
                {calculating && <Loader2 size={14} className="text-[#4D8ED6] animate-spin" />}
              </div>

              {totals && totals.length > 0 ? (
                <div className="flex flex-col">
                  {totals.map((t, i) => (
                    <div
                      key={t.medicine_id}
                      className={`flex items-center justify-between py-3.5 ${i > 0 ? "border-t border-[#E6ECF7]" : ""}`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-[#EAF2FF] flex items-center justify-center shrink-0">
                          <Pill size={16} className="text-[#4D8ED6]" />
                        </div>
                        <p className="text-[14px] font-semibold text-[#1B2A4A] truncate">{t.brand_name}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Sigma size={13} className="text-[#9DAABF]" />
                        <span className="text-[16px] font-bold text-[#1B2A4A] tabular-nums">{t.total_dosage}</span>
                        <span className="text-[11px] text-[#9DAABF]">units</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                !calculating && (
                  <p className="text-[12px] text-[#9DAABF] py-4 text-center">No medicines in this selection.</p>
                )
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

// ── Shared layout components ──────────────────────────────────
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
          <span className={`text-[12.5px] leading-tight ${active ? "font-semibold" : "font-medium"}`}>{label}</span>
        </a>
      ))}
    </aside>
  );
}
