import { adaptMatches, adaptPredictions, validateExport } from "./matchdata.js";
/* ===== Real results copied from the notebook outputs the user pasted (notebooks 05 and 06) ===== */
const verdictOf = (lo, hi) => (lo > 0 ? "better" : hi < 0 ? "worse" : "noise");

const FUNNEL = [
  { name: "Usable matches", value: 1183, tone: "good" },
  { name: "Rain-adjusted target (D/L or similar)", value: 23, tone: "warn" },
  { name: "Tie / no result", value: 18, tone: "warn" },
  { name: "First innings curtailed", value: 13, tone: "warn" },
  { name: "Missing an innings", value: 6, tone: "warn" },
];

const OVERS = [1, 3, 6, 10, 15, 18];
const MODELS = [
  { key: "base", name: "Base rate", color: "mute" },
  { key: "direct", name: "Direct logistic", color: "s2" },
  { key: "point", name: "Point forecast → win %", color: "s3" },
  { key: "conn", name: "Score distribution → win % (connected)", color: "s1" },
];
const FI_VAL_LL = {
  base: [0.694, 0.694, 0.694, 0.694, 0.695, 0.696],
  direct: [0.703, 0.685, 0.648, 0.626, 0.595, 0.591],
  point: [0.719, 0.695, 0.654, 0.629, 0.597, 0.591],
  conn: [0.704, 0.686, 0.652, 0.629, 0.599, 0.593],
};
const FI_VAL_ACC = {
  base: [51.8, 51.8, 51.8, 51.8, 51.6, 51.0],
  direct: [51.2, 58.2, 61.4, 67.8, 67.2, 67.8],
  point: [51.2, 58.2, 62.3, 66.4, 66.0, 66.6],
  conn: [51.5, 58.8, 60.8, 66.4, 66.0, 67.5],
};
const FI_HOLD_LL = {
  base: [0.674, 0.674, 0.674, 0.674, 0.674, 0.675],
  direct: [0.687, 0.672, 0.688, 0.674, 0.648, 0.635],
  point: [0.658, 0.638, 0.666, 0.637, 0.603, 0.605],
  conn: [0.696, 0.668, 0.676, 0.651, 0.617, 0.597],
};
const FI_MEAN_VAL = { base: 0.6946, direct: 0.63, point: 0.6337, conn: 0.6321 };

const G = (rows) => rows.map(([o, g, lo, hi]) => ({ over: o, gain: g, lo, hi, verdict: verdictOf(lo, hi) }));
const GAINS = {
  val: {
    "Connected vs Point forecast": G([[1,.015,-.001,.030],[3,.009,-.005,.022],[6,.001,-.007,.010],[10,.000,-.007,.008],[15,-.002,-.006,.003],[18,-.002,-.004,.001],["ALL",.002,-.005,.008]]),
    "Connected vs Direct logistic": G([[1,-.001,-.016,.013],[3,-.001,-.014,.011],[6,-.004,-.017,.008],[10,-.002,-.017,.011],[15,-.004,-.021,.012],[18,-.001,-.020,.017],["ALL",-.002,-.016,.011]]),
    "Connected vs Base rate": G([[1,-.010,-.027,.007],[3,.008,-.017,.031],[6,.042,.009,.073],[10,.065,.029,.099],[15,.096,.052,.137],[18,.103,.055,.149],["ALL",.063,.032,.093]]),
    "Direct logistic vs Base rate": G([[1,-.009,-.025,.008],[3,.010,-.015,.034],[6,.047,.013,.078],[10,.068,.032,.102],[15,.100,.057,.140],[18,.105,.056,.152],["ALL",.065,.035,.096]]),
  },
  hold: {
    "Connected vs Point forecast": G([[1,-.038,-.080,.007],[3,-.031,-.064,.003],[6,-.010,-.032,.010],[10,-.014,-.029,.002],[15,-.015,-.025,-.004],[18,.008,.002,.015],["ALL",-.013,-.029,.002]]),
    "Connected vs Direct logistic": G([[1,-.009,-.037,.018],[3,.004,-.020,.028],[6,.013,-.014,.039],[10,.024,-.007,.054],[15,.031,-.001,.062],[18,.038,.001,.075],["ALL",.020,-.007,.047]]),
    "Connected vs Base rate": G([[1,-.022,-.063,.018],[3,.006,-.050,.062],[6,-.002,-.095,.091],[10,.024,-.073,.117],[15,.057,-.066,.168],[18,.078,-.061,.206],["ALL",.027,-.064,.114]]),
    "Direct logistic vs Base rate": G([[1,-.013,-.043,.017],[3,.002,-.057,.061],[6,-.014,-.111,.083],[10,0,-.103,.104],[15,.026,-.094,.137],[18,.040,-.100,.164],["ALL",.007,-.083,.098]]),
  },
};

