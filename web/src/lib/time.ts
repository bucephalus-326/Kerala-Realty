/** True when a time zone currently has the same UTC offset as India (e.g. "Asia/Calcutta", "Asia/Kolkata"). */
export function sameAsIST(tz: string | undefined) {
  if (!tz) return true;
  try {
    const now = new Date();
    const f = (z: string) => new Intl.DateTimeFormat("en-GB", { timeZone: z, hour: "2-digit", minute: "2-digit", day: "2-digit" }).format(now);
    return f(tz) === f("Asia/Kolkata");
  } catch {
    return true;
  }
}
