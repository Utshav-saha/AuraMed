"use client";

import { useMemo, useState } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";
import Modal from "@/components/Modal";
import { api, type Prescription, type ReminderTimes } from "@/lib/api";
import { DOSE_LABELS } from "@/lib/dose";

const DEFAULTS: ReminderTimes = { morning: "08:00", noon: "14:00", night: "21:00" };
const KEYS = ["morning", "noon", "night"] as const;

export default function ReminderModal({
  rx,
  email,
  onClose,
  onSaved,
}: {
  rx: Prescription | null;
  email: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [times, setTimes] = useState<ReminderTimes>(DEFAULTS);
  const [start, setStart] = useState(() => new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);

  // kon slot e asole dose ache
  const used = useMemo(() => {
    const u = [false, false, false];
    rx?.items.forEach((it) => it.dose.forEach((q, i) => q > 0 && (u[i] = true)));
    return u;
  }, [rx]);

  const total = useMemo(
    () => rx?.items.reduce((s, it) => s + it.dose.filter((q) => q > 0).length * it.duration, 0) ?? 0,
    [rx],
  );

  const save = async () => {
    if (!rx) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await api.createReminders({ prescription_id: rx.prescription_id, times, start_date: start });
      setDone(r.created);
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!rx) return;
    setBusy(true);
    try {
      await api.deleteReminders(rx.prescription_id);
      onSaved();
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={!!rx}
      onClose={onClose}
      title="Dose reminders"
      footer={
        done !== null ? (
          <button onClick={onClose} className="btn-primary">Done</button>
        ) : (
          <>
            {rx?.reminders_set && (
              <button onClick={remove} disabled={busy} className="btn-ghost text-rx mr-auto">
                <BellOff size={14} /> Turn off
              </button>
            )}
            <button onClick={onClose} className="btn-ghost">Cancel</button>
            <button onClick={save} disabled={busy || total === 0} className="btn-primary">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Bell size={14} />}
              {rx?.reminders_set ? "Update" : "Set"} {total} reminders
            </button>
          </>
        )
      }
    >
      {done !== null ? (
        <div className="py-6 text-center">
          <div className="font-display text-3xl">{done}</div>
          <p className="text-sm text-ink-2 mt-1">emails scheduled to {email}</p>
          <p className="text-xs text-ink-3 mt-3">Each one arrives a few minutes before the dose. Doses already in the past were skipped.</p>
        </div>
      ) : (
        <div className="space-y-4 text-sm">
          <p className="text-ink-2">
            One email per dose, grouped when medicines share a time. Sent to <span className="text-ink">{email}</span>.
          </p>
          <div className="grid grid-cols-3 gap-2">
            {KEYS.map((k, i) => (
              <label key={k} className={`sheet p-3 ${used[i] ? "" : "opacity-45"}`}>
                <span className="label">{DOSE_LABELS[i]}</span>
                <input
                  type="time"
                  value={times[k]}
                  disabled={!used[i]}
                  onChange={(e) => setTimes({ ...times, [k]: e.target.value })}
                  className="input h-9 num"
                />
                <span className="block text-[10px] text-ink-3 mt-1">{used[i] ? "has doses" : "no dose"}</span>
              </label>
            ))}
          </div>
          <div>
            <span className="label">Start from</span>
            <input type="date" value={start} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setStart(e.target.value)} className="input h-9 num max-w-[200px]" />
          </div>
          <ul className="text-xs text-ink-2 space-y-1 border-t border-line pt-3">
            {rx?.items.map((it) => (
              <li key={it.item_id} className="flex justify-between gap-2">
                <span className="truncate">{it.brand_name ?? it.medicine_name}</span>
                <span className="num text-ink-3 shrink-0">
                  {it.dose.map((q) => (q > 0 ? "●" : "○")).join(" ")} · {it.duration}d
                </span>
              </li>
            ))}
          </ul>
          {err && <p className="text-rx text-xs">{err}</p>}
        </div>
      )}
    </Modal>
  );
}
