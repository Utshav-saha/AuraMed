"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Check, Loader2, AlertCircle } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

type Mode = "signin" | "signup";

// app/api/auth.py er rule gulo
const RULES = [
  { label: "8+ characters", test: (p: string) => p.length >= 8 },
  { label: "uppercase", test: (p: string) => /[A-Z]/.test(p) },
  { label: "lowercase", test: (p: string) => /[a-z]/.test(p) },
  { label: "number", test: (p: string) => /[0-9]/.test(p) },
  { label: "symbol", test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <Login />
    </Suspense>
  );
}

function Login() {
  const router = useRouter();
  const params = useSearchParams();
  const { login, register, token, ready } = useAuth();
  const [mode, setMode] = useState<Mode>(params.get("mode") === "signup" ? "signup" : "signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(params.get("expired") ? "Your session expired. Please sign in again." : null);

  useEffect(() => {
    if (ready && token) router.replace("/dashboard");
  }, [ready, token, router]);

  const checks = useMemo(() => RULES.map((r) => ({ label: r.label, ok: r.test(password) })), [password]);
  const strong = checks.every((c) => c.ok);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (mode === "signup" && name.trim().length < 2) return setError("Please enter your name.");
    if (mode === "signup" && !strong) return setError("Password doesn't meet the requirements yet.");
    setBusy(true);
    try {
      if (mode === "signin") await login(email.trim(), password);
      else await register(name.trim(), email.trim(), password);
      router.push("/dashboard");
    } catch (err) {
      setError((err as Error).message || "Something went wrong.");
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-[1fr_1fr]">
      <aside className="hidden lg:flex flex-col justify-between p-12 bg-ink text-paper paper-grid-dark">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="w-7 h-7 rounded-md bg-paper text-ink grid place-items-center font-display">℞</span>
          <span className="font-display text-lg">AuraMed</span>
        </Link>
        <div className="max-w-sm">
          <h1 className="text-4xl leading-tight text-paper">The paper stays on the fridge. The record lives here.</h1>
          <p className="mt-4 text-paper/70 leading-relaxed">Scan prescriptions, get dose reminders by email, find stock nearby, and book doctors.</p>
        </div>
        <p className="text-xs text-paper/50">Information only. Confirm with your doctor or pharmacist.</p>
      </aside>

      <main className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm">
          <Link href="/" className="lg:hidden flex items-center gap-2.5 mb-10">
            <span className="w-7 h-7 rounded-md bg-green text-paper grid place-items-center font-display">℞</span>
            <span className="font-display text-lg">AuraMed</span>
          </Link>

          <h2 className="text-3xl">{mode === "signin" ? "Welcome back" : "Create your account"}</h2>
          <p className="text-sm text-ink-2 mt-1">{mode === "signin" ? "Sign in to see your prescriptions." : "Reminders go to the email you sign up with."}</p>

          <div className="flex sheet p-0.5 mt-6 text-sm">
            {(["signin", "signup"] as const).map((m) => (
              <button key={m} type="button" onClick={() => { setMode(m); setError(null); }} className={`flex-1 h-8 rounded-md ${mode === m ? "bg-ink text-paper" : "text-ink-2"}`}>
                {m === "signin" ? "Sign in" : "Sign up"}
              </button>
            ))}
          </div>

          {error && (
            <div className="mt-4 flex items-start gap-2 text-sm text-rx bg-rx-soft rounded-md p-3">
              <AlertCircle size={16} className="shrink-0 mt-0.5" /> {error}
            </div>
          )}

          <form onSubmit={submit} className="mt-5 space-y-4">
            {mode === "signup" && (
              <label className="block">
                <span className="label">Full name</span>
                <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className="input h-11" />
              </label>
            )}
            <label className="block">
              <span className="label">Email</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required className="input h-11" />
            </label>
            <label className="block">
              <span className="label">Password</span>
              <div className="relative">
                <input type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete={mode === "signin" ? "current-password" : "new-password"} className="input h-11 pr-11" />
                <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-1.5 top-1.5 h-8 w-8 grid place-items-center text-ink-3 hover:text-ink" tabIndex={-1}>
                  {show ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {mode === "signup" && password.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                  {checks.map((c) => (
                    <li key={c.label} className={`flex items-center gap-1 ${c.ok ? "text-green" : "text-ink-3"}`}>
                      <Check size={11} strokeWidth={3} className={c.ok ? "" : "opacity-30"} /> {c.label}
                    </li>
                  ))}
                </ul>
              )}
            </label>
            <button type="submit" disabled={busy} className="btn-primary w-full h-11 mt-2">
              {busy && <Loader2 size={15} className="animate-spin" />}
              {mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
