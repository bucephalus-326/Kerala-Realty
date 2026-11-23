const { chromium, B, GL, phone, dress, login } = require("./common.cjs");
const out = process.argv[2];
(async () => {
  const b = await chromium.launch({ args: GL });
  const ctx = await phone(b); const p = await ctx.newPage();
  for (const [u, n, wait] of [["/", "home", 1500], ["/listings/L001", "listing", 1500], ["/map", "map", 8000]]) {
    await p.goto(B + u, { waitUntil: "networkidle" }); await p.waitForTimeout(wait); await dress(p);
    await p.screenshot({ path: `${out}/x-${n}.png` });
  }
  await p.goto(B + "/", { waitUntil: "networkidle" }); await p.waitForTimeout(800);
  await p.evaluate(() => document.querySelector("#featured")?.scrollIntoView()); await p.waitForTimeout(800); await dress(p);
  await p.screenshot({ path: `${out}/x-featured.png` });
  // assistant
  await p.evaluate(() => scrollTo(0, 0)); await dress(p, { hideLauncher: false });
  await p.getByLabel("Open property assistant").click(); await p.waitForTimeout(1500); await dress(p, { hideLauncher: false });
  await p.screenshot({ path: `${out}/x-hella-open.png` });
  await b.close();
})();