const CAL_CONN = [[49,.073,.245],[320,.158,.128],[626,.252,.288],[1035,.354,.360],[1485,.451,.440],[1446,.546,.548],[829,.644,.634],[432,.746,.787],[189,.844,.810],[61,.932,.967]].map(([n,p,o])=>({n,pred:p,obs:o}));
const CAL_DIRECT = [[61,.071,.230],[253,.159,.107],[595,.254,.242],[1010,.353,.363],[1479,.453,.431],[1424,.547,.546],[893,.645,.649],[469,.746,.740],[225,.843,.782],[63,.927,.968]].map(([n,p,o])=>({n,pred:p,obs:o}));
const CAL_START = [[37,.127,.135],[81,.310,.272],[80,.492,.550],[97,.688,.670],[47,.877,.872]].map(([n,p,o])=>({n,pred:p,obs:o}));

const TIMELINE = [
  ["1st inn · over 1",70,.674,.696,-.022,-.063,.018],
  ["1st inn · over 3",70,.674,.668,.006,-.050,.062],
  ["1st inn · over 6",70,.674,.676,-.002,-.095,.091],
  ["1st inn · over 10",70,.674,.651,.024,-.073,.117],
  ["1st inn · over 15",70,.674,.617,.057,-.066,.168],
  ["1st inn · over 18",69,.675,.597,.078,-.061,.206],
  ["Innings break",70,.674,.548,.126,.013,.229],
  ["Chase · over 1",70,.674,.612,.062,-.067,.187],
  ["Chase · over 3",70,.674,.554,.120,.001,.240],
  ["Chase · over 6",70,.674,.371,.303,.198,.396],
  ["Chase · over 10",69,.675,.326,.349,.241,.439],
  ["Chase · over 15",65,.674,.231,.442,.335,.532],
  ["Chase · over 18",50,.678,.165,.513,.389,.607],
].map(([stage,n,base,model,gain,lo,hi])=>({stage,short:stage.replace("1st inn · ","1st ").replace("Chase · ","C "),n,base,model,gain,lo,hi,verdict:verdictOf(lo,hi)}));

const START_MODEL = { base: 0.6944, model: 0.5687, gain: 0.126, lo: 0.077, hi: 0.173, ece: 0.029, n: 342 };

/* par table printed by notebook 06 (Wankhede context, league avg 199, chase rate 0.59) */
const PAR_OVERS = [6, 10, 15, 18];
const PAR_TABLE = {
  160: { 2: [32, 56, 97, 131], 4: [53, 71, 104, 133] },
  180: { 2: [48, 74, 116, 150], 4: [70, 88, 122, 152] },
  200: { 2: [65, 91, 134, 170], 4: [86, 106, 141, 172] },
  220: { 2: [81, 108, 153, 189], 4: [103, 123, 159, 191] },
};

/* two real 2026 matches, as printed by the notebook */
const REPLAYS = {
  upset: {
    id: "upset",
    title: "Biggest upset",
    date: "2026-05-11",
    teams: { first: "Punjab Kings", chase: "Delhi Capitals" },
    target: 211,
    firstFinal: "210/5",
    blurb: "Delhi were given 6% at the 6th over and still won. The par line shows why: they stayed 34 to 46 runs behind until the very end.",
    chase: { overs: [3, 6, 10, 15, 18], runs: [14, 47, 87, 143, 194], wkts: [2, 3, 4, 5, 6], par: [60, 91, 121, 159, 187], p: [0.06, 0.06, 0.08, 0.16, 0.88] },
    first: { overs: [1, 6, 10, 15, 18], runs: [22, 72, 107, 149, 187], wkts: [0, 0, 2, 2, 3], proj: [213.43, 216.62, 207.58, 209.26, 212.6], p: [0.64, 0.63, 0.56, 0.56, 0.56] },
  },
  swing: {
    id: "swing",
    title: "Biggest swing",
    date: "2026-04-25",
    teams: { first: "Delhi Capitals", chase: "Punjab Kings" },
    target: 265,
    firstFinal: "264/2",
    blurb: "A 264/2 total was rated a 92% win for Delhi after 18 overs. Punjab got to 252/4 by the same point and chased it down.",
    chase: { overs: [3, 6, 10, 15, 18], runs: [56, 116, 147, 203, 252], wkts: [0, 0, 3, 4, 4], par: [73, 100, 154, 201, 234], p: [0.28, 0.71, 0.38, 0.55, 0.99] },
    first: { overs: [1, 6, 10, 15, 18], runs: [8, 68, 102, 189, 238], wkts: [0, 1, 1, 1, 1], proj: [198.86, 215.16, 216.46, 257.6, 272.57], p: [0.52, 0.6, 0.61, 0.88, 0.92] },
  },
};

