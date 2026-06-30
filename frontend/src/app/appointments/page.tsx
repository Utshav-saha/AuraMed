"use client";

import { useMemo, useState } from "react";
import {
  Bell, Settings, Calendar, MapPin, Calculator, ShoppingCart,
  Clock, Stethoscope, Plus, X, Loader2, CheckCircle2, AlertTriangle,
  LayoutDashboard, Pill, LogOut, HeartPulse, Video, Building2,
  CalendarClock, ChevronRight,
} from "lucide-react";
import { useRequireAuth } from "@/lib/auth-context";

// ── Nav items ──────────────────────────────────────────────────
const NAV_ITEMS = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard" },
  { icon: Calendar, label: "Appointments", href: "/appointments", active: true },
  { icon: MapPin, label: "Pharmacies", href: "/location" },
  { icon: Pill, label: "Medicines", href: "/medicines" },
  { icon: Calculator, label: "Calculator", href: "/dosage" },
  { icon: ShoppingCart, label: "Cart", href: "/cart" },
];

// ── Types ──────────────────────────────────────────────────────
type Mode = "in_person" | "video";
type Status = "upcoming" | "completed" | "cancelled";

interface Appointment {
  id: number;
  doctorName: string;
  specialization: string;
  date: string; // ISO date (yyyy-mm-dd)
  time: string; // e.g. "09:30 AM"
  mode: Mode;
  location: string;
  reason: string;
  status: Status;
}

interface Doctor {
  id: number;
  name: string;
  specialization: string;
  location: string;
}

// ── Placeholder data (no appointments backend yet) ─────────────
const DOCTORS: Doctor[] = [
  { id: 1, name: "Dr. Ayesha Rahman", specialization: "General Physician", location: "AuraMed Clinic, Dhanmondi" },
  { id: 2, name: "Dr. Imran Hossain", specialization: "Cardiologist", location: "Heart Care Center, Gulshan" },
  { id: 3, name: "Dr. Nadia Karim", specialization: "Dermatologist", location: "SkinWell, Banani" },
  { id: 4, name: "Dr. Sajid Alam", specialization: "Pediatrician", location: "Children's Health, Uttara" },
];

const INITIAL_APPOINTMENTS: Appointment[] = [
  {
    id: 1,
    doctorName: "Dr. Ayesha Rahman",
    specialization: "General Physician",
    date: "2026-07-08",
    time: "09:30 AM",
    mode: "in_person",
    location: "AuraMed Clinic, Dhanmondi",
    reason: "Routine check-up & blood pressure review",
    status: "upcoming",
  },
  {
    id: 2,
    doctorName: "Dr. Imran Hossain",
    specialization: "Cardiologist",
    date: "2026-07-15",
    time: "02:00 PM",
    mode: "video",
    location: "Video consultation",
    reason: "Follow-up on ECG results",
    status: "upcoming",
  },
  {
    id: 3,
    doctorName: "Dr. Nadia Karim",
    specialization: "Dermatologist",
    date: "2026-06-12",
    time: "11:00 AM",
    mode: "in_person",
    location: "SkinWell, Banani",
    reason: "Skin allergy consultation",
    status: "completed",
  },
];

const TIME_OPTIONS = [
  "09:00 AM", "09:30 AM", "10:00 AM", "10:30 AM", "11:00 AM",
  "11:30 AM", "02:00 PM", "02:30 PM", "03:00 PM", "03:30 PM", "04:00 PM",
];

// ── Helpers ────────────────────────────────────────────────────
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
  });
}

