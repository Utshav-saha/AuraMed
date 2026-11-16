"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Check, Loader2, MapPin, MessageSquareText } from "lucide-react";
import { api, taka, type Alternative, type MedicineDetails } from "@/lib/api";
import { useChat } from "@/components/ChatContext";

// medex er moto: header, sticky toc, leaflet sections, other brands
const SECTIONS: { key: keyof MedicineDetails; title: string }[] = [
  { key: "indication_description", title: "Indications" },
  { key: "pharmacology_description", title: "Pharmacology" },
  { key: "dosage_description", title: "Dosage" },
  { key: "administration_description", title: "Administration" },
  { key: "interaction_description", title: "Interaction" },
  { key: "contraindications_description", title: "Contraindications" },
  { key: "side_effects_description", title: "Side effects" },
  { key: "pregnancy_and_lactation_description", title: "Pregnancy & lactation" },
  { key: "precautions_description", title: "Precautions" },
  { key: "pediatric_usage_description", title: "Pediatric use" },
  { key: "overdose_effects_description", title: "Overdose" },
  { key: "duration_of_treatment_description", title: "Duration of treatment" },
  { key: "reconstitution_description", title: "Reconstitution" },
  { key: "storage_conditions_description", title: "Storage" },
];

export default function MedicineDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  // key diye state reset hoy jokhon id change kore
  return <Details key={id} medId={Number(id)} />;
}

