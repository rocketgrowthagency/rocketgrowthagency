import fs from "fs";
import path from "path";
import os from "os";
import http from "http";
import { execFile } from "child_process";
import { chromium } from "playwright";

const STEP2_DIR = path.join(process.cwd(), "output", "Step 2 (Email Scraper)");
const COMBINED_ROOT = path.join(process.cwd(), "output", "Step 4 (Combine Desktop+Mobile)");
const BRANDED_ROOT = path.join(process.cwd(), "output", "Step 5 (Branding Overlay)");

const MAX_BRANDS = 1;
const INTRO_SEC = 3.2;
const OUTRO_SEC = 3.0;

function findLatestStep2Csv() {
  if (!fs.existsSync(STEP2_DIR)) {
    console.error(`Step 2 directory not found: ${STEP2_DIR}`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(STEP2_DIR)
    .filter((f) => f.toLowerCase().endsWith(".csv") && f.includes("[step-2]"));

  if (!files.length) {
    console.error(`No Step 2 CSV files found in: ${STEP2_DIR}`);
    process.exit(1);
  }

  files.sort();
  const latest = files[files.length - 1];
  const csvPath = path.join(STEP2_DIR, latest);
  const baseName = latest.replace(/\.csv$/i, "");

  console.log(`Using Step 2 CSV: ${csvPath}`);
  console.log(`Base name: ${baseName}`);

  return { csvPath, baseName };
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function runFFmpeg(args) {
  return new Promise((resolve, reject) => {
    execFile("ffmpeg", args, (error, stdout, stderr) => {
      if (error) {
        reject(new Error((stderr || "").toString() || error.message));
        return;
      }
      resolve((stderr || "").toString());
    });
  });
}

function newestFile(dir, ext) {
  const files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(ext));
  if (!files.length) return null;
  const newest = files
    .map((name) => ({ name, t: fs.statSync(path.join(dir, name)).mtimeMs }))
    .sort((a, b) => a.t - b.t)
    .pop();
  return newest ? path.join(dir, newest.name) : null;
}

function buildBrandingHtml({ introSec, outroSec }) {
  const rocketSvg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"></path>
    <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"></path>
    <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"></path>
    <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"></path>
  </svg>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>RGA Branding</title>
<style>
  html, body {
    width: 1280px;
    height: 720px;
    margin: 0;
    background: #ffffff;
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, Helvetica, Arial, sans-serif;
  }
  .stage {
    position: relative;
    width: 1280px;
    height: 720px;
    background: #ffffff;
  }
  .centerWrap {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 160px;
  }
  .intro {
    width: 980px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 28px;
    text-align: center;
  }
  .brandLine {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    font-size: 18px;
    font-weight: 600;
    color: #0b1120;
  }
  .brandMark {
    width: 30px;
    height: 30px;
    border-radius: 10px;
    background: #2563ff;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .h1 {
    line-height: 1.02;
    letter-spacing: -0.02em;
  }
  .h1 .top {
    font-size: 72px;
    font-weight: 850;
    color: #0b1120;
  }
  .h1 .bottom {
    font-size: 72px;
    font-weight: 850;
    color: #2563ff;
  }

  .videoWrap {
    position: absolute;
    inset: 0;
    background: #ffffff;
    display: none;
  }
  video {
    width: 1280px;
    height: 720px;
    object-fit: cover;
    background: #ffffff;
  }

  .cornerBubble {
    position: absolute;
    right: 24px;
    bottom: 22px;
    z-index: 10;
    display: none;
    align-items: center;
    gap: 10px;
    padding: 10px 14px 10px 12px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.96);
    box-shadow: 0 12px 30px rgba(15, 23, 42, 0.18);
    border: 1px solid rgba(15, 23, 42, 0.08);
    user-select: none;
  }
  .cornerIcon {
    width: 30px;
    height: 30px;
    border-radius: 12px;
    background: #2563ff;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
  }
  .cornerText {
    font-size: 14px;
    font-weight: 600;
    color: #0b1120;
    letter-spacing: -0.01em;
    white-space: nowrap;
  }
</style>
</head>
<body>
  <div class="stage">
    <div id="intro" class="centerWrap">
      <div class="intro">
        <div class="brandLine">
          <span class="brandMark">${rocketSvg}</span>
          <span>Rocket Growth Agency</span>
        </div>
        <div class="h1">
          <div class="top">Local Search</div>
          <div class="bottom">Growth Audit</div>
        </div>
      </div>
    </div>

    <div id="videoWrap" class="videoWrap">
      <video id="vid" muted playsinline preload="auto">
        <source src="/video.mp4" type="video/mp4" />
      </video>

      <div id="corner" class="cornerBubble">
        <span class="cornerIcon">${rocketSvg}</span>
        <span class="cornerText">Rocket Growth Agency</span>
      </div>
    </div>

    <div id="outro" class="centerWrap" style="display:none;">
      <div class="intro">
        <div class="brandLine">
          <span class="brandMark">${rocketSvg}</span>
          <span>Rocket Growth Agency</span>
        </div>
        <div class="h1">
          <div class="top">Local Search</div>
          <div class="bottom">Growth Audit</div>
        </div>
      </div>
    </div>
  </div>

<script>
  (function(){
    const INTRO = ${Number(introSec)};
    const OUTRO = ${Number(outroSec)};
    const introEl = document.getElementById("intro");
    const outroEl = document.getElementById("outro");
    const wrapEl = document.getElementById("videoWrap");
    const cornerEl = document.getElementById("corner");
    const vid = document.getElementById("vid");

    window.__RGA_DONE = false;

    function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

    async function run(){
      await sleep(Math.round(INTRO * 1000));

      introEl.style.display = "none";
      wrapEl.style.display = "block";
      cornerEl.style.display = "inline-flex";

      try { await vid.play(); } catch (e) {}

      await new Promise((resolve) => {
        const onEnd = () => resolve();
        vid.addEventListener("ended", onEnd, { once: true });
        setTimeout(resolve, Math.max(2000, (vid.duration || 1) * 1000 + 1500));
      });

      wrapEl.style.display = "none";
      outroEl.style.display = "flex";

      await sleep(Math.round(OUTRO * 1000));

      window.__RGA_DONE = true;
    }

    run();
  })();
</script>
</body>
</html>`;
}

async function brandOne(combinedMp4Path, outMp4Path) {
  const tmpDir = path.join(
    os.tmpdir(),
    `rga_brand_${Date.now()}_${Math.random().toString(16).slice(2)}`
  );
  ensureDir(tmpDir);

  const server = http.createServer((req, res) => {
    if (!req.url) {
      res.statusCode = 404;
      res.end();
      return;
    }

    if (req.url === "/" || req.url.startsWith("/index")) {
      const html = buildBrandingHtml({ introSec: INTRO_SEC, outroSec: OUTRO_SEC });
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }

    if (req.url.startsWith("/video.mp4")) {
      try {
        const stat = fs.statSync(combinedMp4Path);
        res.writeHead(200, {
          "Content-Type": "video/mp4",
          "Content-Length": stat.size,
          "Accept-Ranges": "bytes",
          "Cache-Control": "no-store",
        });
        fs.createReadStream(combinedMp4Path).pipe(res);
      } catch {
        res.statusCode = 404;
        res.end();
      }
      return;
    }

    res.statusCode = 404;
    res.end();
  });

  const port = await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      resolve(typeof addr === "object" && addr ? addr.port : 0);
    });
  });

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      recordVideo: { dir: tmpDir, size: { width: 1280, height: 720 } },
    });

    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}/`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    await page.waitForFunction(() => window.__RGA_DONE === true, null, {
      timeout: 10 * 60 * 1000,
    });

    await context.close();

    const recordedWebm = newestFile(tmpDir, ".webm");
    if (!recordedWebm) throw new Error("No recorded .webm found from Playwright");

    ensureDir(path.dirname(outMp4Path));
    if (fs.existsSync(outMp4Path)) {
      try {
        fs.unlinkSync(outMp4Path);
      } catch {}
    }

    await runFFmpeg([
      "-y",
      "-i",
      recordedWebm,
      "-vf",
      "fps=30,scale=1280:720:flags=bicubic,setsar=1",
      "-an",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "20",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      outMp4Path,
    ]);
  } finally {
    try {
      await browser.close();
    } catch {}
    try {
      server.close();
    } catch {}
    try {
      for (const f of fs.readdirSync(tmpDir)) {
        try {
          fs.unlinkSync(path.join(tmpDir, f));
        } catch {}
      }
      try {
        fs.rmdirSync(tmpDir);
      } catch {}
    } catch {}
  }
}

