/**
 * Effective platform settings: admin values from the database, falling back to
 * environment variables, then defaults. Cached for 30 s per process.
 */
import { Settings } from "../models/admin.js";

export interface Effective {
  announcement: { text: string; active: boolean };
  ai: { dailyPerVisitor: number; globalDaily: number; enabled: boolean };
  uploads: { maxFiles: number; maxMB: number };
}

let cache: { at: number; value: Effective } | null = null;

export function invalidateSettings() {
  cache = null;
}

export async function getSettings(): Promise<Effective> {
  if (cache && Date.now() - cache.at < 30_000) return cache.value;
  const s = await Settings.findById("platform").lean().catch(() => null);
  const env = process.env;
  const value: Effective = {
    announcement: { text: s?.announcement?.text ?? "", active: !!s?.announcement?.active },
    ai: {
      dailyPerVisitor: s?.ai?.dailyPerVisitor ?? Number(env.AI_DAILY_LIMIT ?? 15),
      globalDaily: s?.ai?.globalDaily ?? Number(env.AI_GLOBAL_DAILY_LIMIT ?? 800),
      enabled: s?.ai?.enabled ?? true,
    },
    uploads: {
      maxFiles: s?.uploads?.maxFiles ?? Number(env.UPLOAD_MAX_FILES ?? 80),
      maxMB: s?.uploads?.maxMB ?? Number(env.UPLOAD_MAX_MB ?? 60),
    },
  };
  cache = { at: Date.now(), value };
  return value;
}
