"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Bell, Settings, Calendar, MapPin, Calculator, ShoppingCart,
  ChevronLeft, ChevronRight, ChevronUp, ChevronDown,
  Clock, AlarmClock, ScanLine, QrCode, Search,
  PlusCircle, Trash2, AlertTriangle, X, LayoutDashboard, Pill, LogOut,
  Loader2, CheckCircle2, HeartPulse,
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
  { icon: Calendar, label: "Appointments", href: "/appointments" },
  { icon: MapPin, label: "Pharmacies", href: "/location" },
  { icon: Pill, label: "Medicines", href: "/medicines" },
  { icon: Calculator, label: "Calculator", href: "/dosage" },
  { icon: ShoppingCart, label: "Cart", href: "/cart" },
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
      <div className="flex flex-col items-center bg-zinc-100 rounded-lg w-10 border border-zinc-200 shadow-sm overflow-hidden">
        <button type="button" className="w-full text-zinc-400 hover:text-zinc-900 hover:bg-zinc-200 transition-colors py-0.5 flex justify-center" onClick={() => stepHour(1)}><ChevronUp size={14} /></button>
        <div className="text-sm font-semibold text-zinc-900 py-1 bg-white w-full text-center">{String(slot.hour).padStart(2, "0")}</div>
        <button type="button" className="w-full text-zinc-400 hover:text-zinc-900 hover:bg-zinc-200 transition-colors py-0.5 flex justify-center" onClick={() => stepHour(-1)}><ChevronDown size={14} /></button>
      </div>
      <span className="text-sm font-bold text-zinc-400 select-none pb-0.5">:</span>
      <div className="flex flex-col items-center bg-zinc-100 rounded-lg w-10 border border-zinc-200 shadow-sm overflow-hidden">
        <button type="button" className="w-full text-zinc-400 hover:text-zinc-900 hover:bg-zinc-200 transition-colors py-0.5 flex justify-center" onClick={() => stepMinute(1)}><ChevronUp size={14} /></button>
        <div className="text-sm font-semibold text-zinc-900 py-1 bg-white w-full text-center">{String(slot.minute).padStart(2, "0")}</div>
        <button type="button" className="w-full text-zinc-400 hover:text-zinc-900 hover:bg-zinc-200 transition-colors py-0.5 flex justify-center" onClick={() => stepMinute(-1)}><ChevronDown size={14} /></button>
      </div>
      <button
        type="button"
        onClick={() => onChange({ ...slot, ampm: slot.ampm === "AM" ? "PM" : "AM" })}
        className="text-xs font-bold px-2 py-1.5 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-700 hover:bg-indigo-600 hover:text-white transition-colors w-12 text-center ml-2 shadow-sm"
      >
        {slot.ampm}
      </button>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────
