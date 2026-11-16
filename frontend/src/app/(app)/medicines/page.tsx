"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, Loader2, Plus, Check, ArrowUpRight } from "lucide-react";
import { api, taka, type MedicineResult, type Suggestion } from "@/lib/api";

export default function MedicinesPage() {
  return (
    <Suspense fallback={null}>
      <Medicines />
    </Suspense>
  );
}

function Medicines() {
  const params = useSearchParams();
  const router = useRouter();
  const initial = params.get("q") ?? "";
  const [q, setQ] = useState(initial);
  const [sugs, setSugs] = useState<Suggestion[]>([]);
  const [focus, setFocus] = useState(false);
  const [results, setResults] = useState<MedicineResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [added, setAdded] = useState<Record<number, "pending" | "done">>({});
  const lastRun = useRef("");

  // url er q change hole search
  useEffect(() => {
    const term = params.get("q")?.trim() ?? "";
    setQ(term);
    if (!term || lastRun.current === term) return;
    lastRun.current = term;
    setBusy(true);
    setErr(null);
    api
      .searchMedicines(term, 24)
      .then(setResults)
      .catch((e) => {
        setErr((e as Error).message);
        setResults([]);
      })
      .finally(() => setBusy(false));
  }, [params]);

  // suggestions: prefix, cheap
  useEffect(() => {
    if (!focus || q.trim().length < 2) return setSugs([]);
    const t = setTimeout(() => api.suggest(q, 7).then(setSugs).catch(() => setSugs([])), 160);
    return () => clearTimeout(t);
  }, [q, focus]);

  const go = (term: string) => {
    setSugs([]);
    setFocus(false);
    if (term.trim()) router.push(`/medicines?q=${encodeURIComponent(term.trim())}`);
  };

  const add = async (id: number) => {
    if (added[id]) return;
    setAdded((a) => ({ ...a, [id]: "pending" }));
    try {
      await api.addToCart({ medicine_id: id, count: 1 });
      setAdded((a) => ({ ...a, [id]: "done" }));
      setTimeout(() => setAdded((a) => { const { [id]: _, ...rest } = a; void _; return rest; }), 1500);
    } catch {
      setAdded((a) => { const { [id]: _, ...rest } = a; void _; return rest; });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Medicines</p>
        <h1 className="text-3xl mt-1">Search by name, generic or symptom</h1>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          go(q);
        }}
        className="relative max-w-2xl"
      >
        <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setFocus(true)}
          onBlur={() => setTimeout(() => setFocus(false), 150)}
          placeholder="Napa, Paracetamol, or “burning chest”"
          className="input h-12 pl-11 pr-24 text-base"
          autoFocus
        />
        <button type="submit" className="btn-primary absolute right-1.5 top-1.5 h-9">
          {busy ? <Loader2 size={15} className="animate-spin" /> : "Search"}
        </button>
        {focus && sugs.length > 0 && (
          <ul className="absolute z-20 left-0 right-0 mt-1 sheet shadow-lg overflow-hidden text-sm">
            {sugs.map((s, i) => (
              <li key={i}>
                <button
                  type="button"
                  onMouseDown={() => (s.kind === "brand" && s.medicine_id ? router.push(`/medicines/${s.medicine_id}`) : go(s.label))}
                  className="w-full text-left px-4 py-2 hover:bg-paper flex justify-between gap-3"
                >
                  <span>{s.label}</span>
                  <span className="text-xs text-ink-3 truncate">{s.sub}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </form>

      {err && <p className="text-sm text-rx">{err}</p>}

      {results === null && !busy && (
        <div className="text-sm text-ink-2 max-w-xl space-y-2">
          <p>Type a brand like <b>Napa</b>, a generic like <b>Omeprazole</b>, or describe what&apos;s wrong, like <b>sore throat and fever</b>.</p>
          <p className="text-ink-3 text-xs">Symptom searches use AI to pick drug classes, then match leaflets. Name searches are instant.</p>
        </div>
      )}

      {results && results.length === 0 && !busy && <p className="text-sm text-ink-3">Nothing matched “{params.get("q")}”. Try the generic name or a different spelling.</p>}

      {results && results.length > 0 && (
        <>
          <p className="text-xs text-ink-3">{results.length} results</p>
          <ul className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {results.map((m) => (
              <li key={m.medicine_id} className="sheet p-4 flex flex-col gap-2 hover:border-line-2 transition-colors">
                <Link href={`/medicines/${m.medicine_id}`} className="group">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium text-base group-hover:text-green">{m.brand_name}</span>
                    <span className="num text-xs text-ink-2 shrink-0">{m.strength}</span>
                  </div>
                  <div className="text-sm text-ink-2 truncate">{m.generic_name}</div>
                  <div className="text-xs text-ink-3 truncate mt-0.5">{[m.dosage_form, m.manufacturer_name].filter(Boolean).join(" · ")}</div>
                </Link>
                <div className="flex items-center justify-between mt-auto pt-2 border-t border-line">
                  <span className="num text-sm">{taka(m.unit_price)}<span className="text-ink-3 text-xs"> /unit</span></span>
                  <div className="flex gap-1">
                    <Link href={`/medicines/${m.medicine_id}`} className="btn-ghost h-8 px-2 text-xs">
                      Details <ArrowUpRight size={12} />
                    </Link>
                    <button onClick={() => add(m.medicine_id)} disabled={!!added[m.medicine_id]} className="btn-outline h-8 px-2.5 text-xs">
                      {added[m.medicine_id] === "done" ? <Check size={13} className="text-green" /> : added[m.medicine_id] === "pending" ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                      Add
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
