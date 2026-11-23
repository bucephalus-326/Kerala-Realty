// Renders the reel. node render.cjs stills 1.2,5,13 | node render.cjs video [from] [to]
const fs = require("fs"), path = require("path"), http = require("http");
const { chromium } = require("playwright");
const root = __dirname, out = path.join(root, "out");
const types = { ".html": "text/html", ".js": "text/javascript", ".png": "image/png", ".jpg": "image/jpeg", ".json": "application/json", ".woff2": "font/woff2" };
const server = http.createServer((req, res) => {
  const f = path.join(root, decodeURIComponent(req.url.split("?")[0]));
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "Content-Type": types[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(res);
}).listen(8765);

(async () => {
  const [mode = "stills", a, b] = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  page.on("pageerror", (e) => console.error("pageerror", e.message));
  page.on("console", (m) => m.type() === "error" && console.error("console", m.text()));
  await page.goto("http://localhost:8765/compose/index.html");
  await page.evaluate(() => window.ready);
  const fps = await page.evaluate(() => window.FPS), dur = await page.evaluate(() => window.DURATION);
  const grab = async (t, file, fmt) => {
    const data = await page.evaluate(([t, fmt]) => { renderFrame(t); return document.getElementById("c").toDataURL(fmt === "png" ? "image/png" : "image/jpeg", 0.95); }, [t, fmt]);
    fs.writeFileSync(file, Buffer.from(data.split(",")[1], "base64"));
  };
  fs.mkdirSync(out, { recursive: true });
  if (mode === "stills") {
    for (const t of (a || "1").split(",").map(Number)) await grab(t, path.join(out, `still-${t.toFixed(2)}.jpg`), "jpg");
  } else {
    const dir = path.join(out, "frames"); fs.mkdirSync(dir, { recursive: true });
    const f0 = Math.round((Number(a) || 0) * fps), f1 = Math.round((b ? Number(b) : dur) * fps);
    const started = Date.now();
    for (let f = f0; f < f1; f++) { await grab(f / fps, path.join(dir, `${String(f).padStart(4, "0")}.jpg`), "jpg"); if (f % 60 === 0) console.log(`frame ${f}/${f1} ${((Date.now() - started) / 1000).toFixed(0)}s`); }
  }
  await browser.close(); server.close();
})().catch((e) => { console.error(e); server.close(); process.exit(1); });
