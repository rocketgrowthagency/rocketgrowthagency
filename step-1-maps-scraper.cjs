const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const slugify = require("slugify");

const stealth = StealthPlugin();
stealth.enabledEvasions.delete("user-agent-override");
stealth.enabledEvasions.delete("sourceurl");
puppeteer.use(stealth);

const SEARCH_QUERY =
  process.env.SEARCH_QUERY || process.argv.slice(2).join(" ") || "Dentists near Los Angeles CA";

const TARGET_UNIQUE_PLACES = Number(process.env.TARGET_UNIQUE_PLACES || 55);
const SCROLL_MAX_ITERS = Number(process.env.SCROLL_MAX_ITERS || 55);
const SCROLL_STABLE_ITERS = Number(process.env.SCROLL_STABLE_ITERS || 14);

const NAV_TIMEOUT_MS = Number(process.env.NAV_TIMEOUT_MS || 90000);
const RESULTS_READY_TIMEOUT_MS = Number(process.env.RESULTS_READY_TIMEOUT_MS || 70000);
const PLACE_READY_TIMEOUT_MS = Number(process.env.PLACE_READY_TIMEOUT_MS || 65000);

const OUTPUT_DIR = path.join(process.cwd(), "output");
const STEP1_DIR = path.join(OUTPUT_DIR, "Step 1");
const DEBUG_DIR = path.join(OUTPUT_DIR, "debug");

fs.mkdirSync(STEP1_DIR, { recursive: true });
fs.mkdirSync(DEBUG_DIR, { recursive: true });

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function todayISO() {
  const d = new Date();
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function safeSlug(s) {
  return (
    slugify(String(s || ""), { lower: true, strict: true, trim: true }).slice(0, 80) || "query"
  );
}

function csvEscape(v) {
  const s = v == null ? "" : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function parseUSAddress(full) {
  const out = { address: "", city: "", state: "", zip: "" };
  const s = String(full || "").trim();
  if (!s) return out;

  const cleaned = s.replace(/^[\s\uE000-\uF8FF]+/g, "").replace(/\s+/g, " ").trim();
  out.address = cleaned;

  const parts = cleaned.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 3) {
    const city = parts[parts.length - 2];
    const stZip = parts[parts.length - 1];
    const m = stZip.match(/^([A-Z]{2})\s+(\d{5})(?:-\d{4})?$/);
    if (m) {
      out.city = city;
      out.state = m[1];
      out.zip = m[2];
    } else {
      const m2 = stZip.match(/^([A-Z]{2})\b/);
      if (m2) out.state = m2[1];
      out.city = city;
    }
  }
  return out;
}

function simplifyPlaceUrl(u) {
  const s = String(u || "");
  const i = s.indexOf("/data=");
  if (i > -1) return s.slice(0, i);
  const j = s.indexOf("?authuser=");
  if (j > -1) return s.slice(0, j);
  return s;
}

function placeKeysFromUrl(u) {
  const s = String(u || "");
  const keys = [];
  const m1 = s.match(/!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i);
  if (m1 && m1[1]) keys.push(m1[1]);
  const m2 = s.match(/!19s([^!&?]+)/i);
  if (m2 && m2[1]) keys.push(m2[1]);
  const m3 = s.match(/ChIJ[0-9A-Za-z_-]+/);
  if (m3 && m3[0]) keys.push(m3[0]);
  const base = simplifyPlaceUrl(s);
  if (base) keys.push(base);
  return Array.from(new Set(keys));
}

async function saveDebug(page, label) {
  const ts = Date.now();
  const png = path.join(DEBUG_DIR, `${label}_${ts}.png`);
  const html = path.join(DEBUG_DIR, `${label}_${ts}.html`);
  try {
    await page.screenshot({ path: png, fullPage: true });
  } catch {}
  try {
    const content = await page.content();
    fs.writeFileSync(html, content, "utf8");
  } catch {}
  console.log(`🧩 saved debug: ${png}`);
  console.log(`🧩 saved debug: ${html}`);
}

async function waitForAny(page, selectors, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    for (const sel of selectors) {
      const ok = await page.$(sel).then((h) => !!h).catch(() => false);
      if (ok) return sel;
    }
    await delay(350);
  }
  return null;
}

async function waitForResultsUI(page) {
  const ok = await waitForAny(
    page,
    ['div[role="feed"]', "div.Nv2PK", 'a[href*="/maps/place/"]'],
    RESULTS_READY_TIMEOUT_MS
  );
  return ok;
}

