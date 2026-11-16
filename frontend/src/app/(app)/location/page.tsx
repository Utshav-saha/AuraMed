"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { Search, X, Loader2, LocateFixed, Plus, Check, Store, Route, AlertCircle } from "lucide-react";
import { api, geolocate, km, type CartResult, type CheckPharmacyItem, type PharmacyHit, type Suggestion } from "@/lib/api";
import type { Pin } from "@/components/PharmacyMap";

const PharmacyMap = dynamic(() => import("@/components/PharmacyMap"), { ssr: false, loading: () => <div className="h-full w-full bg-paper-2 animate-pulse rounded-lg" /> });

interface Want {
  id: number;
  name: string;
  qty: number;
}

export default function LocationPage() {
  return (
    <Suspense fallback={null}>
      <Location />
    </Suspense>
  );
}

function Location() {
  const params = useSearchParams();
  const [mode, setMode] = useState<"medicine" | "pharmacy">("medicine");
  const [wants, setWants] = useState<Want[]>([]);
  const [q, setQ] = useState("");
  const [sugs, setSugs] = useState<Suggestion[]>([]);
  const [pharmSugs, setPharmSugs] = useState<PharmacyHit[]>([]);
  const [pharmacy, setPharmacy] = useState<PharmacyHit | null>(null);
  const [focus, setFocus] = useState(false);
  const [pos, setPos] = useState<[number, number] | null>(null);
  const [posErr, setPosErr] = useState<string | null>(null);
  const [radius, setRadius] = useState(5000);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<CartResult | null>(null);
  const [check, setCheck] = useState<CheckPharmacyItem[] | null>(null);
  const [tab, setTab] = useState<"one" | "route" | "partial">("one");
  const [added, setAdded] = useState<Record<string, boolean>>({});

  // ?ids=1,2 (dashboard theke) ba ?q=napa (chatbot theke)
  useEffect(() => {
    const ids = params.get("ids");
    const qq = params.get("q");
    if (ids) {
      const list = ids.split(",").map(Number).filter(Boolean);
      Promise.all(list.map((id) => api.medicineDetails(id).catch(() => null))).then((ds) =>
        setWants(ds.filter((d): d is NonNullable<typeof d> => !!d).map((d) => ({ id: d.id, name: `${d.brand_name} ${d.strength ?? ""}`.trim(), qty: 1 }))),
      );
    } else if (qq) {
      api.suggest(qq, 1).then((s) => s[0]?.medicine_id && setWants([{ id: s[0].medicine_id, name: s[0].label, qty: 1 }])).catch(() => {});
    }
  }, [params]);

  const locate = useCallback(
    () =>
      geolocate()
        .then((p) => {
          setPosErr(null);
          setPos([p.coords.latitude, p.coords.longitude]);
        })
        .catch(() => {
          setPosErr("Location blocked. Using your saved home location if any.");
          return api.patient().then((me) => me.home_location && setPos([me.home_location.latitude, me.home_location.longitude])).catch(() => {});
        }),
    [],
  );
  useEffect(() => {
    void locate();
  }, [locate]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (!focus || q.trim().length < 2) {
        setSugs([]);
        setPharmSugs([]);
      } else if (mode === "medicine") api.suggest(q, 7).then((s) => setSugs(s.filter((x) => x.kind === "brand"))).catch(() => setSugs([]));
      else api.pharmaciesByName(q).then(setPharmSugs).catch(() => setPharmSugs([]));
    }, 160);
    return () => clearTimeout(t);
  }, [q, focus, mode]);

  const addWant = (s: Suggestion) => {
    if (!s.medicine_id) return;
    if (!wants.some((w) => w.id === s.medicine_id)) setWants([...wants, { id: s.medicine_id, name: s.label, qty: 1 }]);
    setQ("");
    setSugs([]);
  };

  const run = async () => {
    setErr(null);
    setBusy(true);
    try {
      if (mode === "pharmacy") {
        if (!pharmacy) throw new Error("Pick a pharmacy first");
        setCheck(await api.checkPharmacy({ pharmacy_id: pharmacy.pharmacy_id, medicine_ids: wants.map((w) => w.id), quantities: wants.map((w) => w.qty) }));
      } else {
        if (!pos) throw new Error("We need your location to find nearby pharmacies");
        const r = await api.searchPharmacies({ user_lat: pos[0], user_lng: pos[1], search_radius_meters: radius, target_medicine_ids: wants.map((w) => w.id), target_quantities: wants.map((w) => w.qty) });
        setResult(r);
        setTab(r.one_stop_options.length ? "one" : r.multi_stop_route.length ? "route" : "partial");
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const addToCart = async (medId: number, pharmacyId: number, key: string) => {
    if (added[key]) return;
    try {
      await api.addToCart({ medicine_id: medId, count: wants.find((w) => w.id === medId)?.qty ?? 1, assigned_pharmacy: pharmacyId });
      setAdded((a) => ({ ...a, [key]: true }));
    } catch {}
  };

  // map pins
  const pins: Pin[] = useMemo(() => {
    if (mode === "pharmacy") return pharmacy?.lat && pharmacy.lng ? [{ id: pharmacy.pharmacy_id, name: pharmacy.pharmacy_name, lat: pharmacy.lat, lng: pharmacy.lng, highlight: true }] : [];
    if (!result) return [];
    if (tab === "route") {
      const seen = new Map<number, Pin>();
      result.multi_stop_route.forEach((s) => {
        if (s.lat && s.lng && !seen.has(s.pharmacy_id)) seen.set(s.pharmacy_id, { id: s.pharmacy_id, name: s.pharmacy_name, lat: s.lat, lng: s.lng, label: String(s.stop_order), highlight: true });
      });
      return [...seen.values()];
    }
    const list = tab === "one" ? result.one_stop_options : result.partial_matches;
    return list.filter((p) => p.lat && p.lng).map((p, i) => ({ id: p.pharmacy_id, name: p.pharmacy_name, lat: p.lat!, lng: p.lng!, label: String(i + 1), sub: km(p.distance_meters), highlight: i === 0 }));
  }, [mode, pharmacy, result, tab]);

  const routeLine = useMemo<[number, number][] | undefined>(() => {
    if (tab !== "route" || !result || !pos) return;
    return [pos, ...pins.map((p) => [p.lat, p.lng] as [number, number])];
  }, [tab, result, pos, pins]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Pharmacies</p>
          <h1 className="text-3xl mt-1">Where to buy</h1>
        </div>
        <div className="flex sheet p-0.5 text-sm">
          {(["medicine", "pharmacy"] as const).map((m) => (
            <button key={m} onClick={() => { setMode(m); setResult(null); setCheck(null); }} className={`h-8 px-3 rounded-md ${mode === m ? "bg-ink text-paper" : "text-ink-2"}`}>
              {m === "medicine" ? "Near me" : "At a pharmacy"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-[380px_1fr] gap-6">
        <div className="space-y-4">
          {mode === "pharmacy" && (
            <div className="relative">
              <span className="label">Pharmacy</span>
              {pharmacy ? (
                <div className="sheet px-3 h-10 flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2"><Store size={14} /> {pharmacy.pharmacy_name}</span>
                  <button onClick={() => setPharmacy(null)} className="text-ink-3 hover:text-ink"><X size={14} /></button>
                </div>
              ) : (
                <>
                  <input value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => setFocus(true)} onBlur={() => setTimeout(() => setFocus(false), 150)} placeholder="Lazz, City Pharma…" className="input" />
                  {focus && pharmSugs.length > 0 && (
                    <ul className="absolute z-20 left-0 right-0 mt-1 sheet shadow-lg text-sm">
                      {pharmSugs.map((p) => (
                        <li key={p.pharmacy_id}><button onMouseDown={() => { setPharmacy(p); setQ(""); }} className="w-full text-left px-3 py-2 hover:bg-paper">{p.pharmacy_name}</button></li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          )}

          <div className="relative">
            <span className="label">Medicines</span>
            <Search size={15} className="absolute left-3 top-[34px] text-ink-3" />
            <input
              value={mode === "medicine" || pharmacy ? q : ""}
              onChange={(e) => setQ(e.target.value)}
              onFocus={() => setFocus(true)}
              onBlur={() => setTimeout(() => setFocus(false), 150)}
              placeholder="Add a medicine…"
              className="input pl-9"
              disabled={mode === "pharmacy" && !pharmacy}
            />
            {focus && sugs.length > 0 && (mode === "medicine" || pharmacy) && (
              <ul className="absolute z-20 left-0 right-0 mt-1 sheet shadow-lg text-sm">
                {sugs.map((s, i) => (
                  <li key={i}><button onMouseDown={() => addWant(s)} className="w-full text-left px-3 py-2 hover:bg-paper flex justify-between"><span>{s.label}</span><span className="text-xs text-ink-3">{s.sub}</span></button></li>
                ))}
              </ul>
            )}
          </div>

          {wants.length > 0 && (
            <ul className="sheet divide-y divide-line text-sm">
              {wants.map((w) => (
                <li key={w.id} className="flex items-center gap-2 px-3 h-10">
                  <span className="flex-1 truncate">{w.name}</span>
                  <input type="number" min={1} value={w.qty} onChange={(e) => setWants(wants.map((x) => (x.id === w.id ? { ...x, qty: Math.max(1, Number(e.target.value)) } : x)))} className="input h-7 w-14 num text-center px-1" />
                  <button onClick={() => setWants(wants.filter((x) => x.id !== w.id))} className="text-ink-3 hover:text-rx"><X size={14} /></button>
                </li>
              ))}
            </ul>
          )}

          {mode === "medicine" && (
            <div className="flex items-center gap-2 text-xs text-ink-2">
              <button onClick={locate} className="btn-ghost h-8 px-2"><LocateFixed size={14} /> {pos ? "Located" : "Locate me"}</button>
              <select value={radius} onChange={(e) => setRadius(Number(e.target.value))} className="input h-8 w-auto text-xs">
                {[1000, 2000, 5000, 10000].map((r) => <option key={r} value={r}>within {r / 1000} km</option>)}
              </select>
            </div>
          )}
          {posErr && <p className="text-xs text-amber flex items-center gap-1"><AlertCircle size={12} /> {posErr}</p>}

          <button onClick={run} disabled={busy || wants.length === 0 || (mode === "pharmacy" && !pharmacy)} className="btn-primary w-full">
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />} {mode === "medicine" ? "Find pharmacies" : "Check stock"}
          </button>
          {err && <p className="text-sm text-rx">{err}</p>}

          {/* results */}
          {mode === "pharmacy" && check && (
            <ul className="sheet divide-y divide-line text-sm">
              {check.map((c) => (
                <li key={c.medicine_id} className="p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{c.brand_name}</span>
                    <span className={`tag ${c.in_stock ? "bg-green-soft text-green" : "bg-rx-soft text-rx"}`}>{c.in_stock ? `${c.stock_count} in stock` : "out of stock"}</span>
                  </div>
                  {c.in_stock && pharmacy && (
                    <button onClick={() => addToCart(c.medicine_id, pharmacy.pharmacy_id, `p${c.medicine_id}`)} className="btn-outline h-7 text-xs">
                      {added[`p${c.medicine_id}`] ? <Check size={12} /> : <Plus size={12} />} Add from here
                    </button>
                  )}
                  {!c.in_stock && c.substitutes.length > 0 && (
                    <div className="text-xs text-ink-2">
                      Same generic available:{" "}
                      {c.substitutes.slice(0, 3).map((s) => (
                        <button key={s.provided_medicine_id} onClick={() => pharmacy && addToCart(s.provided_medicine_id, pharmacy.pharmacy_id, `s${s.provided_medicine_id}`)} className="underline decoration-dotted mr-2 hover:text-green">
                          {s.provided_medicine_name}{added[`s${s.provided_medicine_id}`] ? " ✓" : ""}
                        </button>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {mode === "medicine" && result && (
            <div className="space-y-3">
              <div className="flex sheet p-0.5 text-xs">
                {([["one", `One stop (${result.one_stop_options.length})`], ["route", `Route (${new Set(result.multi_stop_route.map((s) => s.pharmacy_id)).size} stops)`], ["partial", "Partial"]] as const).map(([k, l]) => (
                  <button key={k} onClick={() => setTab(k)} className={`flex-1 h-7 rounded ${tab === k ? "bg-ink text-paper" : "text-ink-2"}`}>{l}</button>
                ))}
              </div>
              {result.missing_medicine_ids.length > 0 && (
                <p className="text-xs text-amber flex gap-1"><AlertCircle size={13} className="shrink-0 mt-0.5" /> Not found nearby: {result.missing_medicine_ids.map((id) => result.target_names[id]).join(", ")}</p>
              )}

              {tab === "one" && (result.one_stop_options.length === 0 ? <p className="text-sm text-ink-3">No single pharmacy has everything. Check the route tab.</p> : result.one_stop_options.map((p, i) => (
                <div key={p.pharmacy_id} className="sheet p-3 text-sm space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium flex items-center gap-2"><span className="num w-5 h-5 rounded-full bg-ink text-paper grid place-items-center text-[10px]">{i + 1}</span>{p.pharmacy_name}</span>
                    <span className="num text-xs text-ink-2">{km(p.distance_meters)}</span>
                  </div>
                  <ul className="text-xs space-y-1">
                    {p.items.map((it) => (
                      <li key={it.target_medicine_id} className="flex items-center justify-between gap-2">
                        <span className="truncate">{it.provided_medicine_name}{!it.is_exact && <span className="text-amber"> (substitute for {result.target_names[it.target_medicine_id]})</span>}</span>
                        <button onClick={() => addToCart(it.provided_medicine_id, p.pharmacy_id, `${p.pharmacy_id}-${it.provided_medicine_id}`)} className="btn-ghost h-6 px-1.5 text-[11px] shrink-0">
                          {added[`${p.pharmacy_id}-${it.provided_medicine_id}`] ? <Check size={11} className="text-green" /> : <Plus size={11} />}
                        </button>
                      </li>
                    ))}
                  </ul>
                  <button onClick={() => p.items.forEach((it) => addToCart(it.provided_medicine_id, p.pharmacy_id, `${p.pharmacy_id}-${it.provided_medicine_id}`))} className="btn-outline h-7 text-xs w-full">Add all from here</button>
                </div>
              )))}

              {tab === "route" && (result.multi_stop_route.length === 0 ? <p className="text-sm text-ink-3">Nothing in range.</p> : (
                <ol className="sheet divide-y divide-line text-sm">
                  {result.multi_stop_route.map((s) => (
                    <li key={s.target_medicine_id} className="p-3 flex items-center gap-3">
                      <span className="num w-6 h-6 rounded-full bg-green text-paper grid place-items-center text-[11px] shrink-0">{s.stop_order}</span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate">{s.provided_medicine_name}{!s.is_exact && <span className="text-xs text-amber"> · substitute</span>}</div>
                        <div className="text-xs text-ink-3 truncate flex items-center gap-1"><Route size={11} /> {s.pharmacy_name} · {km(s.distance_meters)}</div>
                      </div>
                      <button onClick={() => addToCart(s.provided_medicine_id, s.pharmacy_id, `r${s.target_medicine_id}`)} className="btn-ghost h-7 w-7 p-0">
                        {added[`r${s.target_medicine_id}`] ? <Check size={13} className="text-green" /> : <Plus size={13} />}
                      </button>
                    </li>
                  ))}
                </ol>
              ))}

              {tab === "partial" && result.partial_matches.map((p) => (
                <div key={p.pharmacy_id} className="sheet p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{p.pharmacy_name}</span>
                    <span className="num text-xs text-ink-2">{p.medicine_count}/{wants.length} · {km(p.distance_meters)}</span>
                  </div>
                  <div className="text-xs text-ink-2 mt-1 truncate">{p.available_medicines.map((m) => m.provided_medicine_name).join(", ")}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="h-[420px] lg:h-[calc(100vh-200px)] lg:sticky lg:top-20 sheet overflow-hidden">
          <PharmacyMap user={pos} pins={pins} route={routeLine} />
        </div>
      </div>
    </div>
  );
}
