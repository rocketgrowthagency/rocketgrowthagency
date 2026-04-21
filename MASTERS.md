# Scraper Pipeline — Master File Map

This doc declares which file is canonical for each pipeline step. Anything not listed here is either archived or an abandoned experiment. When in doubt, the top-level tracked file for each step number is master.

## Pipeline

| Step | Master file | Purpose |
|------|-------------|---------|
| 1 | `step-1-maps-scraper.cjs` | Google Maps search → business listings CSV |
| 2 | `step-2-email-scraper.mjs` | Enrich CSV with email / Facebook / Instagram from each website |
| 3 | `step-3-video-recorder.mjs` | Record desktop + mobile `.webm` of each business website |
| 4 | `step-4-combine-desktop-mobile.mjs` | Encode + concatenate desktop/mobile into one MP4 |
| 5 | `step-5-branding.mjs` | Add RGA intro/outro/branding overlay to the combined MP4 |
| 6 | `step-6-voiceover.mjs` | OpenAI-generated voiceover MP3 per business |
| 7 | `step-7-merge-branded-audio.mjs` | Merge branded MP4 + voiceover MP3 into final outreach video |

## Archived / Not Master

- `archive/step1/` — pre-canonical attempts; kept for reference
- `archive/step1-tests/` — test harnesses from early iteration
- `archive/step2/` — 10 prior email-scraper variants (test1-9, previous)
- `archive/untracked-variants/` — untracked-on-disk experiments moved off the top level:
  - `[2]step-1-maps-scraper.cjs` — alternate Step 1 variant from Dec 2025, never committed
  - `[longer]step-1-maps-scraper.cjs` — longer-scroll Step 1 variant from Dec 2025, never committed

## Output Expectations

Each step reads from `output/` and writes to `output/` unless configured otherwise. Step N+1 auto-discovers the latest file from step N by filename convention (`YYYY-MM-DD_search-term-[step-N].csv` or directory).

## Running

Manual invocation per step today (Chris runs one at a time while iterating). Orchestrator `run-pipeline.mjs` is queued to wrap steps 1→7 into a single command.

## Caps

Steps 3-7 each have a `MAX_*=1` cap (video/branding/merge counts) for testing iteration. Lift to unlimited or batch-size when running production campaigns.
