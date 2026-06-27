"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  HeartPulse, ScanLine, MapPin, Pill, AlarmClock, MessageSquare,
  ArrowRight, ShieldCheck, ChevronRight,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";

// ── Feature cards data ──────────────────────────────────────────
const FEATURES = [
  {
    icon: ScanLine,
    title: "Scan Prescriptions",
    description: "Point your camera at any prescription. Our AI extracts every medicine, dosage, and duration instantly.",
    accent: "#4F46E5", // Indigo
    bg: "#EEF2FF",
  },
  {
    icon: MapPin,
    title: "Find Nearby Pharmacies",
    description: "See which pharmacies near you stock exactly what you need — with real-time inventory and distance.",
    accent: "#059669", // Emerald
    bg: "#ECFDF5",
  },
  {
    icon: Pill,
    title: "Smart Medicine Search",
    description: "Search by brand, generic name, or describe your symptoms. Our engine understands both.",
    accent: "#7C3AED", // Violet
    bg: "#F5F3FF",
  },
  {
    icon: AlarmClock,
    title: "Medicine Reminders",
    description: "Set smart reminders for each dose. Never miss a medication with customisable daily schedules.",
    accent: "#EA580C", // Orange
    bg: "#FFF7ED",
  },
  {
    icon: MessageSquare,
    title: "Drug Safety Chatbot",
    description: "Ask anything about your medication — side effects, interactions, dosage — grounded in official leaflets.",
    accent: "#E11D48", // Rose
    bg: "#FFF1F2",
  },
  {
    icon: ShieldCheck,
    title: "Verified & Secure",
    description: "Your health data is encrypted and private. Pharmacy partners are verified before joining AuraMed.",
    accent: "#0284C7", // Sky
    bg: "#F0F9FF",
  },
];

// ── Steps ───────────────────────────────────────────────────────
const STEPS = [
  {
    num: "01",
    title: "Create account",
    description: "Sign up in seconds. No insurance details, no forms — just your name and email.",
  },
  {
    num: "02",
    title: "Scan prescription",
    description: "Upload a photo. Our AI reads it, matches medicines, and builds your health profile.",
  },
  {
    num: "03",
    title: "Collect medicines",
    description: "See the nearest pharmacies with stock, set reminders, and stay on top of your care.",
  },
];