function Details({ medId }: { medId: number }) {
  const chat = useChat();
  const [m, setM] = useState<MedicineDetails | null>(null);
  const [alts, setAlts] = useState<Alternative[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [cartState, setCartState] = useState<"idle" | "pending" | "done">("idle");

  useEffect(() => {
    api.medicineDetails(medId).then(setM).catch((e) => setErr((e as Error).message));
    api.alternatives(medId).then(setAlts).catch(() => setAlts([]));
  }, [medId]);

  // chat ke ei generic er context dei, page chere gele clear
  useEffect(() => {
    if (m?.generic_id) chat.setGeneric(m.generic_id, m.generic_name);
    return () => chat.setGeneric(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m?.generic_id]);

  const add = async () => {
    if (cartState !== "idle") return;
    setCartState("pending");
    try {
      await api.addToCart({ medicine_id: medId, count: 1 });
      setCartState("done");
      setTimeout(() => setCartState("idle"), 1500);
    } catch {
      setCartState("idle");
    }
  };

  if (err) {
    return (
      <div className="space-y-3">
        <Link href="/medicines" className="btn-ghost h-8 -ml-2"><ArrowLeft size={14} /> Back</Link>
        <p className="text-rx text-sm">{err}</p>
      </div>
    );
  }
  if (!m) return <div className="h-64 sheet animate-pulse" />;

  const present = SECTIONS.filter((s) => m[s.key]);

  return (
    <div className="space-y-8">
      <Link href="/medicines" className="btn-ghost h-8 -ml-2 text-ink-3"><ArrowLeft size={14} /> Medicines</Link>

      <header className="grid lg:grid-cols-[1fr_auto] gap-6 items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            {m.dosage_form && <span className="tag bg-green-soft text-green">{m.dosage_form}</span>}
            {m.drug_type && <span className="tag bg-paper-2 text-ink-2">{m.drug_type}</span>}
          </div>
          <h1 className="text-4xl sm:text-5xl leading-none">
            {m.brand_name} <span className="text-ink-2 text-2xl sm:text-3xl num">{m.strength}</span>
          </h1>
          <p className="mt-2 text-lg text-ink-2">{m.generic_name}</p>
          <dl className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3 text-sm">
            <Row k="Manufacturer" v={m.manufacturer_name} />
            <Row k="Drug class" v={m.drug_class_name} />
            <Row k="Indication" v={m.indication_name} />
            <Row k="Pack" v={m.package_size ?? m.package_container} />
          </dl>
        </div>

        <aside className="sheet p-4 w-full lg:w-64 space-y-3">
          <div>
            <span className="eyebrow">Unit price</span>
            <div className="font-display text-3xl num">{taka(m.unit_price)}</div>
            {m.pack_price != null && <div className="text-xs text-ink-3 num">pack {taka(m.pack_price)}</div>}
          </div>
          <button onClick={add} disabled={cartState !== "idle"} className="btn-primary w-full">
            {cartState === "done" ? <Check size={15} /> : cartState === "pending" ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
            {cartState === "done" ? "Added" : "Add to cart"}
          </button>
          <Link href={`/location?ids=${m.id}`} className="btn-outline w-full"><MapPin size={15} /> Find in pharmacies</Link>
          <button onClick={() => chat.ask(`Tell me about ${m.generic_name ?? m.brand_name}: what it is for, common side effects and precautions.`)} className="btn-ghost w-full text-ink-2">
            <MessageSquareText size={15} /> Ask about this medicine
          </button>
        </aside>
      </header>

      <div className="grid lg:grid-cols-[200px_1fr] gap-8">
        <nav className="hidden lg:block sticky top-20 self-start">
          <span className="eyebrow block mb-2">On this page</span>
          <ul className="space-y-1 text-sm border-l border-line">
            {present.map((s) => (
              <li key={s.key}>
                <a href={`#${s.key}`} className="block pl-3 py-0.5 -ml-px border-l border-transparent text-ink-2 hover:text-ink hover:border-green">{s.title}</a>
              </li>
            ))}
            {alts.length > 0 && (
              <li><a href="#alternatives" className="block pl-3 py-0.5 -ml-px border-l border-transparent text-ink-2 hover:text-ink hover:border-green">Other brands</a></li>
            )}
          </ul>
        </nav>

        <article className="min-w-0 space-y-6">
          {present.length === 0 && <p className="text-sm text-ink-3">No leaflet information available for this generic.</p>}
          {present.map((s) => (
            <details key={s.key} id={s.key} open className="sheet group scroll-mt-20">
              <summary className="cursor-pointer list-none px-5 py-3 flex items-center justify-between">
                <h2 className="text-lg">{s.title}</h2>
                <span className="text-ink-3 text-xs group-open:rotate-180 transition-transform">▾</span>
              </summary>
              <div className="px-5 pb-5 text-[15px] leading-relaxed text-ink-2 whitespace-pre-line border-t border-line pt-4">{String(m[s.key])}</div>
            </details>
          ))}

          {alts.length > 0 && (
            <section id="alternatives" className="sheet scroll-mt-20">
              <header className="px-5 py-3 border-b border-line">
                <h2 className="text-lg">Other brands of {m.generic_name}</h2>
                <p className="text-xs text-ink-3">Same generic{m.dosage_form ? `, same form (${m.dosage_form})` : ""}. Cheapest first.</p>
              </header>
              <table className="w-full text-sm">
                <thead className="text-[11px] uppercase tracking-wider text-ink-3">
                  <tr className="border-b border-line">
                    <th className="text-left font-medium px-5 py-2">Brand</th>
                    <th className="text-left font-medium px-2 py-2 hidden sm:table-cell">Manufacturer</th>
                    <th className="text-right font-medium px-5 py-2">Unit</th>
                  </tr>
                </thead>
                <tbody>
                  {alts.map((a) => (
                    <tr key={a.medicine_id} className="border-b border-line last:border-0 hover:bg-paper">
                      <td className="px-5 py-2">
                        <Link href={`/medicines/${a.medicine_id}`} className="hover:text-green">
                          {a.brand_name} <span className="num text-xs text-ink-2">{a.strength}</span>
                        </Link>
                      </td>
                      <td className="px-2 py-2 text-ink-2 hidden sm:table-cell truncate max-w-[200px]">{a.manufacturer_name}</td>
                      <td className="px-5 py-2 text-right num">{taka(a.unit_price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <p className="text-xs text-ink-3">Leaflet text is for information only. Always follow your prescription and talk to a pharmacist or doctor.</p>
        </article>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string | null | undefined }) {
  if (!v) return null;
  return (
    <div className="min-w-0">
      <dt className="eyebrow">{k}</dt>
      <dd className="truncate" title={v}>{v}</dd>
    </div>
  );
}
