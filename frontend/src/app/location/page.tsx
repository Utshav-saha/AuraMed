"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  Bell, Settings, Calendar, MapPin, Calculator, ShoppingCart,
  Search, PlusCircle, X, Pill, Store, CheckCircle2, AlertCircle,
  Minus, Plus, Lock, Loader2, ShoppingBag, Navigation, LayoutDashboard,
  LogOut, HeartPulse
} from "lucide-react";
import {
  api,
  type MedicineResult,
  type PharmacyNameResult,
  type CartResult,
  type PartialMatch,
  type AvailableMed,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

// ── Nav items ──────────────────────────────────────────────────
const NAV_ITEMS = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard" },
  { icon: Calendar, label: "Appointments", href: "/appointments" },
  { icon: MapPin, label: "Pharmacies", href: "/location", active: true },
  { icon: Pill, label: "Medicines", href: "/medicines" },
  { icon: Calculator, label: "Calculator", href: "/dosage" },
  { icon: ShoppingCart, label: "Cart", href: "/cart" },
];

// ── Types ──────────────────────────────────────────────────────
interface MedicineChip {
  medicine_id: number;
  brand_name: string;
  generic_name: string;
  strength: string | null;
  quantity: number;
  // Required by the search-pharmacies RPC for generic-equivalent matching.
  // Resolved in the background via /prescriptions/medicine_variants; 0 = unknown.
  dosage_form_id: number;
}

interface PharmacyChip {
  pharmacy_id: number;
  pharmacy_name: string;
}

interface QtyOverlay {
  idx: number;
  chip: MedicineChip;
}

interface DisplayPharmacy {
  pharmacyId: number;
  pharmacyName: string;
  distanceMeters: number;
  availableMeds: AvailableMed[];
}

