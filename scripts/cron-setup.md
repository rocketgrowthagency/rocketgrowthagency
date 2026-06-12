# Cron / Scheduled Discovery Setup

Daily backlog crawl of the Airtable no-email leads. Pulls 200 leads/hr against the SerpAPI cap, auto-pauses + resumes when the cap hits, persists progress via `.discover-state.json` so restarts don't lose work.

## Manual one-shot

```bash
cd "/Users/chris/RGA/Rocket Growth Agency Scraper VS Code"
node scripts/discover-no-email-leads.mjs
```

Walks the entire no-email backlog with auto-pacing. For 600 leads × 3 queries/lead = ~9hr wall time on the 200/hr SerpAPI plan.

## Daily cron entry (recommended)

Open crontab:
```bash
crontab -e
```

Add this line (runs daily at 9am):
```cron
0 9 * * * cd "/Users/chris/RGA/Rocket Growth Agency Scraper VS Code" && /usr/local/bin/node scripts/discover-no-email-leads.mjs >> /tmp/discover-daily.log 2>&1
```

The script will:
- Run until SerpAPI cap → sleep 1hr → resume
- Save `.discover-state.json` after each lead so a Mac sleep/wake doesn't lose progress
- Auto-bail when all leads processed (clears state file)

## Resume from checkpoint

If the script crashes or is killed mid-run, it resumes from the last-processed record on next run automatically (reads `.discover-state.json`).

To force a specific resume point:
```bash
node scripts/discover-no-email-leads.mjs --resume-from=recAbCdEf123
```

## Health check standalone

```bash
node -e "require('./lib/serpapi-rate-aware.cjs').serpapiHealthCheck(process.env.SERPAPI_KEY, 'manual')"
```

Logs plan + searches remaining this month.

## Memory references

- `reference_serpapi_rate_limit.md` — rate-limit handling pattern
- `feedback_email_via_external_search.md` — discovery cascade architecture
- `project_2026-05-20_pipeline_baseline.md` — end-of-day regression baseline