const LIVE_DEMOS = [
  { name: "Wankhede: 92/2 after 10 (1st inn)", mode: "first", over: 10, runs: 92, wkts: 2, target: 200, ve: 0, real: "Notebook: projected 203, range 175–231, bat-first win 46.8%" },
  { name: "Wankhede: chase 186, 98/3 after 12", mode: "chase", over: 12, runs: 98, wkts: 3, target: 186, ve: 0, real: "Notebook: chase win 59.5%, par 94, margin +4" },
  { name: "DC chasing 211: 87/4 after 10", mode: "chase", over: 10, runs: 87, wkts: 4, target: 211, ve: 0, real: "Notebook: chase win 8%, par 121, margin −34" },
  { name: "PBKS chasing 265: 116/0 after 6", mode: "chase", over: 6, runs: 116, wkts: 0, target: 265, ve: 0, real: "Notebook: chase win 71%, par 100, margin +16" },
];

/* notebook 05 */
const XI = {
  runs: [
    { task: "A · Pre-match total, with XI", val: [0.16, -0.16, 0.47], hold: [0.46, -0.46, 1.36] },
    { task: "B · Live total, + XI strength", val: [0.12, -0.05, 0.27], hold: [-0.01, -0.43, 0.43] },
    { task: "B · Live total, + remaining batters", val: [0.11, -0.07, 0.26], hold: [0.02, -0.4, 0.5] },
  ],
  ll: [
    { task: "C · Chase win %, + XI strength", val: -0.003, hold: -0.009 },
    { task: "C · Chase win %, + remaining batters", val: -0.005, hold: -0.013 },
  ],
  corr: [
    { name: "Batting XI strength", r: 0.059, expect: "positive" },
    { name: "Opposition bowling: runs", r: 0.026, expect: "positive" },
    { name: "Opposition bowling: wickets", r: 0.074, expect: "negative" },
  ],
  batters: ["AD Russell (0.299)", "TH David", "N Pooran", "V Sehwag", "AB de Villiers", "KA Pollard", "SP Narine", "GJ Maxwell", "Harbhajan Singh (0.174)"],
  tight: ["SP Narine", "Rashid Khan", "JJ Bumrah", "AR Patel", "M Muralitharan", "MJ Santner", "JC Archer", "A Kumble"],
};
XI.wicket = ["AD Russell", "L Ngidi", "AJ Tye", "K Rabada", "M Pathirana", "SL Malinga", "Imran Tahir"];

const NOTEBOOKS = [
  { id: "01-02", title: "Score baselines", tag: "Foundation", status: "done", what: "First-innings score prediction: baselines, features and the first honest error numbers.", metric: "Starting point", limits: "Pre-match prediction has a high noise ceiling." },
  { id: "03", title: "Live first-innings score", tag: "Regression", status: "settled", what: "Ridge on remaining runs for overs 1–18, a Par table for over 19, era-adjusted venue effect, and a calibrated 80% range (2 seasons, scale 1.05).", metric: "80% coverage target", limits: "Under-projects explosive innings. After 7+ wickets: coverage 72%, bias +4.1 runs." },
  { id: "04", title: "Live win probability", tag: "Classification", status: "settled", what: "Chase win probability from the live state. Champion: logistic on the full state. Gradient boosting was overconfident.", metric: "Validation log loss 0.437 · ECE 0.028", limits: "2026 holdout under-rated chasing sides (ECE 0.130; chase win rate 64%), partly chance." },
  { id: "05", title: "Playing-XI player features", tag: "Negative result", status: "null", what: "Leak-safe batting and bowling ratings from earlier matches, rolled into team strength and remaining-batter skill.", metric: "No reliable gain on any task", limits: "Team XI differences are small and the match state already carries quality." },
  { id: "06", title: "Whole-match model + par", tag: "Integration", status: "done", what: "Start-of-chase model, score distribution → win probability, a whole-match timeline and a chase par-score curve.", metric: "Start-of-chase gain +0.126 log loss", limits: "Connected ≈ direct logistic in accuracy; the 70-match holdout is small." },
];


/* ===== The single mutable data object every screen reads. Starts with the numbers pasted from the notebooks;
   adapters replace them with the exported JSON when it is loaded. ===== */
const D = {
  live: {}, // which exported files are loaded: { nb06: {generated, matches, ...} }
  matches: 1183, seasons: [2008, 2026], valN: 342, holdN: 70, files: 1243,
  FUNNEL, MODELS, GAINS, TIMELINE, START_MODEL, NOTEBOOKS, XI, REPLAYS, LIVE_DEMOS,
  FI: { overs: OVERS, ll_val: FI_VAL_LL, acc_val: FI_VAL_ACC, ll_hold: FI_HOLD_LL, mean_val: FI_MEAN_VAL },
  CAL: { conn: CAL_CONN, direct: CAL_DIRECT, start: CAL_START, ece: { conn: 0.016, direct: 0.015, start: 0.029 } },
  PAR: null,            // real par grid from notebook 06 (targets x wickets x overs)
  GRID_CHASE: null, GRID_FIRST: null, START_CURVE: null, VENUES: [], CONTEXT: null,
  NB03: null, NB04: null, EXPLORER: null,
  NB04_SAMPLE: { ll: 0.437, ece: 0.028, holdEce: 0.130, holdChaseWin: 0.64 },
};

