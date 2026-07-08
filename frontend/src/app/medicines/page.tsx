"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  Bell, Settings, Calendar, MapPin, Calculator, ShoppingCart,
  Search, Pill, Plus, Check, Loader2, AlertCircle, LayoutDashboard,
  PackageSearch, LogOut, HeartPulse, X, ChevronRight, Info, FlaskConical,
  Stethoscope, Syringe, ShieldAlert, AlertTriangle, Baby, Ban, Activity,
  Beaker, Thermometer, Clock3, Layers, GitMerge,
} from "lucide-react";
import { api, type MedicineResult, type MedicineDetails } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import DrugSafetyChat from "@/components/DrugSafetyChat";

// ── Nav items ──────────────────────────────────────────────────
const NAV_ITEMS = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard" },
  { icon: Calendar, label: "Appointments", href: "/appointments" },
  { icon: MapPin, label: "Pharmacies", href: "/location" },
  { icon: Pill, label: "Medicines", href: "/medicines", active: true },
  { icon: Calculator, label: "Calculator", href: "/dosage" },
  { icon: ShoppingCart, label: "Cart", href: "/cart" },
];

// ── Sidebar ────────────────────────────────────────────────────
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

// ── NavBar ─────────────────────────────────────────────────────
function NavBar({ logout, avatarInitial, displayName }: { logout: () => void; avatarInitial: string; displayName: string }) {
  return (
    <header className="h-16 bg-white/70 backdrop-blur-md border-b border-zinc-200 flex items-center justify-between px-8 shrink-0 z-10">
      <div className="lg:hidden flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-full bg-zinc-900 flex items-center justify-center shrink-0">
          <HeartPulse size={16} className="text-white" />
        </div>
        <span className="text-base font-bold tracking-tight text-zinc-900">AuraMed</span>
      </div>
      <div className="hidden lg:block" /> {/* Spacer */}
      <div className="flex items-center gap-3">
        <button className="relative w-9 h-9 rounded-full flex items-center justify-center hover:bg-zinc-100 transition-colors">
          <Bell size={18} className="text-zinc-500 hover:text-zinc-900" />
          <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-emerald-500 border-2 border-white" />
        </button>
        <button className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-zinc-100 transition-colors">
          <Settings size={18} className="text-zinc-500 hover:text-zinc-900" />
        </button>
        <div className="w-px h-5 bg-zinc-200 mx-1" />
        <div title={displayName} className="w-9 h-9 rounded-full bg-indigo-600 flex items-center justify-center text-white text-sm font-semibold shadow-sm border border-indigo-700 ml-1 cursor-default">
          {avatarInitial}
        </div>
        <button onClick={logout} title="Log out" className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-red-50 text-zinc-400 hover:text-red-600 transition-colors ml-1">
          <LogOut size={16} />
        </button>
      </div>
    </header>
  );
}

// ── Medicine Result Card ───────────────────────────────────────
function MedicineCard({
  med, onAdd, onOpen, status,
}: {
  med: MedicineResult;
  onAdd: (med: MedicineResult) => void;
  onOpen: (med: MedicineResult) => void;
  status: "idle" | "pending" | "added";
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(med)}
      className="w-full text-left bg-white rounded-3xl border border-zinc-200 p-5 flex items-center gap-4 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all active:scale-[0.995] group"
    >
      {/* Icon */}
      <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0">
        <Pill size={20} className="text-indigo-600" />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-base font-bold text-zinc-900 truncate">
          {med.brand_name}
          {med.strength ? <span className="font-medium text-zinc-400"> {med.strength}</span> : null}
        </p>
        <p className="text-sm text-zinc-500 font-medium mt-0.5 truncate">{med.generic_name}</p>
        {med.manufacturer_name && (
          <p className="text-xs text-zinc-400 mt-0.5 truncate">{med.manufacturer_name}</p>
        )}
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {/* Add to cart */}
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => { e.stopPropagation(); onAdd(med); }}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); if (status === "idle") onAdd(med); } }}
          aria-disabled={status !== "idle"}
          className={`inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-xl transition-all shadow-sm active:scale-95 ${
            status === "added"
              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
              : status === "pending"
              ? "bg-zinc-900 text-white opacity-70 shadow-md"
              : "bg-zinc-900 text-white hover:bg-zinc-800 shadow-md"
          }`}
        >
          {status === "pending" && <Loader2 size={14} className="animate-spin" />}
          {status === "added" && <Check size={14} />}
          {status === "idle" && <Plus size={14} />}
          {status === "added" ? "Added" : status === "pending" ? "Adding…" : "Add"}
        </span>
        <ChevronRight size={18} className="text-zinc-300 group-hover:text-indigo-400 transition-colors" />
      </div>
    </button>
  );
}

