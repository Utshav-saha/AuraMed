"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Bell, Settings, Calendar, MapPin, Calculator, ShoppingCart,
  Clock, Stethoscope, Plus, X, Loader2, CheckCircle2, AlertTriangle,
  LayoutDashboard, Pill, LogOut, HeartPulse, Building2,
  CalendarClock, Search,
} from "lucide-react";
import { useRequireAuth } from "@/lib/auth-context";
import {
  api,
  type BookedAppointment,
  type DoctorSearchResult,
  type DoctorAvailability,
} from "@/lib/api";

// ── Nav items ──────────────────────────────────────────────────
const NAV_ITEMS = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard" },
  { icon: Calendar, label: "Appointments", href: "/appointments", active: true },
  { icon: MapPin, label: "Pharmacies", href: "/location" },
  { icon: Pill, label: "Medicines", href: "/medicines" },
  { icon: Calculator, label: "Calculator", href: "/dosage" },
  { icon: ShoppingCart, label: "Cart", href: "/cart" },
];

// ── Helpers ────────────────────────────────────────────────────
function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
  });
}

// "14:30:00" → "2:30 PM"
function formatTime(t: string) {
  const [hStr, mStr] = t.split(":");
  const h = parseInt(hStr, 10);
  if (Number.isNaN(h)) return t;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mStr ?? "00"} ${ampm}`;
}

// Parse a free-text time_slot (e.g. "09:30 AM", "14:00", "9 AM - 11 AM")
// into the "HH:MM:SS" the booking endpoint expects. Uses the first time found.
function slotToTime(timeSlot: string): string {
  const m = timeSlot.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!m) return "09:00:00";
  let h = parseInt(m[1], 10);
  const min = m[2] ?? "00";
  const ampm = m[3]?.toLowerCase();
  if (ampm === "pm" && h !== 12) h += 12;
  if (ampm === "am" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${min}:00`;
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

