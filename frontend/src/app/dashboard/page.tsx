"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Bell, Settings, Calendar, MapPin, Calculator, ShoppingCart,
  ChevronLeft, ChevronRight, ChevronUp, ChevronDown,
  Clock, AlarmClock, ScanLine, QrCode, Search,
  PlusCircle, Trash2, AlertTriangle, X, LayoutDashboard, Pill, LogOut,
  Loader2, CheckCircle2,
} from "lucide-react";
import { useRequireAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { loadEnrichedPrescriptions } from "@/lib/data";

// ── View model (adapted from the enriched backend prescription) ─
interface PrescriptionItem {
  brandName: string;
  genericName: string;
  dosageInstruction: string;
  durationDays: number;
}

interface Prescription {
  id: number;
  date: string;
  doctorName: string;
  specialization: string;
  diagnosis: string;
  items: PrescriptionItem[];
}

interface TimeSlot {
  hour: number;
  minute: number;
  ampm: "AM" | "PM";
}

const NAV_ITEMS = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard", active: true },
  { icon: Calendar, label: "Book Appointment", href: "/appointments" },
  { icon: MapPin, label: "Find Pharmacies", href: "/location" },
  { icon: Pill, label: "Search Medicine", href: "/medicines" },
  { icon: Calculator, label: "Dosage Calculator", href: "/dosage" },
  { icon: ShoppingCart, label: "View Cart", href: "/cart" },
];

// ── Helpers ────────────────────────────────────────────────────
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

function parseDosage(instr: string) {
  const parts = instr.split("+");
  const labels = ["Morning", "Afternoon", "Night"];
  const result = parts.map((v, i) => (v !== "0" ? `${v}× ${labels[i]}` : null)).filter(Boolean);
  return result.join(", ") || instr;
}

function initSlots(prescriptions: Prescription[]): Record<string, TimeSlot[]> {
  const slots: Record<string, TimeSlot[]> = {};
  prescriptions.forEach((rx) => {
    rx.items.forEach((_, i) => {
      slots[`${rx.id}-${i}`] = [{ hour: 8, minute: 0, ampm: "AM" }];
    });
  });
  return slots;
}