/* ===== Simulator surrogate: fitted to the par table and case studies printed by notebook 06 =====
   It is NOT the trained model. It interpolates the real par table and maps margin-vs-par to a probability
   with a scale fitted to the case-study outputs. The accuracy table in the app compares it to the notebook. */
const sigmoid = (z) => 1 / (1 + Math.exp(-z));
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;

function pchip(xs, ys) {
  const n = xs.length, h = [], d = [];
  for (let i = 0; i < n - 1; i++) { h.push(xs[i + 1] - xs[i]); d.push((ys[i + 1] - ys[i]) / h[i]); }
  const m = new Array(n).fill(0);
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) m[i] = 0;
    else { const w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1]; m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]); }
  }
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0; while (x > xs[i + 1]) i++;
    const t = (x - xs[i]) / h[i], t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h[i] * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h[i] * m[i + 1];
  };
}

const T_ANCH = [160, 180, 200, 220];
function parAnchor(T, w, over) {
  const row = PAR_TABLE[T];
  const vals = PAR_OVERS.map((_, i) => {
    const slope = (row[4][i] - row[2][i]) / 2;
    const dw = w < 2 ? 0.5 * (w - 2) : w - 2;
    return clamp(row[2][i] + slope * dw, 0, T);
  });
  const caps = [T, T - 0.7 * vals[0], ...vals.map((p) => T - p), 0];
  const f = pchip([0, 3, ...PAR_OVERS, 20], caps);
  return T - f(over);
}
function parAt(T, w, over) {
  const vs = T_ANCH.map((t) => parAnchor(t, w, over));
  let i = T <= 180 ? 0 : T <= 200 ? 1 : 2;
  const t = (T - T_ANCH[i]) / (T_ANCH[i + 1] - T_ANCH[i]);
  return Math.max(0, lerp(vs[i], vs[i + 1], clamp(t, -2, 6)));
}

const S_ANCH = [[0, 17], [6, 17], [10, 14], [12, 12.5], [15, 9.8], [18, 3.7], [20, 2]];
function marginScale(over) {
  for (let i = 0; i < S_ANCH.length - 1; i++) {
    const [a, sa] = S_ANCH[i], [b, sb] = S_ANCH[i + 1];
    if (over <= b) return lerp(sa, sb, (over - a) / (b - a));
  }
  return 2;
}
const T50 = 205, S0 = 17;

function chaseSim({ target, runs, wkts, over, ve = 0 }) {
  if (runs >= target) return { p: 1, par: 0, margin: runs, done: "won" };
  if (wkts >= 10 || over >= 20) return { p: 0, par: target, margin: runs - target, done: "lost" };
  const par = Math.max(0, parAt(target, wkts, over) - ve * ((20 - over) / 20));
  const margin = runs - par;
  const a = Math.min(over / 3, 1);
  const logit = (1 - a) * ((T50 + ve - target) / S0) + a * (margin / marginScale(over));
  return { p: sigmoid(logit), par, margin };
}
function firstSim({ runs, wkts, over, ve = 0 }) {
  const rem = 20 - over;
  let proj = runs + (200 - parAt(200, wkts, over));
  const T1 = clamp(proj, 160, 240);
  proj = runs + (T1 - parAt(T1, wkts, over)) + ve * (rem / 20);
  const hw = Math.max(3, 28 * Math.sqrt(rem / 10));
  return { proj, hw, lo: proj - hw, hi: proj + hw, p: pBatFirst(proj, hw, ve) };
}
function pBatFirst(proj, hw, ve = 0) {
  const sd = hw / 1.2816; let acc = 0, wt = 0;
  for (let k = -30; k <= 30; k++) {
    const z = k / 10, w = Math.exp(-0.5 * z * z);
    const T = proj + z * sd + 1;
    acc += w * (1 - sigmoid((T50 + ve - T) / S0)); wt += w;
  }
  return acc / wt;
}
function chasePathLine(target, wkts, over, ve) {
  const rows = [];
  for (let o = 0; o <= 20; o++) rows.push({ over: o, par: +Math.max(0, parAt(target, wkts, o) - ve * ((20 - o) / 20)).toFixed(1) });
  return rows;
}

