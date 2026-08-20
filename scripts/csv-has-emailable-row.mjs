#!/usr/bin/env node
/**
 * csv-has-emailable-row.mjs — does this step-2 CSV contain a row we can actually email? (2026-08-20)
 *
 * Exit 0 = yes. Exit 1 = no. Exit 2 = unreadable.
 *
 * WHY THIS EXISTS
 * `rebuild-broken-videos.sh` decided "does this CSV have an email?" with its own test: *any non-empty
 * value in a column whose name contains "email"*. A URL satisfies that. Katie B Creative's row held
 * `https://djkatieb.com/` in the email cell, so the rebuild built and deployed a video — and step-8
 * then rejected the row as unusable, leaving a live video with no lead that can never be emailed
 * ([[project-orphaned-videos]]).
 *
 * Two rules answering the same question WILL drift. This calls `extractValidEmail` from
 * lib/email-validation.cjs — the SAME rule step-8 applies — so the build filter and the publish filter
 * cannot disagree.
 *
 * 🔴 USES A REAL CSV PARSER. A first attempt split lines on "," and misaligned the columns on any row
 * containing a quoted comma — which REJECTED a good lead (Marissa Joy Photography). That is the
 * dangerous direction: a false negative silently drops a real prospect
 * ([[feedback-unreachable-contact-emails]]). Never hand-parse these files.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const csvParser = require('csv-parser');
const { extractValidEmail, isUsableLeadRow } = require('../lib/email-validation.cjs');

const file = process.argv[2];
if (!file || !fs.existsSync(file)) process.exit(2);

let found = false;
await new Promise((resolve) => {
  fs.createReadStream(file)
    .pipe(csvParser())
    .on('data', (row) => {
      if (found) return;
      // BOTH conditions, because step-8 applies both: the row must be a contactable business AND have a
      // usable email. Katie B Creative had a valid email but no phone and no website, so step-8 filtered
      // her as a directory/generic listing — after the build had already spent a full render on her.
      if (!isUsableLeadRow(row)) return;
      for (const [k, v] of Object.entries(row)) {
        if (!/email/i.test(k || '')) continue;
        if (extractValidEmail(v)) { found = true; return; }
      }
    })
    .on('end', resolve)
    .on('error', resolve);
});

process.exit(found ? 0 : 1);