// ── Appointment card ───────────────────────────────────────────
function AppointmentCard({ appt, past }: { appt: BookedAppointment; past: boolean }) {
  return (
    <div className="bg-white rounded-3xl border border-zinc-200 p-6 flex flex-col sm:flex-row sm:items-start justify-between gap-6 shadow-sm hover:shadow-md transition-all">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0">
            <Stethoscope size={22} className="text-indigo-600" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <p className="text-lg font-bold text-zinc-900">
                {appt.doctors?.name ?? "Doctor"}
              </p>
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border shadow-sm ${
                  past
                    ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                    : "bg-indigo-50 text-indigo-700 border-indigo-100"
                }`}
              >
                {past ? "Completed" : "Upcoming"}
              </span>
            </div>
            {appt.doctors?.specialization && (
              <p className="text-sm text-zinc-500 font-medium mt-0.5">{appt.doctors.specialization}</p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-700 bg-zinc-50 px-3 py-1.5 rounded-full border border-zinc-200">
            <Calendar size={13} className="text-zinc-400" />
            {formatDate(appt.date)}
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-700 bg-zinc-50 px-3 py-1.5 rounded-full border border-zinc-200">
            <Clock size={13} className="text-zinc-400" />
            {formatTime(appt.time)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────
export default function AppointmentsPage() {
  const { logout, patient } = useRequireAuth();
  const patientId = patient?.id ?? 1; // placeholder fallback for guest mode
  const displayName = patient?.name ?? "there";
  const avatarInitial = displayName.charAt(0).toUpperCase() || "A";

  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [upcoming, setUpcoming] = useState<BookedAppointment[]>([]);
  const [past, setPast] = useState<BookedAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Booking overlay state
  const [bookOpen, setBookOpen] = useState(false);
  const [doctorQuery, setDoctorQuery] = useState("");
  const [doctors, setDoctors] = useState<DoctorSearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<{ doctor: DoctorSearchResult; slot: DoctorAvailability } | null>(null);
  const [booking, setBooking] = useState(false);
  const [bookSuccess, setBookSuccess] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    await Promise.resolve();
    setLoadError(null);
    try {
      const [up, pa] = await Promise.all([
        api.myAppointments(patientId, "upcoming"),
        api.myAppointments(patientId, "past"),
      ]);
      setUpcoming(up);
      setPast(pa);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Couldn't load appointments.");
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void reload();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [reload]);

  const shown = tab === "upcoming" ? upcoming : past;

  // ── Booking flow ────────────────────────────────────────────
  const searchDoctors = async () => {
    setSearching(true);
    setFormError(null);
    try {
      setDoctors(await api.searchDoctors(doctorQuery.trim() || undefined));
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Doctor search failed.");
      setDoctors([]);
    } finally {
      setSearching(false);
    }
  };

  const openBooking = () => {
    setDoctorQuery("");
    setDoctors(null);
    setSelectedSlot(null);
    setFormError(null);
    setBookSuccess(false);
    setBookOpen(true);
    // Load all available doctors immediately
    setSearching(true);
    api.searchDoctors()
      .then(setDoctors)
      .catch(() => setDoctors([]))
      .finally(() => setSearching(false));
  };

  const handleBook = async () => {
    if (!selectedSlot) return setFormError("Pick an available time slot first.");
    const { doctor, slot } = selectedSlot;
    if (!slot.hospitals) return setFormError("This slot has no hospital attached.");

    setBooking(true);
    setFormError(null);
    try {
      await api.bookAppointment({
        patient_id: patientId,
        doctor_id: doctor.id,
        hospital_id: slot.hospitals.id,
        appointment_date: slot.date ?? new Date().toISOString().split("T")[0],
        appointment_time: slotToTime(slot.time_slot),
        availability_id: slot.id,
      });
      setBookSuccess(true);
      setLoading(true);
      await reload();
      setTab("upcoming");
      setTimeout(() => setBookOpen(false), 1200);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Booking failed. Please try again.");
    } finally {
      setBooking(false);
    }
  };

  return (
    <div className="flex h-screen bg-[#FAFAFA] font-sans text-zinc-900 overflow-hidden selection:bg-indigo-100 selection:text-indigo-900">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <NavBar logout={logout} avatarInitial={avatarInitial} displayName={displayName} />
        {/* Subtle background glow */}
        <div className="absolute top-0 right-0 w-125 h-125 bg-indigo-50/50 rounded-full blur-3xl pointer-events-none -z-10" />

        <main className="flex-1 overflow-y-auto p-8 lg:p-12">
          <div className="max-w-4xl mx-auto flex flex-col gap-6">

            {/* ── Header row ── */}
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold text-zinc-900 tracking-tight">Appointments</h1>
                <p className="text-sm text-zinc-500 mt-2">
                  Book and view your doctor appointments.
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
                <p className="text-2xl font-bold text-zinc-900 leading-none">{upcoming.length}</p>
                <p className="text-sm text-zinc-500 font-medium mt-1">
                  {upcoming.length === 1 ? "upcoming appointment" : "upcoming appointments"}
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

            {loadError && (
              <p className="text-sm font-semibold text-red-600 bg-red-50 p-3 rounded-xl border border-red-100 flex items-center gap-2">
                <AlertTriangle size={16} />
                {loadError}
              </p>
            )}

            {/* ── List ── */}
            {loading ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center py-20">
                <Loader2 size={32} className="text-indigo-500 animate-spin" />
                <p className="text-sm font-medium text-zinc-500">Loading your appointments…</p>
              </div>
            ) : shown.length === 0 ? (
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
                    : "Your completed appointments will appear here."}
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
                {shown.map((appt) => (
                  <AppointmentCard key={appt.id} appt={appt} past={tab === "past"} />
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
                <p className="text-sm font-medium text-zinc-500 mt-1">
                  Search a doctor or specialization, then pick a slot.
                </p>
              </div>
              <button
                onClick={() => !booking && setBookOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-zinc-100 text-zinc-400 hover:text-zinc-900 transition-colors shrink-0"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-6 flex flex-col gap-5 bg-zinc-50/50">
              {bookSuccess ? (
                <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
                  <div className="w-20 h-20 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center">
                    <CheckCircle2 size={40} className="text-emerald-500" />
                  </div>
                  <div>
                    <p className="text-lg font-bold text-zinc-900">Appointment Booked!</p>
                    <p className="text-sm font-medium text-zinc-500 mt-1">See it under your upcoming appointments.</p>
                  </div>
                </div>
              ) : (
                <>
                  {/* Doctor search */}
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none z-10" />
                      <input
                        type="text"
                        value={doctorQuery}
                        onChange={(e) => setDoctorQuery(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") searchDoctors(); }}
                        placeholder="Doctor name or specialization…"
                        className="w-full h-11 pl-11 pr-4 bg-white border border-zinc-200 rounded-xl text-sm font-medium text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all shadow-sm"
                      />
                    </div>
                    <button
                      onClick={searchDoctors}
                      disabled={searching}
                      className="px-5 bg-zinc-900 text-white text-sm font-bold rounded-xl hover:bg-zinc-800 transition-all shadow-sm disabled:opacity-60 shrink-0 flex items-center gap-2"
                    >
                      {searching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                    </button>
                  </div>

                  {/* Doctor results with slots */}
                  {searching && (
                    <div className="flex items-center justify-center gap-2 text-sm text-zinc-500 py-8">
                      <Loader2 size={16} className="animate-spin" /> Finding available doctors…
                    </div>
                  )}

                  {!searching && doctors && doctors.length === 0 && (
                    <p className="text-sm text-zinc-500 text-center py-8">
                      No doctors with available slots found. Try a different search.
                    </p>
                  )}

                  {!searching && doctors && doctors.map((doc) => {
                    const slots = doc.hospital_doctor_availability.filter(
                      (s) => s.available_slots > 0 && s.hospitals
                    );
                    if (slots.length === 0) return null;
                    return (
                      <div key={doc.id} className="bg-white border border-zinc-200 rounded-2xl shadow-sm overflow-hidden">
                        <div className="px-5 py-3.5 border-b border-zinc-100 bg-zinc-50/50 flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0">
                            <Stethoscope size={16} className="text-indigo-600" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-zinc-900 truncate">{doc.name}</p>
                            {doc.specialization && (
                              <p className="text-xs text-zinc-500 truncate">{doc.specialization}</p>
                            )}
                          </div>
                        </div>
                        <div className="p-4 flex flex-col gap-2">
                          {slots.map((slot) => {
                            const isSelected = selectedSlot?.slot.id === slot.id;
                            return (
                              <button
                                key={slot.id}
                                onClick={() => setSelectedSlot({ doctor: doc, slot })}
                                className={`flex items-center justify-between gap-3 px-4 py-3 rounded-xl border text-left transition-all ${
                                  isSelected
                                    ? "bg-indigo-50/60 border-indigo-300 shadow-sm"
                                    : "bg-white border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50"
                                }`}
                              >
                                <div className="min-w-0">
                                  <p className={`text-sm font-bold ${isSelected ? "text-indigo-900" : "text-zinc-900"}`}>
                                    {slot.date ? formatDate(slot.date) : "Any day"} · {slot.time_slot}
                                  </p>
                                  <p className="text-xs text-zinc-500 mt-0.5 flex items-center gap-1.5 truncate">
                                    <Building2 size={12} className="shrink-0" />
                                    {slot.hospitals!.name}
                                  </p>
                                </div>
                                <span className={`text-xs font-bold px-2.5 py-1 rounded-full border shrink-0 ${
                                  isSelected
                                    ? "bg-indigo-600 text-white border-indigo-600"
                                    : "bg-emerald-50 text-emerald-700 border-emerald-200"
                                }`}>
                                  {isSelected ? "Selected" : `${slot.available_slots} left`}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}

                  {formError && (
                    <p className="text-sm font-semibold text-red-600 bg-red-50 p-3 rounded-xl border border-red-100 flex items-center gap-2">
                      <AlertTriangle size={16} />
                      {formError}
                    </p>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            {!bookSuccess && (
              <div className="px-6 py-5 shrink-0 bg-white border-t border-zinc-100 flex gap-4">
                <button
                  onClick={() => !booking && setBookOpen(false)}
                  className="flex-1 py-3 bg-white border border-zinc-200 text-zinc-700 text-sm font-bold rounded-xl hover:bg-zinc-50 transition-colors shadow-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleBook}
                  disabled={booking || !selectedSlot}
                  className="flex-1 py-3 bg-zinc-900 text-white text-sm font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-zinc-800 transition-all shadow-md active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100"
                >
                  {booking ? <Loader2 size={16} className="animate-spin" /> : <CalendarClock size={16} />}
                  {booking ? "Booking…" : "Confirm Booking"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
