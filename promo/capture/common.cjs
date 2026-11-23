// Shared setup for promo captures: 1080×1920 phone frames of the real app, brand wordmark hidden.
const { chromium } = require("playwright");
const B = "http://localhost:3100";
const GL = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];

async function phone(browser, { currency } = {}) {
  const ctx = await browser.newContext({
    viewport: { width: 432, height: 768 }, deviceScaleFactor: 2.5, isMobile: true, hasTouch: true, colorScheme: "dark",
    timezoneId: currency === "AED" ? "Asia/Dubai" : "Asia/Kolkata",
  });
  await ctx.addInitScript((cur) => {
    localStorage.setItem("theme", "dark");
    localStorage.setItem("consent", JSON.stringify({ version: "2026-11", choices: { personalisation: true, location: true, analytics: false } }));
    if (cur) localStorage.setItem("pref.currency", JSON.stringify(cur));
  }, currency ?? null);
  // A visitor in Kochi (what Vercel's edge would report once location is allowed).
  await ctx.route("**/api/geo", (r) => r.fulfill({ json: { city: "Kochi", region: "KL", country: "IN", source: "edge" } }));
  return ctx;
}

/** Video-only cosmetics: no product name, optionally no assistant launcher, Hella's name on the panel. */
async function dress(page, { hideLauncher = true, hella = true } = {}) {
  await page.evaluate(({ hideLauncher, hella }) => {
    const id = "promo-style";
    document.getElementById(id)?.remove();
    const s = document.createElement("style");
    s.id = id;
    s.textContent = `
      nextjs-portal, [data-nextjs-toast] { display:none !important; }
      ${hideLauncher ? '[aria-label="Open property assistant"], .rise.fixed { display:none !important; }' : ""}
      * { caret-color: transparent; }
    `;
    document.head.appendChild(s);
    // Remove the product name wherever it appears inside text ("Tharavad NRI concierge" → "NRI concierge").
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n; (n = w.nextNode()); ) if (/tharavad/i.test(n.nodeValue) && !/^\s*tharavad\s*$/i.test(n.parentElement?.textContent || "")) n.nodeValue = n.nodeValue.replace(/tharavad\s*/gi, "");
    for (const el of document.querySelectorAll("body *")) {
      if (el.children.length) continue;
      const t = (el.textContent || "").trim();
      if (/^tharavad$/i.test(t) || /^kerala realty$/i.test(t)) el.style.visibility = "hidden";
      if (hella && t === "Property assistant") el.textContent = "Hella";
      if (hella && t === "Searches verified listings only") el.textContent = "Your personal home finder";
    }
  }, { hideLauncher, hella });
}

async function login(page, email) {
  await page.goto(B + "/signin", { waitUntil: "networkidle" });
  const r = await page.evaluate(async (email) => (await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "demo-pass-2026" }) })).status, email);
  if (r !== 200) throw new Error("login failed " + email + " " + r);
}

module.exports = { chromium, B, GL, phone, dress, login };
