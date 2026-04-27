// State persistence for the flow engine.
// Onboarding (Month 1) state lives in client_onboarding_records.data JSONB.
// Monthly (Month 2+) state lives in client_monthly_records.data JSONB (one row per reporting_month).

import "dotenv/config";

const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function assertEnv() {
  if (!SUPA_URL || !SUPA_KEY) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env");
  }
}

async function rest(path, init = {}) {
  assertEnv();
  const r = await fetch(`${SUPA_URL}/rest/v1${path}`, {
    ...init,
    headers: {
      apikey: SUPA_KEY,
      Authorization: `Bearer ${SUPA_KEY}`,
      "Content-Type": "application/json",
      Prefer: init.method && init.method !== "GET" ? "return=representation" : "",
      ...(init.headers || {}),
    },
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Supabase ${r.status} ${path}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}

export async function loadClient(clientId) {
  const rows = await rest(`/clients?id=eq.${clientId}&select=*`);
  if (!rows.length) throw new Error(`Client ${clientId} not found`);
  return rows[0];
}

// --- Month 1 state ---
export async function loadOnboardingState(clientId) {
  const rows = await rest(`/client_onboarding_records?client_id=eq.${clientId}&select=*`);
  return rows[0] || null;
}

export async function saveOnboardingTaskState(clientId, stepId, patch) {
  const existing = await loadOnboardingState(clientId);
  const data = existing?.data || { playbook_version: "month1-v1", tasks: {} };
  if (!data.tasks) data.tasks = {};
  data.tasks[stepId] = { ...(data.tasks[stepId] || {}), ...patch };

  if (existing) {
    await rest(`/client_onboarding_records?client_id=eq.${clientId}`, {
      method: "PATCH",
      body: JSON.stringify({ data, updated_at: new Date().toISOString() }),
    });
  } else {
    const client = await loadClient(clientId);
    await rest(`/client_onboarding_records`, {
      method: "POST",
      body: JSON.stringify({
        workspace_id: client.workspace_id,
        client_id: clientId,
        data,
      }),
    });
  }
  return data.tasks[stepId];
}

// --- Month 2+ state ---
function currentReportingMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export async function loadMonthlyState(clientId, reportingMonth = currentReportingMonth()) {
  const rows = await rest(`/client_monthly_records?client_id=eq.${clientId}&reporting_month=eq.${reportingMonth}&select=*`);
  return rows[0] || null;
}

export async function ensureMonthlyState(clientId, reportingMonth = currentReportingMonth()) {
  const existing = await loadMonthlyState(clientId, reportingMonth);
  if (existing) return existing;
  const client = await loadClient(clientId);
  const created = await rest(`/client_monthly_records`, {
    method: "POST",
    body: JSON.stringify({
      workspace_id: client.workspace_id,
      client_id: clientId,
      reporting_month: reportingMonth,
      data: { playbook_version: "month2plus-v1", tasks: {} },
    }),
  });
  return created?.[0] || created;
}

export async function saveMonthlyTaskState(clientId, stepId, patch, reportingMonth = currentReportingMonth()) {
  const existing = await ensureMonthlyState(clientId, reportingMonth);
  const data = existing.data || { playbook_version: "month2plus-v1", tasks: {} };
  if (!data.tasks) data.tasks = {};
  data.tasks[stepId] = { ...(data.tasks[stepId] || {}), ...patch };

  await rest(`/client_monthly_records?id=eq.${existing.id}`, {
    method: "PATCH",
    body: JSON.stringify({ data, updated_at: new Date().toISOString() }),
  });
  return data.tasks[stepId];
}

export async function logActivity(clientId, kind, payload) {
  try {
    await rest(`/client_activity`, {
      method: "POST",
      body: JSON.stringify({ client_id: clientId, kind, payload, occurred_at: new Date().toISOString() }),
    });
  } catch (e) {
    // client_activity table may not exist yet — non-fatal
  }
}
