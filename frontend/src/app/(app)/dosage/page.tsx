"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Trash2, MapPin, ShoppingBag, Loader2 } from "lucide-react";
import { api, taka, type Prescription } from "@/lib/api";
import { dailyTotal, isValidDose, parseDose, dosePattern } from "@/lib/dose";

interface Line {
  key: string;
  medicine_id: number | null;
  name: string;
  pattern: string;
  days: number;
  custom?: boolean;
}

let n = 0;

export default function DosagePage() {
  const [rxs, setRxs] = useState<Prescription[] | null>(null);
  const [sel, setSel] = useState<number | "all">("all");
  const [custom, setCustom] = useState<Line[]>([]);
  const [edits, setEdits] = useState<Record<string, Partial<Line>>>({}); // prescription row e user ja bodlaise
  const [prices, setPrices] = useState<Record<number, number | null>>({});
  const [override, setOverride] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    api.prescriptions().then(setRxs).catch(() => setRxs([]));
  }, []);

  const base = useMemo<Line[]>(() => {
    const src = sel === "all" ? rxs ?? [] : (rxs ?? []).filter((r) => r.prescription_id === sel);
    return src.flatMap((r) =>
      r.items.map((it) => ({
        key: `i${it.item_id}`,
        medicine_id: it.medicine_id,
        name: `${it.brand_name ?? it.medicine_name ?? "Medicine"}${it.strength ? " " + it.strength : ""}`,
        pattern: dosePattern(it.dose).replace(/ /g, ""),
        days: it.duration,
      })),
    );
  }, [rxs, sel]);

  // price gulo details theke, ekbar kore
  useEffect(() => {
    const missing = [...new Set(base.map((b) => b.medicine_id).filter((x): x is number => !!x && !(x in prices)))];
    if (!missing.length) return;
    Promise.all(missing.map((id) => api.medicineDetails(id).then((d) => [id, d.unit_price] as const).catch(() => [id, null] as const))).then((pairs) =>
      setPrices((p) => ({ ...p, ...Object.fromEntries(pairs) })),
    );
  }, [base, prices]);

  const rows = useMemo(
    () =>
      [...base.map((l) => ({ ...l, ...edits[l.key] })), ...custom].map((l) => {
        const perDay = dailyTotal(l.pattern);
        const days = override ?? l.days;
        const total = perDay * days;
        const price = l.medicine_id ? prices[l.medicine_id] ?? null : null;
        return { ...l, perDay, days, total, price, cost: price != null ? price * total : null, ok: isValidDose(l.pattern) };
      }),
    [base, custom, edits, prices, override],
  );
  const grand = rows.reduce((s, r) => s + (r.cost ?? 0), 0);

  const patch = (key: string, u: Partial<Line>) => {
    if (key.startsWith("c")) setCustom((ls) => ls.map((l) => (l.key === key ? { ...l, ...u } : l)));
    else setEdits((e) => ({ ...e, [key]: { ...e[key], ...u } }));
  };

  const addAllToCart = async () => {
    setAdding(true);
    for (const r of rows) if (r.medicine_id && r.ok && r.total > 0) await api.addToCart({ medicine_id: r.medicine_id, count: Math.ceil(r.total) }).catch(() => {});
    setAdding(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Planning</p>
          <h1 className="text-3xl mt-1">Dosage calculator</h1>
        </div>
        <div className="flex gap-2 text-sm">
          <select value={sel} onChange={(e) => setSel(e.target.value === "all" ? "all" : Number(e.target.value))} className="input h-9 w-auto">
            <option value="all">All prescriptions</option>
            {rxs?.map((r) => (
              <option key={r.prescription_id} value={r.prescription_id}>
                {r.doctorName ?? "No doctor"} · {new Date(r.prescribed_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
              </option>
            ))}
          </select>
          <select value={override ?? ""} onChange={(e) => setOverride(e.target.value ? Number(e.target.value) : null)} className="input h-9 w-auto">
            <option value="">Prescribed days</option>
            {[7, 14, 30, 60, 90].map((d) => <option key={d} value={d}>{d} days</option>)}
          </select>
        </div>
      </div>

      {rxs === null ? (
        <div className="sheet h-40 animate-pulse" />
      ) : (
        <div className="sheet overflow-x-auto">
          <table className="w-full text-sm min-w-160">
            <thead className="text-[11px] uppercase tracking-wider text-ink-3">
              <tr className="border-b border-line">
                <th className="text-left font-medium px-4 py-2">Medicine</th>
                <th className="text-center font-medium px-2 py-2">M + N + N</th>
                <th className="text-right font-medium px-2 py-2">Per day</th>
                <th className="text-right font-medium px-2 py-2">Days</th>
                <th className="text-right font-medium px-2 py-2">Total units</th>
                <th className="text-right font-medium px-4 py-2">Est. cost</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-b border-line last:border-0">
                  <td className="px-4 py-2">
                    {r.custom ? (
                      <input value={r.name} onChange={(e) => patch(r.key, { name: e.target.value })} placeholder="Medicine name" className="input h-8" />
                    ) : r.medicine_id ? (
                      <Link href={`/medicines/${r.medicine_id}`} className="hover:text-green">{r.name}</Link>
                    ) : (
                      r.name
                    )}
                  </td>
                  <td className="px-2 py-2 text-center">
                    <input value={r.pattern} onChange={(e) => patch(r.key, { pattern: e.target.value })} className={`input h-8 w-24 num text-center mx-auto ${r.ok ? "" : "border-rx"}`} />
                  </td>
                  <td className="px-2 py-2 text-right num">{r.perDay}</td>
                  <td className="px-2 py-2 text-right">
                    <input type="number" min={1} value={r.days} disabled={override !== null} onChange={(e) => patch(r.key, { days: Math.max(1, Number(e.target.value)) })} className="input h-8 w-16 num text-right ml-auto" />
                  </td>
                  <td className="px-2 py-2 text-right num font-medium">{r.total}</td>
                  <td className="px-4 py-2 text-right num">{r.cost == null ? <span className="text-ink-3 text-xs">—</span> : taka(r.cost)}</td>
                  <td className="px-1">
                    {r.custom && <button onClick={() => setCustom((ls) => ls.filter((l) => l.key !== r.key))} className="btn-ghost h-7 w-7 p-0 text-ink-3 hover:text-rx"><Trash2 size={13} /></button>}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-ink-3">No prescriptions yet. Add a custom row below or <Link href="/dashboard" className="underline">scan one</Link>.</td></tr>
              )}
            </tbody>
            <tfoot>
              <tr className="bg-paper">
                <td colSpan={4} className="px-4 py-2">
                  <button onClick={() => setCustom((ls) => [...ls, { key: `c${++n}`, medicine_id: null, name: "", pattern: "1+0+1", days: override ?? 7, custom: true }])} className="btn-ghost h-8 text-xs -ml-2">
                    <Plus size={13} /> Custom row
                  </button>
                </td>
                <td className="px-2 py-2 text-right num font-medium">{rows.reduce((s, r) => s + r.total, 0)}</td>
                <td className="px-4 py-2 text-right num font-medium">{taka(grand)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button onClick={addAllToCart} disabled={adding || !rows.some((r) => r.medicine_id)} className="btn-primary">
          {adding ? <Loader2 size={15} className="animate-spin" /> : <ShoppingBag size={15} />} Add full course to cart
        </button>
        <Link href={`/location?ids=${rows.map((r) => r.medicine_id).filter(Boolean).join(",")}`} className="btn-outline"><MapPin size={15} /> Find in pharmacies</Link>
      </div>
      <p className="text-xs text-ink-3 max-w-xl">
        Pattern is morning + noon + night. Half tablets like ½+0+1 work. Cost is unit price × total units; packs may round up at the pharmacy.
        {rows.some((r) => parseDose(r.pattern).some((q) => q % 1 !== 0)) && " Half doses are counted as half a unit."}
      </p>
    </div>
  );
}