/* ===== Trained-model grids exported by notebook 06 (used when loaded) ===== */
function locate(arr, x) {
  const n = arr.length;
  if (x <= arr[0]) return [0, 0];
  if (x >= arr[n - 1]) return [n - 2, 1];
  let i = 0; while (x > arr[i + 1]) i++;
  return [i, (x - arr[i]) / (arr[i + 1] - arr[i])];
}
function interpN(dims, values, pt) {
  const nd = dims.length, strides = new Array(nd), idx = [], w = [];
  let s = 1;
  for (let d = nd - 1; d >= 0; d--) { strides[d] = s; s *= dims[d].length; }
  for (let d = 0; d < nd; d++) { const [i, t] = locate(dims[d], pt[d]); idx.push(i); w.push(t); }
  let out = 0;
  for (let mask = 0; mask < (1 << nd); mask++) {
    let wt = 1, off = 0;
    for (let d = 0; d < nd; d++) { const hi = (mask >> d) & 1; wt *= hi ? w[d] : 1 - w[d]; off += (idx[d] + hi) * strides[d]; }
    if (wt > 0) out += wt * values[off];
  }
  return out;
}
function startP(target, ve) {
  const c = D.START_CURVE;
  if (c) return clamp(interpN([c.ve, c.targets], c.p, [clamp(ve, c.ve[0], c.ve[c.ve.length - 1]), target]), 0, 1);
  return sigmoid((T50 + ve - target) / S0);
}
function chaseGridP(target, runs, wkts, over, ve) {
  const g = D.GRID_CHASE, v = clamp(ve, g.ve[0], g.ve[g.ve.length - 1]);
  const o = clamp(over, g.overs[0], g.overs[g.overs.length - 1]);
  const fm = g.frac[g.frac.length - 1], f = runs / target;
  const pt = (ff) => interpN([g.ve, g.targets, g.overs, g.wickets, g.frac], g.p, [v, clamp(target, g.targets[0], g.targets[g.targets.length - 1]), o, clamp(wkts, 0, 9), ff]);
  if (f <= fm) return pt(f);
  return lerp(pt(fm), 1, (f - fm) / (1 - fm));
}
function parGrid(target, wkts, over, ve) {
  if (over <= 0) return 0;
  if (over >= 20) return target;
  if (chaseGridP(target, 0, wkts, over, ve) >= 0.5) return 0;
  let lo = 0, hi = target - 1;
  while (hi - lo > 0.5) { const mid = (lo + hi) / 2; if (chaseGridP(target, mid, wkts, over, ve) >= 0.5) hi = mid; else lo = mid; }
  return Math.ceil(hi);
}
function chaseGridSim({ target, runs, wkts, over, ve = 0 }) {
  if (runs >= target) return { p: 1, par: 0, margin: runs, done: "won" };
  if (wkts >= 10 || over >= 20) return { p: 0, par: target, margin: runs - target, done: "lost" };
  const p = over < 1 ? startP(target, ve) : chaseGridP(target, runs, wkts, over, ve);
  const par = parGrid(target, wkts, over, ve);
  return { p, par, margin: runs - par };
}
function firstGridSim({ runs, wkts, over, ve = 0 }) {
  const g = D.GRID_FIRST;
  if (over < 1) {
    const c = D.CONTEXT || { league_recent: 200, venue_effect: 0 };
    const proj = c.league_recent + c.venue_effect + ve;
    return { proj, hw: 40, lo: proj - 40, hi: proj + 40, p: 1 - startP(proj + 1, ve) };
  }
  const v = clamp(ve, g.ve[0], g.ve[g.ve.length - 1]);
  const pt = [v, clamp(over, 1, 19), clamp(wkts, 0, 9), clamp(runs / Math.max(over, 1), g.run_rate[0], g.run_rate[g.run_rate.length - 1])];
  const dims = [g.ve, g.overs, g.wickets, g.run_rate];
  const proj = interpN(dims, g.proj, pt) + (runs - clamp(runs / Math.max(over, 1), g.run_rate[0], g.run_rate[g.run_rate.length - 1]) * over);
  const lo = interpN(dims, g.lo, pt) + (proj - interpN(dims, g.proj, pt)), hi = interpN(dims, g.hi, pt) + (proj - interpN(dims, g.proj, pt));
  return { proj, hw: (hi - lo) / 2, lo, hi, p: clamp(interpN(dims, g.p, pt), 0, 1) };
}

/* dispatch: trained-model grid when notebook 06 is loaded, otherwise the surrogate above */
const chaseSurrogate = chaseSim, firstSurrogate = firstSim;
function chaseAny(s) { return D.GRID_CHASE ? chaseGridSim(s) : chaseSurrogate(s); }
function firstAny(s) { return D.GRID_FIRST ? firstGridSim(s) : firstSurrogate(s); }
function parAny(T, w, over, ve = 0) {
  return D.GRID_CHASE ? parGrid(T, w, over, ve) : Math.max(0, parAt(T, w, over) - ve * ((20 - over) / 20));
}
function winVsTotal(T, ve = 0) { return D.START_CURVE ? 1 - startP(T + 1, ve) : 1 - sigmoid((T50 + ve - (T + 1)) / S0); }

