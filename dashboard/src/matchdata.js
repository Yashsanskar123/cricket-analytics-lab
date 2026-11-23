/* Historical match data: matches.json (notebook 08) and predictions.json (paste cells at the end of notebooks 03, 04, 06).
   Standalone module. lib.js registers the adapters so the files load, persist and validate like the other exports.
   Nothing here invents numbers: every value comes from those two files or is a plain computation on them. */

const MD = {
  loaded: { matches: false, predictions: false },
  meta: {}, rows: [], byId: new Map(), progress: {}, seasons: [], teams: [], venues: [],
  statusCounts: {}, files: 0,
  pred: { nb03: {}, nb04: {}, nb06: {} }, predInfo: {}, predMeta: {},
};
const cache = new Map();
const key = (id) => String(id);

const TEAM_CODES = {
  "Chennai Super Kings": "CSK", "Mumbai Indians": "MI", "Royal Challengers Bengaluru": "RCB", "Royal Challengers Bangalore": "RCB",
  "Kolkata Knight Riders": "KKR", "Delhi Capitals": "DC", "Delhi Daredevils": "DC", "Punjab Kings": "PBKS", "Kings XI Punjab": "PBKS",
  "Rajasthan Royals": "RR", "Sunrisers Hyderabad": "SRH", "Deccan Chargers": "DCH", "Gujarat Titans": "GT", "Lucknow Super Giants": "LSG",
  "Rising Pune Supergiant": "RPS", "Rising Pune Supergiants": "RPS", "Gujarat Lions": "GL", "Kochi Tuskers Kerala": "KTK", "Pune Warriors": "PWI",
};
const ERA = { "Delhi Daredevils": "Delhi Capitals", "Kings XI Punjab": "Punjab Kings", "Royal Challengers Bangalore": "Royal Challengers Bengaluru", "Rising Pune Supergiants": "Rising Pune Supergiant" };
const canonTeam = (t) => ERA[t] || t;
const teamCode = (t) => (t ? TEAM_CODES[t] || String(t).split(" ").map((w) => w[0]).join("").slice(0, 4).toUpperCase() : "?");

function adaptMatches(j) {
  const cols = j.cols || [];
  const rows = (j.rows || []).map((r) => {
    const o = {}; cols.forEach((c, i) => { o[c] = r[i]; });
    o.id = key(o.id);
    o.usable = o.target !== null && o.target !== undefined;
    // who batted first: from the toss, falling back to the result when the toss is missing
    let first = null;
    if (o.toss_winner && o.toss_decision) first = o.toss_decision === "bat" ? o.toss_winner : (o.toss_winner === o.team1 ? o.team2 : o.team1);
    else if (o.winner && (o.chase_won === 0 || o.chase_won === 1)) first = o.chase_won === 0 ? o.winner : (o.winner === o.team1 ? o.team2 : o.team1);
    o.first = first; o.chaser = first ? (first === o.team1 ? o.team2 : o.team1) : null;
    o.label = `${teamCode(o.team1)} v ${teamCode(o.team2)}`;
    return o;
  });
  MD.rows = rows; MD.byId = new Map(rows.map((r) => [r.id, r]));
  MD.progress = j.progress || {};
  MD.seasons = (j.seasons || [...new Set(rows.map((r) => r.season))]).slice().sort((a, b) => a - b);
  MD.teams = (j.teams || [...new Set(rows.flatMap((r) => [r.team1, r.team2]))]).filter(Boolean).slice().sort();
  MD.venues = [...new Set(rows.map((r) => r.venue).filter(Boolean))].sort();
  MD.statusCounts = j.status_counts || {}; MD.files = j.files || rows.length;
  MD.meta = j.meta || {}; MD.loaded.matches = true; cache.clear();
}

function adaptPredictions(j) {
  ["nb03", "nb04", "nb06"].forEach((s) => {
    if (j[s] && j[s].matches) {
      const m = {}; Object.entries(j[s].matches).forEach(([id, v]) => { m[key(id)] = v; });
      MD.pred[s] = m; MD.predInfo[s] = { ...j[s], matches: undefined };
    }
  });
  MD.predMeta = j.meta || {}; MD.loaded.predictions = true; cache.clear();
}

const hasPred = (id) => !!(MD.pred.nb03[key(id)] || MD.pred.nb04[key(id)] || MD.pred.nb06[key(id)]);
const splitOf = (id) => {
  const k = key(id);
  return (MD.pred.nb03[k] || MD.pred.nb04[k] || MD.pred.nb06[k] || {}).split || null;
};
const SPLIT_LABEL = { val: "Validation (2021–25, out of sample)", hold: "Holdout (2026, out of sample)", train: "In-sample reference" };

