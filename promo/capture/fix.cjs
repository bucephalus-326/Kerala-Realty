const { chromium, B, GL, phone, dress, login } = require("./common.cjs");
const OUT = process.argv[2];
(async () => {
  const b = await chromium.launch({ args: GL });
  { const ctx = await phone(b, { currency: "AED" }); const p = await ctx.newPage(); await login(p, "nri@example.com");
    await p.goto(B + "/account", { waitUntil: "networkidle" }); await p.waitForTimeout(1500); await dress(p); await p.screenshot({ path: `${OUT}/nri-account.png` });
    await p.getByText("Two clocks").scrollIntoViewIfNeeded(); await p.evaluate(() => scrollBy(0, -140)); await p.waitForTimeout(600); await dress(p); await p.screenshot({ path: `${OUT}/nri-clocks.png` });
    await ctx.close(); }
  { const ctx = await phone(b); const p = await ctx.newPage(); await login(p, "owner@example.com");
    await p.goto(B + "/portal", { waitUntil: "networkidle" }); await p.waitForTimeout(1500);
    const tabs = await p.getByRole("tab").allTextContents().catch(() => []); console.log("tabs", tabs);
    const doc = p.getByRole("tab", { name: /doc/i }).or(p.getByRole("button", { name: /^Doc/i })).first();
    await doc.click(); await p.waitForTimeout(1200); await dress(p);
    console.log("vault heading", await p.getByText("Document vault").count());
    await p.screenshot({ path: `${OUT}/vault.png` }); await ctx.close(); }
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
