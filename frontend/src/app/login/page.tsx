"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Mail, Lock, User, Eye, EyeOff, Check, X, Loader2, AlertCircle,
  HeartPulse, ShieldCheck, Clock, Sparkles, FastForward,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";

type Mode = "signin" | "signup";

// Mirrors the backend password policy in app/api/auth.py
const PASSWORD_RULES = [
  { label: "At least 8 characters", test: (p: string) => p.length >= 8 },
  { label: "One uppercase letter", test: (p: string) => /[A-Z]/.test(p) },
  { label: "One lowercase letter", test: (p: string) => /[a-z]/.test(p) },
  { label: "One number", test: (p: string) => /[0-9]/.test(p) },
  { label: "One special character", test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

export default function LoginPage() {
  const router = useRouter();
  const { login, register, loginAsGuest, token, ready } = useAuth();

  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Already signed in → go to dashboard
  useEffect(() => {
    if (ready && token) router.replace("/dashboard");
  }, [ready, token, router]);

  const passwordChecks = useMemo(
    () => PASSWORD_RULES.map((r) => ({ label: r.label, ok: r.test(password) })),
    [password]
  );
  const passwordValid = passwordChecks.every((c) => c.ok);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setPassword("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === "signup") {
      if (name.trim().length < 2) return setError("Please enter your full name.");
      if (!passwordValid) return setError("Please meet all password requirements.");
    }

    setSubmitting(true);
    try {
      if (mode === "signin") {
        await login(email.trim(), password);
      } else {
        await register(name.trim(), email.trim(), password);
      }
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? cleanError(err.message) : "Something went wrong.");
      setSubmitting(false);
    }
  };

  // placeholder — skip auth and enter the dashboard with a fake account
  const handleBypass = useCallback(() => {
    loginAsGuest();
    router.push("/dashboard");
  }, [loginAsGuest, router]);

  return (
    <div className="relative min-h-screen w-full flex bg-[#EDF1F9]">
      {/* placeholder — dev bypass: small square, top-right corner */}
      <button
        type="button"
        onClick={handleBypass}
        title="Skip login (dev) — enter with a placeholder account"
        aria-label="Skip login and enter dashboard"
        className="absolute top-4 right-4 z-50 w-9 h-9 rounded-lg bg-white/80 backdrop-blur border border-[#D8E0F0] text-[#6A7898] flex items-center justify-center shadow-sm hover:bg-white hover:text-[#4D8ED6] hover:border-[#4D8ED6] transition-colors"
      >
        <FastForward size={16} />
      </button>
      {/* ── Left brand panel (showcase) ── */}
      <aside className="hidden lg:flex w-[44%] max-w-[620px] relative overflow-hidden flex-col justify-between p-12 text-white">
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(150deg, #3A78C4 0%, #4D8ED6 45%, #5AA6E8 100%)" }}
        />
        {/* soft glows */}
        <div className="absolute -top-24 -left-24 w-80 h-80 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute bottom-[-6rem] right-[-4rem] w-96 h-96 rounded-full bg-[#2E5FA8]/30 blur-3xl" />

        {/* Logo */}
        <div className="relative flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center">
            <HeartPulse size={20} className="text-white" />
          </div>
          <span className="text-[19px] font-semibold tracking-tight">AuraMed</span>
        </div>

        {/* Hero copy */}
        <div className="relative">
          <p className="text-[13px] font-medium text-white/70 mb-3 flex items-center gap-2">
            <Sparkles size={14} /> Care that feels personal
          </p>
          <h1 className="font-display text-[40px] leading-[1.1] font-semibold tracking-tight">
            Your health,
            <br />
            <span className="italic text-white/95">beautifully cared for.</span>
          </h1>
          <p className="text-[14px] text-white/80 mt-5 max-w-[380px] leading-relaxed">
            Find medicines and nearby pharmacies, track prescriptions, and stay on top of your
            care — all in one calm, trusted place.
          </p>
        </div>

        {/* Trust points */}
        <div className="relative flex flex-col gap-3.5">
          {[
            { icon: ShieldCheck, text: "Verified pharmacy partners & secure data" },
            { icon: Clock, text: "Same-day delivery and timely reminders" },
            { icon: HeartPulse, text: "Built around patients, not paperwork" },
          ].map(({ icon: Icon, text }) => (
            <div key={text} className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center shrink-0">
                <Icon size={15} className="text-white" />
              </div>
              <span className="text-[13px] text-white/85">{text}</span>
            </div>
          ))}
        </div>
      </aside>

      {/* ── Right form ── */}
      <main className="flex-1 flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-[420px]">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2.5 mb-8 justify-center">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#5AA6E8] to-[#3A78C4] flex items-center justify-center">
              <HeartPulse size={20} className="text-white" />
            </div>
            <span className="text-[19px] font-semibold text-[#1B2A4A] tracking-tight">AuraMed</span>
          </div>

          {/* Heading */}
          <div className="mb-6">
            <h2 className="font-display text-[26px] font-semibold text-[#1B2A4A] tracking-tight">
              {mode === "signin" ? "Welcome back" : "Create your account"}
            </h2>
            <p className="text-[13px] text-[#6A7898] mt-1.5">
              {mode === "signin"
                ? "Sign in to continue to your dashboard."
                : "Join AuraMed and take charge of your care."}
            </p>
          </div>

          {/* Mode toggle */}
          <div className="flex bg-[#F3F5FB] border border-[#E6ECF7] rounded-2xl p-1 mb-6">
            {(["signin", "signup"] as const).map((m) => (
              <button
                type="button"
                key={m}
                onClick={() => switchMode(m)}
                className={`flex-1 py-2 rounded-xl text-[13px] font-semibold transition-all ${
                  mode === m ? "bg-white text-[#4D8ED6] shadow-sm" : "text-[#6A7898] hover:text-[#1B2A4A]"
                }`}
              >
                {m === "signin" ? "Sign In" : "Create Account"}
              </button>
            ))}
          </div>

          {/* Error banner */}
          {error && (
            <div className="mb-4 flex items-start gap-2 rounded-xl bg-[#FDEAEA] border border-[#F5C9C9] px-3.5 py-2.5">
              <AlertCircle size={15} className="text-[#D94F4F] mt-0.5 shrink-0" />
              <p className="text-[12.5px] text-[#C0392B]">{error}</p>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
            {mode === "signup" && (
              <Field
                icon={User}
                type="text"
                placeholder="Full name"
                value={name}
                onChange={setName}
                autoComplete="name"
              />
            )}

            <Field
              icon={Mail}
              type="email"
              placeholder="Email address"
              value={email}
              onChange={setEmail}
              autoComplete="email"
              required
            />

            <div>
              <div className="relative">
                <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9DAABF] pointer-events-none z-10" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  required
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  className="w-full h-11 pl-10 pr-11 bg-[#F3F5FB] border border-[#D8E0F0] rounded-xl text-[13px] text-[#1B2A4A] placeholder:text-[#9DAABF] focus:outline-none focus:border-[#4D8ED6] focus:bg-white focus:shadow-[0_0_0_3px_rgba(77,142,214,0.12)] transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg flex items-center justify-center text-[#9DAABF] hover:text-[#6A7898] hover:bg-[#EAF2FF] transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>

              {/* Live password checklist (signup only) */}
              {mode === "signup" && password.length > 0 && (
                <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5">
                  {passwordChecks.map((c) => (
                    <div key={c.label} className="flex items-center gap-1.5">
                      <span
                        className={`w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0 ${
                          c.ok ? "bg-[#E6F7F0] text-[#22A06B]" : "bg-[#F3F5FB] text-[#C8D0E0]"
                        }`}
                      >
                        {c.ok ? <Check size={9} strokeWidth={3} /> : <X size={9} strokeWidth={3} />}
                      </span>
                      <span className={`text-[11px] ${c.ok ? "text-[#22A06B]" : "text-[#9DAABF]"}`}>
                        {c.label}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {mode === "signin" && (
              <div className="flex justify-end -mt-1">
                <button type="button" className="text-[12px] font-medium text-[#4D8ED6] hover:underline">
                  Forgot password?
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="aura-btn-primary w-full h-11 text-[14px] font-semibold flex items-center justify-center gap-2 mt-1 disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none"
            >
              {submitting && <Loader2 size={15} className="animate-spin" />}
              {submitting
                ? "Please wait…"
                : mode === "signin"
                ? "Sign In"
                : "Create Account"}
            </button>
          </form>

          {/* Footer switch */}
          <p className="text-center text-[12.5px] text-[#6A7898] mt-6">
            {mode === "signin" ? "New to AuraMed? " : "Already have an account? "}
            <button
              onClick={() => switchMode(mode === "signin" ? "signup" : "signin")}
              className="font-semibold text-[#4D8ED6] hover:underline"
            >
              {mode === "signin" ? "Create an account" : "Sign in"}
            </button>
          </p>
        </div>
      </main>
    </div>
  );
}

// ── Reusable input field ──
function Field({
  icon: Icon,
  type,
  placeholder,
  value,
  onChange,
  autoComplete,
  required,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  type: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  required?: boolean;
}) {
  return (
    <div className="relative">
      <Icon size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9DAABF] pointer-events-none z-10" />
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        className="w-full h-11 pl-10 pr-4 bg-[#F3F5FB] border border-[#D8E0F0] rounded-xl text-[13px] text-[#1B2A4A] placeholder:text-[#9DAABF] focus:outline-none focus:border-[#4D8ED6] focus:bg-white focus:shadow-[0_0_0_3px_rgba(77,142,214,0.12)] transition-all"
      />
    </div>
  );
}

// Strip FastAPI's `{"detail":"..."}` wrapper if present
function cleanError(msg: string): string {
  try {
    const parsed = JSON.parse(msg);
    if (parsed?.detail) return String(parsed.detail);
  } catch {
    // not JSON
  }
  return msg;
}