/* ===== Adapters: notebook JSON exports -> the shapes the screens read. Also loading and persistence. ===== */
const FILES = [
  { name: "nb03", label: "Notebook 03 · live score", feeds: "Score Engine" },
  { name: "nb04", label: "Notebook 04 · win probability", feeds: "Win Probability" },
  { name: "nb05", label: "Notebook 05 · playing XI", feeds: "Player Impact" },
  { name: "nb06", label: "Notebook 06 · whole match", feeds: "Match Centre, Par Lab, Replays, Evidence" },
  { name: "explorer", label: "Notebook 07 · data explorer", feeds: "Data Explorer" },
  { name: "matches", label: "Notebook 08 · match index", feeds: "Match selector, Match Centre, Replays, Par Lab, Data Explorer" },
  { name: "predictions", label: "Notebooks 03/04/06 · per-match predictions", feeds: "Match Centre, Replays, Par Lab, Win Probability, Score Engine" },
];
const CHECK_OVERS = [1, 3, 6, 10, 15, 18];
const listeners = new Set();
const notify = () => listeners.forEach((f) => f());

const shortName = (s) => {
  s = String(s);
  if (/connected/i.test(s)) return "Connected";
  if (/^Direct logistic/i.test(s)) return "Direct logistic";
  if (/Point forecast/i.test(s)) return "Point forecast";
  if (/^Base rate/i.test(s)) return "Base rate";
  return s;
};
const modelKey = (s) => {
  s = String(s);
  if (/connected/i.test(s)) return "conn";
  if (/^Direct logistic/i.test(s)) return "direct";
  if (/Point forecast/i.test(s)) return "point";
  if (/^Base rate/i.test(s)) return "base";
  return s;
};
const overVal = (o) => (o === "ALL" ? "ALL" : Number(o));

/* compare records -> { "A vs B": [{over, gain, lo, hi, verdict}] } for the checkpoint overs and ALL */
function adaptCompare(records, label = (c, r) => `${shortName(c)} vs ${shortName(r)}`, overs = CHECK_OVERS) {
  const out = {};
  (records || []).forEach((r) => {
    const o = overVal(r.over);
    if (o !== "ALL" && !overs.includes(o)) return;
    const k = label(r.challenger, r.reference);
    const gain = r.gain !== undefined ? r.gain : r.gain_runs;
    (out[k] = out[k] || []).push({ over: o, gain, lo: r.ci_lo, hi: r.ci_hi, verdict: verdictOf(r.ci_lo, r.ci_hi), n: r.n_matches });
  });
  return out;
}
/* pivot table {index, columns, data} -> {index, cols: {name: [..]}} */
function pivotT(t) {
  const cols = {};
  t.columns.forEach((c, j) => { cols[c] = t.data.map((row) => row[j]); });
  return { index: t.index.map(Number), cols, names: t.columns };
}
const colMean = (a) => a.filter((x) => x !== null).reduce((s, x) => s + x, 0) / a.filter((x) => x !== null).length;
const calBins = (b) => b.map((r) => ({ n: r.n, pred: r.mean_predicted, obs: r.observed_win_rate }));

