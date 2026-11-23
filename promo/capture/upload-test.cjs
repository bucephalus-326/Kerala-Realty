const { chromium, B, GL, phone, login } = require("./common.cjs");
(async () => {
  const b = await chromium.launch(); const ctx = await phone(b); const p = await ctx.newPage(); await login(p, "owner@example.com");
  const pdf = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n";
  for (const h of [{ "X-Doc-Kind": "title_deed" }, { "X-Doc-Kind": "title_deed", "X-Listing-Id": "L060" }]) {
    const r = await p.evaluate(async ([pdf, h]) => { const x = await fetch("/api/documents", { method: "POST", headers: { "Content-Type": "application/pdf", "X-KR-Upload": "1", "X-File-Name": "Title-deed-sample.pdf", ...h }, body: new Blob([pdf], { type: "application/pdf" }) }); return x.status + " " + (await x.text()).slice(0, 160); }, [pdf, h]);
    console.log(JSON.stringify(h), r);
  }
  await b.close();
})();
