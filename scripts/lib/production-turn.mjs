// scripts/lib/production-turn.mjs: the SAME one-turn-at-a-time lock as scripts/lib/production-turn.sh, for a Node run (the client data
// backup). Same directory, same holder line ("who<TAB>pid<TAB>started<TAB>hard_end", epoch seconds), same rules: a live holder inside its
// time makes you wait; a holder whose process is gone, or alive 10 minutes past its own hard end, is taken over; a run started by a holder
// inherits its turn (RGA_PRODUCTION_TURN_HELD). Approved 11-11 (automation clock decision 1). Gate: check-production-runs-take-turns.
import fs from "node:fs";
import path from "node:path";

const dirOf = (env) => env.RGA_PRODUCTION_TURN_DIR || "/tmp/rga-production-turn";
const holderOf = (dir) => { try { return fs.readFileSync(path.join(dir, "holder"), "utf8").split("\n")[0] || ""; } catch { return ""; } };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === "EPERM"; } };

/** 0 = may be taken over, 1 = a live holder inside its time */
function freeToTake(dir, nowS) {
  const h = holderOf(dir);
  if (!h) {
    let age = 0;
    try { age = nowS - Math.floor(fs.statSync(dir).mtimeMs / 1000); } catch { return true; }
    return age > 60;
  }
  const [, pid, , until] = h.split("\t");
  if (!/^\d+$/.test(pid || "")) return true;
  if (!alive(Number(pid))) return true;
  if (/^\d+$/.test(until || "") && nowS > Number(until) + 600) return true;
  return false;
}

/**
 * Wait for the turn. → { ok: true } (yours, given back when this process exits) or { ok: false, why }.
 * opts: { who, maxWaitMin, hardEndEpoch, env, sleepMs, nowS }
 */
export async function takeTurn({ who, maxWaitMin = 45, hardEndEpoch = 0, env = process.env, sleepMs = 30000, nowS = () => Math.floor(Date.now() / 1000) } = {}) {
  if (env.RGA_PRODUCTION_TURN_HELD) return { ok: true, inherited: true };
  const dir = dirOf(env), giveUp = nowS() + maxWaitMin * 60;
  for (;;) {
    try {
      fs.mkdirSync(dir);
      fs.writeFileSync(path.join(dir, "holder"), `${who}\t${process.pid}\t${nowS()}\t${hardEndEpoch}\n`);
      env.RGA_PRODUCTION_TURN_HELD = who;
      // given back on any exit, only if it is still ours
      process.on("exit", () => { try { if (holderOf(dir).split("\t")[1] === String(process.pid)) fs.rmSync(dir, { recursive: true, force: true }); } catch { /* the next taker sees a dead pid */ } });
      return { ok: true };
    } catch (e) {
      if (e.code !== "EEXIST") return { ok: false, why: `the production turn could not be taken (${e.code || e.message})` };
    }
    if (freeToTake(dir, nowS())) { fs.rmSync(dir, { recursive: true, force: true }); continue; }
    if (nowS() >= giveUp) {
      const [h, , since] = holderOf(dir).split("\t");
      const at = since ? new Date(Number(since) * 1000).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" }) : "?";
      return { ok: false, why: `${h || "another run"} held the clients' database for the whole ${maxWaitMin}-minute wait (since ${at})` };
    }
    await new Promise((r) => setTimeout(r, sleepMs));
  }
}
