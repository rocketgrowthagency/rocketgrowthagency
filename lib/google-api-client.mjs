// Google API client — given a client_id, returns a token + helper fetchers
// for GA4 / GSC / GBP / YouTube. Auto-refreshes access tokens.
//
// Usage:
//   import { getGoogleClient } from "./lib/google-api-client.mjs";
//   const g = await getGoogleClient(clientId);
//   const ga4 = await g.fetchJson(`https://analyticsdata.googleapis.com/v1beta/${g.ga4PropertyId}:runReport`, { method: "POST", body: ... });
//
// Env required:
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY     — bypasses RLS to read refresh tokens
//   GOOGLE_OAUTH_CLIENT_ID
//   GOOGLE_OAUTH_CLIENT_SECRET

import "dotenv/config";

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

function env(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

async function loadOauthRow(clientId) {
  const supaUrl = env("SUPABASE_URL");
  const supaKey = env("SUPABASE_SERVICE_ROLE_KEY");
  const url = `${supaUrl}/rest/v1/client_google_oauth?client_id=eq.${clientId}&select=*`;
  const r = await fetch(url, {
    headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}` },
  });
  if (!r.ok) throw new Error(`Supabase load failed (${r.status}): ${await r.text()}`);
  const rows = await r.json();
  if (!rows.length) throw new Error(`No Google OAuth row for client_id=${clientId} — they have not connected Google yet.`);
  return rows[0];
}

async function refreshAccessToken(refreshToken) {
  const r = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env("GOOGLE_OAUTH_CLIENT_ID"),
      client_secret: env("GOOGLE_OAUTH_CLIENT_SECRET"),
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }).toString(),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`Token refresh failed: ${data.error || r.status} — ${data.error_description || ""}`);
  return {
    accessToken: data.access_token,
    expiresAt: new Date(Date.now() + (data.expires_in - 60) * 1000).toISOString(),
  };
}

async function persistAccessToken(clientId, accessToken, expiresAt) {
  const supaUrl = env("SUPABASE_URL");
  const supaKey = env("SUPABASE_SERVICE_ROLE_KEY");
  await fetch(`${supaUrl}/rest/v1/client_google_oauth?client_id=eq.${clientId}`, {
    method: "PATCH",
    headers: {
      apikey: supaKey,
      Authorization: `Bearer ${supaKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      access_token: accessToken,
      access_token_expires_at: expiresAt,
      last_refreshed_at: new Date().toISOString(),
      last_used_at: new Date().toISOString(),
    }),
  });
}

export async function getGoogleClient(clientId) {
  const row = await loadOauthRow(clientId);

  let accessToken = row.access_token;
  const exp = row.access_token_expires_at ? new Date(row.access_token_expires_at).getTime() : 0;

  if (!accessToken || exp < Date.now()) {
    const fresh = await refreshAccessToken(row.refresh_token);
    accessToken = fresh.accessToken;
    await persistAccessToken(clientId, fresh.accessToken, fresh.expiresAt);
  }

  const fetchJson = async (url, init = {}) => {
    const r = await fetch(url, {
      ...init,
      headers: {
        ...(init.headers || {}),
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": init.body ? "application/json" : undefined,
      },
    });
    const text = await r.text();
    if (!r.ok) throw new Error(`Google API ${r.status} ${url}: ${text.slice(0, 400)}`);
    return text ? JSON.parse(text) : null;
  };

  return {
    clientId,
    accessToken,
    googleEmail: row.google_account_email,
    ga4PropertyId: row.ga4_property_id,
    gscSiteUrl: row.gsc_site_url,
    gbpAccountId: row.gbp_account_id,
    gbpLocationId: row.gbp_location_id,
    youtubeChannelId: row.youtube_channel_id,
    scopes: row.scopes || [],
    fetchJson,

    // Convenience helpers (most common calls)
    async ga4RunReport(body) {
      if (!row.ga4_property_id) throw new Error("Client has no GA4 property linked");
      return fetchJson(`https://analyticsdata.googleapis.com/v1beta/${row.ga4_property_id}:runReport`, {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    async gscQuery(body) {
      if (!row.gsc_site_url) throw new Error("Client has no GSC site linked");
      const site = encodeURIComponent(row.gsc_site_url);
      return fetchJson(`https://searchconsole.googleapis.com/webmasters/v3/sites/${site}/searchAnalytics/query`, {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    async gbpGetLocation() {
      if (!row.gbp_location_id) throw new Error("Client has no GBP location linked");
      return fetchJson(`https://mybusinessbusinessinformation.googleapis.com/v1/${row.gbp_location_id}?readMask=name,title,categories,phoneNumbers,websiteUri,regularHours,profile`);
    },
    async gbpUpdateLocation(updateMask, body) {
      if (!row.gbp_location_id) throw new Error("Client has no GBP location linked");
      const mask = encodeURIComponent(updateMask);
      return fetchJson(`https://mybusinessbusinessinformation.googleapis.com/v1/${row.gbp_location_id}?updateMask=${mask}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
    },
  };
}
