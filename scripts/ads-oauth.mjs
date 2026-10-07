#!/usr/bin/env node
/**
 * One-time: mint a Google Ads API refresh token for hello@rocketgrowthagency.com.
 * Desktop-app loopback flow — no secret leaves this machine.
 * Run:  node scripts/ads-oauth.mjs
 */
import http from "node:http";
import { URL } from "node:url";
import fs from "node:fs";

const ID = process.env.GOOGLE_ADS_CLIENT_ID;
const SECRET = process.env.GOOGLE_ADS_CLIENT_SECRET;
if (!ID || !SECRET) { console.error("⛔ GOOGLE_ADS_CLIENT_ID / SECRET not in env — source .env first"); process.exit(2); }

const server = http.createServer();
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
const redirect = `http://localhost:${port}`;

const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
auth.searchParams.set("client_id", ID);
auth.searchParams.set("redirect_uri", redirect);
auth.searchParams.set("response_type", "code");
auth.searchParams.set("scope", "https://www.googleapis.com/auth/adwords");
auth.searchParams.set("access_type", "offline");
auth.searchParams.set("prompt", "consent");      // force a refresh token even on re-auth

console.log("\n🔑 Open this URL, sign in as hello@rocketgrowthagency.com, and approve:\n");
console.log(auth.toString());
console.log("\nWaiting for the redirect…\n");

const code = await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error("timed out after 20 minutes")), 1200000);
  server.on("request", (req, res) => {
    const u = new URL(req.url, redirect);
    const c = u.searchParams.get("code"), e = u.searchParams.get("error");
    // 🔴 THE CHARSET IS NOT OPTIONAL. Without it the browser falls back to Latin-1 and the em-dash
    // in the line below renders as "Done â€" you can close this tab." Node sends UTF-8 bytes; the
    // header has to say so. Seen by Chris 2026-10-07 on the live callback page.
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`<h2 style="font:600 20px system-ui">${c ? "Done — you can close this tab." : "Failed: " + e}</h2>`);
    clearTimeout(t);
    c ? resolve(c) : reject(new Error(e || "no code"));
  });
});
server.close();

const r = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ code, client_id: ID, client_secret: SECRET, redirect_uri: redirect, grant_type: "authorization_code" }),
});
const j = await r.json();
if (!j.refresh_token) { console.error("⛔ no refresh_token returned:", JSON.stringify(j).slice(0, 300)); process.exit(1); }

const env = fs.readFileSync(".env", "utf8");
if (/^GOOGLE_ADS_REFRESH_TOKEN=/m.test(env)) {
  fs.writeFileSync(".env", env.replace(/^GOOGLE_ADS_REFRESH_TOKEN=.*$/m, `GOOGLE_ADS_REFRESH_TOKEN=${j.refresh_token}`));
} else {
  fs.appendFileSync(".env", `GOOGLE_ADS_REFRESH_TOKEN=${j.refresh_token}\n`);
}
console.log(`✅ refresh token saved to .env (${j.refresh_token.length} chars). Scope: ${j.scope}`);