// ── Medicine Details Overlay ───────────────────────────────────
// Clinical leaflet sections, rendered in order when present.
const DETAIL_SECTIONS: { key: keyof MedicineDetails; label: string; icon: typeof Info }[] = [
  { key: "indication_description", label: "Indications", icon: Stethoscope },
  { key: "therapeutic_class_description", label: "Therapeutic Class", icon: Layers },
  { key: "pharmacology_description", label: "Pharmacology", icon: FlaskConical },
  { key: "dosage_description", label: "Dosage", icon: Activity },
  { key: "administration_description", label: "Administration", icon: Syringe },
  { key: "interaction_description", label: "Drug Interactions", icon: GitMerge },
  { key: "contraindications_description", label: "Contraindications", icon: Ban },
  { key: "side_effects_description", label: "Side Effects", icon: AlertTriangle },
  { key: "pregnancy_and_lactation_description", label: "Pregnancy & Lactation", icon: Baby },
  { key: "precautions_description", label: "Precautions", icon: ShieldAlert },
  { key: "pediatric_usage_description", label: "Pediatric Usage", icon: Baby },
  { key: "overdose_effects_description", label: "Overdose", icon: AlertTriangle },
  { key: "duration_of_treatment_description", label: "Duration of Treatment", icon: Clock3 },
  { key: "reconstitution_description", label: "Reconstitution", icon: Beaker },
  { key: "storage_conditions_description", label: "Storage Conditions", icon: Thermometer },
];

function MetaChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-2xl">
      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">{label}</span>
      <span className="text-sm font-semibold text-zinc-800">{value}</span>
    </div>
  );
}

