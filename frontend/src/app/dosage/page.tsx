"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Bell, Settings, Calendar, MapPin, Calculator, ShoppingCart,
  LayoutDashboard, Pill, Loader2, AlertCircle, Sigma, Plus,
  Trash2, X, Clock, CheckCircle2, HeartPulse, LogOut
} from "lucide-react";
import { api } from "@/lib/api";
import { loadEnrichedPrescriptions, type EnrichedPrescription } from "@/lib/data";
import { useAuth } from "@/lib/auth-context";

// ── Nav items ──────────────────────────────────────────────────
const NAV_ITEMS = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard" },
  { icon: Calendar, label: "Appointments", href: "/appointments" },
  { icon: MapPin, label: "Pharmacies", href: "/location" },
  { icon: Pill, label: "Medicines", href: "/medicines" },
  { icon: Calculator, label: "Calculator", href: "/dosage", active: true },
  { icon: ShoppingCart, label: "Cart", href: "/cart" },
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

// ── Types ──────────────────────────────────────────────────────
type Totals = { medicine_id: number; total_dosage: number; brand_name: string }[];

interface ManualItem {
  id: number;
  brand_name: string;
  dosage_instruction: string;
  duration: number;
}

// ── Shared layout components ──────────────────────────────────
function NavBar({ logout }: { logout: () => void }) {
  return (
    <header className="h-16 bg-white/70 backdrop-blur-md border-b border-zinc-200 flex items-center justify-between px-8 shrink-0 z-10">
      <div className="lg:hidden flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-full bg-zinc-900 flex items-center justify-center shrink-0">
          <HeartPulse size={16} className="text-white" />
        </div>
        <span className="text-base font-bold tracking-tight text-zinc-900">AuraMed</span>
      </div>
      <div className="hidden lg:block" />
      <div className="flex items-center gap-3">
        <button className="relative w-9 h-9 rounded-full flex items-center justify-center hover:bg-zinc-100 transition-colors">
          <Bell size={18} className="text-zinc-500 hover:text-zinc-900" />
          <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-emerald-500 border-2 border-white" />
        </button>
        <button className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-zinc-100 transition-colors">
          <Settings size={18} className="text-zinc-500 hover:text-zinc-900" />
        </button>
        <div className="w-px h-5 bg-zinc-200 mx-1" />
        <div className="w-9 h-9 rounded-full bg-indigo-600 flex items-center justify-center text-white text-sm font-semibold shadow-sm border border-indigo-700 ml-1 cursor-default">
          A
        </div>
        <button onClick={logout} title="Log out" className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-red-50 text-zinc-400 hover:text-red-600 transition-colors ml-1">
          <LogOut size={16} />
        </button>
      </div>
    </header>
  );
}