// ── Helpers ────────────────────────────────────────────────────
function fmtDistance(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ── NavBar ─────────────────────────────────────────────────────
function NavBar({ logout }: { logout: () => void }) {
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

// ── Filter Toggle ──────────────────────────────────────────────
function FilterToggle({
  label, sublabel, active, onToggle,
}: { label: string; sublabel: string; active: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className={`flex items-center gap-3 px-4 py-3 rounded-2xl border text-left transition-all ${
        active
          ? "bg-indigo-50/50 border-indigo-200 text-indigo-900 shadow-sm"
          : "bg-white border-zinc-200 text-zinc-500 hover:border-zinc-300 hover:bg-zinc-50"
      }`}
    >
      <div className={`w-10 h-5 rounded-full relative transition-colors shrink-0 ${active ? "bg-indigo-500" : "bg-zinc-200"}`}>
        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${active ? "left-[22px]" : "left-0.5"}`} />
      </div>
      <div>
        <p className={`text-sm font-bold ${active ? "text-indigo-900" : "text-zinc-700"}`}>{label}</p>
        <p className="text-xs text-zinc-500 mt-0.5">{sublabel}</p>
      </div>
    </button>
  );
}

// ── Pharmacy Row Card ──────────────────────────────────────────
function PharmacyRow({
  pharmacy, allMedicineChips, exactMatchOn, onCartClick,
}: {
  pharmacy: DisplayPharmacy;
  allMedicineChips: MedicineChip[];
  exactMatchOn: boolean;
  onCartClick: () => void;
}) {
  const availableMap = new Map(pharmacy.availableMeds.map((m) => [m.medicine_id, m]));

  return (
    <div
      data-pharmacy-id={pharmacy.pharmacyId}
      className="bg-white rounded-3xl border border-zinc-200 p-6 flex flex-col sm:flex-row sm:items-start justify-between gap-6 shadow-sm hover:shadow-md transition-all"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0">
            <Store size={22} className="text-indigo-600" />
          </div>
          <div>
            <p className="text-lg font-bold text-zinc-900">{pharmacy.pharmacyName}</p>
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-full mt-1 border border-indigo-100">
              <Navigation size={12} />
              {fmtDistance(pharmacy.distanceMeters)} away
            </span>
          </div>
        </div>

        {/* Medicine availability chips */}
        {allMedicineChips.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {allMedicineChips.map((chip) => {
              const med = availableMap.get(chip.medicine_id);
              const available = !!med;
              const isGeneric = available && !med.is_exact;

              if (!available) {
                return (
                  <span key={chip.medicine_id} className="inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full bg-zinc-50 text-zinc-400 border border-zinc-200">
                    <X size={12} />
                    {chip.brand_name}
                  </span>
                );
              }
              if (isGeneric && exactMatchOn) {
                return (
                  <span key={chip.medicine_id} className="inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full bg-zinc-50 text-zinc-400 border border-zinc-200">
                    <X size={12} />
                    {chip.brand_name}
                  </span>
                );
              }
              if (isGeneric) {
                return (
                  <span key={chip.medicine_id} className="inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                    <AlertCircle size={12} />
                    {chip.brand_name} (generic)
                  </span>
                );
              }
              return (
                <span key={chip.medicine_id} className="inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <CheckCircle2 size={12} />
                  {chip.brand_name}
                </span>
              );
            })}
          </div>
        )}
      </div>

      <button
        onClick={onCartClick}
        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 bg-zinc-900 text-white text-sm font-semibold rounded-xl hover:bg-zinc-800 transition-all shadow-md active:scale-95 shrink-0"
      >
        <ShoppingBag size={16} />
        View & Add
      </button>
    </div>
  );
}

// ── Inner page component (uses useSearchParams — needs Suspense) ─
function LocationPageInner() {
  const searchParams = useSearchParams();
  const { patient, logout } = useAuth();

  // ── State ──────────────────────────────────────────────────
  const [searchMode, setSearchMode] = useState<"medicine" | "pharmacy">("medicine");
  const [query, setQuery] = useState("");
  const [autocompleteResults, setAutocompleteResults] = useState<MedicineResult[] | PharmacyNameResult[]>([]);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [medicineChips, setMedicineChips] = useState<MedicineChip[]>([]);
  const [pharmacyChips, setPharmacyChips] = useState<PharmacyChip[]>([]);
  
  // FIX: Initialize exactMatch directly from searchParams to avoid the ESLint warning.
  const [exactMatch, setExactMatch] = useState(searchParams.get("exact") === "1");
  const [singlePharmacy, setSinglePharmacy] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<CartResult | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [cartOverlay, setCartOverlay] = useState<PartialMatch | null>(null);
  const [cartQtys, setCartQtys] = useState<Record<number, number>>({});
  const [addingToCart, setAddingToCart] = useState(false);
  const [cartSuccess, setCartSuccess] = useState(false);
  const [qtyOverlay, setQtyOverlay] = useState<QtyOverlay | null>(null);
  const [qtyTemp, setQtyTemp] = useState(1);
  const [addingChip, setAddingChip] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<HTMLDivElement>(null);
  const debouncedQuery = useDebounce(query, 320);

  // Close autocomplete on outside click
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (
        autocompleteRef.current &&
        !autocompleteRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowAutocomplete(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  // Fetch autocomplete results
  useEffect(() => {
    // Return early if not enough characters.
    // (Clearing the array is now handled instantly in the input's onChange to fix the ESLint error)
    if (debouncedQuery.trim().length < 2) {
      return;
    }
    
    let cancelled = false;
    async function doFetch() {
      try {
        if (searchMode === "medicine") {
          const res = await api.searchMedicines(debouncedQuery, 6);
          if (!cancelled) { setAutocompleteResults(res); setShowAutocomplete(res.length > 0); }
        } else {
          const res = await api.searchPharmaciesByName(debouncedQuery);
          if (!cancelled) { setAutocompleteResults(res); setShowAutocomplete(res.length > 0); }
        }
      } catch {
        if (!cancelled) {
          setAutocompleteResults([]);
          setShowAutocomplete(false);
        }
      }
    }
    doFetch();
    return () => { cancelled = true; };
  }, [debouncedQuery, searchMode]);

  // ── Chip management ────────────────────────────────────────
  const addMedicineChip = useCallback((med: MedicineResult) => {
    setMedicineChips((prev) => {
      if (prev.some((c) => c.medicine_id === med.medicine_id)) return prev;
      return [...prev, {
        medicine_id: med.medicine_id,
        brand_name: med.brand_name,
        generic_name: med.generic_name,
        strength: med.strength,
        quantity: 1,
        dosage_form_id: 0,
      }];
    });
    setQuery("");
    setShowAutocomplete(false);

    // Resolve the medicine's dosage_form_id in the background (needed by the
    // nearby-pharmacy RPC to also match generic equivalents of the same form).
    api.getMedicineVariants(med.brand_name)
      .then((variants) => {
        const v = variants.find((x) => x.medicine_id === med.medicine_id);
        if (v?.dosage_form_id != null) {
          setMedicineChips((prev) =>
            prev.map((c) =>
              c.medicine_id === med.medicine_id ? { ...c, dosage_form_id: v.dosage_form_id! } : c
            )
          );
        }
      })
      .catch(() => { /* generic matching just falls back to exact-only */ });
  }, []);

  const addPharmacyChip = useCallback((pharm: PharmacyNameResult) => {
    setPharmacyChips((prev) => {
      if (prev.some((c) => c.pharmacy_id === pharm.pharmacy_id)) return prev;
      return [...prev, { pharmacy_id: pharm.pharmacy_id, pharmacy_name: pharm.pharmacy_name }];
    });
    setQuery("");
    setShowAutocomplete(false);
  }, []);

  const removeMedicineChip = (idx: number) =>
    setMedicineChips((prev) => prev.filter((_, i) => i !== idx));

  const removePharmacyChip = (idx: number) =>
    setPharmacyChips((prev) => prev.filter((_, i) => i !== idx));

  const addFromInput = async () => {
    const q = query.trim();
    if (q.length === 0) return;
    setSearchError(null);

    // Instant path: use the loaded dropdown result if present
    if (autocompleteResults.length > 0) {
      if (searchMode === "medicine") addMedicineChip(autocompleteResults[0] as MedicineResult);
      else addPharmacyChip(autocompleteResults[0] as PharmacyNameResult);
      return;
    }

    // Fallback: resolve the typed text against the backend directly
    setAddingChip(true);
    try {
      if (searchMode === "medicine") {
        const res = await api.searchMedicines(q, 1);
        if (res.length > 0) addMedicineChip(res[0]);
        else setSearchError(`No medicine found matching "${q}".`);
      } else {
        const res = await api.searchPharmaciesByName(q);
        if (res.length > 0) addPharmacyChip(res[0]);
        else setSearchError(`No pharmacy found matching "${q}".`);
      }
    } catch {
      setSearchError("Could not search right now. Please try again.");
    } finally {
      setAddingChip(false);
    }
  };

  // ── Search ─────────────────────────────────────────────────
  const handleSearch = () => {
    if (searchMode === "medicine" && medicineChips.length === 0) {
      setSearchError("Add at least one medicine to search.");
      return;
    }
    if (searchMode === "pharmacy" && pharmacyChips.length === 0) {
      setSearchError("Add at least one pharmacy name to search.");
      return;
    }
    setSearchError(null);
    setIsSearching(true);
    setResults(null);

    if (searchMode === "pharmacy") {
      // Pharmacy name mode: show the selected pharmacies directly (no geo needed for display)
      setResults({
        one_stop_options: [],
        multi_stop_route: [],
        partial_matches: pharmacyChips.map((p) => ({
          pharmacy_id: p.pharmacy_id,
          pharmacy_name: p.pharmacy_name,
          distance_meters: 0,
          available_medicines: [],
          medicine_count: 0,
        })),
      });
      setIsSearching(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await api.searchPharmacies({
            user_lat: pos.coords.latitude,
            user_lng: pos.coords.longitude,
            target_medicine_ids: medicineChips.map((c) => c.medicine_id),
            target_dosage_forms: medicineChips.map((c) => c.dosage_form_id),
            target_quantities: medicineChips.map((c) => c.quantity),
          });
          setResults(res);
        } catch (err) {
          setSearchError(err instanceof Error ? err.message : "Search failed.");
        } finally {
          setIsSearching(false);
        }
      },
      () => {
        setSearchError("Location access denied. Please enable location permissions.");
        setIsSearching(false);
      }
    );
  };

  // ── Displayed pharmacy list ────────────────────────────────
  const displayedPharmacies: DisplayPharmacy[] = (() => {
    if (!results) return [];

    if (singlePharmacy && searchMode === "medicine") {
      // Apply exact match filter: drop pharmacies where any requested medicine
      // is only available as a generic when exactMatch is on
      let options = results.one_stop_options;
      if (exactMatch) {
        options = options.filter((p) =>
          p.items.every((it) => it.is_exact)
        );
      }
      return options.map((p) => ({
        pharmacyId: p.pharmacy_id,
        pharmacyName: p.pharmacy_name,
        distanceMeters: p.distance_meters,
        availableMeds: p.items.map((it) => ({
          medicine_id: it.provided_medicine_id,
          stock_count: it.stock_count,
          is_exact: it.is_exact,
        })),
      }));
    }

    // Partial / pharmacy-name mode
    let partials = results.partial_matches;
    if (exactMatch && searchMode === "medicine") {
      // Re-score: only count exact-match medicines
      partials = partials
        .map((p) => ({
          ...p,
          available_medicines: p.available_medicines.filter((m) => m.is_exact),
          medicine_count: p.available_medicines.filter((m) => m.is_exact).length,
        }))
        .filter((p) => p.medicine_count > 0)
        .sort((a, b) => b.medicine_count - a.medicine_count || a.distance_meters - b.distance_meters);
    }

    return partials.map((p) => ({
      pharmacyId: p.pharmacy_id,
      pharmacyName: p.pharmacy_name,
      distanceMeters: p.distance_meters,
      availableMeds: p.available_medicines,
    }));
  })();

  // ── Cart overlay helpers ───────────────────────────────────
  const openCartOverlay = (pharmacy: DisplayPharmacy) => {
    setCartOverlay({
      pharmacy_id: pharmacy.pharmacyId,
      pharmacy_name: pharmacy.pharmacyName,
      distance_meters: pharmacy.distanceMeters,
      available_medicines: pharmacy.availableMeds,
      medicine_count: pharmacy.availableMeds.length,
    });
    const initQtys: Record<number, number> = {};
    medicineChips.forEach((c) => { initQtys[c.medicine_id] = c.quantity; });
    setCartQtys(initQtys);
    setCartSuccess(false);
  };

  const getStockForMedicine = (medId: number): number => {
    if (!cartOverlay) return 0;
    const found = cartOverlay.available_medicines.find((m) => m.medicine_id === medId);
    return found ? found.stock_count : 0;
  };

  const isMedicineAvailableInOverlay = (medId: number): boolean => {
    if (!cartOverlay) return false;
    return cartOverlay.available_medicines.some((m) => m.medicine_id === medId);
  };

  const handleAddToCart = async () => {
    if (!cartOverlay) return;
    setAddingToCart(true);
    try {
      const promises = medicineChips
        .filter((c) => isMedicineAvailableInOverlay(c.medicine_id) && (cartQtys[c.medicine_id] ?? 0) > 0)
        .map((c) =>
          api.addToCart({
            medicine_id: c.medicine_id,
            count: cartQtys[c.medicine_id] ?? 1,
            assigned_pharmacy: cartOverlay.pharmacy_id,
            patient_id: patient?.id ?? 1,
          })
        );
      await Promise.all(promises);
      setCartSuccess(true);
      setTimeout(() => {
        setCartOverlay(null);
        setCartSuccess(false);
      }, 1400);
    } catch {
      // keep overlay open so user can retry
    } finally {
      setAddingToCart(false);
    }
  };

  // ── Qty overlay helpers ────────────────────────────────────
  const openQtyOverlay = (chip: MedicineChip, idx: number) => {
    setQtyOverlay({ chip, idx });
    setQtyTemp(chip.quantity);
  };

  const saveQty = () => {
    if (!qtyOverlay) return;
    setMedicineChips((prev) =>
      prev.map((c, i) => (i === qtyOverlay.idx ? { ...c, quantity: qtyTemp } : c))
    );
    setQtyOverlay(null);
  };

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="flex h-screen bg-[#FAFAFA] font-sans text-zinc-900 overflow-hidden selection:bg-indigo-100 selection:text-indigo-900">
      
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <NavBar logout={logout} />
        {/* Subtle background glow */}
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-50/50 rounded-full blur-3xl pointer-events-none -z-10" />

        {/* ── Main Content ── */}
        <main className="flex-1 overflow-y-auto p-8 lg:p-12">
          <div className="max-w-4xl mx-auto flex flex-col gap-6">

            {/* ── Header row ── */}
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold text-zinc-900 tracking-tight">Find Pharmacies</h1>
                <p className="text-sm text-zinc-500 mt-2">
                  Search by medicine or pharmacy name — well find whats nearby.
                </p>
              </div>

              {/* Mode toggle */}
              <div className="flex items-center bg-zinc-100 rounded-xl p-1 gap-1 shadow-sm border border-zinc-200">
                {(["medicine", "pharmacy"] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => {
                      setSearchMode(mode);
                      setQuery("");
                      setAutocompleteResults([]);
                      setShowAutocomplete(false);
                    }}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                      searchMode === mode
                        ? "bg-white text-zinc-900 shadow-sm"
                        : "text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50"
                    }`}
                  >
                    {mode === "medicine" ? <Pill size={14} /> : <Store size={14} />}
                    {mode === "medicine" ? "By Medicine" : "By Pharmacy"}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Search card ── */}
            <div className="bg-white rounded-3xl shadow-sm border border-zinc-200 p-6 lg:p-8 flex flex-col gap-6 shrink-0">

              {/* Search input row */}
              <div className="flex gap-3 items-start">
                <div className="relative flex-1">
                  <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none z-10" />
                  <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => {
                      const val = e.target.value;
                      setQuery(val);
                      // Fix for ESLint warning: Clear instantly without waiting for debounce/effect
                      if (val.trim().length < 2) {
                        setAutocompleteResults([]);
                        setShowAutocomplete(false);
                      }
                    }}
                    onFocus={() => { if (autocompleteResults.length > 0) setShowAutocomplete(true); }}
                    onKeyDown={(e) => { if (e.key === "Enter") addFromInput(); }}
                    placeholder={
                      searchMode === "medicine"
                        ? "Search medicine by name or symptom…"
                        : "Search pharmacy by name…"
                    }
                    className="w-full h-12 pl-12 pr-4 bg-zinc-50 border border-zinc-200 rounded-2xl text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all shadow-sm"
                  />

                  {/* Autocomplete dropdown */}
                  {showAutocomplete && autocompleteResults.length > 0 && (
                    <div
                      ref={autocompleteRef}
                      className="absolute top-[calc(100%+8px)] left-0 right-0 bg-white rounded-2xl border border-zinc-200 shadow-lg z-50 overflow-hidden"
                    >
                      {searchMode === "medicine"
                        ? (autocompleteResults as MedicineResult[]).map((med) => (
                            <button
                              key={med.medicine_id}
                              onMouseDown={(e) => { e.preventDefault(); addMedicineChip(med); }}
                              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-50 transition-colors text-left border-b border-zinc-50 last:border-0"
                            >
                              <div className="w-8 h-8 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
                                <Pill size={14} className="text-indigo-600" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-zinc-900 truncate">
                                  {med.brand_name}{med.strength ? ` ${med.strength}` : ""}
                                </p>
                                <p className="text-xs text-zinc-500 truncate">{med.generic_name}</p>
                              </div>
                            </button>
                          ))
                        : (autocompleteResults as PharmacyNameResult[]).map((pharm) => (
                            <button
                              key={pharm.pharmacy_id}
                              onMouseDown={(e) => { e.preventDefault(); addPharmacyChip(pharm); }}
                              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-50 transition-colors text-left border-b border-zinc-50 last:border-0"
                            >
                              <div className="w-8 h-8 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
                                <Store size={14} className="text-indigo-600" />
                              </div>
                              <p className="text-sm font-bold text-zinc-900">{pharm.pharmacy_name}</p>
                            </button>
                          ))
                      }
                    </div>
                  )}
                </div>

                {/* + button */}
                <button
                  onClick={addFromInput}
                  disabled={addingChip}
                  title="Add to search"
                  className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 hover:bg-indigo-100 flex items-center justify-center transition-colors shrink-0 disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
                >
                  {addingChip ? (
                    <Loader2 size={20} className="text-indigo-600 animate-spin" />
                  ) : (
                    <PlusCircle size={20} className="text-indigo-600" />
                  )}
                </button>
              </div>

              {/* Selected chips */}
              {(medicineChips.length > 0 || pharmacyChips.length > 0) && (
                <div className="flex flex-wrap gap-2.5">
                  {medicineChips.map((chip, idx) => (
                    <div key={chip.medicine_id} className="flex flex-col items-start gap-1">
                      <button
                        onClick={() => openQtyOverlay(chip, idx)}
                        className="group flex items-center gap-2 pl-3 pr-2 py-1.5 bg-indigo-50 border border-indigo-200 rounded-xl text-sm font-semibold text-indigo-900 hover:bg-indigo-100 hover:border-indigo-300 transition-all shadow-sm"
                      >
                        <Pill size={14} className="text-indigo-600 shrink-0" />
                        <span>{chip.brand_name}{chip.strength ? ` ${chip.strength}` : ""}</span>
                        <span className="text-indigo-600 font-bold bg-white px-1.5 rounded-md shadow-sm ml-1 text-xs">×{chip.quantity}</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); removeMedicineChip(idx); }}
                          className="w-5 h-5 rounded-full flex items-center justify-center hover:bg-indigo-200 transition-colors ml-1"
                        >
                          <X size={12} className="text-indigo-600" />
                        </button>
                      </button>
                      <span className="text-[10px] text-zinc-400 pl-1 font-medium">Tap to adjust qty</span>
                    </div>
                  ))}

                  {pharmacyChips.map((chip, idx) => (
                    <div
                      key={chip.pharmacy_id}
                      className="flex items-center gap-2 pl-3 pr-2 py-1.5 bg-zinc-100 border border-zinc-200 rounded-xl text-sm font-semibold text-zinc-800 shadow-sm"
                    >
                      <Store size={14} className="text-zinc-500 shrink-0" />
                      <span>{chip.pharmacy_name}</span>
                      <button
                        onClick={() => removePharmacyChip(idx)}
                        className="w-5 h-5 rounded-full flex items-center justify-center hover:bg-zinc-200 transition-colors ml-1"
                      >
                        <X size={12} className="text-zinc-600" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Filter toggles + Search button */}
              <div className="flex flex-col sm:flex-row items-center gap-4 flex-wrap pt-2 border-t border-zinc-100">
                {/* FIX: Only show filters if searching by Medicine */}
                {searchMode === "medicine" && (
                  <>
                    <FilterToggle
                      label="Single Pharmacy"
                      sublabel="All medicines in one place"
                      active={singlePharmacy}
                      onToggle={() => setSinglePharmacy((v) => !v)}
                    />
                    <FilterToggle
                      label="Exact Match"
                      sublabel="Brand name only, no generics"
                      active={exactMatch}
                      onToggle={() => setExactMatch((v) => !v)}
                    />
                  </>
                )}

                <div className="flex-1" />

                <button
                  onClick={handleSearch}
                  disabled={isSearching}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-3.5 bg-zinc-900 text-white text-sm font-bold rounded-xl hover:bg-zinc-800 transition-all shadow-md active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed shrink-0"
                >
                  {isSearching ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Navigation size={16} />
                  )}
                  {isSearching ? "Searching…" : "Search Nearby"}
                </button>
              </div>

              {/* Error */}
              {searchError && (
                <p className="text-sm font-semibold text-red-600 bg-red-50 p-3 rounded-xl border border-red-100 flex items-center gap-2">
                  <AlertCircle size={16} />
                  {searchError}
                </p>
              )}
            </div>

            {/* ── Results ── */}
            {isSearching && (
              <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center py-20">
                <Loader2 size={32} className="text-indigo-500 animate-spin" />
                <p className="text-sm font-medium text-zinc-500">Locating nearby pharmacies…</p>
              </div>
            )}

            {!isSearching && results && displayedPharmacies.length === 0 && (
              <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center py-20">
                <div className="w-16 h-16 rounded-3xl bg-zinc-100 border border-zinc-200 flex items-center justify-center">
                  <MapPin size={28} className="text-zinc-400" />
                </div>
                <p className="text-lg font-bold text-zinc-900">No pharmacies found</p>
                <p className="text-sm text-zinc-500 max-w-sm leading-relaxed">
                  {singlePharmacy && searchMode === "medicine"
                    ? "No single pharmacy has all medicines nearby. Try turning off Single Pharmacy."
                    : "No pharmacies found nearby. Try different medicines or a larger search radius."}
                </p>
              </div>
            )}

            {!isSearching && displayedPharmacies.length > 0 && (
              <div className="flex flex-col gap-4 pb-12">
                <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest shrink-0 px-2">
                  {displayedPharmacies.length}{" "}
                  {displayedPharmacies.length === 1 ? "pharmacy" : "pharmacies"} found
                  {singlePharmacy && searchMode === "medicine" ? " · All medicines available" : ""}
                  {!singlePharmacy && searchMode === "medicine" ? " · Sorted by most medicines available" : ""}
                </p>
                {displayedPharmacies.map((pharm) => (
                  <PharmacyRow
                    key={pharm.pharmacyId}
                    pharmacy={pharm}
                    allMedicineChips={medicineChips}
                    exactMatchOn={exactMatch}
                    onCartClick={() => openCartOverlay(pharm)}
                  />
                ))}
              </div>
            )}

            {!isSearching && !results && (
              <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center py-20">
                <div className="w-16 h-16 rounded-3xl bg-indigo-50 border border-indigo-100 flex items-center justify-center">
                  <MapPin size={28} className="text-indigo-400" />
                </div>
                <p className="text-lg font-bold text-zinc-900">Add items to search</p>
                <p className="text-sm text-zinc-500 max-w-xs leading-relaxed">
                  Type a name above, add it with +, then click Search Nearby.
                </p>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* ── Cart Overlay ─────────────────────────────────────────── */}
      {cartOverlay && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200"
          onClick={(e) => { if (e.target === e.currentTarget && !addingToCart) setCartOverlay(null); }}
        >
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden max-h-[85vh]">
            {/* Header */}
            <div className="flex items-start justify-between px-8 pt-8 pb-5 shrink-0 bg-white border-b border-zinc-100">
              <div>
                <h2 className="text-xl font-bold text-zinc-900">{cartOverlay.pharmacy_name}</h2>
                <p className="text-sm font-medium text-zinc-500 mt-1">Select items & quantities for cart</p>
              </div>
              <button
                onClick={() => !addingToCart && setCartOverlay(null)}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-zinc-100 text-zinc-400 hover:text-zinc-900 transition-colors shrink-0"
              >
                <X size={18} />
              </button>
            </div>

            {/* Medicine list */}
            <div className="flex-1 overflow-y-auto px-8 py-6 flex flex-col gap-4 bg-zinc-50/50">
              {cartSuccess ? (
                <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
                  <div className="w-20 h-20 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center">
                    <CheckCircle2 size={40} className="text-emerald-500" />
                  </div>
                  <div>
                    <p className="text-lg font-bold text-zinc-900">Added to Cart!</p>
                    <p className="text-sm font-medium text-zinc-500 mt-1">Medicines have been added successfully.</p>
                  </div>
                </div>
              ) : (
                medicineChips.map((chip) => {
                  const available = isMedicineAvailableInOverlay(chip.medicine_id);
                  const stock = getStockForMedicine(chip.medicine_id);
                  const qty = cartQtys[chip.medicine_id] ?? chip.quantity;
                  const atLimit = qty >= stock;

                  return (
                    <div
                      key={chip.medicine_id}
                      className={`border rounded-2xl overflow-hidden transition-colors ${
                        available ? "border-zinc-200 bg-white shadow-sm" : "border-zinc-200 bg-zinc-50 opacity-60"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-4 p-4">
                        <div className="flex items-center gap-4 flex-1 min-w-0">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${available ? 'bg-indigo-50 border border-indigo-100' : 'bg-zinc-200'}`}>
                            <Pill size={18} className={available ? "text-indigo-600" : "text-zinc-400"} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-zinc-900 truncate">
                              {chip.brand_name}{chip.strength ? ` ${chip.strength}` : ""}
                            </p>
                            <p className="text-xs font-medium text-zinc-500 truncate mt-0.5">{chip.generic_name}</p>
                            {!available && (
                              <p className="text-xs text-red-500 mt-1 font-bold">
                                Not available here
                              </p>
                            )}
                            {available && (
                              <p className="text-xs font-semibold text-zinc-400 mt-1">{stock} in stock</p>
                            )}
                          </div>
                        </div>

                        {/* Quantity controls */}
                        {available && (
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() =>
                                setCartQtys((prev) => ({
                                  ...prev,
                                  [chip.medicine_id]: Math.max(1, (prev[chip.medicine_id] ?? chip.quantity) - 1),
                                }))
                              }
                              className="w-8 h-8 rounded-lg border border-zinc-200 bg-white flex items-center justify-center text-zinc-500 hover:border-zinc-400 hover:text-zinc-900 transition-colors shadow-sm"
                            >
                              <Minus size={14} />
                            </button>
                            <span className="text-sm font-bold text-zinc-900 w-6 text-center tabular-nums">
                              {qty}
                            </span>
                            <button
                              onClick={() => {
                                if (!atLimit)
                                  setCartQtys((prev) => ({
                                    ...prev,
                                    [chip.medicine_id]: (prev[chip.medicine_id] ?? chip.quantity) + 1,
                                  }));
                              }}
                              disabled={atLimit}
                              title={atLimit ? "Stock limit reached" : undefined}
                              className={`w-8 h-8 rounded-lg border flex items-center justify-center transition-colors shadow-sm ${
                                atLimit
                                  ? "border-zinc-200 bg-zinc-50 text-zinc-300 cursor-not-allowed"
                                  : "border-zinc-200 bg-white text-zinc-500 hover:border-zinc-400 hover:text-zinc-900"
                              }`}
                            >
                              {atLimit ? <Lock size={12} /> : <Plus size={14} />}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            {!cartSuccess && (
              <div className="px-8 py-5 shrink-0 bg-white border-t border-zinc-100 flex gap-4">
                <button
                  onClick={() => !addingToCart && setCartOverlay(null)}
                  className="flex-1 py-3 bg-white border border-zinc-200 text-zinc-700 text-sm font-bold rounded-xl hover:bg-zinc-50 transition-colors shadow-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddToCart}
                  disabled={
                    addingToCart ||
                    medicineChips.every((c) => !isMedicineAvailableInOverlay(c.medicine_id))
                  }
                  className="flex-1 py-3 bg-zinc-900 text-white text-sm font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-zinc-800 transition-all shadow-md active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
                >
                  {addingToCart ? <Loader2 size={16} className="animate-spin" /> : <ShoppingBag size={16} />}
                  {addingToCart ? "Adding…" : "Add to Cart"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Medicine Quantity Overlay ─────────────────────────────── */}
      {qtyOverlay && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-zinc-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
          onClick={(e) => { if (e.target === e.currentTarget) setQtyOverlay(null); }}
        >
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xs p-8 flex flex-col gap-6">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-lg font-bold text-zinc-900 leading-tight">
                  {qtyOverlay.chip.brand_name}
                  {qtyOverlay.chip.strength ? ` ${qtyOverlay.chip.strength}` : ""}
                </p>
                <p className="text-xs font-medium text-zinc-500 mt-1">{qtyOverlay.chip.generic_name}</p>
              </div>
              <button
                onClick={() => setQtyOverlay(null)}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-zinc-100 text-zinc-400 hover:text-zinc-900 shrink-0 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Qty picker */}
            <div className="flex flex-col items-center gap-3">
              <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Adjust Quantity</p>
              <div className="flex items-center gap-6 mt-2">
                <button
                  onClick={() => setQtyTemp((v) => Math.max(1, v - 1))}
                  className="w-12 h-12 rounded-2xl border border-zinc-200 bg-white flex items-center justify-center text-zinc-500 hover:border-zinc-400 hover:text-zinc-900 transition-colors shadow-sm"
                >
                  <Minus size={20} />
                </button>
                <span className="text-4xl font-bold text-zinc-900 tabular-nums w-14 text-center">
                  {qtyTemp}
                </span>
                <button
                  onClick={() => setQtyTemp((v) => v + 1)}
                  className="w-12 h-12 rounded-2xl border border-zinc-200 bg-white flex items-center justify-center text-zinc-500 hover:border-zinc-400 hover:text-zinc-900 transition-colors shadow-sm"
                >
                  <Plus size={20} />
                </button>
              </div>
            </div>

            <button onClick={saveQty} className="w-full py-3.5 mt-2 bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-bold rounded-xl transition-all shadow-md active:scale-95">
              Save Quantity
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page export (wraps inner in Suspense for useSearchParams) ──
export default function LocationPage() {
  return (
    <Suspense>
      <LocationPageInner />
    </Suspense>
  );
}