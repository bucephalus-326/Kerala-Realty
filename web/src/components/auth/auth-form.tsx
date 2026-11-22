"use client";

import clsx from "clsx";
import { Briefcase, Eye, EyeOff, Globe2, Home, KeyRound, Loader2, UserRound } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { type RegisterInput, usePrefs } from "../providers";
import { buttonClass } from "../ui/primitives";

const ROLES: { value: RegisterInput["role"]; title: string; body: string; icon: React.ElementType }[] = [
  { value: "buyer", title: "Buyer / Renter", body: "Save homes, book visits", icon: UserRound },
  { value: "nri", title: "NRI Buyer", body: "Concierge, video tours, your currency", icon: Globe2 },
  { value: "owner", title: "Property Owner", body: "List and manage your property", icon: Home },
  { value: "agent", title: "Agent / Builder", body: "Listings, leads and projects", icon: Briefcase },
];

/** Demo accounts seeded by the API outside production. */
const DEMO = [
  { label: "Buyer", email: "buyer@example.com" },
  { label: "NRI", email: "nri@example.com" },
  { label: "Owner", email: "owner@example.com" },
  { label: "Agent", email: "agent@example.com" },
  { label: "Admin", email: "admin@example.com" },
];
const DEMO_PASSWORD = "demo-pass-2026";
/**
 * Demo buttons: always in development. In a production build only when
 * NEXT_PUBLIC_SHOW_DEMO_ACCOUNTS is "true" (no admin; the API never creates a
 * demo admin in production) or "all" (local production test runs).
 */
const DEMO_MODE = process.env.NODE_ENV === "development" ? "all" : process.env.NEXT_PUBLIC_SHOW_DEMO_ACCOUNTS;
const SHOW_DEMO = DEMO_MODE === "true" || DEMO_MODE === "all";
const DEMO_SHOWN = DEMO.filter((d) => DEMO_MODE === "all" || !d.email.startsWith("admin@"));

