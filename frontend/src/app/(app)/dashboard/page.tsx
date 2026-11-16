"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ScanLine, QrCode, MapPin, CalendarDays, ShoppingBag, Loader2, BellOff, ArrowUpRight } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { api, taka, type Appointment, type CartRow, type Prescription, type Reminder } from "@/lib/api";
import Modal from "@/components/Modal";
import PrescriptionStack from "@/components/dashboard/PrescriptionStack";
import TodayDoses from "@/components/dashboard/TodayDoses";
import ReminderModal from "@/components/dashboard/ReminderModal";
import LinkQrModal from "@/components/dashboard/LinkQrModal";
import ScanReviewModal, { draftFromPrescription, draftFromScan, type Draft } from "@/components/dashboard/ScanReviewModal";

export default function DashboardPage() {
  return (
    <Suspense fallback={null}>
      <Dashboard />
    </Suspense>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function Dashboard() {
  const { patient, user } = useAuth();
  const router = useRouter();
  const params = useSearchParams();

  const [rxs, setRxs] = useState<Prescription[] | null>(null);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [appts, setAppts] = useState<Appointment[]>([]);
  const [cart, setCart] = useState<CartRow[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanErr, setScanErr] = useState<string | null>(null);
  const [remindRx, setRemindRx] = useState<Prescription | null>(null);
  const [deleteRx, setDeleteRx] = useState<Prescription | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(
    () =>
      Promise.all([api.prescriptions(), api.reminders(), api.myAppointments("upcoming"), api.cart()])
        .then(([p, r, a, c]) => {
          setRxs(p);
          setReminders(r);
          setAppts(a.filter((x) => x.status === "booked"));
          setCart(c);
          setLoadErr(null);
        })
        .catch((e) => {
          setLoadErr((e as Error).message);
          setRxs((x) => x ?? []);
        }),
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // chatbot "/dashboard?scan=1" diye pathale
  useEffect(() => {
    if (params.get("scan") === "1") {
      fileRef.current?.click();
      router.replace("/dashboard");
    }
  }, [params, router]);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setScanning(true);
    setScanErr(null);
    try {
      const res = await api.scanPrescription(f);
      setDraft(draftFromScan(res, URL.createObjectURL(f)));
    } catch (e) {
      setScanErr((e as Error).message);
    } finally {
      setScanning(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const confirmDelete = async () => {
    if (!deleteRx) return;
    await api.removePrescription(deleteRx.prescription_id).catch(() => {});
    setDeleteRx(null);
    void load();
  };

  const findPharmacy = (rx: Prescription) => {
    const ids = rx.items.map((i) => i.medicine_id).filter((x): x is number => !!x);
    router.push(ids.length ? `/location?ids=${ids.join(",")}` : "/location");
  };

  const name = patient?.name ?? "there";
  const cartTotal = cart.reduce((s, c) => s + (c.unit_price ?? 0) * c.count, 0);
  const nextAppt = appts[0];

  return (
    <div className="grid gap-8 lg:grid-cols-12">
      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />

      {/* left: paper */}
      <div className="lg:col-span-5 order-2 lg:order-1">
        {rxs === null ? (
          <div className="mx-auto max-w-[420px] aspect-[3/4] sheet animate-pulse" />
        ) : (
          <PrescriptionStack
            prescriptions={rxs}
            patientName={name}
            onScan={() => fileRef.current?.click()}
            onEdit={(rx) => setDraft(draftFromPrescription(rx))}
            onDelete={setDeleteRx}
            onReminders={setRemindRx}
            onFindPharmacy={findPharmacy}
          />
        )}
      </div>

      {/* right */}
      <div className="lg:col-span-7 order-1 lg:order-2 space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">{greeting()}</p>
            <h1 className="text-3xl sm:text-4xl mt-1">{name.split(" ")[0]}</h1>
          </div>
          <div className="flex gap-2">
            <button onClick={() => fileRef.current?.click()} disabled={scanning} className="btn-primary">
              {scanning ? <Loader2 size={15} className="animate-spin" /> : <ScanLine size={15} />}
              {scanning ? "Reading…" : "Scan prescription"}
            </button>
            <button onClick={() => setQrOpen(true)} className="btn-outline" title="Link via QR / ID">
              <QrCode size={15} /> <span className="hidden sm:inline">Link</span>
            </button>
          </div>
        </div>
        {scanErr && <p className="text-sm text-rx">{scanErr}</p>}
        {loadErr && <p className="text-sm text-rx">Could not load everything: {loadErr}</p>}

        <TodayDoses prescriptions={rxs ?? []} reminders={reminders} />

        <div className="grid sm:grid-cols-2 gap-4">
          <Link href="/appointments" className="sheet p-4 hover:border-line-2 transition-colors group">
            <div className="flex items-center justify-between">
              <span className="eyebrow">Next appointment</span>
              <CalendarDays size={14} className="text-ink-3" />
            </div>
            {nextAppt ? (
              <div className="mt-2">
                <div className="font-medium">{nextAppt.doctor_name}</div>
                <div className="text-xs text-ink-2">{nextAppt.specialization}</div>
                <div className="num text-sm mt-2">
                  {new Date(nextAppt.date).toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" })} · {nextAppt.time_slot ?? nextAppt.time.slice(0, 5)}
                </div>
                <div className="text-xs text-ink-3 truncate">{nextAppt.hospital_name}</div>
              </div>
            ) : (
              <p className="mt-2 text-sm text-ink-2 group-hover:text-ink flex items-center gap-1">
                Book a doctor <ArrowUpRight size={13} />
              </p>
            )}
          </Link>

          <Link href="/cart" className="sheet p-4 hover:border-line-2 transition-colors group">
            <div className="flex items-center justify-between">
              <span className="eyebrow">Cart</span>
              <ShoppingBag size={14} className="text-ink-3" />
            </div>
            {cart.length ? (
              <div className="mt-2">
                <div className="font-display text-2xl num">{taka(cartTotal)}</div>
                <div className="text-xs text-ink-2 mt-0.5">
                  {cart.length} item{cart.length > 1 ? "s" : ""} · {cart.slice(0, 2).map((c) => c.brand_name).join(", ")}
                  {cart.length > 2 ? "…" : ""}
                </div>
              </div>
            ) : (
              <p className="mt-2 text-sm text-ink-2 group-hover:text-ink flex items-center gap-1">
                Cart is empty <ArrowUpRight size={13} />
              </p>
            )}
          </Link>
        </div>

        <section id="reminders" className="sheet">
          <header className="px-4 h-11 flex items-center justify-between border-b border-line">
            <h2 className="text-sm font-medium font-sans">Upcoming reminders</h2>
            <span className="num text-xs text-ink-3">{reminders.length}</span>
          </header>
          {reminders.length === 0 ? (
            <p className="px-4 py-5 text-sm text-ink-3">
              None scheduled. Open a prescription and press <span className="text-ink">Remind</span> to get an email before each dose.
            </p>
          ) : (
            <ul className="divide-y divide-line max-h-64 overflow-auto">
              {groupReminders(reminders).map((g) => (
                <li key={g.key} className="px-4 py-2.5 flex items-center gap-3 text-sm">
                  <div className="num text-xs text-ink-2 w-24 shrink-0">
                    {g.when.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}{" "}
                    {g.when.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                  </div>
                  <div className="min-w-0 flex-1 truncate">
                    <span className="text-ink-3 text-xs mr-1.5">{g.label}</span>
                    {g.meds.join(", ")}
                  </div>
                  <button onClick={() => api.deleteReminders(g.rxId).then(load)} className="btn-ghost h-7 w-7 p-0 text-ink-3 hover:text-rx" title="Turn off for this prescription">
                    <BellOff size={13} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="flex flex-wrap gap-2 text-sm">
          <Link href="/location" className="btn-outline h-9"><MapPin size={14} /> Find a pharmacy</Link>
          <Link href="/dosage" className="btn-outline h-9">Dosage calculator</Link>
          <Link href="/medicines" className="btn-outline h-9">Browse medicines</Link>
        </div>
      </div>

      <ScanReviewModal draft={draft} onClose={() => setDraft(null)} onSaved={load} />
      <ReminderModal rx={remindRx} email={user?.email ?? ""} onClose={() => setRemindRx(null)} onSaved={load} />
      <LinkQrModal open={qrOpen} onClose={() => setQrOpen(false)} onLinked={load} />
      <Modal
        open={!!deleteRx}
        onClose={() => setDeleteRx(null)}
        title="Delete prescription?"
        footer={
          <>
            <button onClick={() => setDeleteRx(null)} className="btn-ghost">Keep</button>
            <button onClick={confirmDelete} className="btn-danger">Delete</button>
          </>
        }
      >
        <p className="text-sm text-ink-2">
          This removes the prescription from {deleteRx?.doctorName ?? "the doctor"} with {deleteRx?.items.length ?? 0} medicines, and any reminders set for it.
        </p>
      </Modal>
    </div>
  );
}

// same rx + same minute er reminder gulo ek line e
function groupReminders(rs: Reminder[]) {
  const map = new Map<string, { key: string; when: Date; label: string; meds: string[]; rxId: number }>();
  for (const r of rs) {
    const when = new Date(r.schedule_time);
    const key = `${r.prescription_id}-${when.getTime()}`;
    const g = map.get(key) ?? { key, when, label: r.dose_label ?? "", meds: [], rxId: r.prescription_id ?? 0 };
    g.meds.push(r.medicine_name);
    map.set(key, g);
  }
  return [...map.values()].sort((a, b) => a.when.getTime() - b.when.getTime()).slice(0, 12);
}
