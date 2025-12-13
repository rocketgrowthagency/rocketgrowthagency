import fs from "fs";
import path from "path";
import { execFile } from "child_process";

const STEP2_DIR = path.join(process.cwd(), "output", "Step 2 (Email Scraper)");
const BRANDED_ROOT = path.join(process.cwd(), "output", "Step 5 (Branding Overlay)");
const AUDIO_ROOT = path.join(process.cwd(), "output", "Step 6 (Voiceover MP3)");
const FINAL_ROOT = path.join(process.cwd(), "output", "Step 7 (Final Merge MP4)");

const MAX_MERGES = 1;

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

  return { baseName };
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function main() {
  const { baseName } = findLatestStep2Csv();

  const BRANDED_DIR = path.join(BRANDED_ROOT, baseName);
  const AUDIO_DIR = path.join(AUDIO_ROOT, baseName);
  const FINAL_DIR = path.join(FINAL_ROOT, baseName);

  if (!fs.existsSync(BRANDED_DIR)) {
    console.error(`Branded directory not found: ${BRANDED_DIR}`);
    process.exit(1);
  }
  if (!fs.existsSync(AUDIO_DIR)) {
    console.error(`Audio directory not found: ${AUDIO_DIR}`);
    process.exit(1);
  }

  ensureDir(FINAL_DIR);

  console.log(`Branded dir: ${BRANDED_DIR}`);
  console.log(`Audio dir:   ${AUDIO_DIR}`);
  console.log(`Final dir:   ${FINAL_DIR}`);

  const audioFiles = fs
    .readdirSync(AUDIO_DIR)
    .filter((f) => f.toLowerCase().endsWith(".mp3"))
    .sort();

  if (!audioFiles.length) {
    console.error("No audio files found to merge.");
    process.exit(1);
  }

  let mergedCount = 0;

  for (const audioFile of audioFiles) {
    if (mergedCount >= MAX_MERGES) break;

    const base = audioFile.replace(/\.mp3$/i, "");
    const baseNoRetry = base.replace(/\[\d+\]/g, "");

    const brandedPath = path.join(BRANDED_DIR, `${baseNoRetry}_branded.mp4`);
    if (!fs.existsSync(brandedPath)) {
      console.warn(
        `⚠️ Skipping ${audioFile} — branded video not found for base "${baseNoRetry}". Expected: ${brandedPath}`
      );
      continue;
    }

    const audioPath = path.join(AUDIO_DIR, audioFile);
    const outMp4 = path.join(FINAL_DIR, `${baseNoRetry}.mp4`);

    console.log(`\nMerging final video for: ${baseNoRetry}`);
    console.log(`  Branded video: ${brandedPath}`);
    console.log(`  Audio:         ${audioPath}`);
    console.log(`  Output:        ${outMp4}`);

    await runFFmpeg([
      "-y",
      "-i",
      brandedPath,
      "-i",
      audioPath,
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-shortest",
      "-movflags",
      "+faststart",
      outMp4,
    ]);

    console.log(`✓ Final merged MP4: ${outMp4}`);
    mergedCount++;
  }

  if (!mergedCount) {
    console.error(
      "No final videos merged. Check that *_branded.mp4 files exist in Branded/ and that audio filenames match the pattern (01_*.mp3)."
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error in step-7-merge-branded-audio:", err.message || err);
  process.exit(1);
});
