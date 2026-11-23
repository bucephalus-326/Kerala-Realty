const { chromium, B, dress } = require("./common.cjs");
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 432, height: 768 }, deviceScaleFactor: 7, isMobile: true, hasTouch: true, colorScheme: "dark" });
  await ctx.addInitScript(() => { localStorage.setItem("theme", "dark"); localStorage.setItem("consent", JSON.stringify({ version: "2026-11", choices: { personalisation: false, location: false, analytics: false } })); });
  const p = await ctx.newPage();
  await p.goto(B + "/listings/L001", { waitUntil: "networkidle" }); await p.waitForTimeout(1500); await dress(p);
  const bb = await p.getByText("K-RERA verified", { exact: false }).first().boundingBox();
  await p.screenshot({ path: process.argv[2], clip: { x: bb.x - 34, y: bb.y - 40, width: bb.width + 68 + 60, height: bb.height + 80 } });
  await b.close();
})();