export default function LandingPage() {
  const router = useRouter();
  const { token, ready } = useAuth();

  // Already signed in → skip landing, go straight to dashboard
  useEffect(() => {
    if (ready && token) router.replace("/dashboard");
  }, [ready, token, router]);

  return (
    <div className="min-h-screen bg-[#FAFAFA] font-sans text-zinc-900 selection:bg-indigo-100 selection:text-indigo-900">
      
      {/* ── Navbar (Floating Pill Design) ──────────────────────── */}
      <div className="fixed top-0 inset-x-0 z-50 px-4 pt-4">
        <header className="max-w-5xl mx-auto bg-white/70 backdrop-blur-lg border border-zinc-200/80 rounded-full shadow-[0_2px_15px_-3px_rgba(0,0,0,0.07)]">
          <div className="px-6 h-14 flex items-center justify-between">
            {/* Logo */}
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-zinc-900 flex items-center justify-center shrink-0">
                <HeartPulse size={16} className="text-white" />
              </div>
              <span className="text-[16px] font-bold tracking-tight text-zinc-900">AuraMed</span>
            </div>

            {/* Nav links */}
            <nav className="hidden md:flex items-center gap-8">
              {["Features", "How it works", "About"].map((label) => (
                <a
                  key={label}
                  href={`#${label.toLowerCase().replace(/\s+/g, "-")}`}
                  className="text-sm font-medium text-zinc-500 hover:text-zinc-900 transition-colors"
                >
                  {label}
                </a>
              ))}
            </nav>

            {/* CTA */}
            <div className="flex items-center gap-4">
              <a
                href="/login"
                className="hidden sm:block text-sm font-medium text-zinc-600 hover:text-zinc-900 transition-colors"
              >
                Sign In
              </a>
              <a
                href="/login"
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-zinc-900 text-white rounded-full text-sm font-medium hover:bg-zinc-800 transition-all active:scale-95"
              >
                Get Started
                <ChevronRight size={14} className="opacity-70" />
              </a>
            </div>
          </div>
        </header>
      </div>

      {/* ── Hero ───────────────────────────────────────────────── */}
      <section className="relative pt-36 pb-24 lg:pt-48 lg:pb-32 overflow-hidden">
        {/* Subtle mesh background */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] opacity-30 pointer-events-none"
             style={{ background: 'radial-gradient(circle at 50% 0%, #C7D2FE 0%, transparent 70%)' }} />

        <div className="max-w-6xl mx-auto px-6 flex flex-col lg:flex-row items-center gap-16 lg:gap-20">
          
          {/* Left: Copy */}
          <div className="flex-1 max-w-2xl relative z-10">
            <h1 className="text-5xl lg:text-7xl font-bold tracking-tighter leading-[1.1] mb-6 text-zinc-900">
              Your health, <br />
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-500 to-cyan-500">
                beautifully cared for.
              </span>
            </h1>

            <p className="text-lg text-zinc-500 leading-relaxed mb-10 max-w-lg">
              Scan prescriptions, locate real-time pharmacy stock, and never miss a dose. An intelligent companion for your daily wellness.
            </p>

            <div className="flex flex-col sm:flex-row items-center gap-4">
              <a
                href="/login"
                className="w-full sm:w-auto inline-flex justify-center items-center gap-2 px-8 py-4 bg-zinc-900 text-white rounded-full text-sm font-medium hover:bg-zinc-800 transition-all hover:shadow-lg hover:-translate-y-0.5"
              >
                Start for free
                <ArrowRight size={16} />
              </a>
              <a
                href="#how-it-works"
                className="w-full sm:w-auto inline-flex justify-center items-center gap-2 px-8 py-4 bg-white text-zinc-900 border border-zinc-200 rounded-full text-sm font-medium hover:bg-zinc-50 transition-all"
              >
                Explore features
              </a>
            </div>
          </div>

          {/* Right: Glassmorphism Dashboard Preview */}
          <div className="flex-1 w-full flex justify-center lg:justify-end relative mt-10 lg:mt-0">
            
            {/* Main glass card */}
            <div className="w-full max-w-md bg-white/60 backdrop-blur-xl border border-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-3xl p-6 relative z-10">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <p className="text-xs text-zinc-400 font-semibold uppercase tracking-wider mb-1">Current Plan</p>
                  <p className="text-base font-bold text-zinc-900">Upper Respiratory</p>
                </div>
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              </div>

              <div className="space-y-4">
                {[
                  { name: "Azithromycin 500mg", generic: "Antibiotic", dose: "Morning", icon: "#4F46E5" },
                  { name: "Paracetamol 500mg", generic: "Analgesic", dose: "As needed", icon: "#059669" },
                  { name: "Cetirizine 10mg", generic: "Antihistamine", dose: "Night", icon: "#7C3AED" },
                ].map((med, i) => (
                  <div key={i} className="flex items-center gap-4 p-3 rounded-2xl hover:bg-white/50 transition-colors border border-transparent hover:border-zinc-100">
                    <div className="w-10 h-10 rounded-xl bg-white shadow-sm border border-zinc-100 flex items-center justify-center shrink-0">
                      <Pill size={16} style={{ color: med.icon }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-zinc-900 truncate">{med.name}</p>
                      <p className="text-xs text-zinc-500">{med.generic}</p>
                    </div>
                    <span className="text-xs font-medium bg-zinc-100 text-zinc-600 px-2.5 py-1 rounded-md shrink-0">
                      {med.dose}
                    </span>
                  </div>
                ))}
              </div>

              <button className="w-full mt-6 bg-zinc-900 text-white py-3 rounded-xl text-sm font-medium hover:bg-zinc-800 transition-colors">
                Locate Nearby Pharmacies
              </button>
            </div>

            {/* Floating widget 1: Pharmacy */}
            <div className="absolute left-0 sm:-left-6 -bottom-4 sm:-bottom-6 bg-white/90 backdrop-blur-xl border border-zinc-100 shadow-[0_8px_25px_rgb(0,0,0,0.08)] rounded-2xl p-4 flex items-center gap-3 z-20 hover:-translate-y-1 transition-transform cursor-default">
              <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">
                <MapPin size={16} className="text-emerald-600" />
              </div>
              <div>
                <p className="text-sm font-bold text-zinc-900">MedPlus Pharmacy</p>
                <p className="text-xs text-zinc-500 font-medium">320m away · <span className="text-emerald-600">In Stock</span></p>
              </div>
            </div>

            {/* Floating widget 2: Reminder */}
            <div className="absolute right-0 sm:-right-6 -top-4 sm:-top-6 bg-white/90 backdrop-blur-xl border border-zinc-100 shadow-[0_8px_25px_rgb(0,0,0,0.08)] rounded-2xl p-4 flex items-center gap-3 z-20 hover:-translate-y-1 transition-transform cursor-default">
              <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center shrink-0">
                <AlarmClock size={16} className="text-indigo-600" />
              </div>
              <div>
                <p className="text-sm font-bold text-zinc-900">Dose Reminder</p>
                <p className="text-xs text-zinc-500 font-medium">8:00 AM · Azithromycin</p>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ── Features ───────────────────────────────────────────── */}
      <section id="features" className="py-24 bg-white relative">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-16">
            <div className="max-w-2xl">
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-zinc-900 mb-4">
                Everything you need to manage your health.
              </h2>
              <p className="text-lg text-zinc-500 leading-relaxed">
                We've rebuilt the pharmacy experience from the ground up to be seamless, intelligent, and designed entirely around you.
              </p>
            </div>
            <a href="#how-it-works" className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-600 hover:text-indigo-700 transition-colors">
              See how it works <ArrowRight size={16} />
            </a>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map(({ icon: Icon, title, description, accent, bg }) => (
              <div
                key={title}
                className="group p-8 rounded-3xl bg-[#FAFAFA] border border-zinc-100 hover:bg-white hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] hover:border-zinc-200 transition-all duration-300"
              >
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center mb-6 transition-transform group-hover:scale-110"
                  style={{ backgroundColor: bg, color: accent }}
                >
                  <Icon size={22} strokeWidth={2} />
                </div>
                <h3 className="text-lg font-bold text-zinc-900 mb-3">{title}</h3>
                <p className="text-sm text-zinc-500 leading-relaxed">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ───────────────────────────────────────── */}
      <section id="how-it-works" className="py-24 bg-zinc-900 text-white">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-20">
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
              Simplicity at its core.
            </h2>
            <p className="text-zinc-400 text-lg">Three steps to a frictionless healthcare experience.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 relative">
            {/* Desktop Connector Line */}
            <div className="hidden md:block absolute top-6 left-[20%] right-[20%] h-[1px] bg-gradient-to-r from-zinc-800 via-zinc-600 to-zinc-800" />

            {STEPS.map(({ num, title, description }) => (
              <div key={num} className="relative flex flex-col items-center text-center group">
                <div className="w-12 h-12 rounded-full bg-zinc-800 border-4 border-zinc-900 flex items-center justify-center mb-6 relative z-10 group-hover:bg-indigo-500 transition-colors duration-500">
                  <span className="text-sm font-bold text-white">{num}</span>
                </div>
                <h3 className="text-lg font-bold mb-3">{title}</h3>
                <p className="text-sm text-zinc-400 leading-relaxed max-w-xs">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Big CTA banner ─────────────────────────────────────── */}
      <section className="py-32 relative bg-white overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-50 via-white to-white opacity-70 pointer-events-none" />
        
        <div className="relative max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-4xl md:text-5xl font-bold tracking-tighter text-zinc-900 mb-6">
            Ready to take control?
          </h2>
          <p className="text-lg text-zinc-500 leading-relaxed mb-10 max-w-xl mx-auto">
            Join thousands of patients managing their prescriptions, finding medicines, and staying healthy with AuraMed.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="/login"
              className="w-full sm:w-auto inline-flex justify-center items-center gap-2 px-8 py-4 bg-zinc-900 text-white rounded-full text-sm font-medium hover:bg-zinc-800 transition-all hover:shadow-lg"
            >
              Get Started for Free
              <ArrowRight size={16} />
            </a>
            <a
              href="/contact"
              className="w-full sm:w-auto inline-flex justify-center items-center gap-2 px-8 py-4 bg-transparent text-zinc-900 border border-zinc-200 rounded-full text-sm font-medium hover:bg-zinc-50 transition-all"
            >
              Contact Sales
            </a>
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <footer className="bg-white border-t border-zinc-200 py-12">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-zinc-900 flex items-center justify-center shrink-0">
              <HeartPulse size={14} className="text-white" />
            </div>
            <span className="text-[15px] font-bold text-zinc-900 tracking-tight">AuraMed</span>
          </div>
          
          <p className="text-sm text-zinc-500 font-medium">
            © {new Date().getFullYear()} AuraMed. All rights reserved.
          </p>
          
          <div className="flex items-center gap-6">
            {["Privacy Policy", "Terms of Service", "Twitter", "GitHub"].map((link) => (
              <a
                key={link}
                href="#"
                className="text-sm font-medium text-zinc-400 hover:text-zinc-900 transition-colors"
              >
                {link}
              </a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}