function MedicineDetailsOverlay({
  fallback, details, loading, error, onClose, onAdd, addStatus,
}: {
  fallback: MedicineResult;
  details: MedicineDetails | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onAdd: (med: MedicineResult) => void;
  addStatus: "idle" | "pending" | "added";
}) {
  const brand = details?.brand_name ?? fallback.brand_name;
  const generic = details?.generic_name ?? fallback.generic_name;
  const strength = details?.strength ?? fallback.strength;
  const manufacturer = details?.manufacturer_name ?? fallback.manufacturer_name;

  const metaChips = details
    ? ([
        ["Type", details.drug_type],
        ["Dosage Form", details.dosage_form],
        ["Pack Size", details.package_size],
        ["Container", details.package_container],
      ] as const).filter(([, v]) => !!v)
    : [];

  const sections = details
    ? DETAIL_SECTIONS.map((s) => ({ ...s, value: details[s.key] as string | null })).filter((s) => !!s.value)
    : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden max-h-[90vh]">
        {/* Header */}
        <div className="px-6 sm:px-8 pt-6 pb-5 shrink-0 bg-white border-b border-zinc-100 flex items-start justify-between gap-4">
          <div className="flex items-start gap-4 min-w-0">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0">
              <Pill size={22} className="text-indigo-600" />
            </div>
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-zinc-900 leading-tight">
                {brand}{strength ? <span className="font-medium text-zinc-400"> {strength}</span> : null}
              </h2>
              <p className="text-sm font-medium text-zinc-500 mt-0.5">{generic}</p>
              {manufacturer && <p className="text-xs text-zinc-400 mt-0.5">{manufacturer}</p>}
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-zinc-100 text-zinc-400 hover:text-zinc-900 transition-colors shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 sm:px-8 py-6 bg-zinc-50/50">
          {loading && (
            <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
              <Loader2 size={30} className="text-indigo-500 animate-spin" />
              <p className="text-sm font-medium text-zinc-500">Loading medicine details…</p>
            </div>
          )}

          {!loading && error && (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <div className="w-14 h-14 rounded-full bg-red-50 border border-red-100 flex items-center justify-center">
                <AlertCircle size={24} className="text-red-500" />
              </div>
              <p className="text-base font-bold text-zinc-900">Couldn&apos;t load details</p>
              <p className="text-sm text-zinc-500 max-w-sm leading-relaxed">{error}</p>
            </div>
          )}

          {!loading && !error && details && (
            <div className="flex flex-col gap-6">
              {/* Meta chips */}
              {metaChips.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {metaChips.map(([label, value]) => (
                    <MetaChip key={label} label={label} value={value as string} />
                  ))}
                </div>
              )}

              {/* Indication name highlight */}
              {details.indication_name && (
                <div className="flex items-center gap-2.5 px-4 py-3 bg-indigo-50/60 border border-indigo-100 rounded-2xl">
                  <Info size={16} className="text-indigo-600 shrink-0" />
                  <p className="text-sm font-semibold text-indigo-900">{details.indication_name}</p>
                </div>
              )}

              {/* Sections */}
              {sections.length > 0 ? (
                <div className="flex flex-col gap-4">
                  {sections.map(({ key, label, icon: Icon, value }) => (
                    <div key={key} className="bg-white border border-zinc-200 rounded-2xl p-5 shadow-sm">
                      <div className="flex items-center gap-2.5 mb-2.5">
                        <div className="w-7 h-7 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0">
                          <Icon size={14} className="text-indigo-600" />
                        </div>
                        <h3 className="text-sm font-bold text-zinc-900">{label}</h3>
                      </div>
                      <p className="text-sm text-zinc-600 leading-relaxed whitespace-pre-line">{value}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-zinc-500 text-center py-6">
                  No additional clinical information is available for this medicine.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 sm:px-8 py-5 shrink-0 bg-white border-t border-zinc-100 flex gap-4">
          <button
            onClick={onClose}
            className="flex-1 py-3 bg-white border border-zinc-200 text-zinc-700 text-sm font-bold rounded-xl hover:bg-zinc-50 transition-colors shadow-sm"
          >
            Close
          </button>
          <button
            onClick={() => onAdd(fallback)}
            disabled={addStatus !== "idle"}
            className={`flex-1 py-3 text-sm font-bold rounded-xl flex items-center justify-center gap-2 transition-all shadow-md active:scale-95 disabled:active:scale-100 ${
              addStatus === "added"
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : "bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-70"
            }`}
          >
            {addStatus === "pending" && <Loader2 size={16} className="animate-spin" />}
            {addStatus === "added" && <Check size={16} />}
            {addStatus === "idle" && <Plus size={16} />}
            {addStatus === "added" ? "Added to Cart" : addStatus === "pending" ? "Adding…" : "Add to Cart"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Inner page (uses useSearchParams — needs Suspense) ─────────
function MedicinesPageInner() {
  const searchParams = useSearchParams();
  const { patient, logout } = useAuth();
  const displayName = patient?.name ?? "there";
  const avatarInitial = displayName.charAt(0).toUpperCase() || "A";

  // Prefill from ?q= synchronously so we don't setState inside an effect
  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<MedicineResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusById, setStatusById] = useState<Record<number, "pending" | "added">>({});

  // Details overlay
  const [detailMed, setDetailMed] = useState<MedicineResult | null>(null);
  const [detailData, setDetailData] = useState<MedicineDetails | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const openDetails = useCallback(async (med: MedicineResult) => {
    setDetailMed(med);
    setDetailData(null);
    setDetailError(null);
    setDetailLoading(true);
    try {
      const data = await api.fetchMedicineDetails(med.medicine_id);
      setDetailData(data);
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : "Failed to load medicine details.");
    } finally {
      setDetailLoading(false);
    }
  }, []);

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

  // On mount: if ?q= present, auto-search (query is already prefilled above).
  // Deferred to a microtask so we don't kick off state updates synchronously
  // inside the effect body.
  useEffect(() => {
    const q = searchParams.get("q");
    if (q && q.trim().length > 0) {
      const id = setTimeout(() => runSearch(q), 0);
      return () => clearTimeout(id);
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
    <div className="flex h-screen bg-[#FAFAFA] font-sans text-zinc-900 overflow-hidden selection:bg-indigo-100 selection:text-indigo-900">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <NavBar logout={logout} avatarInitial={avatarInitial} displayName={displayName} />
        {/* Subtle background glow */}
        <div className="absolute top-0 right-0 w-125 h-125 bg-indigo-50/50 rounded-full blur-3xl pointer-events-none -z-10" />

        <main className="flex-1 overflow-y-auto p-8 lg:p-12">
          <div className="max-w-4xl mx-auto flex flex-col gap-6">

            {/* Header */}
            <div>
              <h1 className="text-3xl font-bold text-zinc-900 tracking-tight">Search Medicine</h1>
              <p className="text-sm text-zinc-500 mt-2">
                Search by medicine name or symptom — add what you need to your cart.
              </p>
            </div>

            {/* Search card */}
            <div className="bg-white rounded-3xl shadow-sm border border-zinc-200 p-6 lg:p-8 flex flex-col gap-4 shrink-0">
              <div className="flex gap-3 items-stretch">
                <div className="relative flex-1">
                  <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none z-10" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") runSearch(query); }}
                    placeholder="e.g. Napa, Paracetamol, or 'headache'…"
                    className="w-full h-12 pl-12 pr-4 bg-zinc-50 border border-zinc-200 rounded-2xl text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all shadow-sm"
                  />
                </div>
                <button
                  onClick={() => runSearch(query)}
                  disabled={isSearching || query.trim().length === 0}
                  className="flex items-center justify-center gap-2 px-8 bg-zinc-900 text-white text-sm font-bold rounded-2xl hover:bg-zinc-800 transition-all shadow-md active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 shrink-0"
                >
                  {isSearching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                  {isSearching ? "Searching…" : "Search"}
                </button>
              </div>

              {/* Error */}
              {error && (
                <p className="text-sm font-semibold text-red-600 bg-red-50 p-3 rounded-xl border border-red-100 flex items-center gap-2">
                  <AlertCircle size={16} />
                  {error}
                </p>
              )}
            </div>

            {/* States */}
            {isSearching && (
              <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center py-20">
                <Loader2 size={32} className="text-indigo-500 animate-spin" />
                <p className="text-sm font-medium text-zinc-500">Searching medicines…</p>
              </div>
            )}

            {!isSearching && results && results.length === 0 && (
              <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center py-20">
                <div className="w-16 h-16 rounded-3xl bg-zinc-100 border border-zinc-200 flex items-center justify-center">
                  <PackageSearch size={28} className="text-zinc-400" />
                </div>
                <p className="text-lg font-bold text-zinc-900">No medicines found</p>
                <p className="text-sm text-zinc-500 max-w-sm leading-relaxed">
                  Try a different brand name, generic name, or symptom.
                </p>
              </div>
            )}

            {!isSearching && results && results.length > 0 && (
              <div className="flex flex-col gap-4 pb-12">
                <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest shrink-0 px-2">
                  {results.length} {results.length === 1 ? "result" : "results"}
                </p>
                {results.map((med) => (
                  <MedicineCard
                    key={med.medicine_id}
                    med={med}
                    onAdd={handleAdd}
                    onOpen={openDetails}
                    status={statusById[med.medicine_id] ?? "idle"}
                  />
                ))}
              </div>
            )}

            {!isSearching && !results && !error && (
              <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center py-20">
                <div className="w-16 h-16 rounded-3xl bg-indigo-50 border border-indigo-100 flex items-center justify-center">
                  <Search size={28} className="text-indigo-400" />
                </div>
                <p className="text-lg font-bold text-zinc-900">Search for a medicine</p>
                <p className="text-sm text-zinc-500 max-w-xs leading-relaxed">
                  Type a brand name, generic name, or a symptom above and press Search.
                </p>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Medicine details overlay */}
      {detailMed && (
        <MedicineDetailsOverlay
          fallback={detailMed}
          details={detailData}
          loading={detailLoading}
          error={detailError}
          onClose={() => setDetailMed(null)}
          onAdd={handleAdd}
          addStatus={statusById[detailMed.medicine_id] ?? "idle"}
        />
      )}

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
