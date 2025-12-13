import fs from "fs";
import path from "path";
import { execFile } from "child_process";

const STEP2_DIR = path.join(process.cwd(), "output", "Step 2 (Email Scraper)");
const VIDEOS_ROOT = path.join(process.cwd(), "output", "Step 3 (Video Recorder - Raw WebM)");
const COMBINED_ROOT = path.join(process.cwd(), "output", "Step 4 (Combine Desktop+Mobile)");

const MAX_COMBINES = 1;

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

function findDesktopMobilePairs(videosDir) {
  const files = fs.readdirSync(videosDir);
  const desktops = files
    .filter((f) => f.toLowerCase().endsWith("_desktop.webm"))
    .sort();

  const pairs = [];

  for (const desktopFile of desktops) {
    const base = desktopFile.replace(/_desktop\.webm$/i, "");
    const mobileFile = `${base}_mobile.webm`;
    if (files.includes(mobileFile)) {
      pairs.push({
        base,
        desktopPath: path.join(videosDir, desktopFile),
        mobilePath: path.join(videosDir, mobileFile),
      });
    }
  }

  return pairs;
}

async function makeDesktopTmp(desktopInput, tmpOutput) {
  await runFFmpeg([
    "-y",
    "-i",
    desktopInput,
    "-vf",
    "fps=30,scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=white,setsar=1,format=yuv420p",
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-movflags",
    "+faststart",
    tmpOutput,
  ]);
}

async function makeMobileTmp(mobileInput, tmpOutput) {
  await runFFmpeg([
    "-y",
    "-i",
    mobileInput,
    "-vf",
    "fps=30,scale=390:720:force_original_aspect_ratio=decrease,pad=390:720:(ow-iw)/2:(oh-ih)/2:color=white,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=white,setsar=1,format=yuv420p",
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-movflags",
    "+faststart",
    tmpOutput,
  ]);
}

async function concatDesktopAndMobile(desktopTmp, mobileTmp, outPath) {
  await runFFmpeg([
    "-y",
    "-i",
    desktopTmp,
    "-i",
    mobileTmp,
    "-filter_complex",
    "[0:v]setsar=1[v0];[1:v]setsar=1[v1];[v0][v1]concat=n=2:v=1:a=0[v]",
    "-map",
    "[v]",
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
    outPath,
  ]);
}

async function main() {
  const { baseName } = findLatestStep2Csv();

  const VIDEOS_DIR = path.join(VIDEOS_ROOT, baseName);
  const COMBINED_DIR = path.join(COMBINED_ROOT, baseName);

  if (!fs.existsSync(VIDEOS_DIR)) {
    console.error(`Videos directory not found: ${VIDEOS_DIR}`);
    process.exit(1);
  }

  ensureDir(COMBINED_DIR);

  console.log(`Videos dir:   ${VIDEOS_DIR}`);
  console.log(`Combined dir: ${COMBINED_DIR}`);

  const pairs = findDesktopMobilePairs(VIDEOS_DIR);

  if (!pairs.length) {
    console.error("No desktop/mobile pairs found to combine.");
    process.exit(1);
  }

  let combinedCount = 0;

  for (const pair of pairs) {
    if (combinedCount >= MAX_COMBINES) break;

    const { base, desktopPath, mobilePath } = pair;

    console.log(`\nCombining: ${base}`);
    console.log(`  Desktop source: ${desktopPath}`);
    console.log(`  Mobile source:  ${mobilePath}`);

    const desktopTmp = path.join(COMBINED_DIR, `${base}_desktop_tmp.mp4`);
    const mobileTmp = path.join(COMBINED_DIR, `${base}_mobile_tmp.mp4`);
    const outCombined = path.join(COMBINED_DIR, `${base}_combined.mp4`);

    await makeDesktopTmp(desktopPath, desktopTmp);
    await makeMobileTmp(mobilePath, mobileTmp);
    await concatDesktopAndMobile(desktopTmp, mobileTmp, outCombined);

    console.log(`  ✓ Combined video saved: ${outCombined}`);

    combinedCount++;
  }

  if (!combinedCount) {
    console.error("No pairs combined. Check that *_desktop.webm and *_mobile.webm files exist.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error in step-4-combine-desktop-mobile:", err.message || err);
  process.exit(1);
});