function adaptNb06(j) {
  const sc = j.start_of_chase, fi = j.first_innings;
  const c0 = sc.compare[0];
  D.START_MODEL = { base: sc.log_loss.base, model: sc.log_loss.model, gain: c0.gain, lo: c0.ci_lo, hi: c0.ci_hi, ece: sc.ece, n: c0.n_matches };
  D.CAL.start = calBins(sc.calibration); D.CAL.ece.start = sc.ece;

  const v = pivotT(fi.logloss_validation), a = pivotT(fi.accuracy_validation), h = pivotT(fi.logloss_holdout);
  const byKey = (p) => { const o = {}; p.names.forEach((n) => { o[modelKey(n)] = p.cols[n]; }); return o; };
  D.FI = { overs: v.index, ll_val: byKey(v), acc_val: byKey(a), ll_hold: byKey(h), mean_val: Object.fromEntries(Object.entries(byKey(v)).map(([k, arr]) => [k, colMean(arr)])) };
  Object.entries(fi.calibration).forEach(([name, c]) => {
    const k = modelKey(name);
    if (k === "conn") { D.CAL.conn = calBins(c.bins); D.CAL.ece.conn = c.ece; }
    if (k === "direct") { D.CAL.direct = calBins(c.bins); D.CAL.ece.direct = c.ece; }
  });
  D.GAINS = { val: adaptCompare(fi.compare_validation), hold: adaptCompare(fi.compare_holdout) };
  const allRow = (fi.compare_validation || []).find((r) => String(r.over) === "ALL");
  if (allRow) D.valN = allRow.n_matches;

  D.TIMELINE = j.timeline_holdout.map((t) => {
    const stage = t.stage.replace("1st innings, over", "1st inn · over").replace("Chase, over", "Chase · over").replace(" (target known)", "");
    return { stage, short: stage.replace("1st inn · ", "1st ").replace("Chase · ", "C "), n: t.n_matches, base: t.base_log_loss, model: t.model_log_loss, gain: t.gain, lo: t.ci_lo, hi: t.ci_hi, verdict: verdictOf(t.ci_lo, t.ci_hi) };
  });
  D.holdN = Math.max(...D.TIMELINE.map((t) => t.n));

  const nameOf = { "biggest upset": ["upset", "Biggest upset"], "biggest swing": ["swing", "Biggest swing"] };
  D.REPLAYS = {};
  Object.entries(j.replays).forEach(([label, r]) => {
    const [id, title] = nameOf[label] || [label, label];
    const firstWon = r.chase_won === 0;
    const chaseP = r.chase.map((x) => x.p_chase);
    const lowest = r.chase.length ? r.chase.reduce((m, x) => (x.p_chase < m.p_chase ? x : m)) : null;
    D.REPLAYS[id] = {
      id, title, date: r.date, venue: r.venue, teams: { first: r.team_first, chase: r.team_chase }, target: r.target,
      firstFinal: `${r.first_final}/${r.first_wkts}`, chaseWon: !firstWon, pBreak: r.p_break_batting_first,
      blurb: `${r.team_chase} chased ${r.target} and ${firstWon ? "lost" : "won"}. ` + (lowest ? `The chasing side's lowest rating was ${Math.round(lowest.p_chase * 100)}% at over ${lowest.over}.` : ""),
      chase: { overs: r.chase.map((x) => x.over), runs: r.chase.map((x) => x.runs), wkts: r.chase.map((x) => x.wickets), par: r.chase.map((x) => x.par), p: chaseP },
      first: { overs: r.first.map((x) => x.over), runs: r.first.map((x) => x.runs), wkts: r.first.map((x) => x.wickets), proj: r.first.map((x) => x.projected_total), p: r.first.map((x) => x.p_bat_first) },
    };
  });
  D.PAR = j.par;
  D.GRID_CHASE = j.grid_chase; D.GRID_FIRST = j.grid_first; D.START_CURVE = j.start_curve || null;
  D.VENUES = j.venues || []; D.CONTEXT = j.context || null;
}

function adaptNb05(j) {
  const taskLetter = (t) => t[0];
  const pick = (rows, hold) => rows;
  const baseRef = (r) => /no XI|match state only/.test(r.reference);
  const runsRows = (j.validation_summary || []).filter((r) => r.unit === "runs" && baseRef(r));
  const holdRows = j.holdout_summary || [];
  const key = (r) => `${r.task}|${r.challenger}|${r.reference}`;
  const hmap = Object.fromEntries(holdRows.map((r) => [key(r), r]));
  const lab = (r) => `${taskLetter(r.task)} · ${r.challenger.replace(/^Ridge \+ |^Logistic \+ /, "+ ").replace("League + venue + XI", "Pre-match + XI")}`;
  const trip = (r) => (r ? [r.gain, r.ci_lo, r.ci_hi] : [0, 0, 0]);
  const llRows = (j.validation_summary || []).filter((r) => r.unit === "log loss" && baseRef(r));
  D.XI = {
    runs: runsRows.map((r) => ({ task: lab(r), val: trip(r), hold: trip(hmap[key(r)]) })),
    ll: llRows.map((r) => ({ task: lab(r), val: r.gain, hold: hmap[key(r)] ? hmap[key(r)].gain : 0, valCi: [r.ci_lo, r.ci_hi], holdCi: hmap[key(r)] ? [hmap[key(r)].ci_lo, hmap[key(r)].ci_hi] : null })),
    corr: (j.xi_correlation || []).filter((r) => /bat|bowl/.test(r.feature) && !/exp/.test(r.feature)).map((r) => ({
      name: { xi1_bat: "Batting XI strength", xi2_bowl_runs: "Opposition bowling: runs", xi2_bowl_wkts: "Opposition bowling: wickets" }[r.feature] || r.feature,
      r: r.r, expect: r.feature === "xi2_bowl_wkts" ? "negative" : "positive" })),
    spread: j.xi_spread,
    batters: (j.top_batters || []).map((p) => `${p.player} (${p.bat_ability.toFixed(3)})`),
    tight: (j.top_tight_bowlers || []).map((p) => `${p.player} (${p.bowl_run_ability.toFixed(3)})`),
    wicket: (j.top_wicket_takers || []).map((p) => `${p.player} (${p.bowl_wk_ability.toFixed(4)})`),
    examples: j.examples_2026 || [], real: true,
    bCompareVal: adaptCompare(j.b_compare, (c, r) => `${c} vs ${r}`), bCompareHold: adaptCompare(j.b_holdout_compare, (c, r) => `${c} vs ${r}`),
    cCompareVal: adaptCompare(j.c_compare, (c, r) => `${c} vs ${r}`), cCompareHold: adaptCompare(j.c_holdout_compare, (c, r) => `${c} vs ${r}`),
  };
}

