"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Search, Loader2, Building2, Phone, CalendarCheck, X } from "lucide-react";
import { api, type Appointment, type DoctorResult, type Slot } from "@/lib/api";
import Modal from "@/components/Modal";

export default function AppointmentsPage() {
  return (
    <Suspense fallback={null}>
      <Appointments />
    </Suspense>
  );
}

const fmtDate = (d: string | null) => (d ? new Date(d + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" }) : "Any day");

function Appointments() {
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [docs, setDocs] = useState<DoctorResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [upcoming, setUpcoming] = useState<Appointment[]>([]);
  const [past, setPast] = useState<Appointment[]>([]);
  const [confirm, setConfirm] = useState<{ doc: DoctorResult; slot: Slot } | null>(null);
  const [cancel, setCancel] = useState<Appointment | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const loadMine = useCallback(() => {
    api.myAppointments("upcoming").then(setUpcoming).catch(() => {});
    api.myAppointments("past").then(setPast).catch(() => {});
  }, []);

  const search = useCallback(async (term: string) => {
    setBusy(true);
    setErr(null);
    try {
      setDocs(await api.searchDoctors(term.trim() || undefined));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    loadMine();
    api.searchDoctors(params.get("q")?.trim() || undefined).then(setDocs).catch((e) => setErr((e as Error).message));
  }, [loadMine, params]);

  const book = async () => {
    if (!confirm) return;
    setBusy(true);
    setErr(null);
    try {
      await api.book(confirm.slot.id);
      setMsg(`Booked with ${confirm.doc.name} on ${fmtDate(confirm.slot.date)}, ${confirm.slot.time_slot}.`);
      setConfirm(null);
      loadMine();
      void search(q);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const doCancel = async () => {
    if (!cancel) return;
    await api.cancelAppointment(cancel.id).catch((e) => setErr((e as Error).message));
    setCancel(null);
    loadMine();
    void search(q);
  };

  return (
    <div className="space-y-8">
      <div>
        <p className="eyebrow">Doctors</p>
        <h1 className="text-3xl mt-1">Book an appointment</h1>
      </div>

      {msg && (
        <div className="sheet border-green/40 p-3 text-sm flex items-center gap-2">
          <CalendarCheck size={16} className="text-green" /> {msg}
          <button onClick={() => setMsg(null)} className="ml-auto text-ink-3"><X size={14} /></button>
        </div>
      )}

      <div className="grid lg:grid-cols-[1fr_320px] gap-8 items-start">
        <section className="space-y-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void search(q);
            }}
            className="relative max-w-xl"
          >
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Doctor name or specialty, e.g. cardiologist" className="input h-11 pl-10 pr-24" />
            <button type="submit" className="btn-primary absolute right-1.5 top-1.5 h-8">{busy ? <Loader2 size={14} className="animate-spin" /> : "Search"}</button>
          </form>
          {err && <p className="text-sm text-rx">{err}</p>}

          {docs === null ? (
            <div className="sheet h-32 animate-pulse" />
          ) : docs.length === 0 ? (
            <p className="text-sm text-ink-3">No doctors with open slots{q ? ` for “${q}”` : ""}. Try another specialty.</p>
          ) : (
            <ul className="space-y-3">
              {docs.map((d) => (
                <li key={d.id} className="sheet p-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <h2 className="text-lg">{d.name}</h2>
                    <span className="text-xs text-ink-2 text-right">{d.specialization}</span>
                  </div>
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {d.slots.map((s) => (
                      <li key={s.id}>
                        <button onClick={() => setConfirm({ doc: d, slot: s })} className="btn-outline h-auto py-1.5 px-3 text-left flex-col items-start gap-0">
                          <span className="text-xs font-medium">{fmtDate(s.date)}</span>
                          <span className="num text-xs text-ink-2">{s.time_slot}</span>
                          <span className="text-[10px] text-ink-3">{s.hospital_name ?? "Clinic"} · {s.available_slots} left</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="space-y-6">
          <div>
            <span className="label">Upcoming</span>
            {upcoming.length === 0 ? (
              <p className="text-sm text-ink-3">None booked.</p>
            ) : (
              <ul className="sheet divide-y divide-line text-sm">
                {upcoming.map((a) => (
                  <li key={a.id} className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{a.doctor_name}</div>
                        <div className="text-xs text-ink-2 truncate">{a.specialization}</div>
                      </div>
                      <span className={`tag ${a.status === "booked" ? "bg-green-soft text-green" : "bg-paper-2 text-ink-3"}`}>{a.status}</span>
                    </div>
                    <div className="num text-xs mt-1.5">{fmtDate(a.date)} · {a.time_slot ?? a.time.slice(0, 5)}</div>
                    {a.hospital_name && <div className="text-xs text-ink-3 flex items-center gap-1 mt-0.5"><Building2 size={11} /> {a.hospital_name}</div>}
                    {a.hospital_contact && <a href={`tel:${a.hospital_contact}`} className="text-xs text-ink-3 flex items-center gap-1"><Phone size={11} /> {a.hospital_contact}</a>}
                    {a.status === "booked" && <button onClick={() => setCancel(a)} className="btn-ghost h-7 text-xs text-rx -ml-2 mt-1">Cancel</button>}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {past.length > 0 && (
            <div>
              <span className="label">Past</span>
              <ul className="text-xs text-ink-2 space-y-1.5">
                {past.slice(0, 8).map((a) => (
                  <li key={a.id} className="flex justify-between gap-2">
                    <span className="truncate">{a.doctor_name}</span>
                    <span className="num text-ink-3 shrink-0">{fmtDate(a.date)}{a.status !== "booked" ? ` · ${a.status}` : ""}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>

      <Modal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title="Confirm booking"
        footer={
          <>
            <button onClick={() => setConfirm(null)} className="btn-ghost">Back</button>
            <button onClick={book} disabled={busy} className="btn-primary">{busy && <Loader2 size={14} className="animate-spin" />} Book</button>
          </>
        }
      >
        {confirm && (
          <dl className="text-sm space-y-2">
            <div><dt className="eyebrow">Doctor</dt><dd>{confirm.doc.name} <span className="text-ink-2">· {confirm.doc.specialization}</span></dd></div>
            <div><dt className="eyebrow">When</dt><dd className="num">{fmtDate(confirm.slot.date)}, {confirm.slot.time_slot}</dd></div>
            <div><dt className="eyebrow">Where</dt><dd>{confirm.slot.hospital_name ?? "Clinic"}{confirm.slot.hospital_contact ? ` · ${confirm.slot.hospital_contact}` : ""}</dd></div>
          </dl>
        )}
      </Modal>
      <Modal
        open={!!cancel}
        onClose={() => setCancel(null)}
        title="Cancel appointment?"
        footer={
          <>
            <button onClick={() => setCancel(null)} className="btn-ghost">Keep</button>
            <button onClick={doCancel} className="btn-danger">Cancel appointment</button>
          </>
        }
      >
        <p className="text-sm text-ink-2">Your slot with {cancel?.doctor_name} on {cancel && fmtDate(cancel.date)} will be released for others.</p>
      </Modal>
    </div>
  );
}
