#!/usr/bin/env node

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import OpenAI from "openai";

const STEP2_DIR = path.join(process.cwd(), "output", "Step 2");
const AUDIO_ROOT = path.join(process.cwd(), "output", "Step 6 (Voiceover MP3)");
const SUBTITLE_ROOT = path.join(process.cwd(), "output", "Step 6b (Subtitles)");
const STEP2_CSV_OVERRIDE = process.env.STEP2_CSV || "";
const MAX_RECORDINGS = Number(process.env.MAX_RECORDINGS || 1);

if (!process.env.OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY not set. Check your .env file.");
  process.exit(1);
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function findLatestStep2Csv() {
  if (STEP2_CSV_OVERRIDE) {
    if (!fs.existsSync(STEP2_CSV_OVERRIDE)) {
      console.error(`Step 2 CSV override not found: ${STEP2_CSV_OVERRIDE}`);
      process.exit(1);
    }
    const csvPath = STEP2_CSV_OVERRIDE;
    const baseName = path.basename(csvPath).replace(/\.csv$/i, "");
    console.log(`Using Step 2 CSV override: ${csvPath}`);
    return { csvPath, baseName };
  }

  if (!fs.existsSync(STEP2_DIR)) {
    console.error(`Step 2 directory not found: ${STEP2_DIR}`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(STEP2_DIR)
    .filter((f) => f.toLowerCase().endsWith(".csv") && f.includes("[step-2]"))
    .map((name) => {
      const fullPath = path.join(STEP2_DIR, name);
      return { name, fullPath, mtimeMs: fs.statSync(fullPath).mtimeMs };
    })
    .sort((a, b) => a.mtimeMs - b.mtimeMs || a.name.localeCompare(b.name));

  if (!files.length) {
    console.error(`No Step 2 CSV files found in: ${STEP2_DIR}`);
    process.exit(1);
  }

  const latest = files[files.length - 1];
  const csvPath = latest.fullPath;
  const baseName = latest.name.replace(/\.csv$/i, "");
  console.log(`Using Step 2 CSV: ${csvPath}`);
  return { csvPath, baseName };
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function transcribeToSrt(audioPath) {
  const transcription = await openai.audio.transcriptions.create({
    file: fs.createReadStream(audioPath),
    model: "whisper-1",
    response_format: "verbose_json",
    timestamp_granularities: ["segment"],
  });

  const segments = Array.isArray(transcription.segments) ? transcription.segments : [];
  if (!segments.length) {
    throw new Error(`No subtitle segments returned for ${audioPath}`);
  }

  return segments
    .map((segment, index) => {
      const start = formatTimestamp(segment.start || 0);
      const end = formatTimestamp(segment.end || 0);
      const text = wrapSubtitleText(segment.text || "");
      return `${index + 1}\n${start} --> ${end}\n${text}\n`;
    })
    .join("\n");
}

function formatTimestamp(seconds) {
  const totalMs = Math.max(0, Math.round(Number(seconds || 0) * 1000));
  const hours = String(Math.floor(totalMs / 3600000)).padStart(2, "0");
  const minutes = String(Math.floor((totalMs % 3600000) / 60000)).padStart(2, "0");
  const secs = String(Math.floor((totalMs % 60000) / 1000)).padStart(2, "0");
  const millis = String(totalMs % 1000).padStart(3, "0");
  return `${hours}:${minutes}:${secs},${millis}`;
}

function wrapSubtitleText(text, maxChars = 36) {
  const words = String(text || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxChars) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    current = word;
  }

  if (current) lines.push(current);
  if (lines.length <= 2) return lines.join("\n");

  const first = lines[0];
  const second = lines.slice(1).join(" ");
  return `${first}\n${second}`;
}

async function main() {
  const { baseName } = findLatestStep2Csv();
  const audioDir = path.join(AUDIO_ROOT, baseName);
  const subtitleDir = path.join(SUBTITLE_ROOT, baseName);

  if (!fs.existsSync(audioDir)) {
    console.error(`Audio directory not found: ${audioDir}`);
    process.exit(1);
  }

  ensureDir(subtitleDir);

  const audioFiles = fs
    .readdirSync(audioDir)
    .filter((f) => f.toLowerCase().endsWith(".mp3"))
    .sort()
    .slice(0, MAX_RECORDINGS);

  if (!audioFiles.length) {
    console.error("No audio files found to subtitle.");
    process.exit(1);
  }

  for (const audioFile of audioFiles) {
    const audioPath = path.join(audioDir, audioFile);
    const base = audioFile.replace(/\.mp3$/i, "");
    const outPath = path.join(subtitleDir, `${base}.srt`);

    console.log(`Generating subtitles for: ${audioFile}`);
    const srt = await transcribeToSrt(audioPath);
    fs.writeFileSync(outPath, srt, "utf8");
    console.log(`✓ Saved subtitles: ${outPath}`);
  }
}

main().catch((err) => {
  console.error("Fatal error in step-6b-subtitles:", err.message || err);
  process.exit(1);
});