const ADAPTERS = {
  nb06: adaptNb06, nb05: adaptNb05, matches: adaptMatches, predictions: adaptPredictions,
  nb03: (j) => { D.NB03 = j; }, nb04: (j) => { D.NB04 = j; }, explorer: (j) => {
    D.EXPLORER = j;
    if (j.funnel) {
      const ok = j.funnel.ok || 0; D.FUNNEL = [{ name: "Usable matches", value: ok, tone: "good" }, ...Object.entries(j.funnel).filter(([k]) => k !== "ok").map(([k, v]) => ({ name: k.charAt(0).toUpperCase() + k.slice(1), value: v, tone: "warn" }))];
    }
    D.files = j.files;
  },
};

function ingest(name, json) {
  const ad = ADAPTERS[name];
  if (!ad) throw new Error("Unknown file: " + name);
  ad(json);
  const m = json.meta || {};
  D.live[name] = { generated: m.generated, matches: m.matches, first: m.first_season, last: m.last_season };
  (D.checks = D.checks || {})[name] = validateExport(name, json);
  if (m.matches && name !== "predictions") { D.matches = m.matches; D.seasons = [m.first_season, m.last_season]; }
  notify();
}
function nameFromJson(fileName, json) {
  const n = json && json.meta && json.meta.notebook;
  if (n && ADAPTERS[n]) return n;
  const m = /(nb0[3-6]|explorer|matches|predictions)/i.exec(fileName || "");
  return m ? m[1].toLowerCase() : null;
}
async function resetData() { await idb.clear(); location.reload(); }

/* ---- persistence in IndexedDB (per browser), so dropped files survive a refresh ---- */
const idb = {
  open() {
    return new Promise((res, rej) => {
      try {
        const rq = indexedDB.open("cricket-lab", 1);
        rq.onupgradeneeded = () => rq.result.createObjectStore("files");
        rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error);
      } catch (e) { rej(e); }
    });
  },
  async put(name, json) { try { const db = await this.open(); await new Promise((r, j) => { const tx = db.transaction("files", "readwrite"); tx.objectStore("files").put(json, name); tx.oncomplete = r; tx.onerror = j; }); } catch (e) {} },
  async all() { try { const db = await this.open(); return await new Promise((r) => { const out = {}; const tx = db.transaction("files"); const cur = tx.objectStore("files").openCursor(); cur.onsuccess = () => { const c = cur.result; if (c) { out[c.key] = c.value; c.continue(); } else r(out); }; cur.onerror = () => r({}); }); } catch (e) { return {}; } },
  async clear() { try { const db = await this.open(); await new Promise((r) => { const tx = db.transaction("files", "readwrite"); tx.objectStore("files").clear(); tx.oncomplete = r; tx.onerror = r; }); } catch (e) {} },
};

async function loadFromServer() {
  const got = [];
  for (const f of FILES) {
    try {
      const r = await fetch(`data/${f.name}.json`, { cache: "no-store" });
      if (!r.ok) continue;
      const j = await r.json(); ingest(f.name, j); got.push(f.name);
    } catch (e) { /* file not there: keep sample values */ }
  }
  return got;
}
async function loadFromBrowserStore() {
  const all = await idb.all(); const got = [];
  for (const [name, j] of Object.entries(all)) { try { ingest(name, j); got.push(name); } catch (e) {} }
  return got;
}
async function ingestFiles(fileList) {
  const res = [];
  for (const file of Array.from(fileList)) {
    try {
      const text = await file.text(); const j = JSON.parse(text);
      const name = nameFromJson(file.name, j);
      if (!name) { res.push({ file: file.name, ok: false, msg: "Not one of the dashboard export files" }); continue; }
      ingest(name, j); idb.put(name, j); res.push({ file: file.name, ok: true, name });
    } catch (e) { res.push({ file: file.name, ok: false, msg: String(e.message || e) }); }
  }
  return res;
}


export { verdictOf, FUNNEL, OVERS, MODELS, FI_VAL_LL, FI_VAL_ACC, FI_HOLD_LL, FI_MEAN_VAL, G, GAINS, CAL_CONN, CAL_DIRECT, CAL_START, TIMELINE, START_MODEL, PAR_OVERS, PAR_TABLE, REPLAYS, LIVE_DEMOS, XI, NOTEBOOKS, D, sigmoid, clamp, lerp, pchip, T_ANCH, parAnchor, parAt, S_ANCH, marginScale, T50, chaseSim, firstSim, pBatFirst, chasePathLine, locate, interpN, startP, chaseGridP, parGrid, chaseGridSim, firstGridSim, chaseSurrogate, chaseAny, firstAny, parAny, winVsTotal, FILES, CHECK_OVERS, listeners, notify, shortName, modelKey, overVal, adaptCompare, pivotT, colMean, calBins, adaptNb06, adaptNb05, ADAPTERS, ingest, nameFromJson, resetData, idb, loadFromServer, loadFromBrowserStore, ingestFiles };
