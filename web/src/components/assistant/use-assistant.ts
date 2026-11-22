"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { AssistantFilters } from "@/lib/search";
import { usePrefs } from "../providers";

export interface CardListing {
  id: string;
  title: string;
  price: number;
  purpose: string;
  type: string;
  beds?: number;
  locality: string;
  city: string;
  image?: string;
  highlight?: string;
  reasons: string[];
}

export interface CompareRow {
  name: string;
  psf: number;
  yoy: number;
  listings: number;
  metro: { name: string; km: number; status?: string } | null;
  itPark: { name: string; km: number } | null;
  schools2km: number;
}

export interface AssistantReply {
  reply: string;
  mode: "rule" | "llm" | "fallback" | "cache";
  intent: string;
  filters?: AssistantFilters;
  listings: CardListing[];
  total: number;
  ids?: string[];
  chips: { label: string; prompt: string }[];
  compare?: CompareRow[];
  leadForm?: boolean;
  limited?: boolean;
}

export type Message = { id: string; role: "user"; text: string } | { id: string; role: "assistant"; data: AssistantReply };

export interface Starters {
  greeting: string;
  headline: string;
  prompts: { label: string; prompt: string }[];
  city: string;
  hub: string;
}

type Device = "mobile" | "tablet" | "desktop";
const deviceOf = (): Device => (window.innerWidth < 768 ? "mobile" : window.innerWidth < 1024 ? "tablet" : "desktop");
const STORE = "assistant.v1";

/**
 * Conversation state + the context sent with each message.
 * Context respects consent: device/time zone/currency only with "personalisation",
 * the city only with "location". Nothing is sent before the visitor chooses.
 */
export function useAssistant() {
  const { consent, currency, timeZone } = usePrefs();
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const [starters, setStarters] = useState<Starters | null>(null);
  const [geoCity, setGeoCity] = useState<string | null>(null);
  const prevFilters = useRef<AssistantFilters | undefined>(undefined);

  // Restore this tab's conversation.
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORE) ?? "null");
      if (saved?.messages) {
        setMessages(saved.messages);
        prevFilters.current = saved.prev;
      }
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    try {
      sessionStorage.setItem(STORE, JSON.stringify({ messages: messages.slice(-30), prev: prevFilters.current }));
    } catch {
      /* ignore */
    }
  }, [messages]);

  // Approximate city, only after the visitor allows location.
  useEffect(() => {
    if (!consent?.location) return setGeoCity(null);
    fetch("/api/geo")
      .then((r) => r.json())
      .then((g) => setGeoCity(g.city ?? null))
      .catch(() => {});
  }, [consent?.location]);

  const context = useCallback(() => {
    const ctx: Record<string, string> = {};
    if (consent?.personalisation) {
      ctx.device = deviceOf();
      if (timeZone) ctx.timeZone = timeZone;
      ctx.currency = currency;
    }
    if (consent?.location && geoCity) ctx.city = geoCity;
    return ctx;
  }, [consent, timeZone, currency, geoCity]);

  // Personalised starter prompts (rule-based on the server: no AI quota used).
  useEffect(() => {
    const q = new URLSearchParams(context()).toString();
    api<Starters>(`/ai/suggestions${q ? `?${q}` : ""}`)
      .then(setStarters)
      .catch(() => setStarters(null));
  }, [context]);

  const send = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || busy) return null;
      setMessages((m) => [...m, { id: crypto.randomUUID(), role: "user", text: message }]);
      setBusy(true);
      try {
        const data = await api<AssistantReply>("/ai/chat", {
          method: "POST",
          body: { message, previous: prevFilters.current, context: context() },
        });
        if (data.filters) prevFilters.current = data.filters;
        setMessages((m) => [...m, { id: crypto.randomUUID(), role: "assistant", data }]);
        return data;
      } catch (e) {
        const err = e as ApiError;
        const data: AssistantReply = {
          reply: err.status === 429 ? "You're sending messages quickly. Give it a minute and try again." : "I can't reach the server right now. Please try again in a moment.",
          mode: "fallback",
          intent: "error",
          listings: [],
          total: 0,
          chips: [],
        };
        setMessages((m) => [...m, { id: crypto.randomUUID(), role: "assistant", data }]);
        return null;
      } finally {
        setBusy(false);
      }
    },
    [busy, context],
  );

  const reset = useCallback(() => {
    setMessages([]);
    prevFilters.current = undefined;
  }, []);

  return { messages, send, busy, starters, reset, context };
}
