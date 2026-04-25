// step-4-combine-desktop-mobile.mjs
import fs from 'fs';
import path from 'path';
import { execFile, spawn } from 'child_process';
import slugify from 'slugify';

const STEP2_DIR = path.join(process.cwd(), 'output', 'Step 2');
const VIDEOS_ROOT = path.join(process.cwd(), 'output', 'Step 3 (Video Recorder - Raw WebM)');
const AUDIO_ROOT = path.join(process.cwd(), 'output', 'Step 6 (Voiceover MP3)');
const COMBINED_ROOT = path.join(process.cwd(), 'output', 'Step 4 (Combine Desktop+Mobile)');
const STEP2_CSV_OVERRIDE = process.env.STEP2_CSV || '';

const MAX_COMBINES = Number(process.env.MAX_COMBINES || 1);

function runFFmpeg(args) {
  return new Promise((resolve, reject) => {
    execFile('ffmpeg', args, (error, stdout, stderr) => {
      if (error) {
        reject(new Error((stderr || '').toString() || error.message));
        return;
      }
      resolve((stderr || '').toString());
    });
  });
}

function findLatestStep2Csv() {
  if (STEP2_CSV_OVERRIDE) {
    if (!fs.existsSync(STEP2_CSV_OVERRIDE)) {
      console.error(`Step 2 CSV override not found: ${STEP2_CSV_OVERRIDE}`);
      process.exit(1);
    }
    const csvPath = STEP2_CSV_OVERRIDE;
    const baseName = path.basename(csvPath).replace(/\.csv$/i, '');
    console.log(`Using Step 2 CSV override: ${csvPath}`);
    return { csvPath, baseName };
  }

  if (!fs.existsSync(STEP2_DIR)) {
    console.error(`Step 2 directory not found: ${STEP2_DIR}`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(STEP2_DIR)
    .filter((f) => f.toLowerCase().endsWith('.csv') && f.includes('[step-2]'))
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
  const baseName = latest.name.replace(/\.csv$/i, '');

  console.log(`Using Step 2 CSV: ${csvPath}`);
  console.log(`Base name: ${baseName}`);

  return { csvPath, baseName };
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function findDesktopMobilePairs(videosDir) {
  const files = fs.readdirSync(videosDir);
  // NEW: look for the 3-webm format (maps + website + mobile separately).
  // Falls back to the legacy single-desktop format if the new files aren't found.
  const mapsWebms = files.filter((f) => f.toLowerCase().endsWith('_desktop_maps.webm')).sort();

  const pairs = [];

  for (const mapsFile of mapsWebms) {
    const base = mapsFile.replace(/_desktop_maps\.webm$/i, '');
    const websiteFile = `${base}_desktop_website.webm`;
    const mobileFile = `${base}_mobile.webm`;
    if (files.includes(websiteFile) && files.includes(mobileFile)) {
      pairs.push({
        base,
        format: 'split',
        mapsPath: path.join(videosDir, mapsFile),
        websitePath: path.join(videosDir, websiteFile),
        mobilePath: path.join(videosDir, mobileFile),
      });
    }
  }

  // Legacy fallback
  if (!pairs.length) {
    const desktops = files.filter((f) => f.toLowerCase().endsWith('_desktop.webm')).sort();
    for (const desktopFile of desktops) {
      const base = desktopFile.replace(/_desktop\.webm$/i, '');
      const mobileFile = `${base}_mobile.webm`;
      if (files.includes(mobileFile)) {
        pairs.push({
          base,
          format: 'legacy',
          desktopPath: path.join(videosDir, desktopFile),
          mobilePath: path.join(videosDir, mobileFile),
        });
      }
    }
  }

  return pairs;
}

async function makeDesktopTmp(desktopInput, tmpOutput) {
  await runFFmpeg([
    '-y',
    '-i',
    desktopInput,
    '-vf',
    'fps=30,scale=1280:720:flags=lanczos:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=white,setsar=1,format=yuv420p',
    '-an',
    '-c:v',
    'libx264',
    '-preset',
    'slow',
    '-crf',
    '20',
    '-pix_fmt',
    'yuv420p',
    '-r',
    '30',
    '-movflags',
    '+faststart',
    tmpOutput,
  ]);
}

async function makeMobileTmp(mobileInput, tmpOutput) {
  await runFFmpeg([
    '-y',
    '-i',
    mobileInput,
    '-vf',
    'fps=30,scale=390:720:flags=lanczos:force_original_aspect_ratio=decrease,pad=390:720:(ow-iw)/2:(oh-ih)/2:color=white,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=white,setsar=1,format=yuv420p',
    '-an',
    '-c:v',
    'libx264',
    '-preset',
    'slow',
    '-crf',
    '20',
    '-pix_fmt',
    'yuv420p',
    '-r',
    '30',
    '-movflags',
    '+faststart',
    tmpOutput,
  ]);
}

async function sliceAndPad(inputPath, startSec, endSec, targetSec, outPath, isDesktop) {
  // Use OUTPUT-side seek for accurate slicing (input-side seek lands on keyframes
  // which can be sparse in webm and miss the intended cut point by seconds).
  // -i input -ss X -t (Y-X) means: read the input, then seek X in, then keep
  // (Y-X) seconds. Slow but accurate.
  const args = ['-y', '-i', inputPath, '-ss', String(startSec)];
  if (endSec != null) {
    const inputDuration = endSec - startSec;
    args.push('-t', String(inputDuration));
  }

  // Filter scales to standard frame + sets 30 fps + pads tail with last frame
  // so trim-to-target works in both pad and trim cases.
  const filter = isDesktop
    ? `fps=30,scale=1280:720:flags=lanczos,setsar=1,format=yuv420p,tpad=stop_mode=clone:stop_duration=999`
    : `fps=30,scale=390:720:flags=lanczos:force_original_aspect_ratio=decrease,pad=390:720:(ow-iw)/2:(oh-ih)/2:color=white,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=white,setsar=1,format=yuv420p,tpad=stop_mode=clone:stop_duration=999`;

  args.push(
    '-vf', filter,
    '-an',
    '-t', String(targetSec),    // final trim to target audio duration
    '-c:v', 'libx264',
    '-preset', 'slow',
    '-crf', '20',
    '-pix_fmt', 'yuv420p',
    '-r', '30',
    '-movflags', '+faststart',
    outPath
  );

  await runFFmpeg(args);
}

async function concatThree(mapsPath, websitePath, mobilePath, outPath) {
  await runFFmpeg([
    '-y',
    '-i',
    mapsPath,
    '-i',
    websitePath,
    '-i',
    mobilePath,
    '-filter_complex',
    '[0:v][1:v][2:v]concat=n=3:v=1:a=0[v]',
    '-map',
    '[v]',
    '-c:v',
    'libx264',
    '-preset',
    'slow',
    '-crf',
    '20',
    '-pix_fmt',
    'yuv420p',
    '-r',
    '30',
    '-movflags',
    '+faststart',
    outPath,
  ]);
}

async function concatDesktopAndMobile(desktopTmp, mobileTmp, outPath) {
  await runFFmpeg([
    '-y',
    '-i',
    desktopTmp,
    '-i',
    mobileTmp,
    '-filter_complex',
    '[0:v]scale=1280:720:flags=lanczos,setsar=1[v0];[1:v]scale=1280:720:flags=lanczos,setsar=1[v1];[v0][v1]concat=n=2:v=1:a=0[v]',
    '-map',
    '[v]',
    '-c:v',
    'libx264',
    '-preset',
    'slow',
    '-crf',
    '20',
    '-pix_fmt',
    'yuv420p',
    '-r',
    '30',
    '-movflags',
    '+faststart',
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
    console.error('No desktop/mobile pairs found to combine.');
    process.exit(1);
  }

  let combinedCount = 0;

  // Hard-coded intro logo length. Audio intro plays over the first 8s of logo +
  // continues over the start of the Maps view. So Maps video target needs to
  // include the intro audio remainder.
  const INTRO_LOGO_HARDCODED_SEC = 8;

  for (const pair of pairs) {
    if (combinedCount >= MAX_COMBINES) break;

    const { base } = pair;

    console.log(`\nCombining: ${base}`);

    const outCombined = path.join(COMBINED_DIR, `${base}_combined.mp4`);

    // Look up audio segment durations from step-6 manifest (for strict sync)
    const slug = String(base).replace(/^\d+_/, '');
    const slugifiedSlug = slugify(slug, { lower: true, strict: true });
    const segmentManifestCandidates = [
      path.join(AUDIO_ROOT, baseName, `${base}_segments`, 'manifest.json'),
      path.join(AUDIO_ROOT, baseName, `01_${slugifiedSlug}_segments`, 'manifest.json'),
    ];
    const manifestPath = segmentManifestCandidates.find((p) => fs.existsSync(p));
    let manifest = null;
    if (manifestPath) {
      try {
        manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        console.log(`  Audio manifest: ${manifestPath}`);
        console.log(`    intro=${manifest.segments.intro.durationSeconds.toFixed(2)}s maps=${manifest.segments.maps.durationSeconds.toFixed(2)}s website=${manifest.segments.website.durationSeconds.toFixed(2)}s mobile=${manifest.segments.mobile.durationSeconds.toFixed(2)}s outro=${manifest.segments.outro.durationSeconds.toFixed(2)}s`);
      } catch {}
    } else {
      console.log('  No audio manifest found; using legacy concat (no strict sync).');
    }

    if (manifest && pair.format === 'split') {
      // 3-webm strict-sync mode (Maps + Website + Mobile recorded separately)
      const mapsAudio = manifest.segments.maps.durationSeconds;
      const websiteAudio = manifest.segments.website.durationSeconds;
      const mobileAudio = manifest.segments.mobile.durationSeconds;
      const introAudio = manifest.segments.intro.durationSeconds;

      // Maps video must cover: intro_audio_remainder (after 5s logo) + maps_audio
      const mapsTargetSec = Math.max(0.5, introAudio - INTRO_LOGO_HARDCODED_SEC) + mapsAudio;
      const websiteTargetSec = websiteAudio;
      const mobileTargetSec = mobileAudio;

      console.log(`  Targets: maps=${mapsTargetSec.toFixed(2)}s website=${websiteTargetSec.toFixed(2)}s mobile=${mobileTargetSec.toFixed(2)}s`);
      console.log(`  Sources: maps=${pair.mapsPath}`);
      console.log(`           website=${pair.websitePath}`);
      console.log(`           mobile=${pair.mobilePath}`);

      const mapsTmp = path.join(COMBINED_DIR, `${base}_maps_tmp.mp4`);
      const websiteTmp = path.join(COMBINED_DIR, `${base}_website_tmp.mp4`);
      const mobileSegTmp = path.join(COMBINED_DIR, `${base}_mobile_seg_tmp.mp4`);

      await sliceAndPad(pair.mapsPath, 0, null, mapsTargetSec, mapsTmp, true);
      await sliceAndPad(pair.websitePath, 0, null, websiteTargetSec, websiteTmp, true);
      await sliceAndPad(pair.mobilePath, 0, null, mobileTargetSec, mobileSegTmp, false);
      await concatThree(mapsTmp, websiteTmp, mobileSegTmp, outCombined);
      console.log(`  ✓ Combined (strict-sync, 3-webm) video saved: ${outCombined}`);
    } else if (manifest && pair.format === 'legacy') {
      // Legacy 1-webm path (kept for older recordings)
      const desktopMetaPath = pair.desktopPath.replace(/\.webm$/i, '.meta.json');
      let desktopMeta = null;
      if (fs.existsSync(desktopMetaPath)) {
        try {
          desktopMeta = JSON.parse(fs.readFileSync(desktopMetaPath, 'utf-8'));
          console.log(`  Desktop meta: transition at ${desktopMeta.mapsToWebsiteTransitionSeconds}s`);
        } catch {}
      }
      const desktopTmp = path.join(COMBINED_DIR, `${base}_desktop_tmp.mp4`);
      const mobileTmp = path.join(COMBINED_DIR, `${base}_mobile_tmp.mp4`);
      if (desktopMeta?.mapsToWebsiteTransitionSeconds != null) {
        const introAudio = manifest.segments.intro.durationSeconds;
        const mapsTargetSec = Math.max(0.5, introAudio - INTRO_LOGO_HARDCODED_SEC) + manifest.segments.maps.durationSeconds;
        const mapsTmp = path.join(COMBINED_DIR, `${base}_maps_tmp.mp4`);
        const websiteTmp = path.join(COMBINED_DIR, `${base}_website_tmp.mp4`);
        const mobileSegTmp = path.join(COMBINED_DIR, `${base}_mobile_seg_tmp.mp4`);
        await sliceAndPad(pair.desktopPath, 0, desktopMeta.mapsToWebsiteTransitionSeconds, mapsTargetSec, mapsTmp, true);
        await sliceAndPad(pair.desktopPath, desktopMeta.mapsToWebsiteTransitionSeconds, null, manifest.segments.website.durationSeconds, websiteTmp, true);
        await sliceAndPad(pair.mobilePath, 0, null, manifest.segments.mobile.durationSeconds, mobileSegTmp, false);
        await concatThree(mapsTmp, websiteTmp, mobileSegTmp, outCombined);
        console.log(`  ✓ Combined (strict-sync, legacy 1-webm) video saved: ${outCombined}`);
      } else {
        await makeDesktopTmp(pair.desktopPath, desktopTmp);
        await makeMobileTmp(pair.mobilePath, mobileTmp);
        await concatDesktopAndMobile(desktopTmp, mobileTmp, outCombined);
        console.log(`  ✓ Combined (legacy concat) video saved: ${outCombined}`);
      }
    }

    combinedCount++;
  }

  if (!combinedCount) {
    console.error('No pairs combined. Check that *_desktop.webm and *_mobile.webm files exist.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error in step-4-combine-desktop-mobile:', err.message || err);
  process.exit(1);
});
