"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Mail, Lock, User, Eye, EyeOff, Check, Loader2, AlertCircle,
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
    <div className="relative min-h-screen w-full flex bg-white font-sans text-zinc-900 selection:bg-zinc-200">
      
      {/* Dev Bypass Button */}
      <button
        type="button"
        onClick={handleBypass}
        title="Skip login (dev) — enter with a placeholder account"
        aria-label="Skip login and enter dashboard"
        className="absolute top-6 right-6 z-50 w-10 h-10 rounded-full bg-white border border-zinc-200 text-zinc-500 flex items-center justify-center shadow-sm hover:bg-zinc-50 hover:text-zinc-900 transition-all active:scale-95"
      >
        <FastForward size={16} />
      </button>

      {/* ── Left brand panel (showcase) ── */}
      <aside className="hidden lg:flex w-1/2 relative overflow-hidden flex-col justify-between p-16 bg-zinc-950 text-white">
        {/* Modern minimal background effect */}
        <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_top_left,var(--tw-gradient-stops))] from-zinc-700 via-zinc-950 to-zinc-950 pointer-events-none" />
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-indigo-500/10 blur-[100px] pointer-events-none" />
        <div className="absolute top-1/2 -right-32 w-96 h-96 rounded-full bg-emerald-500/10 blur-[100px] pointer-events-none" />

        {/* Logo */}
        <div className="relative flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shrink-0">
            <HeartPulse size={20} className="text-zinc-950" />
          </div>
          <span className="text-xl font-bold tracking-tight">AuraMed</span>
        </div>

        {/* Hero copy */}
        <div className="relative z-10 max-w-md">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-white/10 mb-6 backdrop-blur-md">
            <Sparkles size={14} className="text-indigo-400" />
            <span className="text-xs font-medium tracking-wide text-zinc-200 uppercase">Care that feels personal</span>
          </div>
          
          <h1 className="text-4xl leading-[1.15] font-bold tracking-tight text-white mb-6">
            Your health,
            <br />
            <span className="text-zinc-400 font-light">beautifully cared for.</span>
          </h1>
          
          <p className="text-base text-zinc-400 leading-relaxed">
            Find medicines and nearby pharmacies, track prescriptions, and stay on top of your
            care — all in one calm, trusted place.
          </p>
        </div>

        {/* Trust points */}
        <div className="relative z-10 flex flex-col gap-5">
          {[
            { icon: ShieldCheck, text: "Verified pharmacy partners & secure data" },
            { icon: Clock, text: "Same-day delivery and timely reminders" },
            { icon: HeartPulse, text: "Built around patients, not paperwork" },
          ].map(({ icon: Icon, text }) => (
            <div key={text} className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                <Icon size={18} className="text-zinc-300" />
              </div>
              <span className="text-sm font-medium text-zinc-300">{text}</span>
            </div>
          ))}
        </div>
      </aside>

      {/* ── Right form ── */}
      <main className="flex-1 flex items-center justify-center p-6 sm:p-12 relative">
        <div className="w-full max-w-105">
          
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2.5 mb-10">
            <div className="w-10 h-10 rounded-full bg-zinc-900 flex items-center justify-center shrink-0">
              <HeartPulse size={20} className="text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight text-zinc-900">AuraMed</span>
          </div>

          {/* Heading */}
          <div className="mb-8">
            <h2 className="text-3xl font-bold tracking-tight text-zinc-900 mb-2">
              {mode === "signin" ? "Welcome back" : "Create an account"}
            </h2>
            <p className="text-sm text-zinc-500">
              {mode === "signin"
                ? "Enter your credentials to access your dashboard."
                : "Join AuraMed and take charge of your care."}
            </p>
          </div>

          {/* Mode toggle (Modern Pill) */}
          <div className="flex bg-zinc-100/80 p-1 rounded-xl mb-8">
            {(["signin", "signup"] as const).map((m) => (
              <button
                type="button"
                key={m}
                onClick={() => switchMode(m)}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                  mode === m 
                    ? "bg-white text-zinc-900 shadow-[0_1px_4px_rgba(0,0,0,0.05)]" 
                    : "text-zinc-500 hover:text-zinc-700"
                }`}
              >
                {m === "signin" ? "Sign In" : "Sign Up"}
              </button>
            ))}
          </div>

          {/* Error banner */}
          {error && (
            <div className="mb-6 flex items-start gap-3 rounded-xl bg-red-50 border border-red-100 p-4 animate-in fade-in slide-in-from-top-2">
              <AlertCircle size={18} className="text-red-600 shrink-0 mt-0.5" />
              <p className="text-sm text-red-600 font-medium leading-relaxed">{error}</p>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
              <div className="relative group">
                <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none z-10 group-focus-within:text-zinc-900 transition-colors" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  required
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  className="w-full h-12 pl-11 pr-12 bg-zinc-50 border border-zinc-200 rounded-xl text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-900 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              {/* Live password checklist (signup only) */}
              {mode === "signup" && password.length > 0 && (
                <div className="mt-4 p-4 rounded-xl border border-zinc-100 bg-zinc-50/50 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {passwordChecks.map((c) => (
                    <div key={c.label} className="flex items-center gap-2.5">
                      <div
                        className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                          c.ok ? "bg-emerald-500 text-white" : "bg-zinc-200 text-transparent"
                        }`}
                      >
                        <Check size={10} strokeWidth={3} />
                      </div>
                      <span className={`text-xs font-medium transition-colors ${c.ok ? "text-zinc-900" : "text-zinc-500"}`}>
                        {c.label}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {mode === "signin" && (
              <div className="flex justify-end pt-1">
                <button type="button" className="text-sm font-medium text-zinc-500 hover:text-zinc-900 transition-colors">
                  Forgot password?
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full h-12 mt-4 bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-semibold rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed disabled:transform-none shadow-sm"
            >
              {submitting && <Loader2 size={16} className="animate-spin" />}
              {submitting
                ? "Please wait…"
                : mode === "signin"
                ? "Sign In"
                : "Create Account"}
            </button>
          </form>

          {/* Footer switch */}
          <p className="text-center text-sm text-zinc-500 mt-8">
            {mode === "signin" ? "New to AuraMed? " : "Already have an account? "}
            <button
              type="button"
              onClick={() => switchMode(mode === "signin" ? "signup" : "signin")}
              className="font-semibold text-zinc-900 hover:underline decoration-zinc-300 underline-offset-4 transition-all"
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
    <div className="relative group">
      <Icon size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none z-10 group-focus-within:text-zinc-900 transition-colors" />
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        className="w-full h-12 pl-11 pr-4 bg-zinc-50 border border-zinc-200 rounded-xl text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-900 transition-all"
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