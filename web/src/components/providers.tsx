"use client";

import { ThemeProvider } from "next-themes";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api, type Session, type User } from "@/lib/api";
import { currencyFromTimeZone, type Currency } from "@/lib/currency";

export type LandUnit = "cents" | "sqft";
export interface ConsentChoices {
  personalisation: boolean;
  location: boolean;
  analytics: boolean;
}
export const CONSENT_VERSION = "2026-11";

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
  role: "buyer" | "nri" | "owner" | "agent";
  phone?: string;
  company?: string;
  country?: string;
}

interface Prefs {
  currency: Currency;
  setCurrency: (c: Currency) => void;
  landUnit: LandUnit;
  setLandUnit: (u: LandUnit) => void;
  saved: Set<string>;
  toggleSaved: (id: string) => void;
  /** Currency suggested from the browser time zone; null when INR or unknown. */
  suggestedCurrency: Currency | null;
  timeZone: string | undefined;
  dismissSuggestion: () => void;

  session: Session | null;
  authLoading: boolean;
  can: (permission: string) => boolean;
  signIn: (email: string, password: string) => Promise<Session>;
  register: (input: RegisterInput) => Promise<Session>;
  signOut: () => Promise<void>;
  updateProfile: (patch: { name?: string; phone?: string; currency?: Currency; timeZone?: string; country?: string }) => Promise<void>;

  /** null until the visitor decides. */
  consent: ConsentChoices | null;
  setConsent: (c: ConsentChoices) => void;
  /** Show the consent banner again so the visitor can change or withdraw consent. */
  reopenConsent: () => void;
}

const PrefsContext = createContext<Prefs | null>(null);

function read<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try {
    if (value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: preferences just won't persist */
  }
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [currency, setCurrencyState] = useState<Currency>("INR");
  const [landUnit, setLandUnitState] = useState<LandUnit>("cents");
  const [localSaved, setLocalSaved] = useState<Set<string>>(new Set());
  const [suggestedCurrency, setSuggested] = useState<Currency | null>(null);
  const [timeZone, setTimeZone] = useState<string>();
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [consent, setConsentState] = useState<ConsentChoices | null>(null);
  const localSavedRef = useRef(localSaved);
  localSavedRef.current = localSaved;

  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    setTimeZone(tz);
    const chosen = read<Currency | null>("pref.currency", null);
    if (chosen) setCurrencyState(chosen);
    setLandUnitState(read<LandUnit>("pref.landUnit", "cents"));
    setLocalSaved(new Set(read<string[]>("pref.saved", [])));
    if (!chosen && !read<boolean>("pref.fxDismissed", false)) setSuggested(currencyFromTimeZone(tz));
    const c = read<{ version: string; choices: ConsentChoices } | null>("consent", null);
    if (c?.version === CONSENT_VERSION) setConsentState(c.choices);

    api<Session>("/auth/me")
      .then(applySession)
      .catch(() => setSession(null))
      .finally(() => setAuthLoading(false));
    // applySession is stable (defined below with useCallback and no deps).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applySession = useCallback((s: Session) => {
    setSession(s);
    // The account's saved currency wins once signed in.
    if (s.user.preferences?.currency) {
      setCurrencyState(s.user.preferences.currency);
      setSuggested(null);
    }
  }, []);

  const can = useCallback(
    (p: string) => !!session && (session.user.role === "admin" || session.permissions.includes(p)),
    [session],
  );
  const serverSaved = can("saved:manage");

  const setCurrency = useCallback(
    (c: Currency) => {
      setCurrencyState(c);
      setSuggested(null);
      write("pref.currency", c);
      if (session) api("/me", { method: "PATCH", body: { currency: c } }).catch(() => {});
    },
    [session],
  );

  const setLandUnit = useCallback((u: LandUnit) => {
    setLandUnitState(u);
    write("pref.landUnit", u);
  }, []);

  const saved = useMemo(
    () => (serverSaved && session ? new Set(session.user.saved) : localSaved),
    [serverSaved, session, localSaved],
  );

  const toggleSaved = useCallback(
    (id: string) => {
      if (serverSaved && session) {
        const has = session.user.saved.includes(id);
        const optimistic = has ? session.user.saved.filter((x) => x !== id) : [...session.user.saved, id];
        setSession({ ...session, user: { ...session.user, saved: optimistic } });
        api<{ ids: string[] }>(`/me/saved/${id}`, { method: has ? "DELETE" : "PUT" })
          .then(({ ids }) => setSession((s) => (s ? { ...s, user: { ...s.user, saved: ids } } : s)))
          .catch(() => setSession((s) => (s ? { ...s, user: { ...s.user, saved: session.user.saved } } : s)));
        return;
      }
      setLocalSaved((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        write("pref.saved", [...next]);
        return next;
      });
    },
    [serverSaved, session],
  );

  const dismissSuggestion = useCallback(() => {
    setSuggested(null);
    write("pref.fxDismissed", true);
  }, []);

  /** After sign-in, homes saved while signed out now live on the account. */
  const clearLocalSaved = () => {
    setLocalSaved(new Set());
    write("pref.saved", undefined);
  };

  const signIn = useCallback(
    async (email: string, password: string) => {
      const s = await api<Session>("/auth/login", {
        method: "POST",
        body: { email, password, saved: [...localSavedRef.current] },
      });
      applySession(s);
      clearLocalSaved();
      return s;
    },
    [applySession],
  );

  const register = useCallback(
    async (input: RegisterInput) => {
      const s = await api<Session>("/auth/register", {
        method: "POST",
        body: {
          ...input,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          currency: read<Currency | null>("pref.currency", null) ?? undefined,
          saved: [...localSavedRef.current],
        },
      });
      applySession(s);
      clearLocalSaved();
      return s;
    },
    [applySession],
  );

  const signOut = useCallback(async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => {});
    setSession(null);
  }, []);

  const updateProfile = useCallback<Prefs["updateProfile"]>(async (patch) => {
    const { user } = await api<{ user: User }>("/me", { method: "PATCH", body: patch });
    setSession((s) => (s ? { ...s, user } : s));
    if (patch.currency) {
      setCurrencyState(patch.currency);
      write("pref.currency", patch.currency);
    }
  }, []);

  const reopenConsent = useCallback(() => setConsentState(null), []);

  const setConsent = useCallback((choices: ConsentChoices) => {
    setConsentState(choices);
    write("consent", { version: CONSENT_VERSION, choices, at: new Date().toISOString() });
    // Keep a server-side record of the decision; the site works without it.
    api("/consent", { method: "POST", body: choices }).catch(() => {});
  }, []);

  const value = useMemo<Prefs>(
    () => ({
      currency,
      setCurrency,
      landUnit,
      setLandUnit,
      saved,
      toggleSaved,
      suggestedCurrency,
      timeZone,
      dismissSuggestion,
      session,
      authLoading,
      can,
      signIn,
      register,
      signOut,
      updateProfile,
      consent,
      setConsent,
      reopenConsent,
    }),
    [currency, setCurrency, landUnit, setLandUnit, saved, toggleSaved, suggestedCurrency, timeZone, dismissSuggestion, session, authLoading, can, signIn, register, signOut, updateProfile, consent, setConsent, reopenConsent],
  );

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
      <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>
    </ThemeProvider>
  );
}

export function usePrefs() {
  const ctx = useContext(PrefsContext);
  if (!ctx) throw new Error("usePrefs must be used inside <Providers>");
  return ctx;
}