/* Result sentence for a match row */
function resultText(m) {
  if (!m) return "";
  if (m.winner) {
    const by = m.by_runs ? `${m.by_runs} run${m.by_runs === 1 ? "" : "s"}` : m.by_wickets ? `${m.by_wickets} wicket${m.by_wickets === 1 ? "" : "s"}` : "";
    return `${m.winner} won${by ? " by " + by : ""}${m.method ? " (" + m.method + ")" : ""}`;
  }
  return m.result ? String(m.result).replace(/^./, (c) => c.toUpperCase()) : "No result recorded";
}

const fill = (arr) => { let last = null; return arr.map((v) => { if (v !== null && v !== undefined) last = v; return last; }); };
const at = (arr, i) => (arr && arr[i] !== undefined ? arr[i] : null);

/* Over-by-over series for one match. Index 0 = start of innings (0/0), index k = after over k. */
function deriveMatch(id) {
  const k = key(id);
  if (cache.has(k)) return cache.get(k);
  const m = MD.byId.get(k); if (!m) return null;
  const pg = MD.progress[k] || null;
  const p3 = MD.pred.nb03[k] || null, p4 = MD.pred.nb04[k] || null, p6 = MD.pred.nb06[k] || null;
  const build = (n) => {
    if (!pg || !pg["r" + n]) return null;
    const R = pg["r" + n], W = pg["w" + n], B = pg["b" + n] || [];
    const Rf = fill(R), Wf = fill(W), Bf = fill(B);
    const rows = [{ over: 0, runs: 0, wkts: 0, bnd: 0, ovRuns: null, ovWkts: null, ovBnd: null, crr: null, live: true }];
    for (let o = 1; o <= 20; o++) {
      const live = R[o - 1] !== null && R[o - 1] !== undefined;
      const prev = rows[o - 1];
      rows.push({
        over: o, runs: Rf[o - 1] ?? 0, wkts: Wf[o - 1] ?? 0, bnd: Bf[o - 1] ?? 0, live,
        ovRuns: live ? (Rf[o - 1] - prev.runs) : null, ovWkts: live ? (Wf[o - 1] - prev.wkts) : null, ovBnd: live ? ((Bf[o - 1] ?? 0) - prev.bnd) : null,
        crr: live ? Rf[o - 1] / o : null,
      });
    }
    return rows;
  };
  const inn1 = build(1), inn2 = build(2);
  const target = m.target ?? (m.first_runs !== null && m.first_runs !== undefined ? m.first_runs + 1 : null);
  if (inn1) inn1.forEach((r) => {
    const i = r.over - 1;
    r.pred = at(p3 && p3.pred, i); r.lo = at(p3 && p3.lo, i); r.hi = at(p3 && p3.hi, i); r.pFirst = at(p6 && p6.p_first, i);
  });
  if (inn2) inn2.forEach((r) => {
    const i = r.over - 1;
    r.pChase = at(p4 && p4.p, i);              // notebook 04 champion
    r.pChase6 = at(p6 && p6.p_chase, i);       // notebook 06 chase model
    r.par = at(p6 && p6.par, i);
    r.margin = r.par !== null && r.par !== undefined ? r.runs - r.par : null;
    if (target !== null && r.over > 0 && r.live) {
      const left = (20 - r.over) * 6;
      r.need = Math.max(0, target - r.runs); r.rrr = left > 0 ? (r.need / left) * 6 : null; r.ballsLeft = left;
    } else if (target !== null && r.over === 0) { r.need = target; r.rrr = (target / 120) * 6; r.ballsLeft = 120; }
  });
  const pStart = p6 && p6.p_start !== undefined && p6.p_start !== null ? (Array.isArray(p6.p_start) ? p6.p_start[0] : p6.p_start) : null;
  if (inn2 && pStart !== null) inn2[0].pChase = pStart;
  const out = { m, inn1, inn2, target, pStart, split: (p3 || p4 || p6 || {}).split || null, has: { score: !!p3, win: !!p4, whole: !!p6 } };
  /* the batting-first side's win probability across the whole match, from the connected model (innings 1) then notebook 04 (chase) */
  out.timeline = [];
  if (inn1) inn1.slice(1, 20).forEach((r) => { if (r.pFirst !== null && r.pFirst !== undefined) out.timeline.push({ x: r.over, stage: "1st · over " + r.over, p: r.pFirst, inn: 1 }); });
  if (inn2) inn2.slice(0, 20).forEach((r) => { if (r.pChase !== null && r.pChase !== undefined) out.timeline.push({ x: 20 + r.over, stage: r.over === 0 ? "Chase · start" : "Chase · over " + r.over, p: 1 - r.pChase, inn: 2, over: r.over }); });
  cache.set(k, out);
  return out;
}