async function openSearch(page, query) {
  const url = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
  console.log("🌍 Opening Google Maps search...");
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });

  const ok = await waitForResultsUI(page);
  if (!ok) {
    await saveDebug(page, "fatal_results_results_timeout");
    throw new Error("Results UI not ready: results_timeout");
  }
}

async function getFeedHandle(page) {
  const feed = await page.$('div[role="feed"]').catch(() => null);
  if (feed) return feed;
  const alt = await page.$(".m6QErb.DxyBCb.kA9KIf.dS8AEf").catch(() => null);
  if (alt) return alt;
  return null;
}

async function countResults(page) {
  return await page
    .evaluate(() => {
      const cards = document.querySelectorAll("div.Nv2PK").length;
      const placeLinks = document.querySelectorAll('a[href*="/maps/place/"]').length;
      return { cards, placeLinks };
    })
    .catch(() => ({ cards: 0, placeLinks: 0 }));
}

async function collectPlaceUrls(page, max = 800) {
  return await page
    .evaluate((maxN) => {
      const set = new Set();
      const anchors = Array.from(document.querySelectorAll('a[href*="/maps/place/"]'));
      for (const a of anchors) {
        const href = a.getAttribute("href") || "";
        if (!href) continue;
        let u = href;
        if (u.startsWith("/")) u = location.origin + u;
        if (!u.includes("google.com/maps/place/")) continue;
        set.add(u);
        if (set.size >= maxN) break;
      }
      return Array.from(set);
    }, max)
    .catch(() => []);
}

async function scrollUntilLoaded(page) {
  console.log("🔄 Scrolling the feed until all results are loaded...");
  const feed = await getFeedHandle(page);
  if (!feed) {
    await saveDebug(page, "fatal_no_feed");
    throw new Error("Could not find results feed container");
  }

  let stable = 0;
  let lastPlaceLinks = 0;

  for (let iter = 1; iter <= SCROLL_MAX_ITERS; iter++) {
    await page
      .evaluate((feedEl) => {
        feedEl.scrollTop = feedEl.scrollHeight;
      }, feed)
      .catch(() => {});

    try {
      const box = await feed.boundingBox().catch(() => null);
      if (box) {
        await page.mouse.move(
          box.x + Math.min(40, box.width - 2),
          box.y + Math.min(40, box.height - 2)
        );
        await page.mouse.wheel({ deltaY: 1200 }).catch(() => {});
      }
    } catch {}

    await delay(1250);

    const { cards, placeLinks } = await countResults(page);

    if (placeLinks <= lastPlaceLinks) stable++;
    else stable = 0;

    lastPlaceLinks = placeLinks;

    console.log(`🔄 Scroll: iter=${iter} cards=${cards} placeLinks=${placeLinks} stable=${stable}`);

    if (placeLinks >= TARGET_UNIQUE_PLACES && stable >= 2) break;
    if (stable >= SCROLL_STABLE_ITERS) break;
  }

  console.log("✅ Scroll complete.");
}

async function extractPlaceDetails(page) {
  return await page
    .evaluate(() => {
      function textFrom(el) {
        if (!el) return "";
        return (el.innerText || el.textContent || "").trim();
      }

      function firstText(selectors) {
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          const t = textFrom(el);
          if (t) return t;
        }
        return "";
      }

      function byDataItemId(id) {
        const el =
          document.querySelector(`[data-item-id="${id}"]`) ||
          document.querySelector(`button[data-item-id="${id}"]`) ||
          document.querySelector(`a[data-item-id="${id}"]`);
        return textFrom(el);
      }

      function hrefByDataItemId(id) {
        const el = document.querySelector(`a[data-item-id="${id}"]`) || null;
        const href = el ? (el.getAttribute("href") || "").trim() : "";
        return href;
      }

      function findRating() {
        const el = document.querySelector('div.F7nice span[aria-hidden="true"]');
        return textFrom(el);
      }

      function findReviews() {
        const btn = Array.from(document.querySelectorAll("button, a")).find((x) =>
          /reviews/i.test((x.getAttribute("aria-label") || "") + " " + (x.textContent || ""))
        );
        const t = textFrom(btn);
        const m = t.match(/([\d,]+)\s*reviews?/i);
        if (m) return m[1].replace(/,/g, "");
        const m2 = (btn && (btn.getAttribute("aria-label") || "")).match(/([\d,]+)\s*reviews?/i);
        if (m2) return m2[1].replace(/,/g, "");
        return "";
      }

      function findCategory() {
        const sel = [
          'button[jsaction*="pane.rating.category"]',
          'button[jsaction*="pane.rating.more"]',
          'button[aria-label*="Category"]',
          'button[aria-label*="category"]'
        ];
        for (const s of sel) {
          const el = document.querySelector(s);
          const t = textFrom(el);
          if (t && t.length < 80) return t;
        }
        const bucket = Array.from(document.querySelectorAll("button, div, span")).slice(0, 260);
        for (const el of bucket) {
          const t = textFrom(el);
          if (!t) continue;
          if (t.length >= 3 && t.length <= 55) {
            if (/directions|save|nearby|send to|share|add a photo|claim/i.test(t)) continue;
            return t;
          }
        }
        return "";
      }

      const name = firstText(["h1.DUwDvf", "h1"]);
      const address = byDataItemId("address");
      const phone = byDataItemId("phone");
      const website = hrefByDataItemId("authority");
      const rating = findRating();
      const reviews = findReviews();
      const category = findCategory();

      return { name, address, phone, website, rating, reviews, category };
    })
    .catch(() => ({
      name: "",
      address: "",
      phone: "",
      website: "",
      rating: "",
      reviews: "",
      category: ""
    }));
}