export function AuthForm() {
  const params = useSearchParams();
  const router = useRouter();
  const { signIn, register, session, authLoading } = usePrefs();
  const [mode, setMode] = useState<"signin" | "register">(params.get("mode") === "register" ? "register" : "signin");
  const [role, setRole] = useState<RegisterInput["role"]>((params.get("role") as RegisterInput["role"]) ?? "buyer");
  const [form, setForm] = useState({ name: "", email: "", password: "", phone: "", company: "", country: "" });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string[]>>({});

  const next = params.get("next")?.startsWith("/") ? params.get("next")! : "/account";

  useEffect(() => {
    if (!authLoading && session) router.replace(next);
  }, [authLoading, session, next, router]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e?: React.FormEvent, demoEmail?: string) => {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});
    try {
      if (demoEmail) await signIn(demoEmail, DEMO_PASSWORD);
      else if (mode === "signin") await signIn(form.email, form.password);
      else
        await register({
          name: form.name,
          email: form.email,
          password: form.password,
          role,
          phone: form.phone || undefined,
          company: form.company || undefined,
          country: form.country || undefined,
        });
      router.replace(next);
    } catch (err) {
      const e = err as ApiError;
      setError(e.message);
      setFields(e.fields ?? {});
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[460px]">
      <div className="glass rounded-3xl p-6 shadow-float md:p-8">
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          {mode === "signin" ? "Welcome back" : "Create your account"}
        </h1>
        <p className="mt-1 text-sm text-ink-3">
          {mode === "signin" ? "Sign in to see your saved homes and visits." : "Free. Takes under a minute."}
        </p>

        <div className="mt-5 grid grid-cols-2 rounded-xl bg-muted p-1" role="tablist">
          {(["signin", "register"] as const).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              onClick={() => {
                setMode(m);
                setError(null);
                setFields({});
              }}
              className={clsx("rounded-lg py-2 text-sm font-semibold transition", mode === m ? "bg-surface-strong text-ink shadow-card" : "text-ink-3")}
            >
              {m === "signin" ? "Sign in" : "Register"}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="mt-5 space-y-4" noValidate>
          {mode === "register" && (
            <fieldset>
              <legend className="mb-2 text-[13px] font-medium text-ink-2">I am a…</legend>
              <div className="grid grid-cols-2 gap-2">
                {ROLES.map(({ value, title, body, icon: I }) => (
                  <label
                    key={value}
                    className={clsx(
                      "flex cursor-pointer flex-col gap-1 rounded-xl border p-3 transition",
                      role === value ? "border-brand bg-brand-soft" : "border-line hover:border-line-strong",
                    )}
                  >
                    <input type="radio" name="role" value={value} checked={role === value} onChange={() => setRole(value)} className="sr-only" />
                    <I className={clsx("h-5 w-5", role === value ? "text-brand" : "text-ink-3")} />
                    <span className="text-[13px] font-semibold">{title}</span>
                    <span className="text-[11.5px] leading-snug text-ink-3">{body}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {mode === "register" && <Input label="Full name" value={form.name} onChange={set("name")} autoComplete="name" error={fields.name} />}
          <Input label="Email" type="email" value={form.email} onChange={set("email")} autoComplete="email" error={fields.email} />
          <div className="relative">
            <Input
              label="Password"
              type={show ? "text" : "password"}
              value={form.password}
              onChange={set("password")}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              hint={mode === "register" ? "At least 8 characters" : undefined}
              error={fields.password}
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              className="absolute right-3 top-[34px] text-ink-3 hover:text-ink"
              aria-label={show ? "Hide password" : "Show password"}
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {mode === "register" && (
            <>
              <Input label="Phone with country code" placeholder="+971 50 123 4567" value={form.phone} onChange={set("phone")} autoComplete="tel" error={fields.phone} optional />
              {role === "nri" && <Input label="Country you live in" placeholder="UAE" value={form.country} onChange={set("country")} autoComplete="country-name" optional />}
              {role === "agent" && <Input label="Agency or company" value={form.company} onChange={set("company")} autoComplete="organization" optional />}
              {(role === "owner" || role === "agent") && (
                <p className="rounded-xl bg-gold-soft px-3 py-2 text-xs text-ink-2">
                  Owner and agent profiles are verified by our team before listings go live.
                </p>
              )}
            </>
          )}

          {error && (
            <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}

          <button type="submit" disabled={busy} className={clsx(buttonClass("primary", "lg"), "w-full")}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>
      </div>

      {SHOW_DEMO && (
        <div className="mt-4 rounded-2xl border border-dashed border-line-strong p-4">
          <p className="flex items-center gap-2 text-[13px] font-medium text-ink-2">
            <KeyRound className="h-4 w-4 text-gold" /> Demo accounts: one click to try each role
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {DEMO_SHOWN.map((d) => (
              <button key={d.email} disabled={busy} onClick={() => submit(undefined, d.email)} className={buttonClass("outline", "sm")}>
                {d.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Input({
  label,
  error,
  hint,
  optional,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string[]; hint?: string; optional?: boolean }) {
  const id = label.toLowerCase().replace(/\W+/g, "-");
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 flex items-baseline justify-between text-[13px] font-medium text-ink-2">
        {label}
        {optional && <span className="text-[11px] font-normal text-ink-3">Optional</span>}
      </label>
      <input
        id={id}
        {...props}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-err` : undefined}
        className={clsx(
          "h-11 w-full rounded-xl border bg-transparent px-3 text-[15px] text-ink outline-none transition placeholder:text-ink-3 focus:border-brand focus:ring-2 focus:ring-brand/20",
          error ? "border-danger" : "border-line-strong",
        )}
      />
      {error ? (
        <p id={`${id}-err`} className="mt-1 text-xs text-danger">
          {error[0]}
        </p>
      ) : (
        hint && <p className="mt-1 text-xs text-ink-3">{hint}</p>
      )}
    </div>
  );
}
