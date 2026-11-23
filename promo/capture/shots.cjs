// Captures every app shot for the promo as 1080×1920 PNGs (sequences in numbered folders).
const fs = require("fs");
const { chromium, B, GL, phone, dress, login } = require("./common.cjs");
const OUT = process.argv[2];
const dir = (d) => (fs.mkdirSync(`${OUT}/${d}`, { recursive: true }), `${OUT}/${d}`);
const pad = (n) => String(n).padStart(3, "0");
const ease = (x) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);

async function hellaText(p) {
  await p.evaluate(() => {
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n; (n = w.nextNode()); ) n.nodeValue = n.nodeValue.replace("I'm your property assistant", "I'm Hella, your property assistant");
  });
}

(async () => {
  const b = await chromium.launch({ args: GL });

  /* ── Phone: visitor in Kochi ── */
  {
    const ctx = await phone(b); const p = await ctx.newPage();
    await p.goto(B + "/", { waitUntil: "networkidle" }); await p.waitForTimeout(1500); await dress(p);
    await p.screenshot({ path: `${OUT}/home.png` });
    const target = await p.evaluate(() => document.querySelector("#featured").getBoundingClientRect().top + scrollY - 70);
    const d = dir("homescroll");
    for (let i = 0; i < 24; i++) { await p.evaluate((y) => scrollTo(0, y), Math.round(ease(i / 23) * target)); await p.waitForTimeout(60); await dress(p); await p.screenshot({ path: `${d}/${pad(i)}.png` }); }
    await p.waitForTimeout(500); await dress(p); await p.screenshot({ path: `${OUT}/featured.png` });
    await p.evaluate(() => scrollBy(0, 560)); await p.waitForTimeout(600); await dress(p); await p.screenshot({ path: `${OUT}/featured2.png` });

    await p.goto(B + "/listings/L001", { waitUntil: "networkidle" }); await p.waitForTimeout(1500); await dress(p);
    await p.screenshot({ path: `${OUT}/listing.png` });
    const badge = await p.getByText("K-RERA verified", { exact: false }).first().boundingBox();
    fs.writeFileSync(`${OUT}/listing-badge.json`, JSON.stringify(badge));
    await p.evaluate(() => scrollBy(0, 700)); await p.waitForTimeout(500); await dress(p); await p.screenshot({ path: `${OUT}/listing2.png` });

    // Hella: the launcher appears for the first time, the panel opens, she greets the visitor in Kochi.
    await p.goto(B + "/", { waitUntil: "networkidle" }); await p.waitForTimeout(1500);
    await dress(p, { hideLauncher: false }); await p.evaluate(() => document.querySelectorAll(".rise.fixed").forEach((e) => (e.style.display = "none")));
    await p.screenshot({ path: `${OUT}/home-launcher.png` });
    fs.writeFileSync(`${OUT}/launcher.json`, JSON.stringify(await p.getByLabel("Open property assistant").boundingBox()));
    await p.getByLabel("Open property assistant").click(); await p.waitForTimeout(1500); await dress(p, { hideLauncher: false }); await hellaText(p);
    await p.screenshot({ path: `${OUT}/hella-greet.png` });
    await p.locator('[role="dialog"] button', { hasText: "Kakkanad" }).first().click(); await p.waitForTimeout(2500); await dress(p, { hideLauncher: false }); await hellaText(p);
    await p.screenshot({ path: `${OUT}/hella-results.png` });

    await p.getByLabel("Start over").click(); await p.waitForTimeout(800);
    const input = p.getByLabel("Message the assistant"); await input.click();
    const text = "kakkanad il 50 lakh flat venam"; const td = dir("hella-type");
    await dress(p, { hideLauncher: false }); await hellaText(p); await p.screenshot({ path: `${td}/${pad(0)}.png` });
    for (let i = 1; i <= text.length; i++) { await input.fill(text.slice(0, i)); await dress(p, { hideLauncher: false }); await hellaText(p); await p.screenshot({ path: `${td}/${pad(i)}.png` }); }
    await input.press("Enter"); await p.waitForTimeout(2500); await dress(p, { hideLauncher: false }); await hellaText(p);
    await p.screenshot({ path: `${OUT}/hella-manglish.png` });
    await ctx.close();
  }

  /* ── Phone: NRI in Dubai ── */
  {
    const ctx = await phone(b, { currency: "AED" }); const p = await ctx.newPage();
    await login(p, "nri@example.com");
    await p.goto(B + "/account", { waitUntil: "networkidle" }); await p.waitForTimeout(1500); await dress(p);
    await p.screenshot({ path: `${OUT}/nri-account.png` });
    await p.getByText("Two clocks").scrollIntoViewIfNeeded(); await p.evaluate(() => scrollBy(0, -140)); await p.waitForTimeout(600); await dress(p);
    await p.screenshot({ path: `${OUT}/nri-clocks.png` });
    await p.goto(B + "/", { waitUntil: "networkidle" }); await p.waitForTimeout(1200);
    await p.evaluate(() => document.querySelector("#featured").scrollIntoView()); await p.evaluate(() => scrollBy(0, 120)); await p.waitForTimeout(800); await dress(p);
    await p.screenshot({ path: `${OUT}/nri-aed.png` });
    await ctx.close();
  }

  /* ── Phone: owner portal and vault ── */
  {
    const ctx = await phone(b); const p = await ctx.newPage();
    await login(p, "owner@example.com");
    // One sample document so the vault shows a real SHA-256 fingerprint.
    const pdf = "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n";
    await p.evaluate(async (pdf) => fetch("/api/documents", { method: "POST", headers: { "Content-Type": "application/pdf", "X-KR-Upload": "1", "X-Doc-Kind": "title_deed", "X-Listing-Id": "L001" }, body: new Blob([pdf], { type: "application/pdf" }) }), pdf);
    await p.goto(B + "/portal", { waitUntil: "networkidle" }); await p.waitForTimeout(1500); await dress(p);
    await p.screenshot({ path: `${OUT}/portal.png` });
    await p.getByText("Document vault").scrollIntoViewIfNeeded(); await p.evaluate(() => scrollBy(0, -120)); await p.waitForTimeout(600); await dress(p);
    await p.screenshot({ path: `${OUT}/vault.png` });
    await ctx.close();
  }

  /* ── Phone: admin ── */
  {
    const ctx = await phone(b); const p = await ctx.newPage();
    await login(p, "admin@example.com");
    await p.goto(B + "/admin", { waitUntil: "networkidle" }); await p.waitForTimeout(2000); await dress(p);
    await p.screenshot({ path: `${OUT}/admin.png` });
    await p.evaluate(() => scrollBy(0, 520)); await p.waitForTimeout(500); await dress(p);
    await p.screenshot({ path: `${OUT}/admin2.png` });
    await ctx.close();
  }

  /* ── Map at portrait tablet size: clean, 3D orbit ── */
  {
    const ctx = await b.newContext({ viewport: { width: 864, height: 1536 }, deviceScaleFactor: 1.25, colorScheme: "dark" });
    await ctx.addInitScript(() => { localStorage.setItem("theme", "dark"); localStorage.setItem("consent", JSON.stringify({ version: "2026-11", choices: { personalisation: false, location: false, analytics: false } })); });
    const p = await ctx.newPage();
    const clean = () => p.evaluate(() => {
      document.querySelector("header")?.style.setProperty("display", "none");
      for (const el of document.querySelectorAll("body *")) if (el.children.length === 0 && /homes in view/.test(el.textContent || "")) { let a = el; while (a.parentElement && getComputedStyle(a).position !== "absolute" && getComputedStyle(a).position !== "fixed") a = a.parentElement; a.style.display = "none"; }
      for (const el of document.querySelectorAll("button")) if (/Draw search area/.test(el.textContent || "")) el.style.display = "none";
    });
    await p.goto(B + "/map", { waitUntil: "networkidle" }); await p.waitForTimeout(6000); await clean();
    // Flat overview for the "she knows where you are" pin.
    await p.mouse.move(432, 768); await p.mouse.wheel(0, 500); await p.waitForTimeout(2500); await clean();
    await p.screenshot({ path: `${OUT}/map-flat.png` });
    await p.mouse.wheel(0, -900); await p.waitForTimeout(1500);
    const btn = p.getByRole("button", { name: /^(2D|3D)$/ }).first();
    if ((await btn.textContent()).trim() === "2D") await btn.click();
    await p.waitForTimeout(3500); await clean();
    const d = dir("map3d");
    await p.mouse.move(560, 950); await p.mouse.down({ button: "right" });
    for (let i = 0; i < 60; i++) {
      if (i === 30) { await p.mouse.up({ button: "right" }); await p.getByText("Flood risk (demo)").click().catch(() => {}); await p.mouse.move(560 + i * 9, 950); await p.mouse.down({ button: "right" }); }
      await p.mouse.move(560 + (i + 1) * 9, 950 - (i < 30 ? i : 30) * 0.6, { steps: 1 });
      await p.waitForTimeout(220); await clean();
      await p.screenshot({ path: `${d}/${pad(i)}.png` });
    }
    await p.mouse.up({ button: "right" });
    await ctx.close();
  }
  await b.close();
  console.log("done");
})().catch((e) => { console.error(e); process.exit(1); });