async function goBackToResults(page, query) {
  const isPlace = await page
    .evaluate(() => location.href.includes("/maps/place/") || location.pathname.includes("/maps/place/"))
    .catch(() => false);

  if (!isPlace) return true;

  const clicked = await page
    .evaluate(() => {
      const btn =
        document.querySelector('button[aria-label="Back"]') ||
        document.querySelector('button[aria-label*="Back"]') ||
        document.querySelector('button[jsaction*="pane.back"]') ||
        document.querySelector('button[jsaction="pane.back"]');
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    })
    .catch(() => false);

  if (!clicked) {
    try {
      await page.goBack({ waitUntil: "domcontentloaded", timeout: 25000 });
    } catch {
      try {
        await page.evaluate(() => history.back());
      } catch {}
    }
  }

  const ok = await waitForAny(page, ['div[role="feed"]', "div.Nv2PK", 'a[href*="/maps/place/"]'], 25000);
  if (ok) return true;

  try {
    await openSearch(page, query);
    await delay(1200);
    return true;
  } catch {
    return false;
  }
}

async function ensureOnResults(page, query) {
  const ok = await waitForAny(page, ['div[role="feed"]', "div.Nv2PK", 'a[href*="/maps/place/"]'], 6000);
  if (ok) return;
  await openSearch(page, query);
  await delay(1200);
}

async function openPlaceByClick(page, placeUrl) {
  const keys = placeKeysFromUrl(placeUrl);

  const clicked = await page
    .evaluate((keysIn) => {
      const anchors = Array.from(document.querySelectorAll('a[href*="/maps/place/"]'));
      function norm(h) {
        if (!h) return "";
        let u = h;
        if (u.startsWith("/")) u = location.origin + u;
        return u;
      }
      for (const a of anchors) {
        const href = norm(a.getAttribute("href") || "");
        if (!href) continue;
        for (const k of keysIn) {
          if (!k) continue;
          if (href.includes(k) || href === k) {
            try {
              a.scrollIntoView({ block: "center" });
            } catch {}
            try {
              a.click();
              return true;
            } catch {}
          }
        }
      }
      return false;
    }, keys)
    .catch(() => false);

  if (!clicked) return false;

  const ok = await waitForAny(
    page,
    ["h1.DUwDvf", "h1", '[data-item-id="address"]', 'a[data-item-id="authority"]', 'button[data-item-id="phone"]'],
    PLACE_READY_TIMEOUT_MS
  );

  return !!ok;
}

async function gotoPlaceSameTab(page, placeUrl) {
  const tryUrls = [placeUrl, simplifyPlaceUrl(placeUrl)].filter(Boolean);
  let lastErr = null;

  for (const u of tryUrls) {
    try {
      const t0 = Date.now();
      await page.goto(u, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
      const dt = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`✅ place loaded in ${dt}s`);

      const ok = await waitForAny(
        page,
        ["h1.DUwDvf", "h1", '[data-item-id="address"]', 'a[data-item-id="authority"]', 'button[data-item-id="phone"]'],
        PLACE_READY_TIMEOUT_MS
      );

      if (!ok) throw new Error("Place UI not ready");
      return true;
    } catch (e) {
      lastErr = e;
    }
  }

  if (lastErr) throw lastErr;
  return false;
}