/* biggest moves in the batting-first side's probability, with what happened in that over */
function turningPoints(d, n = 3) {
  if (!d) return [];
  const t = d.timeline, out = [];
  for (let i = 1; i < t.length; i++) {
    const a = t[i - 1], b = t[i];
    if (a.inn !== b.inn) continue;   // the hand-over from the innings-1 model to the chase model is not a match event
    const inn = b.inn === 1 ? d.inn1 : d.inn2;
    const over = b.inn === 1 ? b.x : b.over;
    const r = inn && inn[over];
    out.push({ delta: b.p - a.p, from: a.p, to: b.p, inn: b.inn, over, runs: r ? r.ovRuns : null, wkts: r ? r.ovWkts : null, bnd: r ? r.ovBnd : null });
  }
  return out.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta)).slice(0, n);
}

/* Aggregate historical statistics for a set of match rows (usable matches only for score statistics) */
function aggregate(rows) {
  const u = rows.filter((r) => r.usable);
  const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
  const firsts = u.map((r) => r.first_runs).filter((x) => x !== null && x !== undefined);
  const seconds = u.map((r) => r.second_runs).filter((x) => x !== null && x !== undefined);
  const decided = u.filter((r) => r.chase_won === 0 || r.chase_won === 1);
  const top = u.slice().sort((a, b) => b.first_runs - a.first_runs)[0] || null;
  return {
    matches: rows.length, usable: u.length, avgFirst: mean(firsts), avgSecond: mean(seconds),
    chaseWin: decided.length ? decided.filter((r) => r.chase_won === 1).length / decided.length : null, decided: decided.length,
    top, teams: new Set(rows.flatMap((r) => [r.team1, r.team2]).filter(Boolean)).size, venues: new Set(rows.map((r) => r.venue).filter(Boolean)).size,
  };
}

/* ---------- schema checks shown on Connect data ---------- */
const REQUIRED = {
  nb03: ["mae_by_over", "champion", "interval"], nb04: ["logloss_by_over", "champion", "calibration_validation"],
  nb05: ["validation_summary", "holdout_summary"], nb06: ["first_innings", "start_of_chase", "replays", "par"],
  explorer: ["seasons", "venues", "teams", "score_hist", "over_profile"],
  matches: ["cols", "rows", "progress"], predictions: [],
};
const MATCH_COLS = ["id", "date", "season", "team1", "team2", "venue", "winner", "first_runs", "second_runs", "target", "chase_won", "status"];
function validateExport(name, j) {
  const missing = [];
  (REQUIRED[name] || []).forEach((k) => { if (j[k] === undefined) missing.push(k); });
  const info = { records: null, seasons: null, missing, notes: [], note: "" };
  const meta = j.meta || {};
  if (meta.first_season) info.seasons = `${meta.first_season}–${meta.last_season}`;
  if (name === "matches") {
    MATCH_COLS.forEach((c) => { if (!(j.cols || []).includes(c)) missing.push("col:" + c); });
    info.records = (j.rows || []).length; info.seasons = j.seasons && j.seasons.length ? `${j.seasons[0]}–${j.seasons[j.seasons.length - 1]}` : info.seasons;
    info.notes.push(`${Object.keys(j.progress || {}).length} matches with over-by-over progress`);
  } else if (name === "predictions") {
    const secs = ["nb03", "nb04", "nb06"]; let total = 0;
    secs.forEach((s) => {
      if (!j[s] || !j[s].matches) { missing.push("section:" + s); return; }
      const ms = Object.values(j[s].matches); total += ms.length;
      const sp = { val: 0, hold: 0, train: 0 }; ms.forEach((x) => { if (sp[x.split] !== undefined) sp[x.split]++; });
      info.notes.push(`${s}: ${ms.length} matches (${sp.val} val, ${sp.hold} hold${sp.train ? ", " + sp.train + " reference" : ""})`);
      const badLen = ms.filter((x) => Object.entries(x).some(([k, v]) => Array.isArray(v) && v.length !== 19)).length;
      if (badLen) info.notes.push(`${s}: ${badLen} matches with a list that is not 19 long`);
    });
    info.records = total;
  } else if (name === "nb03") {
    info.records = Array.isArray(j.match_history) ? j.match_history.length : null;
    if (info.records === null) info.notes.push("no match_history (historical Score Engine explorer will use predictions.json if present)");
  } else if (meta.matches) info.records = meta.matches;
  info.status = missing.length ? "bad" : "ok";
  return info;
}

export { MD, adaptMatches, adaptPredictions, hasPred, splitOf, SPLIT_LABEL, resultText, deriveMatch, turningPoints, aggregate, validateExport, teamCode, TEAM_CODES, canonTeam };
