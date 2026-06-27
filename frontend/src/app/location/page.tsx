"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  Bell, Settings, Calendar, MapPin, Calculator, ShoppingCart,
  Search, PlusCircle, X, Pill, Store, CheckCircle2, AlertCircle,
  Minus, Plus, Lock, Loader2, ShoppingBag, Navigation, LayoutDashboard,
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
  { icon: Calendar, label: "Book Appointment", href: "/appointments" },
  { icon: MapPin, label: "Find Pharmacies", href: "/location", active: true },
  { icon: Pill, label: "Search Medicine", href: "/medicines" },
  { icon: Calculator, label: "Dosage Calculator", href: "/dosage" },
  { icon: ShoppingCart, label: "View Cart", href: "/cart" },
];

// ── Types ──────────────────────────────────────────────────────
interface MedicineChip {
  medicine_id: number;
  brand_name: string;
  generic_name: string;
  strength: string | null;
  quantity: number;
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

// ── Filter Toggle ──────────────────────────────────────────────
function FilterToggle({
  label, sublabel, active, onToggle,
}: { label: string; sublabel: string; active: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className={`flex items-center gap-2.5 px-4 py-2 rounded-xl border text-left transition-all ${
        active
          ? "bg-[#EAF2FF] border-[#4D8ED6] text-[#4D8ED6]"
          : "bg-white border-[#E6ECF7] text-[#6A7898] hover:border-[#B8D4F5]"
      }`}
    >
      <div className={`w-8 h-4 rounded-full relative transition-colors shrink-0 ${active ? "bg-[#4D8ED6]" : "bg-[#D8E0F0]"}`}>
        <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all ${active ? "left-[18px]" : "left-0.5"}`} />
      </div>
      <div>
        <p className={`text-[12px] font-semibold ${active ? "text-[#4D8ED6]" : "text-[#1B2A4A]"}`}>{label}</p>
        <p className="text-[10.5px] text-[#9DAABF] leading-tight">{sublabel}</p>
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
      className="bg-white rounded-[18px] border border-[rgba(215,225,245,0.70)] shadow-[0_2px_16px_rgba(140,158,205,0.09)] p-4 flex items-start gap-4"
    >
      {/* Icon */}
      <div className="w-10 h-10 rounded-2xl bg-[#EAF2FF] flex items-center justify-center shrink-0 mt-0.5">
        <Store size={18} className="text-[#4D8ED6]" />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <p className="text-[14px] font-semibold text-[#1B2A4A]">{pharmacy.pharmacyName}</p>
          <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-[#4D8ED6] bg-[#EAF2FF] px-2 py-0.5 rounded-full shrink-0">
            <Navigation size={9} />
            {fmtDistance(pharmacy.distanceMeters)}
          </span>
        </div>

        {/* Medicine availability chips */}
        {allMedicineChips.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {allMedicineChips.map((chip) => {
              const med = availableMap.get(chip.medicine_id);
              const available = !!med;
              const isGeneric = available && !med.is_exact;

              if (!available) {
                return (
                  <span key={chip.medicine_id} className="inline-flex items-center gap-1 text-[10.5px] px-2 py-0.5 rounded-full bg-[#F3F5FB] text-[#9DAABF] border border-[#E6ECF7]">
                    <X size={8} />
                    {chip.brand_name}
                  </span>
                );
              }
              if (isGeneric && exactMatchOn) {
                return (
                  <span key={chip.medicine_id} className="inline-flex items-center gap-1 text-[10.5px] px-2 py-0.5 rounded-full bg-[#F3F5FB] text-[#C8D0E0] border border-[#E6ECF7]">
                    <X size={8} />
                    {chip.brand_name}
                  </span>
                );
              }
              if (isGeneric) {
                return (
                  <span key={chip.medicine_id} className="inline-flex items-center gap-1 text-[10.5px] px-2 py-0.5 rounded-full bg-[#FFF8E6] text-[#B07800] border border-[#FFE599]">
                    <AlertCircle size={8} />
                    {chip.brand_name} (generic)
                  </span>
                );
              }
              return (
                <span key={chip.medicine_id} className="inline-flex items-center gap-1 text-[10.5px] px-2 py-0.5 rounded-full bg-[#E6F7F0] text-[#22A06B] border border-[#B8EDD6]">
                  <CheckCircle2 size={8} />
                  {chip.brand_name}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* Cart button */}
      <button
        onClick={onCartClick}
        className="aura-btn-primary flex items-center gap-1.5 px-3.5 py-2 text-[12px] font-semibold shrink-0"
      >
        <ShoppingBag size={13} />
        Add
      </button>
    </div>
  );
}

// ── Inner page component (uses useSearchParams — needs Suspense) ─
function LocationPageInner() {
  const searchParams = useSearchParams();
  const { patient } = useAuth();

  // ── State ──────────────────────────────────────────────────
  const [searchMode, setSearchMode] = useState<"medicine" | "pharmacy">("medicine");
  const [query, setQuery] = useState("");
  const [autocompleteResults, setAutocompleteResults] = useState<MedicineResult[] | PharmacyNameResult[]>([]);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [medicineChips, setMedicineChips] = useState<MedicineChip[]>([]);
  const [pharmacyChips, setPharmacyChips] = useState<PharmacyChip[]>([]);
  const [singlePharmacy, setSinglePharmacy] = useState(true);
  const [exactMatch, setExactMatch] = useState(false);
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

  // Read ?exact=1 from URL (set by "Where to Buy" in dashboard)
  useEffect(() => {
    if (searchParams.get("exact") === "1") setExactMatch(true);
  }, [searchParams]);

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
    if (debouncedQuery.trim().length < 2) {
      setAutocompleteResults([]);
      setShowAutocomplete(false);
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
        if (!cancelled) setAutocompleteResults([]);
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
      }];
    });
    setQuery("");
    setShowAutocomplete(false);
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
    <div className="flex flex-col h-screen bg-[#EDF1F9] overflow-hidden">
      <NavBar />

      <div className="flex flex-1 gap-4 p-4 overflow-hidden">
        <Sidebar />

        {/* ── Main Content ── */}
        <main className="flex-1 flex flex-col gap-4 overflow-y-auto min-w-0">

          {/* ── Header row ── */}
          <div className="shrink-0 flex items-center justify-between">
            <div>
              <h1 className="text-[20px] font-bold text-[#1B2A4A] tracking-tight">Find Pharmacies</h1>
              <p className="text-[12px] text-[#9DAABF] mt-0.5">
                Search by medicine or pharmacy name — we&apos;ll find what&apos;s nearby.
              </p>
            </div>

            {/* Mode toggle */}
            <div className="flex items-center bg-white rounded-xl border border-[#E6ECF7] p-1 gap-0.5 shadow-sm">
              {(["medicine", "pharmacy"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => {
                    setSearchMode(mode);
                    setQuery("");
                    setAutocompleteResults([]);
                    setShowAutocomplete(false);
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all ${
                    searchMode === mode
                      ? "bg-[#4D8ED6] text-white shadow-sm"
                      : "text-[#6A7898] hover:text-[#1B2A4A]"
                  }`}
                >
                  {mode === "medicine" ? <Pill size={12} /> : <Store size={12} />}
                  {mode === "medicine" ? "By Medicine" : "By Pharmacy"}
                </button>
              ))}
            </div>
          </div>

          {/* ── Search card ── */}
          <div className="bg-white rounded-[22px] shadow-[0_2px_20px_rgba(140,158,205,0.11),0_1px_4px_rgba(140,158,205,0.06)] border border-[rgba(215,225,245,0.70)] p-5 flex flex-col gap-4 shrink-0">

            {/* Search input row */}
            <div className="flex gap-2 items-start">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9DAABF] pointer-events-none z-10" />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onFocus={() => { if (autocompleteResults.length > 0) setShowAutocomplete(true); }}
                  onKeyDown={(e) => { if (e.key === "Enter") addFromInput(); }}
                  placeholder={
                    searchMode === "medicine"
                      ? "Search medicine by name or symptom…"
                      : "Search pharmacy by name…"
                  }
                  className="w-full h-11 pl-9 pr-4 bg-[#F3F5FB] border border-[#D8E0F0] rounded-2xl text-[13px] text-[#1B2A4A] placeholder:text-[#9DAABF] focus:outline-none focus:border-[#4D8ED6] focus:bg-white focus:shadow-[0_0_0_3px_rgba(77,142,214,0.10)] transition-all"
                />

                {/* Autocomplete dropdown */}
                {showAutocomplete && autocompleteResults.length > 0 && (
                  <div
                    ref={autocompleteRef}
                    className="absolute top-[calc(100%+6px)] left-0 right-0 bg-white rounded-2xl border border-[#E6ECF7] shadow-[0_8px_32px_rgba(140,158,205,0.18)] z-50 overflow-hidden"
                  >
                    {searchMode === "medicine"
                      ? (autocompleteResults as MedicineResult[]).map((med) => (
                          <button
                            key={med.medicine_id}
                            onMouseDown={(e) => { e.preventDefault(); addMedicineChip(med); }}
                            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[#F3F5FB] transition-colors text-left"
                          >
                            <div className="w-6 h-6 rounded-lg bg-[#EAF2FF] flex items-center justify-center shrink-0">
                              <Pill size={11} className="text-[#4D8ED6]" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[12.5px] font-semibold text-[#1B2A4A] truncate">
                                {med.brand_name}{med.strength ? ` ${med.strength}` : ""}
                              </p>
                              <p className="text-[10.5px] text-[#9DAABF] truncate">{med.generic_name}</p>
                            </div>
                          </button>
                        ))
                      : (autocompleteResults as PharmacyNameResult[]).map((pharm) => (
                          <button
                            key={pharm.pharmacy_id}
                            onMouseDown={(e) => { e.preventDefault(); addPharmacyChip(pharm); }}
                            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[#F3F5FB] transition-colors text-left"
                          >
                            <div className="w-6 h-6 rounded-lg bg-[#EAF2FF] flex items-center justify-center shrink-0">
                              <Store size={11} className="text-[#4D8ED6]" />
                            </div>
                            <p className="text-[12.5px] font-semibold text-[#1B2A4A]">{pharm.pharmacy_name}</p>
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
                className="w-11 h-11 rounded-2xl bg-[#EAF2FF] hover:bg-[#D5E9FF] flex items-center justify-center transition-colors shrink-0 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {addingChip ? (
                  <Loader2 size={18} className="text-[#4D8ED6] animate-spin" />
                ) : (
                  <PlusCircle size={18} className="text-[#4D8ED6]" />
                )}
              </button>
            </div>

            {/* Selected chips */}
            {(medicineChips.length > 0 || pharmacyChips.length > 0) && (
              <div className="flex flex-wrap gap-2">
                {medicineChips.map((chip, idx) => (
                  <div key={chip.medicine_id} className="flex flex-col items-start gap-0.5">
                    <button
                      onClick={() => openQtyOverlay(chip, idx)}
                      className="flex items-center gap-1.5 pl-2.5 pr-1.5 py-1.5 bg-[#EAF2FF] border border-[#B8D4F5] rounded-xl text-[12px] font-medium text-[#1B2A4A] hover:bg-[#D5E9FF] hover:border-[#4D8ED6] transition-all"
                    >
                      <Pill size={11} className="text-[#4D8ED6] shrink-0" />
                      <span>{chip.brand_name}{chip.strength ? ` ${chip.strength}` : ""}</span>
                      <span className="text-[#4D8ED6] font-semibold text-[11px]">×{chip.quantity}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); removeMedicineChip(idx); }}
                        className="w-4 h-4 rounded-full flex items-center justify-center hover:bg-[#C2D9F4] transition-colors ml-0.5"
                      >
                        <X size={9} className="text-[#4D8ED6]" />
                      </button>
                    </button>
                    <span className="text-[9.5px] text-[#9DAABF] pl-1">Tap to adjust qty</span>
                  </div>
                ))}

                {pharmacyChips.map((chip, idx) => (
                  <div
                    key={chip.pharmacy_id}
                    className="flex items-center gap-1.5 pl-2.5 pr-1.5 py-1.5 bg-[#F3F5FB] border border-[#D8E0F0] rounded-xl text-[12px] font-medium text-[#1B2A4A]"
                  >
                    <Store size={11} className="text-[#9DAABF] shrink-0" />
                    <span>{chip.pharmacy_name}</span>
                    <button
                      onClick={() => removePharmacyChip(idx)}
                      className="w-4 h-4 rounded-full flex items-center justify-center hover:bg-[#D8E0F0] transition-colors ml-0.5"
                    >
                      <X size={9} className="text-[#6A7898]" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Filter toggles + Search button */}
            <div className="flex items-center gap-3 flex-wrap">
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

              <div className="flex-1" />

              <button
                onClick={handleSearch}
                disabled={isSearching}
                className="aura-btn-primary flex items-center gap-2 px-5 py-2.5 text-[13px] font-semibold disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none shrink-0"
              >
                {isSearching ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Navigation size={14} />
                )}
                {isSearching ? "Searching…" : "Search Nearby"}
              </button>
            </div>

            {/* Error */}
            {searchError && (
              <p className="text-[12px] text-[#D94F4F] flex items-center gap-1.5">
                <AlertCircle size={13} />
                {searchError}
              </p>
            )}
          </div>

          {/* ── Results ── */}
          {isSearching && (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center py-16">
              <Loader2 size={28} className="text-[#4D8ED6] animate-spin" />
              <p className="text-[13px] text-[#6A7898]">Locating nearby pharmacies…</p>
            </div>
          )}

          {!isSearching && results && displayedPharmacies.length === 0 && (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center py-16">
              <div className="w-14 h-14 rounded-full bg-[#EAF2FF] flex items-center justify-center">
                <MapPin size={24} className="text-[#B8D4F5]" />
              </div>
              <p className="text-[14px] font-semibold text-[#1B2A4A]">No pharmacies found</p>
              <p className="text-[12px] text-[#9DAABF] max-w-[280px] leading-relaxed">
                {singlePharmacy
                  ? "No single pharmacy has all medicines nearby. Try turning off Single Pharmacy."
                  : "No pharmacies found nearby. Try different medicines or a larger search radius."}
              </p>
            </div>
          )}

          {!isSearching && displayedPharmacies.length > 0 && (
            <div className="flex flex-col gap-3">
              <p className="text-[11px] font-semibold text-[#9DAABF] uppercase tracking-widest shrink-0">
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
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center py-16">
              <div className="w-14 h-14 rounded-full bg-[#EAF2FF] flex items-center justify-center">
                <MapPin size={24} className="text-[#4D8ED6]" />
              </div>
              <p className="text-[14px] font-semibold text-[#1B2A4A]">Add medicines and search</p>
              <p className="text-[12px] text-[#9DAABF] max-w-[260px] leading-relaxed">
                Type a medicine name above, add it with +, then click Search Nearby.
              </p>
            </div>
          )}
        </main>
      </div>

      {/* ── Cart Overlay ─────────────────────────────────────────── */}
      {cartOverlay && (
        <div
          className="overlay-backdrop"
          onClick={(e) => { if (e.target === e.currentTarget && !addingToCart) setCartOverlay(null); }}
        >
          <div className="overlay-panel w-full max-w-md mx-4 flex flex-col" style={{ maxHeight: "88vh" }}>
            {/* Header */}
            <div className="flex items-start justify-between px-6 pt-6 pb-4 shrink-0">
              <div>
                <h2 className="text-[16px] font-bold text-[#1B2A4A]">{cartOverlay.pharmacy_name}</h2>
                <p className="text-[11.5px] text-[#9DAABF] mt-0.5">Select medicines and quantities to add to cart</p>
              </div>
              <button
                onClick={() => !addingToCart && setCartOverlay(null)}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[#F3F5FB] text-[#9DAABF] hover:text-[#6A7898] transition-colors shrink-0"
              >
                <X size={16} />
              </button>
            </div>

            {/* Medicine list */}
            <div className="flex-1 overflow-y-auto px-6 flex flex-col gap-3">
              {cartSuccess ? (
                <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
                  <div className="w-14 h-14 rounded-full bg-[#E6F7F0] flex items-center justify-center">
                    <CheckCircle2 size={28} className="text-[#22A06B]" />
                  </div>
                  <p className="text-[14px] font-semibold text-[#1B2A4A]">Added to Cart!</p>
                  <p className="text-[12px] text-[#9DAABF]">Medicines have been added successfully.</p>
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
                      className={`border rounded-2xl overflow-hidden ${
                        available ? "border-[#E6ECF7] bg-[#FAFBFF]" : "border-[#E6ECF7] bg-[#F8F9FC] opacity-60"
                      }`}
                    >
                      <div className="flex items-start gap-3 px-4 pt-3.5 pb-3">
                        <div className="w-8 h-8 rounded-xl bg-[#EAF2FF] flex items-center justify-center shrink-0 mt-0.5">
                          <Pill size={14} className="text-[#4D8ED6]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-semibold text-[#1B2A4A]">
                            {chip.brand_name}{chip.strength ? ` ${chip.strength}` : ""}
                          </p>
                          <p className="text-[11px] text-[#9DAABF] mt-0.5">{chip.generic_name}</p>
                          {!available && (
                            <p className="text-[10.5px] text-[#D94F4F] mt-1 font-medium">
                              Not available at this pharmacy
                            </p>
                          )}
                          {available && (
                            <p className="text-[10.5px] text-[#9DAABF] mt-1">{stock} in stock</p>
                          )}
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
                              className="w-7 h-7 rounded-lg border border-[#E6ECF7] bg-white flex items-center justify-center text-[#6A7898] hover:border-[#4D8ED6] hover:text-[#4D8ED6] transition-colors"
                            >
                              <Minus size={11} />
                            </button>
                            <span className="text-[14px] font-semibold text-[#1B2A4A] w-5 text-center tabular-nums">
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
                              className={`w-7 h-7 rounded-lg border flex items-center justify-center transition-colors ${
                                atLimit
                                  ? "border-[#E6ECF7] bg-[#F3F5FB] text-[#C8D0E0] cursor-not-allowed"
                                  : "border-[#E6ECF7] bg-white text-[#6A7898] hover:border-[#4D8ED6] hover:text-[#4D8ED6]"
                              }`}
                            >
                              {atLimit ? <Lock size={10} /> : <Plus size={11} />}
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
              <div className="px-6 py-4 shrink-0 border-t border-[#E6ECF7] flex gap-3">
                <button
                  onClick={() => !addingToCart && setCartOverlay(null)}
                  className="flex-1 aura-btn-secondary py-2.5 text-[13px]"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddToCart}
                  disabled={
                    addingToCart ||
                    medicineChips.every((c) => !isMedicineAvailableInOverlay(c.medicine_id))
                  }
                  className="flex-1 aura-btn-primary py-2.5 text-[13px] font-semibold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                >
                  {addingToCart ? <Loader2 size={13} className="animate-spin" /> : <ShoppingBag size={13} />}
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
          className="overlay-backdrop"
          style={{ zIndex: 60 }}
          onClick={(e) => { if (e.target === e.currentTarget) setQtyOverlay(null); }}
        >
          <div className="overlay-panel w-full max-w-xs mx-4 p-6 flex flex-col gap-5">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-[15px] font-bold text-[#1B2A4A]">
                  {qtyOverlay.chip.brand_name}
                  {qtyOverlay.chip.strength ? ` ${qtyOverlay.chip.strength}` : ""}
                </p>
                <p className="text-[11.5px] text-[#9DAABF] mt-0.5">{qtyOverlay.chip.generic_name}</p>
              </div>
              <button
                onClick={() => setQtyOverlay(null)}
                className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-[#F3F5FB] text-[#9DAABF] shrink-0"
              >
                <X size={14} />
              </button>
            </div>

            {/* Qty picker */}
            <div className="flex flex-col items-center gap-2">
              <p className="text-[11px] font-semibold text-[#9DAABF] uppercase tracking-widest">Quantity</p>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setQtyTemp((v) => Math.max(1, v - 1))}
                  className="w-10 h-10 rounded-xl border border-[#E6ECF7] bg-white flex items-center justify-center text-[#6A7898] hover:border-[#4D8ED6] hover:text-[#4D8ED6] transition-colors"
                >
                  <Minus size={16} />
                </button>
                <span className="text-[28px] font-bold text-[#1B2A4A] tabular-nums w-12 text-center">
                  {qtyTemp}
                </span>
                <button
                  onClick={() => setQtyTemp((v) => v + 1)}
                  className="w-10 h-10 rounded-xl border border-[#E6ECF7] bg-white flex items-center justify-center text-[#6A7898] hover:border-[#4D8ED6] hover:text-[#4D8ED6] transition-colors"
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>

            <button onClick={saveQty} className="aura-btn-primary w-full py-3 text-[13px] font-semibold">
              Save
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