async function main() {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--disable-dev-shm-usage",
      "--no-first-run",
      "--no-default-browser-check"
    ],
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  });

  let mainPage = null;

  try {
    const pages = await browser.pages().catch(() => []);
    const page = pages && pages.length ? pages[0] : await browser.newPage();
    mainPage = page;

    page.on("popup", async (p) => {
      try {
        await p.close();
      } catch {}
    });

    browser.on("targetcreated", async (target) => {
      try {
        if (target.type() !== "page") return;
        const opener = target.opener && (await target.opener().catch(() => null));
        if (!opener) return;
        const p = await target.page().catch(() => null);
        if (!p) return;
        if (mainPage && p === mainPage) return;
        await p.close().catch(() => {});
      } catch {}
    });

    await page.setDefaultNavigationTimeout(NAV_TIMEOUT_MS);
    await page.setDefaultTimeout(Math.max(45000, Math.floor(NAV_TIMEOUT_MS * 0.8)));

    await openSearch(page, SEARCH_QUERY);
    await delay(1800);

    const initialResultsOk = await waitForResultsUI(page);
    if (!initialResultsOk) {
      await saveDebug(page, "fatal_results_first_render");
      throw new Error("Results UI not ready after openSearch");
    }

    await scrollUntilLoaded(page);

    const rawUrls = await collectPlaceUrls(page, 800);
    const placeUrls = Array.from(new Set(rawUrls)).slice(0, 500);

    console.log(`📋 Cards with usable place URLs: ${placeUrls.length} (these are what we’ll scrape).`);

    const date = todayISO();
    const querySlug = safeSlug(SEARCH_QUERY.replace(/\bnear\b/i, "").trim());
    const outFile = path.join(STEP1_DIR, `${date}_${querySlug}-[step-1].csv`);

    const header = [
      "rank",
      "searchTerm",
      "source",
      "name",
      "address",
      "city",
      "state",
      "zip",
      "phone",
      "website",
      "rating",
      "reviews",
      "category",
      "placeUrl"
    ];

    const ws = fs.createWriteStream(outFile, { flags: "w" });
    ws.write(header.join(",") + "\n");

    const seen = new Set();
    let written = 0;

    for (let i = 0; i < placeUrls.length; i++) {
      const rank = i + 1;
      const placeUrl = placeUrls[i];
      const dedupeKey = simplifyPlaceUrl(placeUrl);

      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      await goBackToResults(page, SEARCH_QUERY);
      await ensureOnResults(page, SEARCH_QUERY);

      console.log(
        `[${rank}/${placeUrls.length}] scraping: ${
          placeUrl.split("/maps/place/")[1]
            ? decodeURIComponent(placeUrl.split("/maps/place/")[1].split("/")[0])
            : "place"
        }`
      );
      console.log(`   ↳ opening place: ${placeUrl}`);

      try {
        let opened = await openPlaceByClick(page, placeUrl);
        if (!opened) opened = await gotoPlaceSameTab(page, placeUrl);
        if (!opened) throw new Error("Could not open place");

        await delay(450);

        const details = await extractPlaceDetails(page);
        const name = (details.name || "").trim();
        const addr = (details.address || "").trim().replace(/^[\s\uE000-\uF8FF]+/g, "").trim();
        const parsed = parseUSAddress(addr);

        const row = {
          rank,
          searchTerm: SEARCH_QUERY,
          source: "Google Maps",
          name,
          address: parsed.address,
          city: parsed.city,
          state: parsed.state,
          zip: parsed.zip,
          phone: (details.phone || "").trim(),
          website: (details.website || "").trim(),
          rating: (details.rating || "").trim(),
          reviews: (details.reviews || "").trim(),
          category: (details.category || "").trim(),
          placeUrl
        };

        ws.write(
          [
            row.rank,
            row.searchTerm,
            row.source,
            row.name,
            row.address,
            row.city,
            row.state,
            row.zip,
            row.phone,
            row.website,
            row.rating,
            row.reviews,
            row.category,
            row.placeUrl
          ]
            .map(csvEscape)
            .join(",") + "\n"
        );

        written++;
        console.log(`[${rank}/${placeUrls.length}] ✅ saved: ${row.name || "(no name)"} (written=${written})`);

        await goBackToResults(page, SEARCH_QUERY);

        if (written >= TARGET_UNIQUE_PLACES) break;

        await delay(450 + Math.floor(Math.random() * 450));
      } catch (e) {
        const msg = e && e.message ? e.message : String(e);
        console.log(`   ❌ error loading place ${placeUrl}: ${msg}`);
        await saveDebug(page, `place_error_${rank}`);
        try {
          await goBackToResults(page, SEARCH_QUERY);
        } catch {}
      }
    }

    ws.end();
    console.log(`📁 Done! Saved ${written} listings to ${outFile}`);
  } catch (e) {
    console.error("❌ Error during scraping:", e);
  } finally {
    await browser.close().catch(() => {});
  }
}

main();
