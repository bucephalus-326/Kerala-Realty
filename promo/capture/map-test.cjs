const { chromium, B, GL, dress } = require("./common.cjs");
const out = process.argv[2];
(async () => {
  const b = await chromium.launch({ args: GL });
  const ctx = await b.newContext({ viewport: { width: 864, height: 1536 }, deviceScaleFactor: 1.25, colorScheme: "dark" });
  await ctx.addInitScript(() => { localStorage.setItem("theme", "dark"); localStorage.setItem("consent", JSON.stringify({ version: "2026-11", choices: { personalisation: false, location: false, analytics: false } })); });
  const p = await ctx.newPage();
  await p.goto(B + "/map", { waitUntil: "networkidle" }); await p.waitForTimeout(6000);
  const btn = p.getByRole("button", { name: /^(2D|3D)$/ });
  console.log("3d buttons", await btn.count(), await btn.first().textContent());
  if ((await btn.first().textContent()).trim() === "2D") await btn.first().click();
  await p.waitForTimeout(3000); await dress(p);
  await p.screenshot({ path: out + "/m-0.png" });
  const t0 = Date.now();
  await p.mouse.move(600, 900); await p.mouse.down({ button: "right" });
  for (let i = 1; i <= 6; i++) { await p.mouse.move(600 + i * 25, 900 - i * 4, { steps: 2 }); await p.waitForTimeout(250); if (i % 3 === 0) await p.screenshot({ path: `${out}/m-${i}.png` }); }
  await p.mouse.up({ button: "right" });
  console.log("ms", Date.now() - t0);
  await b.close();
})();
