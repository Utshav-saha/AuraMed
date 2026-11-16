"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pencil, Trash2, BellRing, MapPin, Bell } from "lucide-react";
import type { Prescription, RxItem } from "@/lib/api";
import { fmtQty, mealTiming } from "@/lib/dose";

interface Props {
  prescriptions: Prescription[];
  patientName: string;
  onScan: () => void;
  onEdit: (rx: Prescription) => void;
  onDelete: (rx: Prescription) => void;
  onReminders: (rx: Prescription) => void;
  onFindPharmacy: (rx: Prescription) => void;
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

function itemName(it: RxItem) {
  return it.brand_name ?? it.medicine_name ?? "Medicine";
}

export default function PrescriptionStack({ prescriptions, patientName, onScan, onEdit, onDelete, onReminders, onFindPharmacy }: Props) {
  const [rawIdx, setIdx] = useState(0);
  const [phase, setPhase] = useState<"idle" | "out" | "in">("idle");
  const [hover, setHover] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const raf = useRef<number | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const n = prescriptions.length;
  const idx = Math.min(rawIdx, Math.max(0, n - 1)); // delete hole clamp

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // flip: out -> swap -> in
  const flipTo = (next: number) => {
    if (phase !== "idle") return;
    setPhase("out");
    timers.current = [
      setTimeout(() => {
        setIdx(next);
        setPhase("in");
      }, 400),
      setTimeout(() => setPhase("idle"), 820),
    ];
  };

  // pointer tilt, css var e likhi, react re-render na
  const onMove = (e: React.PointerEvent) => {
    if (e.pointerType === "touch") return;
    const el = stage.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      sheet.current?.style.setProperty("--ry", `${x * 16}deg`);
      sheet.current?.style.setProperty("--rx", `${-y * 12}deg`);
    });
  };
  const onLeave = () => {
    setHover(false);
    sheet.current?.style.setProperty("--ry", "0deg");
    sheet.current?.style.setProperty("--rx", "0deg");
  };

  const rx = prescriptions[idx];
  const prev = () => n > 1 && flipTo((idx - 1 + n) % n);
  const next = () => n > 1 && flipTo((idx + 1) % n);

  return (
    <div className="flex flex-col gap-4">
      <div
        ref={stage}
        className="rx-stage relative mx-auto w-full max-w-[420px] aspect-[3/4]"
        onPointerMove={onMove}
        onPointerEnter={() => setHover(true)}
        onPointerLeave={onLeave}
      >
        {/* stack peche */}
        {n > 2 && <div className="rx-behind" style={{ transform: "rotate(3deg) translate(10px, 10px) scale(0.97)" }} />}
        {n > 1 && <div className="rx-behind" style={{ transform: "rotate(-2deg) translate(-7px, 6px) scale(0.985)" }} />}

        <div
          ref={sheet}
          className={`rx-sheet absolute inset-0 bg-[#fffdf7] border border-line rounded-md overflow-hidden ${!hover && phase === "idle" ? "rx-idle" : ""} ${
            phase === "out" ? "rx-flip-out" : phase === "in" ? "rx-flip-in" : ""
          }`}
        >
          <svg className="rx-grain" aria-hidden>
            <filter id="grain">
              <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
              <feColorMatrix values="0 0 0 0 0.55  0 0 0 0 0.52  0 0 0 0 0.45  0 0 0 0.08 0" />
            </filter>
            <rect width="100%" height="100%" filter="url(#grain)" />
          </svg>

          {rx ? <Sheet rx={rx} patientName={patientName} /> : <EmptySheet patientName={patientName} onScan={onScan} />}
        </div>
      </div>

      {/* controls */}
      <div className="flex items-center justify-between gap-2 max-w-[420px] w-full mx-auto">
        <div className="flex items-center gap-1">
          <button onClick={prev} disabled={n < 2} className="btn-outline h-8 w-8 p-0" aria-label="Previous">
            <ChevronLeft size={15} />
          </button>
          <span className="num text-xs text-ink-3 w-12 text-center">
            {n ? `${idx + 1} / ${n}` : "0 / 0"}
          </span>
          <button onClick={next} disabled={n < 2} className="btn-outline h-8 w-8 p-0" aria-label="Next">
            <ChevronRight size={15} />
          </button>
        </div>
        {rx && (
          <div className="flex items-center gap-1">
            <button onClick={() => onFindPharmacy(rx)} className="btn-outline h-8 px-2.5 text-xs" title="Find pharmacies for these medicines">
              <MapPin size={13} /> Pharmacy
            </button>
            <button onClick={() => onReminders(rx)} className={`h-8 px-2.5 text-xs ${rx.reminders_set ? "btn-primary" : "btn-outline"}`} title="Dose reminders">
              {rx.reminders_set ? <BellRing size={13} /> : <Bell size={13} />} Remind
            </button>
            <button onClick={() => onEdit(rx)} className="btn-ghost h-8 w-8 p-0" aria-label="Edit">
              <Pencil size={14} />
            </button>
            <button onClick={() => onDelete(rx)} className="btn-ghost h-8 w-8 p-0 text-rx" aria-label="Delete">
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Sheet({ rx, patientName }: { rx: Prescription; patientName: string }) {
  const doctor = rx.doctorName ?? "Doctor not recorded";
  return (
    <div className="absolute inset-0 flex flex-col p-5 sm:p-6 text-ink select-none">
      {/* letterhead */}
      <div className="flex items-start justify-between border-b-2 border-ink/80 pb-2.5">
        <div className="min-w-0">
          <div className="font-display text-[17px] leading-tight truncate">{doctor}</div>
          <div className="text-[10.5px] text-ink-2 truncate">{rx.specialization ?? "General practice"}</div>
        </div>
        <div className="text-right shrink-0">
          <div className="eyebrow">Date</div>
          <div className="num text-[11px]">{fmtDate(rx.prescribed_at)}</div>
        </div>
      </div>

      <div className="flex items-baseline justify-between mt-2.5 text-[11px]">
        <div className="truncate">
          <span className="text-ink-3">Patient </span>
          <span className="font-hand text-[15px]">{patientName}</span>
        </div>
        {rx.disease_diagnosis && (
          <div className="truncate ml-2">
            <span className="text-ink-3">Dx </span>
            <span className="font-hand text-[15px] text-rx">{rx.disease_diagnosis}</span>
          </div>
        )}
      </div>

      {/* body */}
      <div className="relative flex-1 mt-2 rx-ruled">
        <div className="absolute -left-1 -top-1 font-display italic text-[44px] leading-none text-rx/80 select-none">℞</div>
        <div className="absolute right-0 top-0 flex gap-2 text-[9px] uppercase tracking-widest text-ink-3">
          <span className="w-7 text-center">Morn</span>
          <span className="w-7 text-center">Noon</span>
          <span className="w-7 text-center">Night</span>
        </div>
        <ol className="pt-10 space-y-[6px]">
          {rx.items.slice(0, 6).map((it, i) => {
            const meal = mealTiming(it.dosage_instruction);
            return (
              <li key={it.item_id} className="grid grid-cols-[1fr_auto] gap-2 items-start leading-[28px]">
                <div className="min-w-0 flex items-baseline gap-1.5">
                  <span className="num text-[10px] text-ink-3">{i + 1}.</span>
                  <span className="font-hand text-[19px] truncate">
                    {it.dosage_form ? `${it.dosage_form.split(" ")[0]} ` : ""}
                    {itemName(it)}
                    {it.strength ? <span className="text-ink-2"> {it.strength}</span> : null}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {it.dose.map((q, k) => (
                    <span key={k} className={`w-7 text-center num text-[13px] ${q > 0 ? "text-ink" : "text-ink-3/60"}`}>
                      {fmtQty(q)}
                    </span>
                  ))}
                </div>
                <div className="col-span-2 -mt-3 pl-5 text-[10px] text-ink-3 leading-[20px]">
                  {[meal, `${it.duration} days`].filter(Boolean).join(" · ")}
                </div>
              </li>
            );
          })}
          {rx.items.length > 6 && <li className="text-[10px] text-ink-3 pl-5">+{rx.items.length - 6} more</li>}
          {rx.items.length === 0 && <li className="font-hand text-lg text-ink-3 pl-5">No medicines listed</li>}
        </ol>
      </div>

      {/* signature */}
      <div className="flex items-end justify-between mt-2 pt-2">
        <div className="text-[9px] text-ink-3">
          {rx.reminders_set ? "Reminders on" : "Reminders off"} · #{rx.prescription_id}
        </div>
        <div className="text-right">
          <div className="rx-sign text-[22px] text-green leading-none pr-3 -mb-1">{doctor.replace(/^(Prof\.?|Dr\.?)\s*/i, "").split(" ")[0]}</div>
          <div className="border-t border-ink/60 w-28 text-[9px] text-ink-3 pt-0.5 text-center">signature</div>
        </div>
      </div>
    </div>
  );
}

function EmptySheet({ patientName, onScan }: { patientName: string; onScan: () => void }) {
  return (
    <div className="absolute inset-0 flex flex-col p-6 text-ink">
      <div className="border-b-2 border-ink/80 pb-2.5">
        <div className="font-display text-[17px]">AuraMed</div>
        <div className="text-[10.5px] text-ink-2">Patient record · {patientName}</div>
      </div>
      <div className="relative flex-1 mt-2 rx-ruled">
        <div className="absolute -left-1 -top-1 font-display italic text-[44px] leading-none text-rx/70">℞</div>
        <div className="pt-16 pl-6 pr-4">
          <p className="font-hand text-[26px] leading-[28px] text-ink-2">Scan your first prescription and it will appear here.</p>
          <button onClick={onScan} className="btn-primary mt-6">Scan a prescription</button>
        </div>
      </div>
      <div className="flex justify-end pt-3">
        <div className="border-t border-ink/50 w-28 text-[9px] text-ink-3 pt-0.5 text-center">signature</div>
      </div>
    </div>
  );
}
