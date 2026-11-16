"use client";

import { useMemo, useState } from "react";
import { Sun, SunMedium, Moon, Bell } from "lucide-react";
import type { Prescription, Reminder } from "@/lib/api";
import { DOSE_LABELS, fmtQty, mealTiming } from "@/lib/dose";

const ICONS = [Sun, SunMedium, Moon];
const DAY = 86400000;

interface DoseRow {
  key: string;
  name: string;
  qty: number;
  form: string | null;
  meal: string | null;
  rxId: number;
  daysLeft: number;
}

export default function TodayDoses({ prescriptions, reminders }: { prescriptions: Prescription[]; reminders: Reminder[] }) {
  const [now] = useState(() => Date.now());
  const slots = useMemo(() => {
    const out: DoseRow[][] = [[], [], []];
    for (const rx of prescriptions) {
      const started = new Date(rx.prescribed_at).getTime();
      for (const it of rx.items) {
        const end = started + it.duration * DAY;
        if (end < now) continue; // course sesh
        const daysLeft = Math.max(1, Math.ceil((end - now) / DAY));
        it.dose.forEach((q, i) => {
          if (q > 0)
            out[i].push({
              key: `${it.item_id}-${i}`,
              name: `${it.brand_name ?? it.medicine_name ?? "Medicine"}${it.strength ? " " + it.strength : ""}`,
              qty: q,
              form: it.dosage_form,
              meal: mealTiming(it.dosage_instruction),
              rxId: rx.prescription_id,
              daysLeft,
            });
        });
      }
    }
    return out;
  }, [prescriptions, now]);

  const remindedRx = useMemo(() => new Set(reminders.map((r) => r.prescription_id)), [reminders]);
  const total = slots.reduce((s, x) => s + x.length, 0);

  return (
    <section className="sheet">
      <header className="px-4 h-11 flex items-center justify-between border-b border-line">
        <h2 className="text-sm font-medium font-sans">Today&apos;s doses</h2>
        <span className="num text-xs text-ink-3">{total} total</span>
      </header>
      {total === 0 ? (
        <p className="px-4 py-6 text-sm text-ink-3">No active courses. Scan a prescription to see your daily schedule here.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-line">
          {slots.map((rows, i) => {
            const Icon = ICONS[i];
            return (
              <div key={i} className="p-4">
                <div className="flex items-center gap-2 text-xs text-ink-2 mb-3">
                  <Icon size={14} />
                  <span className="uppercase tracking-wider">{DOSE_LABELS[i]}</span>
                  <span className="num text-ink-3 ml-auto">{rows.length}</span>
                </div>
                {rows.length === 0 ? (
                  <p className="text-xs text-ink-3">—</p>
                ) : (
                  <ul className="space-y-2">
                    {rows.map((r) => (
                      <li key={r.key} className="flex items-start gap-2 text-sm">
                        <span className="num text-xs mt-0.5 w-5 text-ink-2 shrink-0">{fmtQty(r.qty)}×</span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate leading-tight">{r.name}</div>
                          <div className="text-[11px] text-ink-3">
                            {[r.form?.split(" ")[0], r.meal, `${r.daysLeft}d left`].filter(Boolean).join(" · ")}
                          </div>
                        </div>
                        {remindedRx.has(r.rxId) && <Bell size={12} className="text-green mt-1 shrink-0" />}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