async function main() {
  const { baseName } = findLatestStep2Csv();

  const COMBINED_DIR = path.join(COMBINED_ROOT, baseName);
  const BRANDED_DIR = path.join(BRANDED_ROOT, baseName);

  if (!fs.existsSync(COMBINED_DIR)) {
    console.error(`Combined directory not found: ${COMBINED_DIR}`);
    process.exit(1);
  }

  ensureDir(BRANDED_DIR);

  console.log(`Combined dir: ${COMBINED_DIR}`);
  console.log(`Branded dir:  ${BRANDED_DIR}`);

  const combinedFiles = fs
    .readdirSync(COMBINED_DIR)
    .filter((f) => f.toLowerCase().endsWith("_combined.mp4"))
    .sort();

  if (!combinedFiles.length) {
    console.error("No *_combined.mp4 files found in Combined dir.");
    process.exit(1);
  }

  let count = 0;
  for (const file of combinedFiles) {
    if (count >= MAX_BRANDS) break;

    const base = file.replace(/_combined\.mp4$/i, "");
    const src = path.join(COMBINED_DIR, file);
    const out = path.join(BRANDED_DIR, `${base}_branded.mp4`);

    console.log(`\nBranding: ${base}`);
    console.log(`  Source:  ${src}`);

    await brandOne(src, out);

    console.log(`  ✓ Branded video saved: ${out}`);
    count++;
  }
}

main().catch((err) => {
  console.error("Fatal error in step-5-branding:", err.message || err);
  process.exit(1);
});