// ── Time Picker sub-component ──────────────────────────────────
function TimePicker({ slot, onChange }: { slot: TimeSlot; onChange: (s: TimeSlot) => void }) {
  const stepHour = (dir: 1 | -1) => {
    let h = slot.hour + dir;
    if (h > 12) h = 1;
    if (h < 1) h = 12;
    onChange({ ...slot, hour: h });
  };
  const stepMinute = (dir: 1 | -1) => {
    let m = slot.minute + dir * 5;
    if (m >= 60) m = 0;
    if (m < 0) m = 55;
    onChange({ ...slot, minute: m });
  };

  return (
    <div className="flex items-center gap-1.5">
      <div className="time-picker-box">
        <button className="time-arrow-btn" onClick={() => stepHour(1)}><ChevronUp size={11} /></button>
        <div className="time-value">{String(slot.hour).padStart(2, "0")}</div>
        <button className="time-arrow-btn" onClick={() => stepHour(-1)}><ChevronDown size={11} /></button>
      </div>
      <span className="text-[13px] font-bold text-[#2E5FA8] select-none pb-0.5">:</span>
      <div className="time-picker-box">
        <button className="time-arrow-btn" onClick={() => stepMinute(1)}><ChevronUp size={11} /></button>
        <div className="time-value">{String(slot.minute).padStart(2, "0")}</div>
        <button className="time-arrow-btn" onClick={() => stepMinute(-1)}><ChevronDown size={11} /></button>
      </div>
      <button
        onClick={() => onChange({ ...slot, ampm: slot.ampm === "AM" ? "PM" : "AM" })}
        className="text-[10px] font-bold px-1.5 py-1 rounded-lg bg-[#EEF3FC] border border-[#C6D8EE] text-[#2E5FA8] hover:bg-[#D5E9FF] transition-colors w-8 text-center"
      >
        {slot.ampm}
      </button>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────
export default function DashboardPage() {
  const router = useRouter();
  const { logout, patient } = useRequireAuth();
  const patientId = patient?.id ?? 1; // placeholder fallback for guest mode
  const displayName = patient?.name ?? "there";
  const firstName = displayName.split(" ")[0];
  const avatarInitial = firstName.charAt(0).toUpperCase() || "A";

  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [reminderOpen, setReminderOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ key: string; slotIdx: number } | null>(null);
  const [timeSlots, setTimeSlots] = useState<Record<string, TimeSlot[]>>({});

  // Scan flows
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [scanState, setScanState] = useState<"idle" | "scanning" | "done" | "error">("idle");
  const [scanMessage, setScanMessage] = useState("");
  const [qrOpen, setQrOpen] = useState(false);
  const [qrId, setQrId] = useState("");
  const [qrBusy, setQrBusy] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);

  const reloadPrescriptions = useCallback(async () => {
    setLoading(true);
    try {
      const list = await loadEnrichedPrescriptions(patientId);
      const adapted: Prescription[] = list
        .map((p) => ({
          id: p.prescription_id,
          date: p.prescribed_at,
          // get_prescriptions returns doctor_id only — no name/specialization
          doctorName: `Doctor #${p.doctor_id}`,
          specialization: "Prescribing physician",
          diagnosis: p.disease_diagnosis,
          items: p.items.map((it) => ({
            brandName: it.brand_name,
            genericName: it.generic_name,
            dosageInstruction: it.dosage_instruction,
            durationDays: it.duration,
          })),
        }))
        .sort((a, b) => +new Date(b.date) - +new Date(a.date)); // most recent first
      setPrescriptions(adapted);
      setTimeSlots(initSlots(adapted));
      setCurrentIndex((i) => Math.min(i, Math.max(0, adapted.length - 1)));
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
  useEffect(() => { reloadPrescriptions(); }, [reloadPrescriptions]);

  const submitSearch = () => {
    const q = searchQuery.trim();
    if (q.length > 0) router.push(`/medicines?q=${encodeURIComponent(q)}`);
  };

  // ── Scan Prescription (Gemini OCR upload) ──────────────────
  const onScanFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    setScanState("scanning");
    setScanMessage("Reading your prescription…");
    try {
      const res = await api.scanPrescription(file, patientId);
      const matched = res.items.filter((i) => i.medicine_id != null).length;
      setScanState("done");
      setScanMessage(
        `Added prescription with ${res.items.length} medicine${res.items.length === 1 ? "" : "s"}` +
          ` (${matched} matched to our catalog).`
      );
      await reloadPrescriptions();
      setCurrentIndex(0);
    } catch (err) {
      setScanState("error");
      setScanMessage(err instanceof Error ? err.message : "Scan failed. Please try again.");
    }
  };

  // ── Scan QR (link an existing prescription by id) ──────────
  const submitQr = async () => {
    const id = parseInt(qrId, 10);
    if (Number.isNaN(id)) { setQrError("Enter a valid prescription ID."); return; }
    setQrBusy(true);
    setQrError(null);
    try {
      await api.addPrescriptionFromQr(patientId, id);
      setQrOpen(false);
      setQrId("");
      await reloadPrescriptions();
      setCurrentIndex(0);
    } catch (err) {
      setQrError(err instanceof Error ? err.message : "Couldn't link that prescription.");
    } finally {
      setQrBusy(false);
    }
  };

  const rx = prescriptions[currentIndex];
  const canGoLeft = currentIndex > 0;
  const canGoRight = currentIndex < prescriptions.length - 1;
  const prevRx = canGoLeft ? prescriptions[currentIndex - 1] : null;
  const nextRx = canGoRight ? prescriptions[currentIndex + 1] : null;

  const slotKey = (medIdx: number) => `${rx.id}-${medIdx}`;

  const addSlot = (key: string) =>
    setTimeSlots((prev) => ({ ...prev, [key]: [...(prev[key] ?? []), { hour: 8, minute: 0, ampm: "AM" }] }));

  const updateSlot = (key: string, idx: number, slot: TimeSlot) =>
    setTimeSlots((prev) => {
      const arr = [...(prev[key] ?? [])];
      arr[idx] = slot;
      return { ...prev, [key]: arr };
    });

  const deleteSlot = (key: string, idx: number) => {
    setTimeSlots((prev) => {
      const arr = [...(prev[key] ?? [])];
      arr.splice(idx, 1);
      return { ...prev, [key]: arr };
    });
    setDeleteConfirm(null);
  };

  return (
    <div className="flex flex-col h-screen bg-[#EDF1F9] overflow-hidden">

      {/* ── Top Nav ────────────────────────────────────────── */}
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
          <button
            onClick={logout}
            title="Log out"
            className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-[#FDEAEA] hover:text-[#D94F4F] text-[#6A7898] transition-colors"
          >
            <LogOut size={17} />
          </button>
          <div title={displayName} className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-300 to-amber-500 flex items-center justify-center text-white text-sm font-semibold">{avatarInitial}</div>
        </div>
      </header>

      {/* ── Body ───────────────────────────────────────────── */}
      <div className="flex flex-1 gap-4 p-4 overflow-hidden">

        {/* ── Left Sidebar ────────────────────────────────── */}
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
              <span className={`text-[12.5px] leading-tight ${active ? "font-semibold" : "font-medium"}`}>{label}</span>
            </a>
          ))}
        </aside>

        {/* ── Main Content ────────────────────────────────── */}
        <main className="flex-1 flex flex-col gap-4 overflow-y-auto min-w-0">

          {/* ── Top row: Greeting + Search | Carousel ─────── */}
          <div className="shrink-0 flex items-end gap-6">

            {/* Left: greeting + search */}
            <div className="flex-1 flex flex-col gap-3 min-w-0">
              <h1 className="text-[22px] font-semibold text-[#1B2A4A] tracking-tight">
                Hey, {firstName}! Glad to have you back 🙌
              </h1>

              {/* Search bar */}
              <div className="relative group">
                <Search
                  size={15}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9DAABF] group-focus-within:text-[#4D8ED6] transition-colors pointer-events-none z-10"
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") submitSearch(); }}
                  placeholder="Search medicine by name or symptom…"
                  className="w-full h-11 pl-10 pr-4 bg-white border border-[#E6ECF7] rounded-2xl text-[13px] text-[#1B2A4A] placeholder:text-[#9DAABF] shadow-[0_1px_8px_rgba(140,158,205,0.08)] focus:outline-none focus:border-[#4D8ED6] focus:shadow-[0_0_0_3px_rgba(77,142,214,0.10),0_1px_8px_rgba(140,158,205,0.08)] transition-all"
                />
              </div>
            </div>

            {/* Right: carousel */}
            <div className="shrink-0 w-[420px]">
              <p className="text-[13px] font-semibold text-[#1B2A4A] mb-2.5">My Prescriptions</p>
              <div className="flex items-center gap-2.5">

                {/* Left arrow */}
                <button
                  onClick={() => canGoLeft && setCurrentIndex((i) => i - 1)}
                  disabled={!canGoLeft}
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-all shrink-0 ${
                    canGoLeft
                      ? "bg-white border border-[#D8E0F0] text-[#4D8ED6] hover:bg-[#EAF2FF] shadow-sm cursor-pointer"
                      : "bg-[#F3F5FB] border border-[#E6ECF7] text-[#C8D0E0] cursor-not-allowed"
                  }`}
                >
                  <ChevronLeft size={15} />
                </button>

                {/* Pills track */}
                <div className="flex items-stretch gap-2 flex-1">
                  {prevRx ? (
                    <button
                      onClick={() => setCurrentIndex((i) => i - 1)}
                      className="rx-card-side flex-1 px-3 py-2 text-left"
                    >
                      <p className="text-[9.5px] font-medium text-[#9DAABF]">{formatDate(prevRx.date)}</p>
                      <p className="text-[11px] font-medium text-[#6A7898] truncate mt-0.5">{prevRx.diagnosis}</p>
                    </button>
                  ) : (
                    <div className="flex-1" />
                  )}

                  <div className="rx-card-center flex-[1.7] px-3.5 py-2.5">
                    {rx ? (
                      <>
                        <p className="text-[10.5px] font-semibold text-[#4D8ED6]">{formatDate(rx.date)}</p>
                        <p className="text-[12.5px] font-bold text-[#1B2A4A] truncate mt-0.5">{rx.diagnosis}</p>
                        <p className="text-[10px] text-[#9DAABF] mt-0.5">{rx.doctorName}</p>
                      </>
                    ) : (
                      <p className="text-[11px] text-[#9DAABF]">No prescriptions yet</p>
                    )}
                  </div>

                  {nextRx ? (
                    <button
                      onClick={() => setCurrentIndex((i) => i + 1)}
                      className="rx-card-side flex-1 px-3 py-2 text-left"
                    >
                      <p className="text-[9.5px] font-medium text-[#9DAABF]">{formatDate(nextRx.date)}</p>
                      <p className="text-[11px] font-medium text-[#6A7898] truncate mt-0.5">{nextRx.diagnosis}</p>
                    </button>
                  ) : (
                    <div className="flex-1" />
                  )}
                </div>

                {/* Right arrow */}
                <button
                  onClick={() => canGoRight && setCurrentIndex((i) => i + 1)}
                  disabled={!canGoRight}
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-all shrink-0 ${
                    canGoRight
                      ? "bg-white border border-[#D8E0F0] text-[#4D8ED6] hover:bg-[#EAF2FF] shadow-sm cursor-pointer"
                      : "bg-[#F3F5FB] border border-[#E6ECF7] text-[#C8D0E0] cursor-not-allowed"
                  }`}
                >
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>
          </div>

          {/* ── Prescription Detail Card ───────────────────── */}
          <div className="bg-white rounded-[22px] shadow-[0_2px_20px_rgba(140,158,205,0.11),0_1px_4px_rgba(140,158,205,0.06)] border border-[rgba(215,225,245,0.70)] p-6 flex flex-col flex-1 min-h-0">

            {loading ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
                <Loader2 size={26} className="text-[#4D8ED6] animate-spin" />
                <p className="text-[13px] text-[#6A7898]">Loading your prescriptions…</p>
              </div>
            ) : !rx ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
                <div className="w-14 h-14 rounded-full bg-[#EAF2FF] flex items-center justify-center">
                  <ScanLine size={24} className="text-[#B8D4F5]" />
                </div>
                <p className="text-[14px] font-semibold text-[#1B2A4A]">No prescriptions yet</p>
                <p className="text-[12px] text-[#9DAABF] max-w-[280px] leading-relaxed">
                  Scan a prescription or link one via QR to see it here.
                </p>
              </div>
            ) : (
              <>
                {/* Card header */}
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="text-[18px] font-bold text-[#1B2A4A]">{rx.doctorName}</h2>
                    <p className="text-[13px] text-[#9DAABF] mt-0.5">{rx.specialization}</p>
                  </div>
                  <span className="text-[11px] font-medium text-[#6A7898] bg-[#F3F5FB] border border-[#E6ECF7] px-3 py-1.5 rounded-full shrink-0">
                    {formatDate(rx.date)}
                  </span>
                </div>

                {/* Diagnosis */}
                <div className="mb-5">
                  <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#4D8ED6] bg-[#EAF2FF] px-3.5 py-1.5 rounded-full">
                    {rx.diagnosis}
                  </span>
                </div>

                {/* Medicine list */}
                <div className="flex-1 overflow-y-auto">
                  <p className="text-[10.5px] font-semibold text-[#9DAABF] uppercase tracking-widest mb-3">
                    Prescribed Medicines
                  </p>
                  {rx.items.map((item, i) => (
                    <div key={i} className={`py-4 ${i > 0 ? "border-t border-[#E6ECF7]" : ""}`}>
                      <div className="flex items-start justify-between gap-6">
                        <div className="flex-1">
                          <p className="text-[14.5px] font-semibold text-[#1B2A4A]">{item.brandName}</p>
                          <p className="text-[12px] text-[#9DAABF] mt-0.5">{item.genericName}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-[12.5px] font-medium text-[#6A7898]">{parseDosage(item.dosageInstruction)}</p>
                          <p className="text-[11px] text-[#9DAABF] mt-0.5">{item.durationDays} days</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Card bottom actions */}
                <div className="flex items-center justify-between pt-4 border-t border-[#E6ECF7] mt-2 shrink-0">
                  <a
                    href="/location?exact=1"
                    className="aura-btn-secondary inline-flex items-center gap-2 px-5 py-2.5 text-[13px]"
                  >
                    <MapPin size={14} />
                    Where to Buy
                  </a>
                  <button
                    onClick={() => setReminderOpen(true)}
                    className="aura-btn-primary inline-flex items-center gap-2 px-5 py-2.5 text-[13px]"
                  >
                    <AlarmClock size={14} />
                    Set Reminder
                  </button>
                </div>
              </>
            )}
          </div>

          {/* ── Scan status + buttons ───────────────────────── */}
          <div className="flex items-center justify-between gap-3 shrink-0 pb-0.5">
            <div className="min-w-0">
              {scanState === "scanning" && (
                <span className="inline-flex items-center gap-2 text-[12px] text-[#4D8ED6]">
                  <Loader2 size={13} className="animate-spin" /> {scanMessage}
                </span>
              )}
              {scanState === "done" && (
                <span className="inline-flex items-center gap-2 text-[12px] text-[#22A06B]">
                  <CheckCircle2 size={13} /> {scanMessage}
                </span>
              )}
              {scanState === "error" && (
                <span className="inline-flex items-center gap-2 text-[12px] text-[#D94F4F]">
                  <AlertTriangle size={13} /> {scanMessage}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onScanFile}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={scanState === "scanning"}
                className="aura-btn-secondary inline-flex items-center gap-2 px-5 py-2.5 text-[13px] disabled:opacity-60"
              >
                <ScanLine size={14} />
                Scan Prescription
              </button>
              <button
                onClick={() => { setQrOpen(true); setQrError(null); }}
                className="aura-btn-secondary inline-flex items-center gap-2 px-5 py-2.5 text-[13px]"
              >
                <QrCode size={14} />
                Scan QR
              </button>
            </div>
          </div>
        </main>
      </div>

      {/* ── Set Reminder Overlay ─────────────────────────────── */}
      {reminderOpen && rx && (
        <div
          className="overlay-backdrop"
          onClick={(e) => { if (e.target === e.currentTarget) setReminderOpen(false); }}
        >
          <div
            className="overlay-panel w-full max-w-lg mx-4 flex flex-col"
            style={{ maxHeight: "88vh" }}
          >
            {/* Overlay header */}
            <div className="flex items-center justify-between px-6 pt-6 pb-4 shrink-0">
              <div>
                <h2 className="text-[17px] font-semibold text-[#1B2A4A]">Set medicine reminder</h2>
                <p className="text-[12px] text-[#9DAABF] mt-0.5">{rx.diagnosis} · {formatDate(rx.date)}</p>
              </div>
              <button
                onClick={() => setReminderOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[#F3F5FB] text-[#9DAABF] hover:text-[#6A7898] transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Medicine rows */}
            <div className="flex-1 overflow-y-auto px-6 flex flex-col gap-3">
              {rx.items.map((item, medIdx) => {
                const key = slotKey(medIdx);
                const slots = timeSlots[key] ?? [];
                return (
                  <div key={medIdx} className="border border-[#E6ECF7] rounded-2xl bg-[#FAFBFF] overflow-hidden">
                    {/* Medicine info */}
                    <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3">
                      <div className="flex-1">
                        <p className="text-[13.5px] font-semibold text-[#1B2A4A]">{item.brandName}</p>
                        <p className="text-[11px] text-[#9DAABF] mt-0.5">
                          {item.genericName} · {parseDosage(item.dosageInstruction)} · {item.durationDays} days
                        </p>
                      </div>
                      <Clock size={14} className="text-[#B8D4F5] mt-0.5 shrink-0" />
                    </div>

                    {/* Time slots */}
                    <div className="border-t border-[#E6ECF7] px-4 py-3 flex flex-col gap-2.5">
                      {slots.map((slot, slotIdx) => (
                        <div key={slotIdx} className="flex items-center gap-2">
                          <TimePicker
                            slot={slot}
                            onChange={(s) => updateSlot(key, slotIdx, s)}
                          />
                          <div className="flex items-center gap-1 ml-auto">
                            <button
                              onClick={() => addSlot(key)}
                              title="Add another time"
                              className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[#EAF2FF] transition-colors"
                            >
                              <PlusCircle size={15} className="text-[#4D8ED6]" />
                            </button>
                            {slots.length > 1 && (
                              <button
                                onClick={() => setDeleteConfirm({ key, slotIdx })}
                                title="Remove this time"
                                className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[#FDEAEA] transition-colors"
                              >
                                <Trash2 size={13} className="text-[#D94F4F]" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Overlay footer */}
            <div className="px-6 py-4 shrink-0 border-t border-[#E6ECF7]">
              <button
                onClick={() => setReminderOpen(false)}
                className="aura-btn-primary w-full py-3 text-[13px] font-semibold"
              >
                Save Reminders
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Scan QR Overlay ──────────────────────────────────── */}
      {qrOpen && (
        <div
          className="overlay-backdrop"
          onClick={(e) => { if (e.target === e.currentTarget && !qrBusy) setQrOpen(false); }}
        >
          <div className="overlay-panel w-full max-w-xs mx-4 p-6 flex flex-col gap-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-[15px] font-semibold text-[#1B2A4A]">Link prescription</h3>
                <p className="text-[11.5px] text-[#9DAABF] mt-0.5">Enter the prescription ID from the QR code.</p>
              </div>
              <button
                onClick={() => !qrBusy && setQrOpen(false)}
                className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-[#F3F5FB] text-[#9DAABF] shrink-0"
              >
                <X size={14} />
              </button>
            </div>

            <input
              type="number"
              value={qrId}
              onChange={(e) => setQrId(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submitQr(); }}
              placeholder="Prescription ID"
              className="w-full h-10 px-3 bg-[#F3F5FB] border border-[#E6ECF7] rounded-xl text-[13px] text-[#1B2A4A] placeholder:text-[#9DAABF] focus:outline-none focus:border-[#4D8ED6] focus:bg-white transition-all"
            />

            {qrError && (
              <p className="text-[11.5px] text-[#D94F4F] flex items-center gap-1.5">
                <AlertTriangle size={12} /> {qrError}
              </p>
            )}

            <button
              onClick={submitQr}
              disabled={qrBusy}
              className="aura-btn-primary w-full py-2.5 text-[13px] font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {qrBusy ? <Loader2 size={13} className="animate-spin" /> : <QrCode size={13} />}
              {qrBusy ? "Linking…" : "Link Prescription"}
            </button>
          </div>
        </div>
      )}

      {/* ── Delete Confirm Overlay ───────────────────────────── */}
      {deleteConfirm && (
        <div className="overlay-backdrop" style={{ zIndex: 60 }}>
          <div className="overlay-panel w-full max-w-xs mx-4 p-6">
            <div className="flex flex-col items-center text-center gap-3">
              <div className="w-12 h-12 rounded-full bg-[#FDEAEA] flex items-center justify-center">
                <AlertTriangle size={22} className="text-[#D94F4F]" />
              </div>
              <h3 className="text-[15px] font-semibold text-[#1B2A4A]">Delete time slot?</h3>
              <p className="text-[12px] text-[#9DAABF] leading-relaxed max-w-[220px]">
                This reminder time will be permanently removed.
              </p>
              <div className="flex gap-3 w-full mt-1">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="flex-1 aura-btn-secondary py-2.5 text-[13px]"
                >
                  Cancel
                </button>
                <button
                  onClick={() => deleteSlot(deleteConfirm.key, deleteConfirm.slotIdx)}
                  className="flex-1 py-2.5 text-[13px] font-semibold rounded-xl text-white transition-all hover:opacity-90"
                  style={{ background: "#D94F4F" }}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