export default function DashboardPage() {
  const router = useRouter();
  const { logout, patient, user } = useRequireAuth();
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
  const [savingReminders, setSavingReminders] = useState(false);

  // Scan flows
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [scanState, setScanState] = useState<"idle" | "scanning" | "done" | "error">("idle");
  const [scanMessage, setScanMessage] = useState("");
  const [qrOpen, setQrOpen] = useState(false);
  const [qrId, setQrId] = useState("");
  const [qrBusy, setQrBusy] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);

  const reloadPrescriptions = useCallback(async () => {
    try {
      const list = await loadEnrichedPrescriptions(patientId);
      const adapted: Prescription[] = list
        .map((p) => ({
          id: p.prescription_id,
          date: p.prescribed_at,
          doctorName: `Doctor #${p.doctor_id}`, // Needs API update to provide actual name
          specialization: "Prescribing physician", // Needs API update to provide actual specialization
          diagnosis: p.disease_diagnosis,
          items: p.items.map((it) => ({
            brandName: it.brand_name,
            genericName: it.generic_name,
            dosageInstruction: it.dosage_instruction,
            durationDays: it.duration,
          })),
        }))
        .sort((a, b) => +new Date(b.date) - +new Date(a.date));
      setPrescriptions(adapted);
      setTimeSlots(initSlots(adapted));
      setCurrentIndex((i) => Math.min(i, Math.max(0, adapted.length - 1)));
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => { reloadPrescriptions(); }, [reloadPrescriptions]);

  const submitSearch = () => {
    const q = searchQuery.trim();
    if (q.length > 0) router.push(`/medicines?q=${encodeURIComponent(q)}`);
  };

  // ── Network Calls ───────────────────────────────────────────
  const onScanFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
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
      setLoading(true);
      await reloadPrescriptions();
      setCurrentIndex(0);
    } catch (err) {
      setScanState("error");
      setScanMessage(err instanceof Error ? err.message : "Scan failed. Please try again.");
    }
  };

  const submitQr = async () => {
    const id = parseInt(qrId, 10);
    if (Number.isNaN(id)) { setQrError("Enter a valid prescription ID."); return; }
    setQrBusy(true);
    setQrError(null);
    try {
      await api.addPrescriptionFromQr(patientId, id);
      setQrOpen(false);
      setQrId("");
      setLoading(true);
      await reloadPrescriptions();
      setCurrentIndex(0);
    } catch (err) {
      setQrError(err instanceof Error ? err.message : "Couldn't link that prescription.");
    } finally {
      setQrBusy(false);
    }
  };

  const handleSaveReminders = async () => {
    if (!rx) return;
    setSavingReminders(true);
    
    const userEmail = user?.email || "patient@example.com";

    try {
      const promises = [];
      const now = new Date();

      for (let i = 0; i < rx.items.length; i++) {
        const item = rx.items[i];
        const key = slotKey(i);
        const slots = timeSlots[key] || [];

        for (const slot of slots) {
          let hour24 = slot.hour;
          if (slot.ampm === "PM" && hour24 !== 12) hour24 += 12;
          if (slot.ampm === "AM" && hour24 === 12) hour24 = 0;

          for (let dayOffset = 0; dayOffset < item.durationDays; dayOffset++) {
            const scheduleDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset, hour24, slot.minute, 0);
            if (scheduleDate <= now) continue;

            promises.push(
              api.sendNotification({
                patient_email: userEmail,
                medicine_name: item.brandName,
                schedule_time: scheduleDate.toISOString(),
                status: "pending",
              })
            );
          }
        }
      }

      await Promise.all(promises);
      setReminderOpen(false);
    } catch (error) {
      console.error("Failed to save reminders", error);
      alert("Failed to schedule some reminders. Please try again.");
    } finally {
      setSavingReminders(false);
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
    <div className="flex h-screen bg-[#FAFAFA] font-sans selection:bg-indigo-100 selection:text-indigo-900 overflow-hidden text-zinc-900">

      {/* ── Fixed Sidebar ───────────────────────────────────── */}
      <aside className="w-64 bg-white border-r border-zinc-200 flex flex-col shrink-0 z-20 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
        {/* Sidebar Header (Logo) */}
        <div className="h-16 flex items-center px-6 border-b border-zinc-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-zinc-900 flex items-center justify-center shrink-0">
              <HeartPulse size={16} className="text-white" />
            </div>
            <span className="text-base font-bold tracking-tight text-zinc-900">AuraMed</span>
          </div>
        </div>

        {/* Sidebar Nav */}
        <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map(({ icon: Icon, label, href, active }) => (
            <a
              key={label}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group ${
                active 
                  ? "bg-zinc-900 text-white shadow-sm" 
                  : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900"
              }`}
            >
              <Icon size={18} className={active ? "text-indigo-400" : "text-zinc-400 group-hover:text-zinc-600"} />
              <span className="text-sm font-medium">{label}</span>
            </a>
          ))}
        </nav>
      </aside>

      {/* ── Main Canvas ─────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        {/* Subtle background glow */}
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-50/50 rounded-full blur-3xl pointer-events-none -z-10" />

        {/* ── Top Header ───────────────────────────────────── */}
        <header className="h-16 bg-white/70 backdrop-blur-md border-b border-zinc-200 flex items-center justify-between px-8 shrink-0 z-10">
          
          {/* Mobile Menu trigger (hidden on desktop, stubbed for visual) */}
          <div className="lg:hidden flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-zinc-900 flex items-center justify-center shrink-0">
              <HeartPulse size={16} className="text-white" />
            </div>
          </div>
          <div className="hidden lg:block" /> {/* Spacer */}

          {/* Right Actions */}
          <div className="flex items-center gap-3">
            <button className="relative w-9 h-9 rounded-full flex items-center justify-center hover:bg-zinc-100 transition-colors">
              <Bell size={18} className="text-zinc-500 hover:text-zinc-900" />
              <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-emerald-500 border-2 border-white" />
            </button>
            <button className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-zinc-100 transition-colors">
              <Settings size={18} className="text-zinc-500 hover:text-zinc-900" />
            </button>
            <div className="w-px h-5 bg-zinc-200 mx-1" />
            <div 
              title={displayName} 
              className="w-9 h-9 rounded-full bg-indigo-600 flex items-center justify-center text-white text-sm font-semibold shadow-sm border border-indigo-700 ml-1 cursor-default"
            >
              {avatarInitial}
            </div>
            <button
              onClick={logout}
              title="Log out"
              className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-red-50 text-zinc-400 hover:text-red-600 transition-colors ml-1"
            >
              <LogOut size={16} />
            </button>
          </div>
        </header>

        {/* ── Scrollable Body ──────────────────────────────── */}
        <main className="flex-1 overflow-y-auto p-8 lg:p-10">
          <div className="max-w-6xl mx-auto flex flex-col gap-8">
            
            {/* ── Greeting & Actions ───────────────────────── */}
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
              <div className="flex-1 max-w-xl">
                <h1 className="text-3xl lg:text-4xl font-bold tracking-tight text-zinc-900 mb-2">
                  Hey, {firstName}! 🙌
                </h1>
                <p className="text-zinc-500 mb-6"> Heres whats happening with your health today.</p>
                
                {/* Search Bar */}
                <div className="relative group">
                  <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 group-focus-within:text-zinc-900 transition-colors pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") submitSearch(); }}
                    placeholder="Search medicine by name or symptom…"
                    className="w-full h-12 pl-12 pr-4 bg-white border border-zinc-200 rounded-full text-sm text-zinc-900 placeholder:text-zinc-400 shadow-sm focus:outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 transition-all"
                  />
                </div>
              </div>

              {/* Action Buttons (Scan) */}
              <div className="flex flex-col gap-3 shrink-0 lg:w-72">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold text-zinc-900">Quick Actions</span>
                </div>
                <div className="flex gap-2">
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onScanFile} />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={scanState === "scanning"}
                    className="flex-1 flex flex-col items-center gap-1.5 p-3 bg-white border border-zinc-200 rounded-2xl hover:border-indigo-300 hover:bg-indigo-50/50 transition-all shadow-sm active:scale-95 disabled:opacity-50"
                  >
                    <ScanLine size={20} className="text-indigo-600" />
                    <span className="text-xs font-semibold text-zinc-700">Scan Script</span>
                  </button>
                  <button
                    onClick={() => { setQrOpen(true); setQrError(null); }}
                    className="flex-1 flex flex-col items-center gap-1.5 p-3 bg-white border border-zinc-200 rounded-2xl hover:border-indigo-300 hover:bg-indigo-50/50 transition-all shadow-sm active:scale-95"
                  >
                    <QrCode size={20} className="text-indigo-600" />
                    <span className="text-xs font-semibold text-zinc-700">Scan QR</span>
                  </button>
                </div>

                {/* Scan Status Feedback */}
                {scanState !== "idle" && (
                  <div className={`flex items-center gap-2 text-xs font-medium mt-1 px-1 ${scanState === 'error' ? 'text-red-500' : scanState === 'done' ? 'text-emerald-600' : 'text-indigo-600'}`}>
                    {scanState === "scanning" && <Loader2 size={14} className="animate-spin" />}
                    {scanState === "done" && <CheckCircle2 size={14} />}
                    {scanState === "error" && <AlertTriangle size={14} />}
                    <span className="truncate">{scanMessage}</span>
                  </div>
                )}
              </div>
            </div>

            {/* ── Prescriptions Section ──────────────────────── */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-zinc-900">Your Prescriptions</h2>
                {/* Navigator Controls */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => canGoLeft && setCurrentIndex((i) => i - 1)}
                    disabled={!canGoLeft}
                    className="w-8 h-8 rounded-full border border-zinc-200 flex items-center justify-center hover:bg-zinc-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span className="text-xs font-semibold text-zinc-500 min-w-[3rem] text-center">
                    {prescriptions.length > 0 ? `${currentIndex + 1} / ${prescriptions.length}` : "0 / 0"}
                  </span>
                  <button
                    onClick={() => canGoRight && setCurrentIndex((i) => i + 1)}
                    disabled={!canGoRight}
                    className="w-8 h-8 rounded-full border border-zinc-200 flex items-center justify-center hover:bg-zinc-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>

              {/* Prescription Content Area */}
              <div className="bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-zinc-200 overflow-hidden min-h-[400px] flex flex-col">
                
                {loading ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
                    <Loader2 size={32} className="text-zinc-300 animate-spin mb-4" />
                    <p className="text-sm font-medium text-zinc-500">Loading your health records…</p>
                  </div>
                ) : !rx ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-zinc-50 border border-zinc-100 flex items-center justify-center mb-4">
                      <ScanLine size={28} className="text-zinc-300" />
                    </div>
                    <p className="text-lg font-bold text-zinc-900">No prescriptions found</p>
                    <p className="text-sm text-zinc-500 max-w-sm mt-1">
                      Upload a photo of your paper prescription or scan a clinic QR code to get started.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col h-full">
                    
                    {/* Card Header (Doctor & Date) */}
                    <div className="px-8 py-6 border-b border-zinc-100 flex flex-col sm:flex-row sm:items-start justify-between gap-4 bg-zinc-50/50">
                      <div>
                        <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs font-bold mb-3 shadow-sm border border-indigo-100">
                          {rx.diagnosis}
                        </div>
                        <h3 className="text-xl font-bold text-zinc-900">{rx.doctorName}</h3>
                        <p className="text-sm text-zinc-500 font-medium mt-0.5">{rx.specialization}</p>
                      </div>
                      <div className="flex items-center gap-2 bg-white border border-zinc-200 px-3 py-1.5 rounded-lg shadow-sm">
                        <Calendar size={14} className="text-zinc-400" />
                        <span className="text-sm font-semibold text-zinc-700">{formatDate(rx.date)}</span>
                      </div>
                    </div>

                    {/* Medicines List */}
                    <div className="flex-1 p-8 overflow-y-auto">
                      <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-4">
                        Prescribed Medicines
                      </p>
                      <div className="flex flex-col gap-3">
                        {rx.items.map((item, i) => (
                          <div key={i} className="group p-4 rounded-2xl border border-zinc-100 hover:border-zinc-200 hover:shadow-[0_2px_10px_rgba(0,0,0,0.02)] transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white">
                            <div className="flex items-center gap-4">
                              <div className="w-10 h-10 rounded-xl bg-zinc-50 border border-zinc-100 flex items-center justify-center shrink-0">
                                <Pill size={18} className="text-indigo-500" />
                              </div>
                              <div>
                                <p className="text-base font-bold text-zinc-900">{item.brandName}</p>
                                <p className="text-xs text-zinc-500 font-medium mt-0.5">{item.genericName}</p>
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-4 sm:justify-end">
                              <div className="text-right">
                                <p className="text-sm font-bold text-zinc-700">{parseDosage(item.dosageInstruction)}</p>
                                <p className="text-xs text-zinc-400 font-medium mt-0.5">for {item.durationDays} days</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Card Footer (Actions) */}
                    <div className="px-8 py-5 border-t border-zinc-100 bg-white flex flex-col sm:flex-row items-center justify-between gap-4 shrink-0">
                      <a
                        href="/location?exact=1"
                        className="w-full sm:w-auto inline-flex justify-center items-center gap-2 px-6 py-2.5 bg-white border border-zinc-200 text-zinc-700 text-sm font-semibold rounded-xl hover:bg-zinc-50 transition-colors shadow-sm"
                      >
                        <MapPin size={16} className="text-zinc-400" />
                        Find Pharmacy
                      </a>
                      <button
                        onClick={() => setReminderOpen(true)}
                        className="w-full sm:w-auto inline-flex justify-center items-center gap-2 px-6 py-2.5 bg-zinc-900 text-white text-sm font-semibold rounded-xl hover:bg-zinc-800 transition-all shadow-md active:scale-95"
                      >
                        <AlarmClock size={16} />
                        Set Reminders
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* ── Overlays (Modals) ────────────────────────────────── */}

      {/* Set Reminder Overlay */}
      {reminderOpen && rx && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200"
          onClick={(e) => { if (e.target === e.currentTarget && !savingReminders) setReminderOpen(false); }}
        >
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl flex flex-col overflow-hidden max-h-[90vh]">
            {/* Modal Header */}
            <div className="px-6 pt-6 pb-4 border-b border-zinc-100 flex items-center justify-between shrink-0 bg-white">
              <div>
                <h2 className="text-xl font-bold text-zinc-900">Dose Reminders</h2>
                <p className="text-sm text-zinc-500 font-medium mt-1">{rx.diagnosis}</p>
              </div>
              <button
                onClick={() => !savingReminders && setReminderOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-zinc-100 text-zinc-400 hover:text-zinc-900 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6 bg-zinc-50/50">
              {rx.items.map((item, medIdx) => {
                const key = slotKey(medIdx);
                const slots = timeSlots[key] ?? [];
                return (
                  <div key={medIdx} className="bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-sm">
                    {/* Medicine Info */}
                    <div className="px-5 py-4 border-b border-zinc-100 bg-zinc-50/50 flex justify-between items-start">
                      <div>
                        <p className="text-sm font-bold text-zinc-900">{item.brandName}</p>
                        <p className="text-xs text-zinc-500 mt-1">
                          {parseDosage(item.dosageInstruction)} · {item.durationDays} days
                        </p>
                      </div>
                      <Clock size={16} className="text-zinc-400" />
                    </div>

                    {/* Time Slots List */}
                    <div className="p-5 flex flex-col gap-4">
                      {slots.map((slot, slotIdx) => (
                        <div key={slotIdx} className="flex items-center justify-between gap-4">
                          <TimePicker slot={slot} onChange={(s) => updateSlot(key, slotIdx, s)} />
                          
                          <div className="flex items-center gap-2">
                            {slots.length > 1 && (
                              <button
                                onClick={() => setDeleteConfirm({ key, slotIdx })}
                                title="Remove this time"
                                className="w-8 h-8 rounded-xl flex items-center justify-center text-zinc-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                            <button
                              onClick={() => addSlot(key)}
                              title="Add another time"
                              className="w-8 h-8 rounded-xl flex items-center justify-center text-indigo-600 hover:bg-indigo-50 transition-colors border border-transparent hover:border-indigo-100"
                            >
                              <PlusCircle size={18} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-5 border-t border-zinc-100 bg-white shrink-0">
              <button
                onClick={handleSaveReminders}
                disabled={savingReminders}
                className="w-full h-12 bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-bold rounded-xl flex items-center justify-center gap-2 transition-all shadow-md active:scale-[0.98] disabled:opacity-70 disabled:active:scale-100"
              >
                {savingReminders && <Loader2 size={16} className="animate-spin" />}
                {savingReminders ? "Saving Schedule..." : "Save & Enable Reminders"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Scan QR Overlay */}
      {qrOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200"
          onClick={(e) => { if (e.target === e.currentTarget && !qrBusy) setQrOpen(false); }}
        >
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8 flex flex-col gap-6">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-xl font-bold text-zinc-900">Link Prescription</h3>
                <p className="text-sm text-zinc-500 mt-1">Enter the ID from your paper or app QR.</p>
              </div>
              <button
                onClick={() => !qrBusy && setQrOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-zinc-100 text-zinc-400 hover:text-zinc-900 transition-colors -mr-2 -mt-2"
              >
                <X size={18} />
              </button>
            </div>

            <div>
              <input
                type="number"
                value={qrId}
                onChange={(e) => setQrId(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") submitQr(); }}
                placeholder="e.g. 10452"
                className="w-full h-12 px-4 bg-zinc-50 border border-zinc-200 rounded-xl text-sm font-medium text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
              />
              {qrError && (
                <p className="text-xs font-medium text-red-500 flex items-center gap-1.5 mt-2">
                  <AlertTriangle size={14} /> {qrError}
                </p>
              )}
            </div>

            <button
              onClick={submitQr}
              disabled={qrBusy}
              className="w-full h-12 bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-bold rounded-xl flex items-center justify-center gap-2 transition-all shadow-md active:scale-[0.98] disabled:opacity-70 disabled:active:scale-100"
            >
              {qrBusy ? <Loader2 size={16} className="animate-spin" /> : <QrCode size={16} />}
              {qrBusy ? "Linking..." : "Link Now"}
            </button>
          </div>
        </div>
      )}

      {/* Delete Confirm Overlay */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-zinc-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xs p-8">
            <div className="flex flex-col items-center text-center gap-3">
              <div className="w-14 h-14 rounded-full bg-red-50 border border-red-100 flex items-center justify-center mb-1">
                <AlertTriangle size={24} className="text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-zinc-900">Delete Reminder?</h3>
              <p className="text-sm text-zinc-500 leading-relaxed">
                This specific time slot will be permanently removed.
              </p>
              
              <div className="flex gap-3 w-full mt-5">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="flex-1 py-2.5 bg-white border border-zinc-200 hover:bg-zinc-50 text-zinc-700 text-sm font-semibold rounded-xl transition-colors shadow-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={() => deleteSlot(deleteConfirm.key, deleteConfirm.slotIdx)}
                  className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-xl transition-all shadow-sm active:scale-95"
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