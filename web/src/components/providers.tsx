"use client";

import { ThemeProvider } from "next-themes";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { currencyFromTimeZone, type Currency } from "@/lib/currency";

export type LandUnit = "cents" | "sqft";

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
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: preferences just won't persist */
  }
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [currency, setCurrencyState] = useState<Currency>("INR");
  const [landUnit, setLandUnitState] = useState<LandUnit>("cents");
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [suggestedCurrency, setSuggested] = useState<Currency | null>(null);
  const [timeZone, setTimeZone] = useState<string>();

  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    setTimeZone(tz);
    const chosen = read<Currency | null>("pref.currency", null);
    if (chosen) setCurrencyState(chosen);
    setLandUnitState(read<LandUnit>("pref.landUnit", "cents"));
    setSaved(new Set(read<string[]>("pref.saved", [])));
    if (!chosen && !read<boolean>("pref.fxDismissed", false)) {
      setSuggested(currencyFromTimeZone(tz));
    }
  }, []);

  const setCurrency = useCallback((c: Currency) => {
    setCurrencyState(c);
    setSuggested(null);
    write("pref.currency", c);
  }, []);

  const setLandUnit = useCallback((u: LandUnit) => {
    setLandUnitState(u);
    write("pref.landUnit", u);
  }, []);

  const toggleSaved = useCallback((id: string) => {
    setSaved((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      write("pref.saved", [...next]);
      return next;
    });
  }, []);

  const dismissSuggestion = useCallback(() => {
    setSuggested(null);
    write("pref.fxDismissed", true);
  }, []);

  const value = useMemo(
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
    }),
    [currency, setCurrency, landUnit, setLandUnit, saved, toggleSaved, suggestedCurrency, timeZone, dismissSuggestion],
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