function Sidebar() {
  return (
    <aside className="hidden lg:flex w-64 bg-white border-r border-zinc-200 flex-col shrink-0 z-20 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
      <div className="h-16 flex items-center px-6 border-b border-zinc-100 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-zinc-900 flex items-center justify-center shrink-0">
            <HeartPulse size={16} className="text-white" />
          </div>
          <span className="text-base font-bold tracking-tight text-zinc-900">AuraMed</span>
        </div>
      </div>
      <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map(({ icon: Icon, label, href, active }) => (
          <a
            key={label}
            href={href}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group ${
              active ? "bg-zinc-900 text-white shadow-sm" : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900"
            }`}
          >
            <Icon size={18} className={active ? "text-indigo-400" : "text-zinc-400 group-hover:text-zinc-600"} />
            <span className="text-sm font-medium">{label}</span>
          </a>
        ))}
      </nav>
    </aside>
  );
}

// ── Main Page ──────────────────────────────────────────────────
export default function DosagePage() {
  const { patient, logout } = useAuth();
  const patientId = patient?.id ?? 1;

  // Data State
  const [prescriptions, setPrescriptions] = useState<EnrichedPrescription[]>([]);
  const [manualItems, setManualItems] = useState<ManualItem[]>([]);
  
  // UI State
  const [selected, setSelected] = useState<number | "all">("all");
  const [period, setPeriod] = useState<"prescribed" | 7 | 14 | 30>("prescribed");
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [newMedName, setNewMedName] = useState("");
  const [newMedDosage, setNewMedDosage] = useState("1+0+1");
  const [newMedDuration, setNewMedDuration] = useState<number>(7);

  // Initial Load
  useEffect(() => {
    let cancelled = false;
    loadEnrichedPrescriptions(patientId)
      .then((list) => { if (!cancelled) setPrescriptions(list); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [patientId]);

  // Derive active items for calculation
  const activeItems = useMemo(() => {
    const rxSource = selected === "all"
      ? prescriptions
      : prescriptions.filter((p) => p.prescription_id === selected);
    
    const standardRx = rxSource.flatMap((p) => p.items).map(it => ({
      id: it.medicine_id,
      brand_name: it.brand_name,
      dosage_instruction: it.dosage_instruction,
      duration: it.duration,
      isRx: true
    }));

    const standardManual = manualItems.map(it => ({
      id: it.id,
      brand_name: it.brand_name,
      dosage_instruction: it.dosage_instruction,
      duration: it.duration,
      isRx: false
    }));

    return [...standardRx, ...standardManual];
  }, [prescriptions, selected, manualItems]);

  // Dictionary for naming the totals
  const nameById = useMemo(() => {
    const m = new Map<number, string>();
    activeItems.forEach((it) => m.set(it.id, it.brand_name));
    return m;
  }, [activeItems]);

  // Calculation function
  const calculate = useCallback(async () => {
    if (activeItems.length === 0) { setTotals([]); return; }
    setCalculating(true);
    setError(null);
    try {
      const payload = activeItems.map((it) => ({
        medicine_id: it.id,
        dosage_instruction: it.dosage_instruction,
        // Override duration if a global period is selected
        duration: period === "prescribed" ? it.duration : period,
      }));

      const res = await api.calculateDosage(payload);
      
      setTotals(
        res.total_dosages.map((t) => ({
          ...t,
          brand_name: nameById.get(t.medicine_id) ?? `Custom Medicine`,
        }))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't calculate dosage.");
      setTotals(null);
    } finally {
      setCalculating(false);
    }
  }, [activeItems, nameById, period]);

  // Auto-recalculate when dependencies change
  useEffect(() => {
    if (!loading) calculate();
  }, [loading, calculate]);

  // Handlers
  const handleAddManual = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMedName.trim() || !newMedDosage.trim()) return;

    setManualItems(prev => [
      ...prev, 
      {
        id: -Date.now(), // Generate a unique negative ID for manual items
        brand_name: newMedName.trim(),
        dosage_instruction: newMedDosage.trim(),
        duration: newMedDuration
      }
    ]);

    setNewMedName("");
    setNewMedDosage("1+0+1");
    setNewMedDuration(7);
    setShowModal(false);
  };

  const removeManualItem = (id: number) => {
    setManualItems(prev => prev.filter(item => item.id !== id));
  };

  return (
    <div className="flex h-screen bg-[#FAFAFA] font-sans text-zinc-900 overflow-hidden selection:bg-indigo-100 selection:text-indigo-900">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <NavBar logout={logout} />
        {/* Subtle background glow */}
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-50/50 rounded-full blur-3xl pointer-events-none -z-10" />

        <main className="flex-1 overflow-y-auto p-8 lg:p-12">
          <div className="max-w-6xl mx-auto flex flex-col lg:flex-row gap-8 items-start">
            
            {/* ── Left Column: Configuration ── */}
            <div className="flex-1 w-full flex flex-col gap-6">
              
              {/* Header */}
              <div>
                <h1 className="text-3xl font-bold text-zinc-900 tracking-tight">Dosage Calculator</h1>
                <p className="text-sm text-zinc-500 mt-2">
                  Calculate total units needed for your prescriptions and custom medicines.
                </p>
              </div>

              {/* Controls Row */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-3xl border border-zinc-200 shadow-sm">
                
                {/* Period Selector */}
                <div className="flex items-center gap-1.5 bg-zinc-100 p-1 rounded-xl shrink-0">
                  {(["prescribed", 7, 14, 30] as const).map((p) => (
                    <button
                      key={p}
                      onClick={() => setPeriod(p)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        period === p
                          ? "bg-white text-zinc-900 shadow-sm"
                          : "text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50"
                      }`}
                    >
                      {p === "prescribed" ? "As Prescribed" : `${p} Days`}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => setShowModal(true)}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 text-sm font-semibold rounded-xl hover:bg-indigo-100 transition-colors shrink-0"
                >
                  <Plus size={16} />
                  Add Custom Med
                </button>
              </div>

              {/* Prescription Selector Tabs */}
              {!loading && prescriptions.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setSelected("all")}
                    className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all shadow-sm border ${
                      selected === "all"
                        ? "bg-zinc-900 border-zinc-900 text-white"
                        : "bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                    }`}
                  >
                    All Prescriptions
                  </button>
                  {prescriptions.map((p) => (
                    <button
                      key={p.prescription_id}
                      onClick={() => setSelected(p.prescription_id)}
                      className={`px-4 py-2 rounded-xl text-sm font-medium transition-all shadow-sm border ${
                        selected === p.prescription_id
                          ? "bg-zinc-900 border-zinc-900 text-white"
                          : "bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                      }`}
                    >
                      {p.disease_diagnosis} <span className="text-zinc-400 ml-1 font-normal text-xs">{formatDate(p.prescribed_at)}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Items List */}
              <div className="flex flex-col gap-3">
                {activeItems.length === 0 && !loading && (
                  <div className="bg-white rounded-3xl border border-zinc-200 border-dashed p-12 flex flex-col items-center justify-center text-center text-zinc-500">
                    <Pill size={32} className="text-zinc-300 mb-3" />
                    <p className="font-semibold text-zinc-900">No medicines selected</p>
                    <p className="text-sm mt-1">Select a prescription or add custom medicines.</p>
                  </div>
                )}

                {activeItems.map((item) => (
                  <div key={item.id} className="bg-white p-4 rounded-2xl border border-zinc-200 shadow-sm flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${item.isRx ? 'bg-indigo-50 text-indigo-600' : 'bg-amber-50 text-amber-600'}`}>
                        <Pill size={18} />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-zinc-900 flex items-center gap-2">
                          {item.brand_name}
                          {!item.isRx && <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-md uppercase">Custom</span>}
                        </p>
                        <p className="text-xs font-medium text-zinc-500 mt-0.5">
                          Dosage: <span className="text-zinc-700 font-semibold">{item.dosage_instruction}</span>
                          <span className="mx-2">•</span>
                          Duration: <span className="text-zinc-700 font-semibold">{period === "prescribed" ? item.duration : period} days</span>
                        </p>
                      </div>
                    </div>
                    
                    {!item.isRx && (
                      <button 
                        onClick={() => removeManualItem(item.id)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                ))}
              </div>

            </div>

            {/* ── Right Column: Results ── */}
            <div className="w-full lg:w-[380px] shrink-0">
              <div className="bg-zinc-900 rounded-3xl shadow-xl p-8 flex flex-col gap-6 text-white sticky top-8">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold">Calculation Results</h2>
                  {calculating && <Loader2 size={16} className="text-indigo-400 animate-spin" />}
                </div>

                <div className="flex items-center gap-2 text-xs font-medium text-zinc-400 bg-zinc-800/50 p-3 rounded-xl">
                  <Clock size={14} className="text-indigo-400" />
                  Period: {period === "prescribed" ? "As Prescribed" : `${period} Days Flat`}
                </div>

                {error && (
                  <p className="text-sm font-medium text-red-400 bg-red-400/10 p-3 rounded-xl border border-red-400/20 flex items-start gap-2">
                    <AlertCircle size={16} className="shrink-0 mt-0.5" />
                    {error}
                  </p>
                )}

                <div className="flex flex-col gap-4">
                  {!totals || totals.length === 0 ? (
                    <p className="text-sm text-zinc-500 text-center py-8">
                      {loading ? "Loading..." : "No results to display."}
                    </p>
                  ) : (
                    totals.map((t, i) => (
                      <div key={t.medicine_id} className={`flex items-center justify-between gap-4 ${i > 0 ? "pt-4 border-t border-zinc-800" : ""}`}>
                        <p className="text-sm font-semibold truncate flex-1">{t.brand_name}</p>
                        <div className="flex items-center gap-2 shrink-0 bg-zinc-800 px-3 py-1.5 rounded-lg border border-zinc-700">
                          <Sigma size={14} className="text-indigo-400" />
                          <span className="text-lg font-bold tabular-nums text-white">{t.total_dosage}</span>
                          <span className="text-xs text-zinc-400">units</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <button 
                  onClick={() => window.location.href = "/location"}
                  className="w-full py-3.5 mt-4 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-bold rounded-xl transition-all shadow-md active:scale-95 flex items-center justify-center gap-2"
                >
                  <MapPin size={16} /> Find in Pharmacies
                </button>
              </div>
            </div>

          </div>
        </main>
      </div>

      {/* ── Add Custom Medicine Modal ── */}
      {showModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200"
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}
        >
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col">
            <div className="px-6 pt-6 pb-4 border-b border-zinc-100 flex items-center justify-between bg-white">
              <h2 className="text-lg font-bold text-zinc-900">Add Custom Medicine</h2>
              <button
                onClick={() => setShowModal(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-zinc-100 text-zinc-400 hover:text-zinc-900 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            
            <form onSubmit={handleAddManual} className="p-6 flex flex-col gap-5 bg-zinc-50/50">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-wide">Medicine Name</label>
                <input 
                  type="text" 
                  value={newMedName}
                  onChange={e => setNewMedName(e.target.value)}
                  placeholder="e.g. Paracetamol 500mg"
                  required
                  className="w-full h-11 px-4 bg-white border border-zinc-200 rounded-xl text-sm font-medium text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all shadow-sm"
                />
              </div>

              <div className="flex gap-4">
                <div className="flex flex-col gap-1.5 flex-1">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-wide">Dosage</label>
                  <input 
                    type="text" 
                    value={newMedDosage}
                    onChange={e => setNewMedDosage(e.target.value)}
                    placeholder="1+0+1"
                    required
                    className="w-full h-11 px-4 bg-white border border-zinc-200 rounded-xl text-sm font-medium text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all shadow-sm"
                  />
                </div>
                <div className="flex flex-col gap-1.5 w-24 shrink-0">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-wide">Days</label>
                  <input 
                    type="number" 
                    min="1"
                    value={newMedDuration}
                    onChange={e => setNewMedDuration(parseInt(e.target.value) || 1)}
                    required
                    className="w-full h-11 px-4 bg-white border border-zinc-200 rounded-xl text-sm font-medium text-zinc-900 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all shadow-sm text-center tabular-nums"
                  />
                </div>
              </div>

              <button 
                type="submit"
                className="w-full py-3 mt-2 bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-bold rounded-xl transition-all shadow-md active:scale-95 flex items-center justify-center gap-2"
              >
                <CheckCircle2 size={16} /> Add to Calculation
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}