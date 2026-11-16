"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ScanLine, MapPin, Bell, CalendarDays, Search, MessageSquareText } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

const FEATURES = [
  { icon: Search, title: "Search like a pharmacist", text: "Brand, generic or just the symptom. Leaflet details for every medicine sold in Bangladesh." },
  { icon: ScanLine, title: "Scan the prescription", text: "Photograph it, correct what the OCR got wrong, and keep a clean digital copy." },
  { icon: Bell, title: "Dose reminders by email", text: "One email before each dose, built straight from the 1+0+1 on your prescription." },
  { icon: MapPin, title: "Find stock nearby", text: "See which pharmacy has everything, or the shortest route if none does." },
  { icon: CalendarDays, title: "Book a doctor", text: "Open slots at nearby hospitals, booked in one tap and easy to cancel." },
  { icon: MessageSquareText, title: "Ask the leaflet", text: "A careful assistant that answers only from official drug leaflets." },
];

export default function Landing() {
  const { ready, token } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (ready && token) router.replace("/dashboard");
  }, [ready, token, router]);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="h-14 flex items-center justify-between px-5 sm:px-8 max-w-6xl w-full mx-auto">
        <span className="flex items-center gap-2.5">
          <span className="w-7 h-7 rounded-md bg-green text-paper grid place-items-center font-display">℞</span>
          <span className="font-display text-lg">AuraMed</span>
        </span>
        <nav className="flex items-center gap-2 text-sm">
          <a href="#features" className="btn-ghost h-9 hidden sm:inline-flex">Features</a>
          <Link href="/login" className="btn-ghost h-9">Sign in</Link>
          <Link href="/login?mode=signup" className="btn-primary h-9">Create account</Link>
        </nav>
      </header>

      <main className="flex-1">
        <section className="max-w-6xl mx-auto px-5 sm:px-8 pt-14 pb-16 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <p className="eyebrow">For patients in Bangladesh</p>
            <h1 className="text-5xl sm:text-6xl leading-[1.02] mt-3">
              Your prescriptions,<br />
              <span className="italic text-green">kept properly.</span>
            </h1>
            <p className="mt-6 text-lg text-ink-2 max-w-md leading-relaxed">
              Scan the paper, get reminded for every dose, find the pharmacy that actually has your medicine, and read the real leaflet instead of guessing.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/login?mode=signup" className="btn-primary h-11 px-5">Get started <ArrowRight size={16} /></Link>
              <Link href="/login" className="btn-outline h-11 px-5">I have an account</Link>
            </div>
          </div>

          {/* static paper, dashboard er 3d version er chhoto preview */}
          <div className="rx-stage mx-auto w-full max-w-[380px] aspect-[3/4]">
            <div className="rx-behind" style={{ transform: "rotate(3deg) translate(10px,10px) scale(.97)" }} />
            <div className="rx-sheet rx-idle absolute inset-0 bg-[#fffdf7] border border-line rounded-md p-6 flex flex-col">
              <div className="border-b-2 border-ink/80 pb-2.5">
                <div className="font-display text-[17px]">Dr. Farhana Rahman</div>
                <div className="text-[10.5px] text-ink-2">MBBS, FCPS (Medicine)</div>
              </div>
              <div className="relative flex-1 mt-2 rx-ruled">
                <div className="absolute -left-1 -top-1 font-display italic text-[44px] leading-none text-rx/80">℞</div>
                <ol className="pt-10 space-y-1.5 pl-5">
                  {[
                    ["Tab Napa 500 mg", "1 + 0 + 1", "after food · 5 days"],
                    ["Cap Seclo 20 mg", "1 + 0 + 0", "before food · 14 days"],
                    ["Tab Fexo 120 mg", "0 + 0 + 1", "7 days"],
                  ].map(([n, d, s]) => (
                    <li key={n} className="leading-[28px]">
                      <div className="flex justify-between"><span className="font-hand text-[19px]">{n}</span><span className="num text-[13px]">{d}</span></div>
                      <div className="text-[10px] text-ink-3 -mt-2 leading-[20px]">{s}</div>
                    </li>
                  ))}
                </ol>
              </div>
              <div className="flex justify-end pt-2">
                <div className="text-right">
                  <div className="rx-sign text-[22px] text-green -mb-1 pr-3">Farhana</div>
                  <div className="border-t border-ink/60 w-28 text-[9px] text-ink-3 pt-0.5 text-center">signature</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="border-t border-line bg-sheet">
          <div className="max-w-6xl mx-auto px-5 sm:px-8 py-16">
            <h2 className="text-3xl">Everything after the doctor&apos;s visit</h2>
            <ul className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-8">
              {FEATURES.map(({ icon: Icon, title, text }) => (
                <li key={title} className="flex gap-3">
                  <span className="w-9 h-9 rounded-md bg-green-soft text-green grid place-items-center shrink-0"><Icon size={17} /></span>
                  <div>
                    <h3 className="font-sans font-medium text-base">{title}</h3>
                    <p className="text-sm text-ink-2 mt-1 leading-relaxed">{text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <footer className="border-t border-line text-xs text-ink-3 px-5 sm:px-8 h-12 flex items-center justify-between max-w-6xl w-full mx-auto">
        <span>AuraMed</span>
        <span>Information only. Not a substitute for a doctor or pharmacist.</span>
      </footer>
    </div>
  );
}