// ── Sidebar ────────────────────────────────────────────────────
function Sidebar() {
  return (
    <aside className="hidden lg:flex w-64 bg-white border-r border-zinc-200 flex-col shrink-0 z-20 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
      <div className="h-16 flex items-center px-6 border-b border-zinc-100 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-zinc-900 flex items-center justify-center shrink-0">
            <HeartPulse size={16} className="text-white" />
          </div>
          <span className="text-base font-bold tracking-tight text-zinc-900">AuraMed</span>
        </div>
      </div>
      <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map(({ icon: Icon, label, href, active }) => (
          <a
            key={label}
            href={href}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group ${
              active ? "bg-zinc-900 text-white shadow-sm" : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900"
            }`}
          >
            <Icon size={18} className={active ? "text-indigo-400" : "text-zinc-400 group-hover:text-zinc-600"} />
            <span className="text-sm font-medium">{label}</span>
          </a>
        ))}
      </nav>
    </aside>
  );
}

// ── NavBar ─────────────────────────────────────────────────────
function NavBar({ logout, avatarInitial, displayName }: { logout: () => void; avatarInitial: string; displayName: string }) {
  return (
    <header className="h-16 bg-white/70 backdrop-blur-md border-b border-zinc-200 flex items-center justify-between px-8 shrink-0 z-10">
      <div className="lg:hidden flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-full bg-zinc-900 flex items-center justify-center shrink-0">
          <HeartPulse size={16} className="text-white" />
        </div>
        <span className="text-base font-bold tracking-tight text-zinc-900">AuraMed</span>
      </div>
      <div className="hidden lg:block" /> {/* Spacer */}
      <div className="flex items-center gap-3">
        <button className="relative w-9 h-9 rounded-full flex items-center justify-center hover:bg-zinc-100 transition-colors">
          <Bell size={18} className="text-zinc-500 hover:text-zinc-900" />
          <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-emerald-500 border-2 border-white" />
        </button>
        <button className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-zinc-100 transition-colors">
          <Settings size={18} className="text-zinc-500 hover:text-zinc-900" />
        </button>
        <div className="w-px h-5 bg-zinc-200 mx-1" />
        <div title={displayName} className="w-9 h-9 rounded-full bg-indigo-600 flex items-center justify-center text-white text-sm font-semibold shadow-sm border border-indigo-700 ml-1 cursor-default">
          {avatarInitial}
        </div>
        <button onClick={logout} title="Log out" className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-red-50 text-zinc-400 hover:text-red-600 transition-colors ml-1">
          <LogOut size={16} />
        </button>
      </div>
    </header>
  );
}

// ── Status badge ───────────────────────────────────────────────
function StatusBadge({ status }: { status: Status }) {
  const styles: Record<Status, string> = {
    upcoming: "bg-indigo-50 text-indigo-700 border-indigo-100",
    completed: "bg-emerald-50 text-emerald-700 border-emerald-100",
    cancelled: "bg-zinc-100 text-zinc-500 border-zinc-200",
  };
  const labels: Record<Status, string> = {
    upcoming: "Upcoming",
    completed: "Completed",
    cancelled: "Cancelled",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border shadow-sm ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

// ── Appointment card ───────────────────────────────────────────
function AppointmentCard({ appt, onCancel }: { appt: Appointment; onCancel: (id: number) => void }) {
  const ModeIcon = appt.mode === "video" ? Video : Building2;
  const isUpcoming = appt.status === "upcoming";

  return (
    <div className="bg-white rounded-3xl border border-zinc-200 p-6 flex flex-col sm:flex-row sm:items-start justify-between gap-6 shadow-sm hover:shadow-md transition-all">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0">
            <Stethoscope size={22} className="text-indigo-600" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <p className="text-lg font-bold text-zinc-900">{appt.doctorName}</p>
              <StatusBadge status={appt.status} />
            </div>
            <p className="text-sm text-zinc-500 font-medium mt-0.5">{appt.specialization}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-700 bg-zinc-50 px-3 py-1.5 rounded-full border border-zinc-200">
            <Calendar size={13} className="text-zinc-400" />
            {formatDate(appt.date)}
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-700 bg-zinc-50 px-3 py-1.5 rounded-full border border-zinc-200">
            <Clock size={13} className="text-zinc-400" />
            {appt.time}
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-700 bg-zinc-50 px-3 py-1.5 rounded-full border border-zinc-200">
            <ModeIcon size={13} className="text-zinc-400" />
            {appt.location}
          </span>
        </div>

        {appt.reason && (
          <p className="text-sm text-zinc-500 mt-4 leading-relaxed">
            <span className="font-semibold text-zinc-700">Reason:</span> {appt.reason}
          </p>
        )}
      </div>

      {isUpcoming && (
        <div className="flex sm:flex-col gap-2 shrink-0">
          {appt.mode === "video" && (
            <button className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-zinc-900 text-white text-sm font-semibold rounded-xl hover:bg-zinc-800 transition-all shadow-md active:scale-95">
              <Video size={16} />
              Join
            </button>
          )}
          <button
            onClick={() => onCancel(appt.id)}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-white border border-zinc-200 text-zinc-700 text-sm font-semibold rounded-xl hover:bg-red-50 hover:text-red-600 hover:border-red-100 transition-colors shadow-sm"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────
export default function AppointmentsPage() {
  const { logout, patient } = useRequireAuth();
  const displayName = patient?.name ?? "there";
  const avatarInitial = displayName.charAt(0).toUpperCase() || "A";

  const [appointments, setAppointments] = useState<Appointment[]>(INITIAL_APPOINTMENTS);
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [bookOpen, setBookOpen] = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState<number | null>(null);

  // Booking form state
  const [doctorId, setDoctorId] = useState<number | null>(null);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [mode, setMode] = useState<Mode>("in_person");
  const [reason, setReason] = useState("");
  const [booking, setBooking] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const filtered = useMemo(
    () =>
      appointments
        .filter((a) => (tab === "upcoming" ? a.status === "upcoming" : a.status !== "upcoming"))
        .sort((a, b) => (tab === "upcoming" ? +new Date(a.date) - +new Date(b.date) : +new Date(b.date) - +new Date(a.date))),
    [appointments, tab]
  );

  const upcomingCount = appointments.filter((a) => a.status === "upcoming").length;

  const resetForm = () => {
    setDoctorId(null);
    setDate("");
    setTime("");
    setMode("in_person");
    setReason("");
    setFormError(null);
  };

  const openBooking = () => {
    resetForm();
    setBookOpen(true);
  };

  const handleBook = async () => {
    if (doctorId == null) return setFormError("Please choose a doctor.");
    if (!date) return setFormError("Please pick a date.");
    if (!time) return setFormError("Please pick a time.");

    const doctor = DOCTORS.find((d) => d.id === doctorId)!;
    setBooking(true);
    setFormError(null);

    // Simulate a network call — no appointments backend yet
    await new Promise((r) => setTimeout(r, 700));

    setAppointments((prev) => [
      ...prev,
      {
        id: Math.max(0, ...prev.map((a) => a.id)) + 1,
        doctorName: doctor.name,
        specialization: doctor.specialization,
        date,
        time,
        mode,
        location: mode === "video" ? "Video consultation" : doctor.location,
        reason: reason.trim(),
        status: "upcoming",
      },
    ]);
    setBooking(false);
    setBookOpen(false);
    setTab("upcoming");
  };

  const handleCancel = (id: number) => {
    setAppointments((prev) => prev.map((a) => (a.id === id ? { ...a, status: "cancelled" } : a)));
    setCancelConfirm(null);
  };

  return (
    <div className="flex h-screen bg-[#FAFAFA] font-sans text-zinc-900 overflow-hidden selection:bg-indigo-100 selection:text-indigo-900">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <NavBar logout={logout} avatarInitial={avatarInitial} displayName={displayName} />
        {/* Subtle background glow */}
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-50/50 rounded-full blur-3xl pointer-events-none -z-10" />

        <main className="flex-1 overflow-y-auto p-8 lg:p-12">
          <div className="max-w-4xl mx-auto flex flex-col gap-6">

            {/* ── Header row ── */}
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold text-zinc-900 tracking-tight">Appointments</h1>
                <p className="text-sm text-zinc-500 mt-2">
                  Book, view, and manage your doctor appointments.
                </p>
              </div>
              <button
                onClick={openBooking}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-zinc-900 text-white text-sm font-bold rounded-xl hover:bg-zinc-800 transition-all shadow-md active:scale-95 shrink-0"
              >
                <Plus size={16} />
                Book Appointment
              </button>
            </div>

            {/* ── Stat summary ── */}
            <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm p-6 flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0">
                <CalendarClock size={22} className="text-indigo-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-zinc-900 leading-none">{upcomingCount}</p>
                <p className="text-sm text-zinc-500 font-medium mt-1">
                  {upcomingCount === 1 ? "upcoming appointment" : "upcoming appointments"}
                </p>
              </div>
            </div>

            {/* ── Tab toggle ── */}
            <div className="flex items-center bg-zinc-100 rounded-xl p-1 gap-1 shadow-sm border border-zinc-200 self-start">
              {(["upcoming", "past"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
                    tab === t ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50"
                  }`}
                >
                  {t === "upcoming" ? "Upcoming" : "Past"}
                </button>
              ))}
            </div>

            {/* ── List ── */}
            {filtered.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center py-20">
                <div className="w-16 h-16 rounded-3xl bg-indigo-50 border border-indigo-100 flex items-center justify-center">
                  <Calendar size={28} className="text-indigo-400" />
                </div>
                <p className="text-lg font-bold text-zinc-900">
                  No {tab === "upcoming" ? "upcoming" : "past"} appointments
                </p>
                <p className="text-sm text-zinc-500 max-w-xs leading-relaxed">
                  {tab === "upcoming"
                    ? "Book an appointment with one of our doctors to get started."
                    : "Your completed and cancelled appointments will appear here."}
                </p>
                {tab === "upcoming" && (
                  <button
                    onClick={openBooking}
                    className="mt-2 inline-flex items-center gap-2 px-6 py-3 bg-zinc-900 text-white text-sm font-bold rounded-xl hover:bg-zinc-800 transition-all shadow-md active:scale-95"
                  >
                    <Plus size={16} />
                    Book Appointment
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-4 pb-12">
                {filtered.map((appt) => (
                  <AppointmentCard key={appt.id} appt={appt} onCancel={setCancelConfirm} />
                ))}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* ── Book Appointment Overlay ───────────────────────────── */}
      {bookOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200"
          onClick={(e) => { if (e.target === e.currentTarget && !booking) setBookOpen(false); }}
        >
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden max-h-[90vh]">
            {/* Header */}
            <div className="flex items-start justify-between px-6 pt-6 pb-4 shrink-0 bg-white border-b border-zinc-100">
              <div>
                <h2 className="text-xl font-bold text-zinc-900">Book Appointment</h2>
                <p className="text-sm font-medium text-zinc-500 mt-1">Choose a doctor and a convenient time.</p>
              </div>
              <button
                onClick={() => !booking && setBookOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-zinc-100 text-zinc-400 hover:text-zinc-900 transition-colors shrink-0"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-6 flex flex-col gap-6 bg-zinc-50/50">
              {/* Doctor select */}
              <div>
                <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-3">Doctor</p>
                <div className="flex flex-col gap-2">
                  {DOCTORS.map((doc) => {
                    const selected = doctorId === doc.id;
                    return (
                      <button
                        key={doc.id}
                        onClick={() => setDoctorId(doc.id)}
                        className={`flex items-center gap-3 px-4 py-3 rounded-2xl border text-left transition-all ${
                          selected
                            ? "bg-indigo-50/50 border-indigo-200 shadow-sm"
                            : "bg-white border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50"
                        }`}
                      >
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${selected ? "bg-indigo-600" : "bg-zinc-50 border border-zinc-100"}`}>
                          <Stethoscope size={18} className={selected ? "text-white" : "text-indigo-500"} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-bold ${selected ? "text-indigo-900" : "text-zinc-900"}`}>{doc.name}</p>
                          <p className="text-xs text-zinc-500 mt-0.5">{doc.specialization} · {doc.location}</p>
                        </div>
                        {selected && <CheckCircle2 size={18} className="text-indigo-600 shrink-0" />}
                        {!selected && <ChevronRight size={16} className="text-zinc-300 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Mode toggle */}
              <div>
                <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-3">Visit type</p>
                <div className="flex items-center bg-zinc-100 rounded-xl p-1 gap-1 border border-zinc-200">
                  {(["in_person", "video"] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setMode(m)}
                      className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                        mode === m ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-900"
                      }`}
                    >
                      {m === "in_person" ? <Building2 size={15} /> : <Video size={15} />}
                      {m === "in_person" ? "In person" : "Video call"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Date & time */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-3">Date</p>
                  <input
                    type="date"
                    value={date}
                    min={new Date().toISOString().split("T")[0]}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full h-12 px-4 bg-white border border-zinc-200 rounded-2xl text-sm font-medium text-zinc-900 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all shadow-sm"
                  />
                </div>
                <div>
                  <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-3">Time</p>
                  <select
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className="w-full h-12 px-4 bg-white border border-zinc-200 rounded-2xl text-sm font-medium text-zinc-900 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all shadow-sm appearance-none"
                  >
                    <option value="">Select a time…</option>
                    {TIME_OPTIONS.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Reason */}
              <div>
                <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-3">Reason <span className="text-zinc-300 normal-case font-medium tracking-normal">(optional)</span></p>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  placeholder="Briefly describe your symptoms or purpose of visit…"
                  className="w-full px-4 py-3 bg-white border border-zinc-200 rounded-2xl text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all shadow-sm resize-none"
                />
              </div>

              {formError && (
                <p className="text-sm font-semibold text-red-600 bg-red-50 p-3 rounded-xl border border-red-100 flex items-center gap-2">
                  <AlertTriangle size={16} />
                  {formError}
                </p>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-5 shrink-0 bg-white border-t border-zinc-100 flex gap-4">
              <button
                onClick={() => !booking && setBookOpen(false)}
                className="flex-1 py-3 bg-white border border-zinc-200 text-zinc-700 text-sm font-bold rounded-xl hover:bg-zinc-50 transition-colors shadow-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleBook}
                disabled={booking}
                className="flex-1 py-3 bg-zinc-900 text-white text-sm font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-zinc-800 transition-all shadow-md active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100"
              >
                {booking ? <Loader2 size={16} className="animate-spin" /> : <CalendarClock size={16} />}
                {booking ? "Booking…" : "Confirm Booking"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Cancel Confirm Overlay ─────────────────────────────── */}
      {cancelConfirm != null && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-zinc-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xs p-8">
            <div className="flex flex-col items-center text-center gap-3">
              <div className="w-14 h-14 rounded-full bg-red-50 border border-red-100 flex items-center justify-center mb-1">
                <AlertTriangle size={24} className="text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-zinc-900">Cancel Appointment?</h3>
              <p className="text-sm text-zinc-500 leading-relaxed">
                This appointment will be cancelled. You can always book a new one.
              </p>
              <div className="flex gap-3 w-full mt-5">
                <button
                  onClick={() => setCancelConfirm(null)}
                  className="flex-1 py-2.5 bg-white border border-zinc-200 hover:bg-zinc-50 text-zinc-700 text-sm font-semibold rounded-xl transition-colors shadow-sm"
                >
                  Keep
                </button>
                <button
                  onClick={() => handleCancel(cancelConfirm)}
                  className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-xl transition-all shadow-sm active:scale-95"
                >
                  Cancel It
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
