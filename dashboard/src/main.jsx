import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import ReactDOM from "react-dom/client";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
  ReferenceArea, BarChart, Bar, Cell, ComposedChart, Area, ScatterChart, Scatter,
} from "recharts";
import "./style.css";
import { MD, canonTeam } from "./matchdata.js";
import { SelectionProvider, useSelection, SelectorBar } from "./selection.jsx";
import { HistoricalMatchCentre, HistoricalReplay, ParMatchView, WinProbMatchView, ScoreMatchView, HistoryStats, MatchList, EMPTY_FLT } from "./matchviews.jsx";
import { verdictOf, FUNNEL, OVERS, MODELS, FI_VAL_LL, FI_VAL_ACC, FI_HOLD_LL, FI_MEAN_VAL, G, GAINS, CAL_CONN, CAL_DIRECT, CAL_START, TIMELINE, START_MODEL, PAR_OVERS, PAR_TABLE, REPLAYS, LIVE_DEMOS, XI, NOTEBOOKS, D, sigmoid, clamp, lerp, pchip, T_ANCH, parAnchor, parAt, S_ANCH, marginScale, T50, chaseSim, firstSim, pBatFirst, chasePathLine, locate, interpN, startP, chaseGridP, parGrid, chaseGridSim, firstGridSim, chaseSurrogate, chaseAny, firstAny, parAny, winVsTotal, FILES, CHECK_OVERS, listeners, notify, shortName, modelKey, overVal, adaptCompare, pivotT, colMean, calBins, adaptNb06, adaptNb05, ADAPTERS, ingest, nameFromJson, resetData, idb, loadFromServer, loadFromBrowserStore, ingestFiles } from "./lib.js";
["Line", "Area", "Bar", "Scatter"].forEach((C) => { const k = { Line, Area, Bar, Scatter }[C]; k.defaultProps = Object.assign({}, k.defaultProps, { isAnimationActive: false }); });


import { f2s, f3s, pct, store, copyText, toCsv, usePalette, PalCtx, usePal, seriesColors, Chip, Seg, Card, Kpi, CopyBtn, VerdictChip, ChartTip, axisProps, Empty, SourceChip, Forest, GainMap, ByOver, Field, Num, Gauge } from "./ui.jsx";


/* ---------- module: Overview ---------- */
function Overview({ go }) {
  const pal = usePal();
  const tl = D.TIMELINE.map((t) => ({ stage: t.short, base: t.base, model: t.model }));
  const last = D.TIMELINE[D.TIMELINE.length - 1];
  const gConn = (D.GAINS.val["Connected vs Direct logistic"] || []).find((g) => String(g.over) === "ALL");
  const sm = D.START_MODEL;
  const findings = [
    { tone: "good", head: "Knowing the target is worth a lot", body: `Start-of-chase model: log loss ${sm.model.toFixed(3)} vs ${sm.base.toFixed(3)} (gain ${f3s(sm.gain)}, CI ${sm.lo.toFixed(3)} to ${sm.hi.toFixed(3)}), ECE ${sm.ece.toFixed(3)}.`, go: "evidence" },
    { tone: "good", head: "The chase decides the match", body: `Holdout log loss reaches ${last.model.toFixed(3)} at ${last.stage.toLowerCase()}, against a ${last.base.toFixed(3)} base rate.`, go: "evidence" },
    { tone: "warn", head: "Connecting the models adds coherence, not accuracy", body: gConn ? `Score distribution → win % vs direct logistic: ${f3s(gConn.gain)} (CI ${f3s(gConn.lo)} to ${f3s(gConn.hi)}). Equal, but it also gives ranges and par.` : "Equal to the direct logistic, but it also gives ranges and par.", go: "evidence" },
    { tone: "mute", head: "Playing-XI features did not help", body: "Score and win-probability comparisons were noise; chase win % was slightly worse.", go: "players" },
    { tone: "warn", head: "Small holdout, small claims", body: `${D.holdN} holdout matches. Opposite-signed single-over verdicts are what chance looks like.`, go: "method" },
  ];
  return (
    <div className="stack">
      <HistoryStats go={go} />
      {MD.loaded.matches && <div className="section-head"><h2>Model evaluation</h2><p className="sub">How the notebooks' models perform. These are not cricket statistics.</p></div>}
      <div className="grid g4">
        <Kpi label="Matches modelled" value={D.matches.toLocaleString()} note={`of ${D.files.toLocaleString()} · ${(D.files - D.matches).toLocaleString()} excluded`} />
        <Kpi label="Seasons" value={`${D.seasons[0]}–${String(D.seasons[1]).slice(2)}`} note="Cricsheet ball-by-ball" />
        <Kpi label="Validation / holdout" value={`${D.valN} / ${D.holdN}`} note="rolling folds 2021–25, 2026 once" />
        <Kpi label={"Chase log loss, " + last.stage.replace("Chase · ", "")} value={last.model.toFixed(3)} note={`vs ${last.base.toFixed(3)} base rate`} tone="good" />
      </div>
      <div className="grid g21">
        <Card title="How much the model knows, stage by stage" sub="Holdout log loss through a whole match (lower is better). Dashed line is the no-information base rate." right={<><SourceChip names={["nb06"]} /><button className="btn ghost sm" onClick={() => go("evidence")}>Open evidence</button></>}>
          <div className="chart h300">
            <ResponsiveContainer>
              <ComposedChart data={tl} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
                <CartesianGrid stroke={pal.line} strokeDasharray="3 4" vertical={false} />
                <XAxis dataKey="stage" {...axisProps(pal)} interval={0} angle={-30} textAnchor="end" height={54} />
                <YAxis domain={[0, 0.8]} {...axisProps(pal)} />
                <Tooltip content={<ChartTip fmt={(v) => v.toFixed(3)} />} />
                <Area type="linear" dataKey="model" name="Model" stroke={pal.s1} fill={pal.s1} fillOpacity={0.14} strokeWidth={2.5} dot={{ r: 3, fill: pal.s1 }} />
                <Line type="linear" dataKey="base" name="Base rate" stroke={pal.mute} strokeDasharray="5 4" dot={false} strokeWidth={1.6} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Data funnel" sub={`${D.files.toLocaleString()} matches parsed from YAML`}>
          <div className="funnel">
            {D.FUNNEL.map((f) => (
              <div key={f.name} className="fun-row">
                <div className="fun-n"><span>{f.name}</span><b>{f.value.toLocaleString()}</b></div>
                <div className="fun-bar"><i style={{ width: Math.max(1.5, (f.value / D.files) * 100) + "%", background: f.tone === "good" ? pal.good : pal.warn }} /></div>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <Card title="What the notebooks found" sub="Every claim carries its verdict from the paired bootstrap">
        <div className="find-grid">
          {findings.map((f, i) => (
            <button key={i} className="find" onClick={() => go(f.go)}>
              <Chip tone={f.tone}>{f.tone === "good" ? "Confirmed" : f.tone === "warn" ? "Caution" : "Null result"}</Chip>
              <h4>{f.head}</h4><p>{f.body}</p>
            </button>
          ))}
        </div>
      </Card>
      <Card title="Pipeline" sub="Each notebook feeds the next; the dashboard reads their exports">
        <div className="pipe">
          {D.NOTEBOOKS.map((n) => (
            <button key={n.id} className="pipe-n" onClick={() => go("models")}>
              <span className="pipe-id">{n.id}</span><b>{n.title}</b><Chip tone={n.status === "null" ? "mute" : "good"}>{n.tag}</Chip>
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}

/* ---------- tabbed pages: the new historical views sit beside the original screens ---------- */
function Tabbed({ id, tabs, go, extra = {} }) {
  const [tab, setTab] = useState(null);
  useEffect(() => { window["__tab_" + id] = setTab; return () => { delete window["__tab_" + id]; }; }, [id]);
  const eff = tab || (MD.loaded.matches ? tabs[0].value : tabs[tabs.length - 1].value);
  const T = tabs.find((t) => t.value === eff) || tabs[0];
  return (
    <div className="stack">
      <div className="toolbar"><Seg value={T.value} onChange={setTab} label="View" options={tabs.map((t) => ({ value: t.value, label: t.label }))} /><span className="grow" /><span className="note">{T.hint}</span></div>
      {T.bar && <SelectorBar opts={T.bar} go={go} />}
      <T.c go={go} {...extra} />
    </div>
  );
}
function MatchCentre(p) { return <Tabbed id="mc" go={p.go} tabs={[{ value: "hist", label: "Historical match", c: HistoricalMatchCentre, bar: { innings: true, over: true }, hint: "Real matches from your YAML files, with model output" }, { value: "sim", label: "Scenario simulator", c: ScenarioSimulator, hint: "Type in a hypothetical match state; not a real match" }]} />; }
function ParLab(p) { return <Tabbed id="par" go={p.go} tabs={[{ value: "match", label: "Historical match", c: ParMatchView, bar: { over: true }, hint: "Actual chase against the model's par" }, { value: "explorer", label: "Par explorer", c: ParExplorer, hint: "Model par table for any target" }]} />; }
function Replays(p) { return <Tabbed id="rp" go={p.go} tabs={[{ value: "any", label: "Any match", c: HistoricalReplay, bar: { innings: true }, hint: "Over-by-over replay of any historical match" }, { value: "featured", label: "Featured 2026 replays", c: FeaturedReplays, hint: "Notebook 06 examples at checkpoint overs" }]} />; }
function WinProb(p) { return <Tabbed id="wp" go={p.go} tabs={[{ value: "match", label: "Match analysis", c: WinProbMatchView, bar: { over: true }, hint: "Probability through one historical match" }, { value: "eval", label: "Model evaluation", c: WinProbEvaluation, hint: "Calibration, log loss and comparisons across matches" }]} />; }

/* ---------- module: Match Centre ---------- */

function ScenarioSimulator() {
  const pal = usePal();
  const trained = !!D.GRID_CHASE;
  const [mode, setMode] = useState("chase");
  const [over, setOver] = useState(12);
  const [runs, setRuns] = useState(98);
  const [wkts, setWkts] = useState(3);
  const [target, setTarget] = useState(186);
  const [ve, setVe] = useState(0);
  const [venue, setVenue] = useState("");
  const [pins, setPins] = useState([]);
  const [open, setOpen] = useState(false);
  const load = (d) => { setMode(d.mode); setOver(d.over); setRuns(d.runs); setWkts(d.wkts); setTarget(d.target); setVe(d.ve); setVenue(""); };
  useEffect(() => { window.__loadDemo = load; });
  const pickVenue = (name) => {
    setVenue(name);
    const v = (D.VENUES || []).find((x) => x.venue === name);
    if (v) setVe(Math.round(clamp(v.venue_effect, -20, 20)));
  };

  const c = useMemo(() => chaseAny({ target, runs, wkts, over, ve }), [target, runs, wkts, over, ve, trained]);
  const f = useMemo(() => firstAny({ runs, wkts, over, ve }), [runs, wkts, over, ve, trained]);
  const ballsLeft = (20 - over) * 6;
  const crr = over > 0 ? runs / over : 0;
  const rrr = ballsLeft > 0 ? ((target - runs) / ballsLeft) * 6 : 0;
  const fiftyTotal = useMemo(() => { let t = 100; while (t < 300 && winVsTotal(t, ve) > 0.5) t++; return t; }, [ve, trained]);

  const curveChase = useMemo(() => {
    const rows = []; for (let r = 0; r <= target + 10; r += 3) rows.push({ runs: r, p: +(chaseAny({ target, runs: r, wkts, over, ve }).p * 100).toFixed(1) }); return rows;
  }, [target, wkts, over, ve, trained]);
  const ladder = useMemo(() => {
    const rows = [];
    for (let o = 0; o <= 20; o++) rows.push({ over: o, parLess: parAny(target, Math.max(0, wkts - 2), o, ve), par: parAny(target, wkts, o, ve), parMore: parAny(target, Math.min(9, wkts + 2), o, ve), you: o === over ? runs : null });
    return rows;
  }, [target, wkts, over, ve, runs, trained]);
  const curveFirst = useMemo(() => {
    const rows = []; for (let t = 140; t <= 270; t += 5) rows.push({ total: t, p: +(winVsTotal(t, ve) * 100).toFixed(1) }); return rows;
  }, [ve, trained]);
  const path = useMemo(() => {
    const T = clamp(f.proj, 130, 260);
    const capNow = T - parAny(T, wkts, Math.max(over, 1), ve);
    const rows = [];
    for (let o = over; o <= 20; o++) {
      const cap = T - parAny(T, wkts, Math.max(o, 1), ve);
      const share = capNow > 0 ? clamp((capNow - (o >= 20 ? 0 : cap)) / capNow, 0, 1) : 0;
      const exp = runs + (f.proj - runs) * (o >= 20 ? 1 : share);
      const spread = f.hw * Math.sqrt(Math.max(0, o - over) / Math.max(1, 20 - over));
      rows.push({ over: o, exp: +exp.toFixed(1), band: [+(exp - spread).toFixed(1), +(exp + spread).toFixed(1)] });
    }
    return rows;
  }, [runs, wkts, over, ve, f.proj, f.hw, trained]);

  const pin = () => setPins((ps) => [...ps.slice(-3), mode === "chase"
    ? { id: Date.now(), kind: "Chase", state: `${runs}/${wkts} after ${over}, target ${target}`, p: c.p, extra: `par ${c.par.toFixed(0)} · margin ${c.margin >= 0 ? "+" : "−"}${Math.abs(Math.round(c.margin))}` }
    : { id: Date.now(), kind: "1st innings", state: `${runs}/${wkts} after ${over}`, p: f.p, extra: `proj ${f.proj.toFixed(0)} (${f.lo.toFixed(0)}–${f.hi.toFixed(0)})` }]);

  const validate = useMemo(() => {
    const out = [];
    Object.values(D.REPLAYS).forEach((r) => {
      r.chase.overs.forEach((o, i) => {
        if (![3, 6, 10, 15, 18].includes(o)) return;
        const s = chaseAny({ target: r.target, runs: r.chase.runs[i], wkts: r.chase.wkts[i], over: o, ve: 0 });
        out.push({ state: `${String(r.teams.chase).split(" ")[0]} chase ${r.target}, ${r.chase.runs[i]}/${r.chase.wkts[i]} @${o}`, realP: r.chase.p[i], simP: s.p, realPar: r.chase.par[i], simPar: s.par });
      });
    });
    return out;
  }, [trained]);
  const mae = validate.length ? validate.reduce((a, r) => a + Math.abs(r.realP - r.simP), 0) / validate.length : 0;

  return (
    <div className="stack">
      <div className="grid g-mc">
        <Card title="Scenario" sub="Drag or type a match state" right={<Seg value={mode} onChange={setMode} label="Innings" options={[{ value: "first", label: "1st innings" }, { value: "chase", label: "Chase" }]} />}>
          <div className="form">
            <Field id="mc-over" label="Overs completed"><Num id="mc-over" value={over} onChange={setOver} min={0} max={20} /></Field>
            <input className="range" aria-label="Overs completed" type="range" min="0" max="20" value={over} onChange={(e) => setOver(+e.target.value)} />
            <Field id="mc-runs" label="Runs"><Num id="mc-runs" value={runs} onChange={setRuns} min={0} max={350} /></Field>
            <input className="range" aria-label="Runs" type="range" min="0" max="300" value={runs} onChange={(e) => setRuns(+e.target.value)} />
            <Field id="mc-w" label="Wickets down"><Num id="mc-w" value={wkts} onChange={setWkts} min={0} max={10} /></Field>
            {mode === "chase" && <Field id="mc-t" label="Target"><Num id="mc-t" value={target} onChange={setTarget} min={80} max={300} /></Field>}
            {(D.VENUES || []).length > 0 && (
              <Field id="mc-venue" label="Venue">
                <select id="mc-venue" className="sel-input" value={venue} onChange={(e) => pickVenue(e.target.value)}>
                  <option value="">Custom</option>
                  {D.VENUES.map((v) => <option key={v.venue} value={v.venue}>{v.venue}</option>)}
                </select>
              </Field>
            )}
            <Field id="mc-ve" label="Venue run environment" hint="Runs above (+) or below (−) the era average"><Num id="mc-ve" value={ve} onChange={(v) => { setVe(v); setVenue(""); }} min={-20} max={20} /></Field>
          </div>
          <div className="presets">
            <span className="lbl">Notebook states</span>
            {D.LIVE_DEMOS.map((d) => <button key={d.name} className="btn ghost sm" onClick={() => load(d)} title={d.real}>{d.name}</button>)}
          </div>
          <button className="btn" onClick={pin}>Pin scenario to compare</button>
        </Card>

        <div className="stack">
          <Card className="hero-card">
            <div className="mc-hero">
              {mode === "chase" ? <Gauge p={c.p} label="Chasing side wins" tone="chase" /> : <Gauge p={f.p} label="Batting side wins" tone="first" />}
              <div className="mc-kpis">
                {mode === "chase" ? (
                  <>
                    <Kpi label="Par at this stage" value={Math.round(c.par)} note={`${runs} on the board`} />
                    <Kpi label="Margin vs par" value={(c.margin >= 0 ? "+" : "−") + Math.abs(Math.round(c.margin))} tone={c.margin >= 0 ? "good" : "bad"} note={c.margin >= 0 ? "ahead of a 50% chase" : "behind a 50% chase"} />
                    <Kpi label="Need" value={Math.max(0, target - runs)} note={`${ballsLeft} balls · ${rrr.toFixed(2)} per over`} />
                    <Kpi label="Current rate" value={crr.toFixed(2)} note={`${wkts} down`} />
                  </>
                ) : (
                  <>
                    <Kpi label="Projected total" value={f.proj.toFixed(0)} note={`80% range ${f.lo.toFixed(0)}–${f.hi.toFixed(0)}`} />
                    <Kpi label="Total for 50/50" value={String(fiftyTotal)} note="given the chasing edge" />
                    <Kpi label="Current rate" value={crr.toFixed(2)} note={`${ballsLeft} balls left`} />
                    <Kpi label="Wickets in hand" value={10 - wkts} note={wkts >= 7 ? "range is too narrow after 7+" : "normal range"} tone={wkts >= 7 ? "warn" : undefined} />
                  </>
                )}
              </div>
            </div>
            <div className="src-line"><Chip tone={trained ? "good" : "warn"}>{trained ? "Trained-model grid from notebook 06" : "Interpolated approximation"}</Chip></div>
            {c.done && mode === "chase" && <p className="note">Result is settled: {c.done === "won" ? "target reached" : "innings over"}.</p>}
          </Card>

          {mode === "chase" ? (
            <div className="grid g2">
              <Card title="Win probability vs runs on the board" sub="At this over and wickets. Amber line: par. Green line: your score">
                <div className="chart h260"><ResponsiveContainer><LineChart data={curveChase} margin={{ top: 8, right: 14, left: -6, bottom: 0 }}>
                  <CartesianGrid stroke={pal.line} strokeDasharray="3 4" vertical={false} />
                  <XAxis dataKey="runs" type="number" domain={[0, "dataMax"]} {...axisProps(pal)} />
                  <YAxis domain={[0, 100]} unit="%" {...axisProps(pal)} />
                  <Tooltip content={<ChartTip fmt={(v) => v + "%"} labelFmt={(l) => l + " runs"} />} />
                  <ReferenceLine y={50} stroke={pal.mute} strokeDasharray="4 4" />
                  <ReferenceLine x={Math.round(c.par)} stroke={pal.s2} strokeDasharray="4 3" />
                  <ReferenceLine x={runs} stroke={pal.s3} strokeWidth={2} />
                  <Line type="monotone" dataKey="p" name="Chase wins" stroke={pal.s3} strokeWidth={2.6} dot={false} />
                </LineChart></ResponsiveContainer></div>
              </Card>
              <Card title="Par ladder" sub="Runs needed on the board over the innings (50% line)">
                <div className="chart h260"><ResponsiveContainer><LineChart data={ladder} margin={{ top: 8, right: 14, left: -6, bottom: 0 }}>
                  <CartesianGrid stroke={pal.line} strokeDasharray="3 4" vertical={false} />
                  <XAxis dataKey="over" type="number" domain={[0, 20]} ticks={[0, 4, 8, 12, 16, 20]} {...axisProps(pal)} />
                  <YAxis domain={[0, target]} {...axisProps(pal)} />
                  <Tooltip content={<ChartTip fmt={(v) => Math.round(v)} labelFmt={(l) => "Over " + l} />} />
                  <Legend wrapperStyle={{ fontSize: 11, color: pal.mute }} />
                  <Line dataKey="parLess" name={`par, ${Math.max(0, wkts - 2)} down`} stroke={pal.s2} strokeOpacity={0.5} dot={false} strokeDasharray="4 3" />
                  <Line dataKey="par" name={`par, ${wkts} down`} stroke={pal.s2} strokeWidth={2.6} dot={false} />
                  <Line dataKey="parMore" name={`par, ${Math.min(9, wkts + 2)} down`} stroke={pal.s4} strokeOpacity={0.6} dot={false} strokeDasharray="4 3" />
                  <Line dataKey="you" name="Your score" stroke={pal.s3} strokeWidth={0} dot={{ r: 7, fill: pal.s3, stroke: pal.panel, strokeWidth: 2 }} activeDot={false} />
                </LineChart></ResponsiveContainer></div>
              </Card>
            </div>
          ) : (
            <div className="grid g2">
              <Card title="Batting-side win % vs final total" sub="Shaded: the model's 80% range for this innings">
                <div className="chart h260"><ResponsiveContainer><LineChart data={curveFirst} margin={{ top: 8, right: 14, left: -6, bottom: 0 }}>
                  <CartesianGrid stroke={pal.line} strokeDasharray="3 4" vertical={false} />
                  <XAxis dataKey="total" type="number" domain={[140, 270]} {...axisProps(pal)} />
                  <YAxis domain={[0, 100]} unit="%" {...axisProps(pal)} />
                  <Tooltip content={<ChartTip fmt={(v) => v + "%"} labelFmt={(l) => "Total " + l} />} />
                  <ReferenceArea x1={clamp(f.lo, 140, 270)} x2={clamp(f.hi, 140, 270)} fill={pal.s1} fillOpacity={0.12} />
                  <ReferenceLine y={50} stroke={pal.mute} strokeDasharray="4 4" />
                  <ReferenceLine x={clamp(Math.round(f.proj / 5) * 5, 140, 270)} stroke={pal.s1} strokeWidth={2} />
                  <Line type="monotone" dataKey="p" name="Batting side wins" stroke={pal.s1} strokeWidth={2.6} dot={false} />
                </LineChart></ResponsiveContainer></div>
              </Card>
              <Card title="Expected scoreboard path" sub="With the growing 80% range to over 20">
                <div className="chart h260"><ResponsiveContainer><ComposedChart data={path} margin={{ top: 8, right: 14, left: -6, bottom: 0 }}>
                  <CartesianGrid stroke={pal.line} strokeDasharray="3 4" vertical={false} />
                  <XAxis dataKey="over" type="number" domain={[over, 20]} {...axisProps(pal)} />
                  <YAxis domain={["auto", "auto"]} {...axisProps(pal)} />
                  <Tooltip content={<ChartTip fmt={(v) => Math.round(v)} labelFmt={(l) => "Over " + l} />} />
                  <Area dataKey="band" name="band" stroke="none" fill={pal.s1} fillOpacity={0.16} />
                  <Line dataKey="exp" name="Expected runs" stroke={pal.s1} strokeWidth={2.6} dot={false} />
                </ComposedChart></ResponsiveContainer></div>
              </Card>
            </div>
          )}

          {pins.length > 0 && (
            <Card title="Pinned scenarios" right={<button className="btn ghost sm" onClick={() => setPins([])}>Clear</button>}>
              <div className="tbl-wrap"><table className="tbl">
                <thead><tr><th>Type</th><th>State</th><th className="r">Win %</th><th>Detail</th><th /></tr></thead>
                <tbody>{pins.map((p) => (
                  <tr key={p.id}><td>{p.kind}</td><td>{p.state}</td><td className="r mono">{pct(p.p, 1)}</td><td>{p.extra}</td>
                    <td className="r"><button className="btn ghost sm" onClick={() => setPins(pins.filter((x) => x.id !== p.id))}>Remove</button></td></tr>
                ))}</tbody>
              </table></div>
            </Card>
          )}
        </div>
      </div>
      <Card title={trained ? "Where these numbers come from" : "How this simulator relates to the notebooks"}
        sub={trained ? "Probabilities are read from a grid of your trained notebook-06 models and interpolated between grid points." : "Until notebook 06 is exported, it interpolates the real par table and maps margin-vs-par to a probability. It is not the trained model."}
        right={<button className="btn ghost sm" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? "Hide check" : "Show accuracy check"}</button>}>
        <p className="note">Against the {validate.length} case-study chase states of the two replays, the mean absolute probability gap is <b>{(mae * 100).toFixed(1)} points</b>.
          {trained ? " The grid covers targets 120–260, overs 1–19, 0–9 wickets and venue effects of ±10 runs." : " Targets outside 160–220 and fewer than 2 or more than 4 wickets are extrapolated."}</p>
        {open && (
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>State</th><th className="r">Notebook P</th><th className="r">Dashboard P</th><th className="r">Notebook par</th><th className="r">Dashboard par</th></tr></thead>
            <tbody>{validate.map((r, i) => (
              <tr key={i}><td>{r.state}</td><td className="r mono">{pct(r.realP)}</td><td className="r mono">{pct(r.simP)}</td><td className="r mono">{Math.round(r.realPar)}</td><td className="r mono">{r.simPar.toFixed(0)}</td></tr>
            ))}</tbody>
          </table></div>
        )}
      </Card>
    </div>
  );
}

/* ---------- module: Par Lab ---------- */
function ParExplorer() {
  const pal = usePal();
  const real = D.PAR;
  const [w, setW] = useState(3);
  const [pick, setPick] = useState(200);
  const [src, setSrc] = useState("real");
  const [wr, setWr] = useState(2);
  const targets = [150, 160, 170, 180, 190, 200, 210, 220, 230, 240];
  const overs = [3, 6, 9, 12, 15, 18];
  const heat = (v, T) => { const t = clamp(v / T, 0, 1); return `color-mix(in srgb, var(--s1) ${Math.round(t * 70)}%, var(--panel))`; };
  const trained = !!D.GRID_CHASE;
  const lines = useMemo(() => {
    const rows = []; for (let o = 0; o <= 20; o++) rows.push({ over: o, ...Object.fromEntries([0, 2, 4, 6].map((k) => [`w${k}`, Math.round(parAny(pick, k, o, 0))])) }); return rows;
  }, [pick, trained]);
  const costTargets = [160, 180, 200, 220];
  const costOvers = real ? real.overs : PAR_OVERS;
  const cost = costOvers.map((o, i) => {
    const r = { over: "Over " + o };
    costTargets.forEach((T) => {
      if (real) { const ti = real.targets.indexOf(T); r[T] = ti < 0 || !real.values[ti][4] || !real.values[ti][2] ? null : real.values[ti][4][i] - real.values[ti][2][i]; }
      else r[T] = PAR_TABLE[T][4][i] - PAR_TABLE[T][2][i];
    });
    return r;
  });
  const csv = () => real
    ? toCsv([["target", "wickets", ...real.overs.map((o) => "over" + o)], ...real.targets.flatMap((T, ti) => real.wickets.map((k, wi) => [T, k, ...real.values[ti][wi]]))])
    : toCsv([["target", "wickets", ...PAR_OVERS.map((o) => "over" + o)], ...T_ANCH.flatMap((T) => [2, 4].map((k) => [T, k, ...PAR_TABLE[T][k]]))]);
  return (
    <div className="stack">
      <div className="grid g21">
        <Card title="Par table" sub={real ? `Runs needed on the board for a 50% chase · ${real.venue}` : "Runs needed on the board for a 50% chase"} right={<><SourceChip names={["nb06"]} /><Seg value={src} onChange={setSrc} label="Source" options={[{ value: "real", label: "Notebook output" }, { value: "interp", label: "Interpolated" }]} /><CopyBtn get={csv} /></>}>
          {src === "real" ? (real ? (
            <div className="tbl-wrap">
              <div className="inline"><label htmlFor="pl-wr">Wickets down: <b>{wr}</b></label><input id="pl-wr" className="range" type="range" min="0" max="8" value={wr} onChange={(e) => setWr(+e.target.value)} /></div>
              <table className="tbl par">
                <thead><tr><th>Target</th>{real.overs.map((o) => <th key={o} className="r">Over {o}</th>)}</tr></thead>
                <tbody>{real.targets.map((T, ti) => (
                  <tr key={T}><td className="strong">{T}</td>{real.values[ti][wr].map((v, oi) => <td key={oi} className="r mono heat" style={{ background: heat(v, T) }}>{Math.round(v)}</td>)}</tr>
                ))}</tbody>
              </table>
            </div>
          ) : (
            <div className="tbl-wrap"><table className="tbl par">
              <thead><tr><th>Target</th><th>Wickets</th>{PAR_OVERS.map((o) => <th key={o} className="r">Over {o}</th>)}</tr></thead>
              <tbody>{T_ANCH.flatMap((T) => [2, 4].map((k) => (
                <tr key={T + "-" + k}>{k === 2 ? <td rowSpan="2" className="strong">{T}</td> : null}<td>{k} down</td>
                  {PAR_TABLE[T][k].map((v, i) => <td key={i} className="r mono heat" style={{ background: heat(v, T) }}>{v}</td>)}</tr>
              )))}</tbody>
            </table></div>
          )) : (
            <div className="tbl-wrap"><div className="inline"><label htmlFor="pl-w">Wickets down: <b>{w}</b></label><input id="pl-w" className="range" type="range" min="0" max="8" value={w} onChange={(e) => setW(+e.target.value)} /></div>
              <table className="tbl par">
                <thead><tr><th>Target</th>{overs.map((o) => <th key={o} className="r">Over {o}</th>)}</tr></thead>
                <tbody>{targets.map((T) => (
                  <tr key={T}><td className="strong">{T}</td>{overs.map((o) => { const v = parAny(T, w, o, 0); return <td key={o} className="r mono heat" style={{ background: heat(v, T) }}>{v.toFixed(0)}</td>; })}</tr>
                ))}</tbody>
              </table></div>
          )}
          <p className="note">{real ? `Notebook context: ${real.venue}, steady-pace assumption, from the final chase model.` : "Notebook context: Wankhede Stadium, league average 199, recent chase win rate 0.59."} Interpolated values lie between the printed anchors.</p>
        </Card>
        <Card title="Reading par" sub="What the table shows">
          <ul className="facts">
            <li><b>Par is what the side can still score.</b> It is the target minus the runs a team with that many wickets can realistically still add.</li>
            <li><b>That is a rising rate:</b> about 9.6 per over from over 6, rising to about 15 per over by over 18.</li>
            <li><b>Lost wickets cost less late.</b> Two extra wickets add far more to par at over 6 than at over 18.</li>
            <li><b>Higher targets need more early.</b> The par at over 6 grows by about 0.8 runs per extra target run.</li>
          </ul>
        </Card>
      </div>
      <div className="grid g2">
        <Card title="Par curve by wickets lost" sub="For the chosen target" right={<Seg value={String(pick)} onChange={(v) => setPick(+v)} label="Target" options={[160, 180, 200, 220].map((t) => ({ value: String(t), label: String(t) }))} />}>
          <div className="chart h280"><ResponsiveContainer><LineChart data={lines} margin={{ top: 8, right: 14, left: -6, bottom: 0 }}>
            <CartesianGrid stroke={pal.line} strokeDasharray="3 4" vertical={false} />
            <XAxis dataKey="over" type="number" domain={[0, 20]} ticks={[0, 4, 8, 12, 16, 20]} {...axisProps(pal)} />
            <YAxis domain={[0, pick]} {...axisProps(pal)} />
            <Tooltip content={<ChartTip fmt={(v) => Math.round(v)} labelFmt={(l) => "Over " + l} />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line dataKey="w0" name="0 down" stroke={pal.s3} dot={false} strokeWidth={2} />
            <Line dataKey="w2" name="2 down" stroke={pal.s1} dot={false} strokeWidth={2} />
            <Line dataKey="w4" name="4 down" stroke={pal.s2} dot={false} strokeWidth={2} />
            <Line dataKey="w6" name="6 down" stroke={pal.s4} dot={false} strokeWidth={2} />
          </LineChart></ResponsiveContainer></div>
        </Card>
        <Card title="Cost of two extra wickets" sub="Par at 4 down minus par at 2 down (notebook output)">
          <div className="chart h280"><ResponsiveContainer><BarChart data={cost} margin={{ top: 8, right: 14, left: -6, bottom: 0 }}>
            <CartesianGrid stroke={pal.line} strokeDasharray="3 4" vertical={false} />
            <XAxis dataKey="over" {...axisProps(pal)} />
            <YAxis {...axisProps(pal)} />
            <Tooltip content={<ChartTip fmt={(v) => "+" + Math.round(v) + " runs"} />} cursor={{ fill: pal.line, opacity: 0.3 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="160" name="Target 160" fill={pal.s3} radius={[3, 3, 0, 0]} />
            <Bar dataKey="180" name="180" fill={pal.s1} radius={[3, 3, 0, 0]} />
            <Bar dataKey="200" name="200" fill={pal.s2} radius={[3, 3, 0, 0]} />
            <Bar dataKey="220" name="220" fill={pal.s4} radius={[3, 3, 0, 0]} />
          </BarChart></ResponsiveContainer></div>
        </Card>
      </div>
    </div>
  );
}

/* ---------- module: Replays ---------- */
function FeaturedReplays() {
  const pal = usePal();
  const ids = Object.keys(D.REPLAYS);
  const [id, setId] = useState(ids[0]);
  const [view, setView] = useState("chase");
  const [i, setI] = useState(0);
  const [play, setPlay] = useState(false);
  const R = D.REPLAYS[id] || D.REPLAYS[ids[0]];
  const D1 = view === "chase" ? R.chase : R.first;
  useEffect(() => { setI(0); setPlay(false); }, [id, view]);
  const ticks = D1.overs.map((o, k) => [o, k]).filter(([o]) => [3, 6, 10, 15, 18].includes(o) || D1.overs.length <= 6);
  useEffect(() => {
    if (!play) return;
    const t = setInterval(() => setI((x) => { if (x >= D1.overs.length - 1) { setPlay(false); return x; } return x + 1; }), D1.overs.length > 8 ? 380 : 1100);
    return () => clearInterval(t);
  }, [play, D1]);
  const rows = D1.overs.map((o, k) => ({ over: o, p: +(D1.p[k] * 100).toFixed(0), runs: D1.runs[k], wkts: D1.wkts[k], par: D1.par ? D1.par[k] : null, proj: D1.proj ? D1.proj[k] : null, margin: D1.par ? D1.runs[k] - D1.par[k] : null }));
  const cur = rows[Math.min(i, rows.length - 1)];
  const team = view === "chase" ? R.teams.chase : R.teams.first;
  const balls = (20 - cur.over) * 6;
  const csv = () => toCsv([["over", "runs", "wkts", view === "chase" ? "par" : "projected", "win_pct"], ...rows.map((r) => [r.over, r.runs, r.wkts, view === "chase" ? r.par : r.proj, r.p])]);
  return (
    <div className="stack">
      <div className="toolbar">
        <Seg value={id} onChange={setId} label="Match" options={ids.map((k) => ({ value: k, label: D.REPLAYS[k].title }))} />
        <Seg value={view} onChange={setView} label="View" options={[{ value: "chase", label: "Chasing side" }, { value: "first", label: "Batting first" }]} />
        <span className="grow" /><Chip tone="mute">{R.date}</Chip>{R.venue && <Chip tone="mute">{R.venue}</Chip>}<SourceChip names={["nb06"]} />
      </div>
      <Card className="score-card">
        <div className="sb">
          <div className="sb-main">
            <div className="sb-team">{team}</div>
            <div className="sb-score">{Math.round(cur.runs)}<span>/{cur.wkts}</span></div>
            <div className="sb-over">after {cur.over} overs</div>
          </div>
          <div className="sb-mid">
            {view === "chase" ? (
              <><div className="sb-line">Target <b>{R.target}</b> · need <b>{Math.round(R.target - cur.runs)}</b> off <b>{balls}</b></div>
                <div className="sb-line">Par <b>{Math.round(cur.par)}</b> · margin <b className={cur.margin >= 0 ? "t-good" : "t-bad"}>{cur.margin >= 0 ? "+" : "−"}{Math.abs(Math.round(cur.margin))}</b></div></>
            ) : (
              <><div className="sb-line">Projected total <b>{cur.proj.toFixed(0)}</b></div>
                <div className="sb-line">Final: <b>{R.firstFinal}</b> · {R.teams.first} {R.chaseWon === false ? "won" : "lost"}</div></>
            )}
          </div>
          <Gauge p={D1.p[Math.min(i, D1.p.length - 1)]} label={view === "chase" ? "Chase wins" : "Batting side wins"} tone={view === "chase" ? "chase" : "first"} />
        </div>
        <div className="scrub">
          <button className="btn" onClick={() => { if (i >= D1.overs.length - 1) setI(0); setPlay(!play); }}>{play ? "Pause" : "Play"}</button>
          <input className="range" type="range" min="0" max={D1.overs.length - 1} value={i} onChange={(e) => { setPlay(false); setI(+e.target.value); }} aria-label="Match moment" />
          <div className="ticks">{ticks.map(([o, k]) => <button key={o} className={k === i ? "on" : ""} onClick={() => { setPlay(false); setI(k); }}>Over {o}</button>)}</div>
        </div>
        <p className="note">{R.blurb}</p>
      </Card>
      <div className="grid g2">
        <Card title="Win probability through the match" sub={view === "chase" ? "Chasing side" : "Batting-first side"}>
          <div className="chart h280"><ResponsiveContainer><ComposedChart data={rows} margin={{ top: 8, right: 14, left: -6, bottom: 0 }}>
            <CartesianGrid stroke={pal.line} strokeDasharray="3 4" vertical={false} />
            <XAxis dataKey="over" type="number" domain={[0, 20]} ticks={[0, 4, 8, 12, 16, 20]} {...axisProps(pal)} />
            <YAxis domain={[0, 100]} unit="%" {...axisProps(pal)} />
            <Tooltip content={<ChartTip fmt={(v) => v + "%"} labelFmt={(l) => "Over " + l} />} />
            <ReferenceLine y={50} stroke={pal.mute} strokeDasharray="4 4" />
            <ReferenceLine x={cur.over} stroke={pal.s2} strokeWidth={2} />
            <Area type="linear" dataKey="p" name="Win %" stroke={view === "chase" ? pal.s3 : pal.s1} fill={view === "chase" ? pal.s3 : pal.s1} fillOpacity={0.15} strokeWidth={2.6} dot={rows.length > 8 ? false : { r: 4 }} />
          </ComposedChart></ResponsiveContainer></div>
        </Card>
        <Card title={view === "chase" ? "Runs vs par" : "Projected total vs actual runs"} sub={view === "chase" ? "Staying below par is what a low probability looks like" : "The projection against the runs scored so far"}>
          <div className="chart h280"><ResponsiveContainer><ComposedChart data={rows} margin={{ top: 8, right: 14, left: -6, bottom: 0 }}>
            <CartesianGrid stroke={pal.line} strokeDasharray="3 4" vertical={false} />
            <XAxis dataKey="over" type="number" domain={[0, 20]} ticks={[0, 4, 8, 12, 16, 20]} {...axisProps(pal)} />
            <YAxis {...axisProps(pal)} />
            <Tooltip content={<ChartTip fmt={(v) => Math.round(v)} labelFmt={(l) => "Over " + l} />} />
            <ReferenceLine x={cur.over} stroke={pal.s2} strokeWidth={2} />
            {view === "chase" ? (
              <>
                <Line type="linear" dataKey="par" name="Par" stroke={pal.s2} strokeWidth={2.4} strokeDasharray="5 4" dot={false} />
                <Line type="linear" dataKey="runs" name="Runs" stroke={pal.s3} strokeWidth={2.6} dot={false} />
              </>
            ) : (
              <>
                <Line type="linear" dataKey="proj" name="Projected total" stroke={pal.s1} strokeWidth={2.4} strokeDasharray="5 4" dot={false} />
                <Line type="linear" dataKey="runs" name="Runs so far" stroke={pal.s4} strokeWidth={2.6} dot={false} />
              </>
            )}
          </ComposedChart></ResponsiveContainer></div>
        </Card>
      </div>
      <Card title="Snapshots" right={<CopyBtn get={csv} />}>
        <div className="tbl-wrap tall"><table className="tbl">
          <thead><tr><th>Over</th><th className="r">Runs</th><th className="r">Wkts</th>{view === "chase" ? <><th className="r">Par</th><th className="r">vs par</th></> : <th className="r">Projected</th>}<th className="r">Win %</th></tr></thead>
          <tbody>{rows.map((r, k) => (
            <tr key={k} className={k === i ? "sel" : ""} onClick={() => { setPlay(false); setI(k); }}>
              <td className="mono">{r.over}</td><td className="r mono">{Math.round(r.runs)}</td><td className="r mono">{r.wkts}</td>
              {view === "chase" ? <><td className="r mono">{Math.round(r.par)}</td><td className={"r mono " + (r.margin >= 0 ? "t-good" : "t-bad")}>{r.margin >= 0 ? "+" : "−"}{Math.abs(Math.round(r.margin))}</td></> : <td className="r mono">{r.proj.toFixed(1)}</td>}
              <td className="r mono strong">{r.p}%</td>
            </tr>
          ))}</tbody>
        </table></div>
      </Card>
    </div>
  );
}

/* ---------- module: Score Engine (notebook 03) ---------- */
function ScoreEngine({ go }) {
  const pal = usePal();
  const j = D.NB03;
  const [scope, setScope] = useState("val");
  const sel = useSelection();
  const shared = !!(sel && sel.ready);
  const [locSeason, setLocSeason] = useState("all");
  const [locMatch, setLocMatch] = useState("");
  const [histScope, setHistScope] = useState("all");
  // the season and match come from the shared selection when matches.json is loaded; otherwise the page keeps its own
  const selectedSeason = shared ? (sel.season === "all" ? "all" : String(sel.season)) : locSeason;
  const selectedMatch = shared ? sel.matchId : locMatch;
  const setSelectedSeason = (v) => (shared ? sel.setSeason(v === "all" ? "all" : Number(v)) : setLocSeason(v));
  const setSelectedMatch = (v) => { if (shared) { if (v) sel.setMatch(v); } else setLocMatch(v); };
  if (!j) {
    return (
      <div className="stack">
        <Empty title="Notebook 03 is not exported yet" go={go}>Run the last cell of <b>03_live_first_innings_prediction_v3.ipynb</b> to write <code>nb03.json</code>, then drop it on the Connect data screen. This screen will show error by over for every model, the interval settings, and coverage by over and by wickets lost.</Empty>
        <div className="grid g3">
          <Kpi label="Models" value="Ridge + Par" note="Ridge overs 1–18, Par table over 19" />
          <Kpi label="Interval" value="80%" note="2 calibration seasons × scale 1.05" />
          <Kpi label="Known limit" value="7+ wickets" note="coverage 72%, bias +4.1 runs" tone="warn" />
        </div>
      </div>
    );
  }

  // Historical match explorer — Notebook 03
  const history = Array.isArray(j.match_history) ? j.match_history : [];

  const seasonOptions = [...new Set(
    history.map((r) => String(r.season))
  )].sort((a, b) => Number(b) - Number(a));

  const effSeason = seasonOptions.includes(selectedSeason) ? selectedSeason : "all";
  const filteredHistory = effSeason === "all"
    ? history
    : history.filter((r) => String(r.season) === effSeason);

  // Build one option per match
  const matchMap = new Map();

  filteredHistory.forEach((r) => {
    const id = String(r.match_id);
    if (!matchMap.has(id)) {
      matchMap.set(id, {
        id,
        date: r.date,
        team: r.batting_team,
        venue: r.venue,
      });
    }
  });

  const matchOptions = [...matchMap.values()].sort(
    (a, b) => String(b.date).localeCompare(String(a.date))
  );

  // Keep a valid match selected when the season changes
  const selectedMatchId = matchMap.has(selectedMatch)
    ? selectedMatch
    : (matchOptions[0]?.id || "");

  const matchRows = filteredHistory
    .filter((r) => String(r.match_id) === selectedMatchId)
    .sort((a, b) => Number(a.over) - Number(b.over));

  const lastPrediction = matchRows[matchRows.length - 1];

  const actualFinal = lastPrediction
    ? Number(lastPrediction.final_score)
    : 0;

  const predictedFinal = lastPrediction
    ? Number(lastPrediction.mid)
    : 0;

  const predictionError = predictedFinal - actualFinal;

  const intervalCovered = lastPrediction
    ? actualFinal >= Number(lastPrediction.lo) &&
      actualFinal <= Number(lastPrediction.hi)
    : false;

  const historyChart = matchRows.map((r) => ({
    over: Number(r.over),
    actualRuns: Number(r.runs),
    wickets: Number(r.wickets),
    predicted: Number(r.mid),
    range: [Number(r.lo), Number(r.hi)],
    actualFinal: Number(r.final_score),
  }));

  // ===== Model performance diagnostics =====

  const diagnosticRows = history
    .map((r) => ({
      ...r,
      error: Number(r.mid) - Number(r.final_score),
      absoluteError: Math.abs(Number(r.mid) - Number(r.final_score)),
      squaredError: Math.pow(Number(r.mid) - Number(r.final_score), 2),
      over: Number(r.over),
      wickets: Number(r.wickets),
      season: String(r.season),
    }))
    .filter((r) =>
      Number.isFinite(r.error) &&
      Number.isFinite(r.over) &&
      Number.isFinite(r.wickets)
    )
    .filter((r) => histScope === "all" || (histScope === "hold" ? Number(r.season) === D.seasons[1] : Number(r.season) < D.seasons[1]));

  const summarizeErrors = (rows) => {
    if (!rows.length) {
      return { count: 0, mae: 0, rmse: 0, bias: 0 };
    }

    return {
      count: rows.length,
      mae: rows.reduce((s, r) => s + r.absoluteError, 0) / rows.length,
      rmse: Math.sqrt(
        rows.reduce((s, r) => s + r.squaredError, 0) / rows.length
      ),
      bias: rows.reduce((s, r) => s + r.error, 0) / rows.length,
    };
  };

  // Overall error distribution
  const overallDiagnostics = summarizeErrors(diagnosticRows);

  // MAE by season
  const seasonDiagnostics = Object.entries(
    Object.groupBy
      ? Object.groupBy(diagnosticRows, (r) => r.season)
      : diagnosticRows.reduce((acc, r) => {
          (acc[r.season] ||= []).push(r);
          return acc;
        }, {})
  )
    .map(([season, rows]) => ({
      season,
      ...summarizeErrors(rows),
    }))
    .sort((a, b) => Number(a.season) - Number(b.season));

  // MAE by over
  const overDiagnostics = Object.entries(
    diagnosticRows.reduce((acc, r) => {
      (acc[r.over] ||= []).push(r);
      return acc;
    }, {})
  )
    .map(([over, rows]) => ({
      over: Number(over),
      ...summarizeErrors(rows),
    }))
    .sort((a, b) => a.over - b.over);

  // Error by wickets lost
  const wicketBuckets = [
    { label: "0–2 wickets", min: 0, max: 2 },
    { label: "3–4 wickets", min: 3, max: 4 },
    { label: "5–6 wickets", min: 5, max: 6 },
    { label: "7–10 wickets", min: 7, max: 10 },
  ];

  const wicketDiagnostics = wicketBuckets.map((bucket) => {
    const rows = diagnosticRows.filter(
      (r) => r.wickets >= bucket.min && r.wickets <= bucket.max
    );

    return {
      bucket: bucket.label,
      ...summarizeErrors(rows),
    };
  });

  // Error by innings phase
  const phaseBuckets = [
    { label: "Powerplay", min: 1, max: 6 },
    { label: "Middle overs", min: 7, max: 15 },
    { label: "Death overs", min: 16, max: 19 },
  ];

  const phaseDiagnostics = phaseBuckets.map((phase) => {
    const rows = diagnosticRows.filter(
      (r) => r.over >= phase.min && r.over <= phase.max
    );

    return {
      phase: phase.label,
      ...summarizeErrors(rows),
    };
  });

  // One latest prediction per match for match-level rankings
  const latestByMatch = new Map();

  diagnosticRows.forEach((r) => {
    const id = String(r.match_id);
    const previous = latestByMatch.get(id);

    if (!previous || r.over > previous.over) {
      latestByMatch.set(id, r);
    }
  });

  const matchDiagnostics = [...latestByMatch.values()]
    .map((r) => ({
      match_id: r.match_id,
      date: r.date,
      season: r.season,
      team: r.batting_team,
      venue: r.venue,
      over: r.over,
      actual: Number(r.final_score),
      predicted: Number(r.mid),
      error: Number(r.error),
      absoluteError: Number(r.absoluteError),
      lower: Number(r.lo),
      upper: Number(r.hi),
      covered:
        Number(r.final_score) >= Number(r.lo) &&
        Number(r.final_score) <= Number(r.hi),
    }));

  const bestPredictions = [...matchDiagnostics]
    .sort((a, b) => a.absoluteError - b.absoluteError)
    .slice(0, 10);

  const worstPredictions = [...matchDiagnostics]
    .sort((a, b) => b.absoluteError - a.absoluteError)
    .slice(0, 10);

  const t = pivotT(j.mae_by_over);
  const hold = j.mae_holdout ? pivotT(j.mae_holdout) : null;
  const tab = scope === "hold" && hold ? hold : t;
  const pre = j.pre_match_mae || {};
  const gains = adaptCompare(scope === "hold" && j.compare_holdout ? j.compare_holdout : j.compare_validation, (c, r) => `${shortName(c)} vs ${shortName(r)}`);
  const iv = j.interval || {};
  const cov = (scope === "hold" && iv.coverage_holdout ? iv.coverage_holdout : iv.coverage_validation) || [];
  const grid = iv.grid || [];
  const scales = [...new Set(grid.map((g) => g.scale))].sort((a, b) => a - b).slice(0, 8);
  const ns = [...new Set(grid.map((g) => g.n_calib))].sort((a, b) => a - b);
  const series = tab.names.map((n) => ({ name: n, values: tab.cols[n], bold: n === j.champion, dash: /naive/i.test(n) }));
  const best = tab.names.map((n) => ({ n, v: colMean(tab.cols[n]) })).sort((a, b) => a.v - b.v);
  const preKey = Object.keys(pre).find((k) => /era/i.test(k)) || Object.keys(pre)[0];
  return (
    <div className="stack">
      <div className="toolbar"><SourceChip names={["nb03"]} /><Chip tone="mute">Champion: {j.champion}</Chip><span className="grow" />
        {j.mae_holdout && <Seg value={scope} onChange={setScope} label="Scope" options={[{ value: "val", label: "Validation" }, { value: "hold", label: "Holdout" }]} />}</div>

      <SelectorBar opts={{}} go={go} />
      {history.length === 0 && <ScoreMatchView go={go} />}
      <Card
        title="Historical match explorer"
        sub={`${history.length.toLocaleString()} over-level predictions · ${matchOptions.length.toLocaleString()} matches in selected season`}
        right={<Chip tone={history.length ? "good" : "warn"}>
          {history.length ? "Historical data loaded" : "No history"}
        </Chip>}
      >
        {history.length > 0 ? (
          <>
            <div className="form">
              <Field id="se-history" label="Season">
                <select
                  id="se-history"
                  className="sel-input"
                  value={effSeason}
                  onChange={(e) => {
                    setSelectedSeason(e.target.value);
                    setSelectedMatch("");
                  }}
                >
                  <option value="all">All seasons</option>
                  {seasonOptions.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </Field>

              <Field id="se-match" label="Historical match">
                <select
                  id="se-match"
                  className="sel-input"
                  value={selectedMatchId}
                  onChange={(e) => setSelectedMatch(e.target.value)}
                >
                  {matchOptions.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.date} · {m.team} · {m.venue} · {m.id}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            {lastPrediction && (
              <>
                <div className="grid g4">
                  <Kpi
                    label="Actual final score"
                    value={actualFinal.toFixed(0)}
                    note="Historical match result"
                  />
                  <Kpi
                    label="Predicted final score"
                    value={predictedFinal.toFixed(1)}
                    note="Prediction at final recorded over"
                  />
                  <Kpi
                    label="Prediction error"
                    value={`${predictionError > 0 ? "+" : ""}${predictionError.toFixed(1)}`}
                    note="Predicted − actual"
                    tone={Math.abs(predictionError) <= 5 ? "good" : "warn"}
                  />
                  <Kpi
                    label="80% interval"
                    value={intervalCovered ? "Covered" : "Missed"}
                    note={`${Number(lastPrediction.lo).toFixed(0)}–${Number(lastPrediction.hi).toFixed(0)} runs`}
                    tone={intervalCovered ? "good" : "warn"}
                  />
                </div>

                <div className="grid g2">
                  <Kpi
                    label="Batting team"
                    value={lastPrediction.batting_team}
                    note={lastPrediction.venue}
                  />
                  <Kpi
                    label="Match date"
                    value={lastPrediction.date}
                    note={`Match ID: ${lastPrediction.match_id}`}
                  />
                </div>

                <Card
                  title="Over-by-over prediction replay"
                  sub="Actual cumulative runs versus predicted final score and its 80% interval"
                >
                  <div className="chart h300">
                    <ResponsiveContainer>
                      <ComposedChart data={historyChart}>
                        <CartesianGrid stroke={pal.line} strokeDasharray="3 4" vertical={false} />
                        <XAxis
                          dataKey="over"
                          type="number"
                          domain={[1, 19]}
                          {...axisProps(pal)}
                        />
                        <YAxis {...axisProps(pal)} />
                        <Tooltip content={
                          <ChartTip
                            fmt={(v) => Number(v).toFixed(1) + " runs"}
                            labelFmt={(l) => "Over " + l}
                          />
                        } />
                        <Legend wrapperStyle={{ fontSize: 11 }} />

                        <Area
                          dataKey="range"
                          name="80% prediction interval"
                          stroke="none"
                          fill={pal.s1}
                          fillOpacity={0.14}
                        />

                        <Line
                          dataKey="predicted"
                          name="Predicted final score"
                          stroke={pal.s1}
                          strokeWidth={2.5}
                          dot={false}
                        />

                        <Line
                          dataKey="actualRuns"
                          name="Actual runs so far"
                          stroke={pal.s3}
                          strokeWidth={2.5}
                          dot={{ r: 3 }}
                        />

                        <ReferenceLine
                          y={actualFinal}
                          stroke={pal.s2}
                          strokeDasharray="5 4"
                          label="Actual final score"
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </Card>

                <Card title="Over-by-over prediction details">
                  <div className="tbl-wrap tall">
                    <table className="tbl">
                      <thead>
                        <tr>
                          <th>Over</th>
                          <th className="r">Runs</th>
                          <th className="r">Wickets</th>
                          <th className="r">Predicted</th>
                          <th className="r">Lower</th>
                          <th className="r">Upper</th>
                          <th className="r">Error</th>
                        </tr>
                      </thead>
                      <tbody>
                        {matchRows.map((r) => {
                          const error = Number(r.mid) - Number(r.final_score);
                          return (
                            <tr key={`${r.match_id}-${r.over}`}>
                              <td className="mono">{r.over}</td>
                              <td className="r mono">{r.runs}</td>
                              <td className="r mono">{r.wickets}</td>
                              <td className="r mono">{Number(r.mid).toFixed(1)}</td>
                              <td className="r mono">{Number(r.lo).toFixed(1)}</td>
                              <td className="r mono">{Number(r.hi).toFixed(1)}</td>
                              <td className="r mono">{error > 0 ? "+" : ""}{error.toFixed(1)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </>
            )}
          </>
        ) : (
          <p className="note">
            No historical match records found. Check that the updated nb03.json export is loaded.
          </p>
        )}
      </Card>

      {/* ===== Score Engine 3.0: Model diagnostics ===== */}
      {history.length > 0 && (
        <div className="stack">
          <div className="section-head">
            <div>
              <h2>Model performance diagnostics</h2>
              <p className="sub">
                Historical prediction errors across {matchDiagnostics.length} matches
                and {diagnosticRows.length.toLocaleString()} over-level records
              </p>
            </div>
            <Seg value={histScope} onChange={setHistScope} label="Evaluation scope" options={[{ value: "all", label: "All" }, { value: "val", label: "Validation" }, { value: "hold", label: "Holdout " + D.seasons[1] }]} />
            <Chip tone="good">Notebook 03 · Historical predictions</Chip>
          </div>

          <div className="grid g4">
            <Kpi
              label="Overall MAE"
              value={overallDiagnostics.mae.toFixed(2)}
              note="Average absolute error · runs"
            />
            <Kpi
              label="Overall RMSE"
              value={overallDiagnostics.rmse.toFixed(2)}
              note="Penalizes large misses · runs"
            />
            <Kpi
              label="Prediction bias"
              value={`${overallDiagnostics.bias > 0 ? "+" : ""}${overallDiagnostics.bias.toFixed(2)}`}
              note={overallDiagnostics.bias > 0 ? "Over-predicting" : "Under-predicting"}
              tone={Math.abs(overallDiagnostics.bias) < 2 ? "good" : "warn"}
            />
            <Kpi
              label="Matches evaluated"
              value={matchDiagnostics.length.toLocaleString()}
              note="One latest prediction per match"
            />
          </div>

          <div className="grid g2">
            <Card title="Prediction error by season" sub="Mean absolute error · lower is better">
              <div className="chart h280">
                <ResponsiveContainer>
                  <BarChart data={seasonDiagnostics}>
                    <CartesianGrid stroke={pal.line} strokeDasharray="3 4" vertical={false} />
                    <XAxis dataKey="season" {...axisProps(pal)} />
                    <YAxis {...axisProps(pal)} />
                    <Tooltip content={<ChartTip fmt={(v) => v.toFixed(2) + " runs"} />} />
                    <Bar dataKey="mae" name="MAE" fill={pal.s1} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card title="Prediction error by over" sub="Mean absolute error at each innings stage">
              <div className="chart h280">
                <ResponsiveContainer>
                  <LineChart data={overDiagnostics}>
                    <CartesianGrid stroke={pal.line} strokeDasharray="3 4" vertical={false} />
                    <XAxis dataKey="over" type="number" domain={[1, 19]} {...axisProps(pal)} />
                    <YAxis {...axisProps(pal)} />
                    <Tooltip content={<ChartTip fmt={(v) => v.toFixed(2) + " runs"} labelFmt={(v) => "Over " + v} />} />
                    <Line
                      dataKey="mae"
                      name="MAE"
                      stroke={pal.s3}
                      strokeWidth={2.6}
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <div className="grid g2">
            <Card title="Error by wickets lost" sub="How prediction error changes as wickets fall">
              <div className="chart h260">
                <ResponsiveContainer>
                  <BarChart data={wicketDiagnostics}>
                    <CartesianGrid stroke={pal.line} strokeDasharray="3 4" vertical={false} />
                    <XAxis dataKey="bucket" {...axisProps(pal)} />
                    <YAxis {...axisProps(pal)} />
                    <Tooltip content={<ChartTip fmt={(v) => v.toFixed(2) + " runs"} />} />
                    <Bar dataKey="mae" name="MAE" fill={pal.s2} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="note">
                Each bucket groups predictions by the wickets lost at that over.
              </p>
            </Card>

            <Card title="Error by innings phase" sub="Powerplay, middle overs and death overs">
              <div className="chart h260">
                <ResponsiveContainer>
                  <BarChart data={phaseDiagnostics}>
                    <CartesianGrid stroke={pal.line} strokeDasharray="3 4" vertical={false} />
                    <XAxis dataKey="phase" {...axisProps(pal)} />
                    <YAxis {...axisProps(pal)} />
                    <Tooltip content={<ChartTip fmt={(v) => v.toFixed(2) + " runs"} />} />
                    <Bar dataKey="mae" name="MAE" fill={pal.s4} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <div className="grid g2">
            <Card title="10 most accurate match predictions" sub="Smallest absolute error at the latest recorded over">
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Match</th>
                      <th className="r">Actual</th>
                      <th className="r">Predicted</th>
                      <th className="r">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bestPredictions.map((r) => (
                      <tr key={r.match_id}>
                        <td>
                          <b>{r.team}</b>
                          <div className="note">{r.date} · {r.season}</div>
                        </td>
                        <td className="r mono">{r.actual}</td>
                        <td className="r mono">{r.predicted.toFixed(1)}</td>
                        <td className="r mono t-good">{r.absoluteError.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card title="10 largest match prediction errors" sub="Largest absolute error at the latest recorded over">
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Match</th>
                      <th className="r">Actual</th>
                      <th className="r">Predicted</th>
                      <th className="r">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {worstPredictions.map((r) => (
                      <tr key={r.match_id}>
                        <td>
                          <b>{r.team}</b>
                          <div className="note">{r.date} · {r.season}</div>
                        </td>
                        <td className="r mono">{r.actual}</td>
                        <td className="r mono">{r.predicted.toFixed(1)}</td>
                        <td className="r mono t-bad">
                          {r.error > 0 ? "+" : ""}{r.error.toFixed(1)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </div>
      )}

      <div className="grid g4">
        <Kpi label="Best mean MAE" value={best[0].v.toFixed(1)} note={best[0].n} tone="good" />
        <Kpi label="Interval setting" value={iv.n_calib !== undefined ? `${iv.n_calib} × ${iv.scale}` : "–"} note="calibration seasons × width scale" />
        <Kpi label="Pre-match MAE" value={preKey ? pre[preKey].toFixed(1) : "–"} note={preKey || ""} />
        <Kpi label="Coverage target" value="80%" note="of final totals inside the range" />
      </div>
      <div className="grid g21">
        <Card title="Error by over" sub={`Mean absolute error in runs, ${scope === "hold" ? "2026 holdout" : "validation folds"}. Lower is better`}>
          <ByOver overs={tab.index} series={series} fmt={(v) => v.toFixed(1) + " runs"} />
        </Card>
        <Card title="Pre-match references" sub="What is knowable before ball 1 (MAE, runs)">
          <div className="chart h300"><ResponsiveContainer><BarChart data={Object.entries(pre).map(([k, v]) => ({ name: k.replace("league + ", "").replace(" (era-adjusted)", "").replace(" (raw shrunk avg)", ""), v }))} layout="vertical" margin={{ top: 8, right: 20, left: 10, bottom: 0 }}>
            <CartesianGrid stroke={pal.line} strokeDasharray="3 4" horizontal={false} />
            <XAxis type="number" domain={[0, "auto"]} {...axisProps(pal)} />
            <YAxis type="category" dataKey="name" width={120} {...axisProps(pal)} />
            <Tooltip content={<ChartTip fmt={(v) => v.toFixed(2)} />} cursor={{ fill: pal.line, opacity: 0.3 }} />
            <Bar dataKey="v" name="MAE" fill={pal.s1} radius={3} />
          </BarChart></ResponsiveContainer></div>
        </Card>
      </div>
      <div className="grid g2">
        <Card title="Coverage of the 80% range by over" sub="Dashed line is the 80% target">
          <div className="chart h280"><ResponsiveContainer><BarChart data={cov.map((r, i) => ({ over: "Over " + (r.over !== undefined ? r.over : i + 1), coverage: +(r.coverage * 100).toFixed(1) }))} margin={{ top: 8, right: 14, left: -6, bottom: 0 }}>
            <CartesianGrid stroke={pal.line} strokeDasharray="3 4" vertical={false} />
            <XAxis dataKey="over" {...axisProps(pal)} />
            <YAxis domain={[50, 100]} unit="%" {...axisProps(pal)} />
            <Tooltip content={<ChartTip fmt={(v) => v + "%"} />} cursor={{ fill: pal.line, opacity: 0.3 }} />
            <ReferenceLine y={80} stroke={pal.s2} strokeDasharray="5 4" />
            <Bar dataKey="coverage" name="Coverage" fill={pal.s3} radius={[3, 3, 0, 0]} />
          </BarChart></ResponsiveContainer></div>
        </Card>
        <Card title="Where the projection struggles" sub="Coverage and bias by wickets lost (validation)">
          <div className="chart h280"><ResponsiveContainer><ComposedChart data={(j.by_wickets || []).map((r) => ({ bucket: r.wk_bucket + " down", coverage: +(r.coverage * 100).toFixed(1), bias: +r.bias.toFixed(2) }))} margin={{ top: 8, right: 14, left: -6, bottom: 0 }}>
            <CartesianGrid stroke={pal.line} strokeDasharray="3 4" vertical={false} />
            <XAxis dataKey="bucket" {...axisProps(pal)} />
            <YAxis yAxisId="l" domain={[50, 100]} unit="%" {...axisProps(pal)} />
            <YAxis yAxisId="r" orientation="right" {...axisProps(pal)} />
            <Tooltip content={<ChartTip fmt={(v, p) => (p.dataKey === "coverage" ? v + "%" : f2s(v) + " runs")} />} cursor={{ fill: pal.line, opacity: 0.3 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ReferenceLine yAxisId="l" y={80} stroke={pal.s2} strokeDasharray="5 4" />
            <Bar yAxisId="l" dataKey="coverage" name="Coverage" fill={pal.s3} radius={[3, 3, 0, 0]} />
            <Line yAxisId="r" dataKey="bias" name="Bias (runs)" stroke={pal.s4} strokeWidth={2.4} dot={{ r: 4 }} />
          </ComposedChart></ResponsiveContainer></div>
          <p className="note">Positive bias means the projection ran high. After many wickets the range is too narrow and the total is over-projected.</p>
        </Card>
      </div>
      <div className="grid g2">
        <Card title="Interval settings explored" sub="Pooled validation coverage; the narrowest setting that reaches 80% was chosen">
          {grid.length ? (
            <div className="tbl-wrap"><table className="tbl par">
              <thead><tr><th>Seasons</th>{scales.map((s) => <th key={s} className="r">× {s}</th>)}</tr></thead>
              <tbody>{ns.map((n) => <tr key={n}><td className="strong">{n}</td>{scales.map((s) => { const g = grid.find((x) => x.n_calib === n && x.scale === s); const chosen = iv.n_calib === n && iv.scale === s; return <td key={s} className={"r mono " + (g && g.pooled_coverage >= 0.8 ? "cell-better" : "cell-noise") + (chosen ? " chosen" : "")} title={g ? `width ${g.avg_width.toFixed(1)}` : ""}>{g ? pct(g.pooled_coverage, 1) : "–"}</td>; })}</tr>)}</tbody>
            </table></div>
          ) : <p className="note">No interval grid in this export.</p>}
        </Card>
        <Card title="Model comparisons" sub="Gain = reference MAE − challenger MAE, runs">
          <GainMap gains={gains} digits={2} />
        </Card>
      </div>
    </div>
  );
}

/* ---------- module: Win Probability (notebook 04) ---------- */
function WinProbEvaluation({ go }) {
  const j = D.NB04;
  const [scope, setScope] = useState("val");
  const [metric, setMetric] = useState("ll");
  const [calm, setCalm] = useState(null);
  if (!j) {
    const s = D.NB04_SAMPLE;
    return (
      <div className="stack">
        <Empty title="Notebook 04 is not exported yet" go={go}>Run the last cell of <b>04_live_win_probability.ipynb</b> to write <code>nb04.json</code>, then drop it on the Connect data screen. You will see log loss, accuracy and AUC by over for every model, plus calibration on validation and on the 2026 holdout.</Empty>
        <div className="grid g4">
          <Kpi label="Champion" value="Logistic" note="full match state" />
          <Kpi label="Validation log loss" value={s.ll.toFixed(3)} note="mean over overs" tone="good" />
          <Kpi label="Validation ECE" value={s.ece.toFixed(3)} note="gradient boosting was overconfident" />
          <Kpi label="Holdout ECE" value={s.holdEce.toFixed(3)} note={`chase win rate ${Math.round(s.holdChaseWin * 100)}% in 2026`} tone="warn" />
        </div>
      </div>
    );
  }
  const hasHold = !!j.logloss_holdout;
  const sc = scope === "hold" && hasHold ? "hold" : "val";
  const ll = pivotT(sc === "hold" ? j.logloss_holdout : j.logloss_by_over);
  const acc = pivotT(sc === "hold" && j.accuracy_holdout ? j.accuracy_holdout : j.accuracy_by_over);
  const auc = j.auc_by_over ? pivotT(j.auc_by_over) : ll;
  const src = metric === "ll" ? ll : metric === "acc" ? acc : auc;
  const series = src.names.map((n) => ({ name: n, values: src.cols[n], bold: n === j.champion, dash: /Base rate/i.test(n) }));
  const calNames = Object.keys(j.calibration_validation || {});
  const calName = calm || j.champion;
  const calSrc = sc === "hold" && calName === j.champion && j.calibration_holdout ? j.calibration_holdout : (j.calibration_validation || {})[calName] || (j.calibration_validation || {})[calNames[0]];
  const gains = adaptCompare(sc === "hold" && j.compare_holdout ? j.compare_holdout : j.compare_validation, (c, r) => `${shortName(c)} vs ${shortName(r)}`);
  const champMean = colMean(ll.cols[j.champion] || []);
  const valEce = ((j.calibration_validation || {})[j.champion] || {}).ece;
  return (
    <div className="stack">
      <div className="toolbar"><SourceChip names={["nb04"]} /><Chip tone="mute">Champion: {j.champion}</Chip><span className="grow" />
        {hasHold && <Seg value={scope} onChange={setScope} label="Scope" options={[{ value: "val", label: "Validation" }, { value: "hold", label: "Holdout 2026" }]} />}</div>
      <div className="grid g4">
        <Kpi label="Champion log loss" value={isNaN(champMean) ? "–" : champMean.toFixed(3)} note={`mean over overs, ${sc === "hold" ? "holdout" : "validation"}`} tone="good" />
        <Kpi label="Validation ECE" value={valEce !== undefined ? valEce.toFixed(3) : "–"} note="calibration gap, champion" />
        <Kpi label="Holdout ECE" value={j.calibration_holdout ? j.calibration_holdout.ece.toFixed(3) : "–"} note="2026 chases" tone={j.calibration_holdout && j.calibration_holdout.ece > 0.08 ? "warn" : undefined} />
        <Kpi label="2026 chase win rate" value={j.holdout_chase_win_rate !== undefined ? pct(j.holdout_chase_win_rate) : "–"} note="share of chases won" />
      </div>
      <div className="grid g21">
        <Card title={metric === "ll" ? "Log loss by over" : metric === "acc" ? "Accuracy by over" : "AUC by over"} sub={`Chase win probability, ${sc === "hold" ? "2026 holdout" : "validation folds"}${metric === "auc" ? " (validation only)" : ""}`}
          right={<Seg value={metric} onChange={setMetric} label="Metric" options={[{ value: "ll", label: "Log loss" }, { value: "acc", label: "Accuracy" }, { value: "auc", label: "AUC" }]} />}>
          <ByOver overs={src.index} series={series} fmt={(v) => (metric === "acc" ? v.toFixed(1) + "%" : v.toFixed(3))} refY={metric === "ll" ? Math.log(2) : undefined} />
        </Card>
        <Card title="Calibration" sub={calSrc ? `Predicted vs observed chase win rate · ECE ${calSrc.ece.toFixed(3)}` : ""}
          right={<select id="wp-cal" className="sel-input" value={calName} onChange={(e) => setCalm(e.target.value)} aria-label="Model">{calNames.map((n) => <option key={n}>{n}</option>)}</select>}>
          {calSrc ? <CalChart data={calBins(calSrc.bins)} /> : <p className="note">No calibration table in this export.</p>}
        </Card>
      </div>
      <Card title="Model comparisons" sub="Gain = reference log loss − challenger log loss; each cell is a paired bootstrap verdict"><GainMap gains={gains} /></Card>
    </div>
  );
}

/* ---------- module: Model Evidence (notebook 06) ---------- */
function Evidence() {
  const pal = usePal();
  const [tab, setTab] = useState("start");
  const [scope, setScope] = useState("val");
  const [metric, setMetric] = useState("ll");
  const keys = Object.keys(D.GAINS.val);
  const [cmp, setCmp] = useState(keys[0]);
  const [calm, setCalm] = useState("conn");
  const tabs = [["start", "Start of chase"], ["fi", "First-innings win %"], ["cal", "Calibration"], ["gain", "Gains & intervals"], ["map", "Significance map"], ["time", "Whole match"]];
  const FI = D.FI;
  const lineSeries = D.MODELS.map((m) => ({ name: m.name, key: m.key, values: (metric === "acc" ? FI.acc_val : scope === "hold" ? FI.ll_hold : FI.ll_val)[m.key] || [], color: pal[m.color], bold: m.key === "conn", dash: m.key === "base" }));
  const gset = D.GAINS[scope] || {};
  const gkey = gset[cmp] ? cmp : Object.keys(gset)[0];
  const gains = (gset[gkey] || []);
  const forestRows = gains.map((g) => ({ label: String(g.over) === "ALL" ? "All overs" : "Over " + g.over, ...g }));
  const cal = calm === "conn" ? D.CAL.conn : D.CAL.direct;
  const sc = scope === "val" ? `Validation 2021–25 (${D.valN} matches)` : `Holdout 2026 (${D.holdN} matches)`;
  const dom = (rows, pad = 0.02) => [Math.min(-pad, ...rows.map((r) => r.lo)) * 1.2, Math.max(pad, ...rows.map((r) => r.hi)) * 1.2];
  const sm = D.START_MODEL;
  return (
    <div className="stack">
      <div className="toolbar">
        <div className="tabs" role="tablist">{tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>)}</div>
        <span className="grow" /><SourceChip names={["nb06"]} />
        {["fi", "gain", "map"].includes(tab) && <Seg value={scope} onChange={setScope} label="Scope" options={[{ value: "val", label: "Validation" }, { value: "hold", label: "Holdout 2026" }]} />}
      </div>

      {tab === "start" && (
        <div className="grid g2">
          <Card title="Start-of-chase model" sub={`P(chase wins | target, era, venue). Validation 2021–25, ${sm.n} matches`}>
            <div className="grid g3 tight">
              <Kpi label="Base rate" value={sm.base.toFixed(4)} note="log loss" />
              <Kpi label="Model" value={sm.model.toFixed(4)} note="log loss" tone="good" />
              <Kpi label="Gain" value={f3s(sm.gain)} note={`95% CI ${sm.lo.toFixed(3)} to ${sm.hi.toFixed(3)}`} tone="good" />
            </div>
            <p className="note">Verdict: <VerdictChip v={verdictOf(sm.lo, sm.hi)} /> ECE {sm.ece.toFixed(3)}.</p>
          </Card>
          <Card title="Calibration" sub="Five bins of predicted chase win %">
            <CalChart data={D.CAL.start} />
          </Card>
        </div>
      )}

      {tab === "fi" && (
        <Card title={metric === "ll" ? "Log loss by over, batting-first win probability" : "Accuracy by over"} sub={sc + (metric === "acc" ? " · validation only" : "")}
          right={<Seg value={metric} onChange={setMetric} label="Metric" options={[{ value: "ll", label: "Log loss" }, { value: "acc", label: "Accuracy" }]} />}>
          <ByOver overs={FI.overs} series={lineSeries} domain={metric === "ll" ? [0.5, 0.76] : [45, 72]} fmt={(v) => (metric === "ll" ? v.toFixed(3) : v.toFixed(1) + "%")} refY={metric === "ll" ? Math.log(2) : undefined} />
          {scope === "val" && metric === "ll" && FI.mean_val && <p className="note">Mean log loss over overs 1–19: {D.MODELS.map((m) => `${m.name.split(" →")[0]} ${FI.mean_val[m.key] !== undefined ? FI.mean_val[m.key].toFixed(4) : "–"}`).join(" · ")}.</p>}
          {scope === "hold" && <p className="note">{D.holdN} matches: differences between the three models are all within noise.</p>}
        </Card>
      )}

      {tab === "cal" && (
        <Card title="Reliability of the first-innings win probability" sub="Validation, pooled over overs. Dot size is the number of rows in the bin" right={<Seg value={calm} onChange={setCalm} label="Model" options={[{ value: "conn", label: `Connected (ECE ${D.CAL.ece.conn.toFixed(3)})` }, { value: "direct", label: `Direct (ECE ${D.CAL.ece.direct.toFixed(3)})` }]} />}>
          <CalChart data={cal} big />
          <p className="note">Lowest bin: predicted {pct(cal[0].pred, 1)}, observed {pct(cal[0].obs, 1)} on {cal[0].n} rows. These rows repeat the same few matches across overs, so the effective sample is smaller than it looks.</p>
        </Card>
      )}

      {tab === "gain" && (
        <Card title="Gain with 95% match-bootstrap interval" sub={sc + ". Gain = reference log loss − challenger log loss. Right of zero favours the challenger"}
          right={<select id="cmp" className="sel-input" value={gkey} onChange={(e) => setCmp(e.target.value)} aria-label="Comparison">{Object.keys(gset).map((k) => <option key={k}>{k}</option>)}</select>}>
          <Forest rows={forestRows} xdomain={dom(forestRows, 0.03)} fmt={f3s} note="Green: interval entirely above zero. Grey: the interval includes zero, which the verdict rule calls noise." />
        </Card>
      )}

      {tab === "map" && (
        <Card title="Significance map" sub={sc + ". Each cell is a gain; the colour is the verdict"} right={<CopyBtn get={() => toCsv([["comparison", "over", "gain", "lo", "hi", "verdict"], ...Object.entries(D.GAINS[scope]).flatMap(([k, v]) => v.map((g) => [k, g.over, g.gain, g.lo, g.hi, g.verdict]))])} />}>
          <GainMap gains={D.GAINS[scope]} />
        </Card>
      )}

      {tab === "time" && (
        <Card title="Whole-match timeline, 2026 holdout" sub="Gain over the base rate with 95% CI, from the first over of innings 1 to the chase" right={<CopyBtn get={() => toCsv([["stage", "n", "base", "model", "gain", "lo", "hi", "verdict"], ...D.TIMELINE.map((t) => [t.stage, t.n, t.base, t.model, t.gain, t.lo, t.hi, t.verdict])])} />}>
          <Forest rows={D.TIMELINE.map((t) => ({ label: t.stage, gain: t.gain, lo: t.lo, hi: t.hi, verdict: t.verdict }))} xdomain={[Math.min(-0.12, ...D.TIMELINE.map((t) => t.lo)), Math.max(0.65, ...D.TIMELINE.map((t) => t.hi)) + 0.03]} fmt={f3s} />
          <p className="note">Later in the chase fewer matches are still live, so the intervals widen. Gains are measured against the base rate on the same matches.</p>
        </Card>
      )}
    </div>
  );
}
function CalChart({ data, big }) {
  const pal = usePal();
  return (
    <div className={"chart " + (big ? "h340" : "h260")}><ResponsiveContainer>
      <ScatterChart margin={{ top: 8, right: 16, left: -6, bottom: 8 }}>
        <CartesianGrid stroke={pal.line} strokeDasharray="3 4" />
        <XAxis type="number" dataKey="pred" domain={[0, 1]} tickFormatter={(v) => Math.round(v * 100) + "%"} {...axisProps(pal)} name="Predicted" label={{ value: "predicted", position: "insideBottom", offset: -4, fill: pal.mute, fontSize: 11 }} height={40} />
        <YAxis type="number" dataKey="obs" domain={[0, 1]} tickFormatter={(v) => Math.round(v * 100) + "%"} {...axisProps(pal)} name="Observed" />
        <Tooltip cursor={{ strokeDasharray: "3 3" }} content={({ active, payload }) => active && payload && payload.length ? (
          <div className="tip"><div className="tip-t">{payload[0].payload.n} rows</div>
            <div className="tip-r">Predicted<b>{pct(payload[0].payload.pred, 1)}</b></div>
            <div className="tip-r">Observed<b>{pct(payload[0].payload.obs, 1)}</b></div></div>) : null} />
        <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 1, y: 1 }]} stroke={pal.mute} strokeDasharray="5 4" />
        <Scatter data={data} fill={pal.s1} line={{ stroke: pal.s1, strokeWidth: 2 }} shape={(p) => <circle cx={p.cx} cy={p.cy} r={clamp(Math.sqrt(p.payload.n) / 2.4, 4, 13)} fill={pal.s1} fillOpacity="0.8" stroke={pal.panel} strokeWidth="2" />} />
      </ScatterChart></ResponsiveContainer></div>
  );
}

/* ---------- module: Player Impact (notebook 05) ---------- */
function Players() {
  const pal = usePal();
  const [scope, setScope] = useState("val");
  const X = D.XI;
  const key = scope === "val" ? "val" : "hold";
  const rows = X.runs.map((r) => ({ label: r.task, gain: r[key][0], lo: r[key][1], hi: r[key][2], verdict: verdictOf(r[key][1], r[key][2]) }));
  const llData = X.ll.map((r) => ({ task: r.task.replace(/^C · /, ""), gain: r[key] }));
  const sc = scope === "val" ? "Validation 2021–25" : `Holdout 2026 (${D.holdN} matches)`;
  const sp = X.spread;
  const lim = Math.max(0.5, ...rows.map((r) => Math.max(Math.abs(r.lo), Math.abs(r.hi)))) * 1.15;
  return (
    <div className="stack">
      <div className="toolbar"><Chip tone="mute">Notebook 05 · matches with both XIs recorded</Chip><SourceChip names={["nb05"]} /><span className="grow" /><Seg value={scope} onChange={setScope} label="Scope" options={[{ value: "val", label: "Validation" }, { value: "hold", label: "Holdout 2026" }]} /></div>
      <div className="grid g21">
        <Card title="Run-prediction gain from the playing XI" sub={sc + ". Gain = baseline MAE − challenger MAE, in runs"}>
          <Forest rows={rows} xdomain={[-lim, lim]} unit="runs" note="Intervals that include zero are noise. One 'better' cell among about 50 tests is what a false positive looks like." />
        </Card>
        <Card title="Chase win-probability gain" sub={sc + ". Negative means the XI made it worse"}>
          <div className="chart h260"><ResponsiveContainer><BarChart data={llData} layout="vertical" margin={{ top: 8, right: 20, left: 20, bottom: 0 }}>
            <CartesianGrid stroke={pal.line} strokeDasharray="3 4" horizontal={false} />
            <XAxis type="number" domain={["auto", "auto"]} {...axisProps(pal)} tickFormatter={(v) => v.toFixed(3)} />
            <YAxis type="category" dataKey="task" width={130} {...axisProps(pal)} />
            <Tooltip content={<ChartTip fmt={(v) => f3s(v)} />} cursor={{ fill: pal.line, opacity: 0.3 }} />
            <ReferenceLine x={0} stroke={pal.text} />
            <Bar dataKey="gain" name="Log loss gain" radius={3}>{llData.map((d, i) => <Cell key={i} fill={d.gain < 0 ? pal.bad : pal.good} />)}</Bar>
          </BarChart></ResponsiveContainer></div>
        </Card>
      </div>
      <div className="grid g3">
        <Card title="Correlation with baseline miss" sub="Residual vs XI feature">
          <div className="chart h220"><ResponsiveContainer><BarChart data={X.corr} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
            <CartesianGrid stroke={pal.line} strokeDasharray="3 4" vertical={false} />
            <XAxis dataKey="name" {...axisProps(pal)} tickFormatter={(v) => v.replace("Opposition bowling: ", "Bowl ").replace("Batting XI strength", "Bat XI")} interval={0} />
            <YAxis domain={[-0.1, 0.1]} {...axisProps(pal)} />
            <ReferenceLine y={0} stroke={pal.text} />
            <Tooltip content={<ChartTip fmt={(v) => v.toFixed(3)} />} cursor={{ fill: pal.line, opacity: 0.3 }} />
            <Bar dataKey="r" name="r" radius={3}>{X.corr.map((c, i) => <Cell key={i} fill={(c.expect === "positive") === (c.r > 0) ? pal.s1 : pal.s4} />)}</Bar>
          </BarChart></ResponsiveContainer></div>
          <p className="note">Blue: the expected sign. Rose: the wrong sign (wickets should be negative). Small correlations explain under 1% of the variance.</p>
        </Card>
        <Card title="Why the XI adds so little">
          <ul className="facts">
            <li><b>Teams are close.</b> {sp ? `Batting XI strength varies by about ±${(sp.xi1_bat || 0).toFixed(1)} runs and bowling by ±${(sp.xi2_bowl_runs || 0).toFixed(1)}` : "Batting XI strength varies by about ±2.5 runs and bowling by ±2.7"}, against a typical miss near 26.</li>
            <li><b>The state already knows.</b> After 10 overs, run rate and wickets reflect how these batters are actually doing.</li>
            <li><b>Ratings are crude.</b> Career averages ignore batting position and phase, so finishers look inflated.</li>
            <li><b>Small sample.</b> {D.valN} validation matches cannot resolve a 0.1–0.2 run effect.</li>
          </ul>
        </Card>
        <Card title="Rating sanity check" sub="Batting = runs above expectation per ball, shrunk with K = 150">
          <div className="chips-l"><span className="lbl">Batting</span>{X.batters.map((n) => <Chip key={n} tone={n.includes("Harbhajan") ? "warn" : "mute"}>{n}</Chip>)}</div>
          <div className="chips-l"><span className="lbl">Tight bowling</span>{X.tight.map((n) => <Chip key={n} tone="mute">{n}</Chip>)}</div>
          <div className="chips-l"><span className="lbl">Wicket-taking</span>{X.wicket.map((n) => <Chip key={n} tone="mute">{n}</Chip>)}</div>
          <p className="note">Tail-enders and finishers bat when run rates are highest, so a rating that ignores phase partly measures role.</p>
        </Card>
      </div>
      {X.examples && X.examples.length > 0 && (
        <Card title="Recent 2026 matches" sub="Pre-match baseline vs baseline with the XI, against the actual score">
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Date</th><th>First innings</th><th className="r">Bat XI</th><th className="r">Opp. bowl runs</th><th className="r">Baseline</th><th className="r">With XI</th><th className="r">Actual</th></tr></thead>
            <tbody>{X.examples.map((r, i) => (
              <tr key={i}><td className="mono">{r.date}</td><td>{r.team1} vs {r.team2}</td><td className="r mono">{f2s(r.xi1_bat)}</td><td className="r mono">{f2s(r.xi2_bowl_runs)}</td><td className="r mono">{r.pre_match_baseline.toFixed(0)}</td><td className="r mono">{r.xi_pred.toFixed(0)}</td><td className="r mono strong">{r.final_score}</td></tr>
            ))}</tbody>
          </table></div>
        </Card>
      )}
      <Card title="Where player data could fit instead" sub="Projects where players are the target, not an extra feature">
        <div className="next-grid">
          <div className="next"><h4>Phase-adjusted ratings</h4><p>Compare each batter with others at the same over and position so finishers stop looking like superstars.</p></div>
          <div className="next"><h4>Role clustering</h4><p>Group openers, anchors, finishers and spinners from ball-by-ball behaviour.</p></div>
          <div className="next"><h4>Matchup tables</h4><p>Batter against bowler type, with shrinkage so small samples do not mislead.</p></div>
        </div>
      </Card>
    </div>
  );
}

/* ---------- module: Data Explorer (notebook 07) ---------- */
function Explorer({ go }) {
  const pal = usePal(); const cols = seriesColors(pal);
  const E = D.EXPLORER;
  const [innings, setInnings] = useState("first");
  const [metric, setMetric] = useState("runs");
  const [sort, setSort] = useState("matches");
  const [flt, setFlt] = useState(EMPTY_FLT);
  const drill = (patch) => { setFlt((f) => ({ ...f, ...patch })); setTimeout(() => { const el = document.getElementById("match-list"); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); }, 60); };
  if (!E) {
    return (
      <div className="stack">
        <Empty title="League-wide data has not been exported yet" go={go}>Run <b>07_dashboard_data_explorer.ipynb</b> (it needs no model) to write <code>explorer.json</code>. This screen then shows season trends, venues, the score distribution, runs and wickets by over for each era, a season-by-over heat map and team records, all from your 1,243 YAML files.</Empty>
        <MatchList flt={flt} setFlt={setFlt} go={go} />
      </div>
    );
  }
  const seasons = E.seasons;
  const eras = Object.keys(E.over_profile);
  const prof = eras.map((e) => E.over_profile[e][innings]);
  const overData = Array.from({ length: 20 }, (_, k) => Object.fromEntries([["over", k + 1], ...eras.map((e, i) => [e, prof[i][metric][k]])]));
  const venues = [...E.venues].sort((a, b) => (sort === "name" ? a.venue.localeCompare(b.venue) : b[sort] - a[sort]));
  const allHeat = E.season_over_heat.flatMap((r) => r.runs_by_over);
  const heatMax = Math.max(...allHeat), heatMin = Math.min(...allHeat);
  const heatCol = (v) => `color-mix(in srgb, var(--s1) ${Math.round(((v - heatMin) / (heatMax - heatMin || 1)) * 80)}%, var(--panel))`;
  const teams = [...E.teams].sort((a, b) => b.matches - a.matches);
  return (
    <div className="stack">
      <div className="toolbar"><SourceChip names={["explorer"]} /><Chip tone="mute">{D.matches.toLocaleString()} usable matches</Chip></div>
      <div className="grid g2">
        <Card title="Average score by season" sub="First and second innings totals, and the share of chases won">
          <div className="chart h280"><ResponsiveContainer><ComposedChart data={seasons} margin={{ top: 8, right: 8, left: -6, bottom: 0 }} onClick={(e) => { if (e && e.activeLabel) drill({ season: Number(e.activeLabel) }); }} style={{ cursor: "pointer" }}>
            <CartesianGrid stroke={pal.line} strokeDasharray="3 4" vertical={false} />
            <XAxis dataKey="season" {...axisProps(pal)} />
            <YAxis yAxisId="l" domain={[120, "auto"]} {...axisProps(pal)} />
            <YAxis yAxisId="r" orientation="right" domain={[0.3, 0.7]} tickFormatter={(v) => Math.round(v * 100) + "%"} {...axisProps(pal)} />
            <Tooltip content={<ChartTip fmt={(v, p) => (p.dataKey === "chase_win" ? pct(v) : v.toFixed(1))} />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line yAxisId="l" dataKey="avg_first" name="Avg 1st innings" stroke={pal.s1} strokeWidth={2.6} dot={{ r: 3 }} />
            <Line yAxisId="l" dataKey="avg_second" name="Avg 2nd innings" stroke={pal.s2} strokeWidth={2.2} dot={{ r: 3 }} />
            <Line yAxisId="r" dataKey="chase_win" name="Chase win %" stroke={pal.s3} strokeDasharray="5 4" strokeWidth={2} dot={false} />
          </ComposedChart></ResponsiveContainer></div>
        </Card>
        <Card title="First-innings totals" sub="How often each score band occurs">
          <div className="chart h280"><ResponsiveContainer><BarChart data={E.score_hist.map((b) => ({ band: b.from + "s", matches: b.matches }))} margin={{ top: 8, right: 8, left: -6, bottom: 0 }}>
            <CartesianGrid stroke={pal.line} strokeDasharray="3 4" vertical={false} />
            <XAxis dataKey="band" {...axisProps(pal)} interval={1} />
            <YAxis {...axisProps(pal)} />
            <Tooltip content={<ChartTip fmt={(v) => v + " matches"} />} cursor={{ fill: pal.line, opacity: 0.3 }} />
            <Bar dataKey="matches" name="Matches" fill={pal.s1} radius={[3, 3, 0, 0]} />
          </BarChart></ResponsiveContainer></div>
        </Card>
      </div>
      <Card title="Runs and wickets by over" sub="Average per over in each era" right={<><Seg value={innings} onChange={setInnings} label="Innings" options={[{ value: "first", label: "1st innings" }, { value: "second", label: "Chase" }]} /><Seg value={metric} onChange={setMetric} label="Metric" options={[{ value: "runs", label: "Runs" }, { value: "wickets", label: "Wickets" }]} /></>}>
        <div className="chart h300"><ResponsiveContainer><LineChart data={overData} margin={{ top: 8, right: 14, left: -6, bottom: 0 }}>
          <CartesianGrid stroke={pal.line} strokeDasharray="3 4" vertical={false} />
          <XAxis dataKey="over" type="number" domain={[1, 20]} ticks={[1, 4, 7, 10, 13, 16, 20]} {...axisProps(pal)} />
          <YAxis domain={["auto", "auto"]} {...axisProps(pal)} />
          <Tooltip content={<ChartTip fmt={(v) => v.toFixed(2)} labelFmt={(l) => "Over " + l} />} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {eras.map((e, i) => <Line key={e} dataKey={e} name={e} stroke={cols[i % cols.length]} strokeWidth={i === eras.length - 1 ? 3 : 2} dot={false} />)}
        </LineChart></ResponsiveContainer></div>
      </Card>
      <Card title="Season × over heat map" sub="Average runs per over in the first innings. Darker means more runs">
        <div className="tbl-wrap"><table className="tbl heatmap">
          <thead><tr><th>Season</th>{Array.from({ length: 20 }, (_, k) => <th key={k} className="r">{k + 1}</th>)}</tr></thead>
          <tbody>{E.season_over_heat.map((r) => <tr key={r.season}><td className="strong mono">{r.season}</td>{r.runs_by_over.map((v, k) => <td key={k} className="r mono hm" style={{ background: heatCol(v) }} title={v.toFixed(2) + " runs"}>{v.toFixed(1)}</td>)}</tr>)}</tbody>
        </table></div>
      </Card>
      <div className="grid g2">
        <Card title="Venues" sub="Top venues by matches. Venue effect = shrunk average excess over the era" right={<select id="ve-sort" className="sel-input" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort venues"><option value="matches">Most matches</option><option value="avg_first">Highest avg score</option><option value="venue_effect">Biggest venue effect</option><option value="chase_win">Chase win %</option><option value="name">Name</option></select>}>
          <div className="tbl-wrap tall"><table className="tbl">
            <thead><tr><th>Venue</th><th className="r">Matches</th><th className="r">Avg 1st</th><th className="r">Effect</th><th className="r">Chase %</th></tr></thead>
            <tbody>{venues.map((v) => <tr key={v.venue} className="click" title="Show this venue's matches" onClick={() => drill({ venue: v.venue })}><td>{v.venue}</td><td className="r mono">{v.matches}</td><td className="r mono">{v.avg_first.toFixed(0)}</td><td className={"r mono " + (v.venue_effect >= 0 ? "t-good" : "t-bad")}>{f2s(v.venue_effect)}</td><td className="r mono">{pct(v.chase_win)}</td></tr>)}</tbody>
          </table></div>
        </Card>
        <Card title="Teams" sub="Record when batting first and when chasing">
          <div className="tbl-wrap tall"><table className="tbl">
            <thead><tr><th>Team</th><th className="r">Played</th><th className="r">Win %</th><th className="r">Bat 1st</th><th className="r">Chasing</th></tr></thead>
            <tbody>{teams.map((t) => <tr key={t.team} className="click" title="Show this team's matches" onClick={() => drill({ team: canonTeam(t.team) })}><td>{t.team}</td><td className="r mono">{t.matches}</td><td className="r mono strong">{pct(t.wins / t.matches)}</td><td className="r mono">{t.bat_first ? pct(t.bat_first_wins / t.bat_first) : "–"}</td><td className="r mono">{t.chasing ? pct(t.chasing_wins / t.chasing) : "–"}</td></tr>)}</tbody>
          </table></div>
        </Card>
      </div>
      <Card title="Highest first-innings totals">
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>Date</th><th>Match</th><th>Venue</th><th className="r">Score</th><th className="r">Reply</th></tr></thead>
          <tbody>{E.top_scores.map((r, i) => <tr key={i}><td className="mono">{r.date}</td><td>{r.team1} vs {r.team2}</td><td>{r.venue}</td><td className="r mono strong">{r.final_score}</td><td className="r mono">{r.second_total}</td></tr>)}</tbody>
        </table></div>
      </Card>
      <MatchList flt={flt} setFlt={setFlt} go={go} />
    </div>
  );
}

/* ---------- module: Model cards ---------- */
function Models() {
  const tone = { settled: "good", done: "good", null: "mute" };
  return (
    <div className="stack">
      <div className="mc-grid">
        {D.NOTEBOOKS.map((n) => (
          <Card key={n.id} className="nb">
            <div className="nb-h"><span className="nb-id">{n.id}</span><Chip tone={tone[n.status]}>{n.tag}</Chip></div>
            <h3>{n.title}</h3>
            <p>{n.what}</p>
            <dl>
              <dt>Headline</dt><dd>{n.metric}</dd>
              <dt>Known limit</dt><dd>{n.limits}</dd>
            </dl>
          </Card>
        ))}
        <Card className="nb">
          <div className="nb-h"><span className="nb-id">07</span><Chip tone="good">Export</Chip></div>
          <h3>Data explorer export</h3>
          <p>Reuses the parsing from notebooks 01–02 and writes league-wide facts for the Data Explorer. No model.</p>
          <dl><dt>Headline</dt><dd>Seasons, venues, teams, scoring by over</dd></dl>
        </Card>
      </div>
      <Card title="Models in play" sub="What each one does and when to use it">
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>Model</th><th>Predicts</th><th>Used for</th><th>Status</th></tr></thead>
          <tbody>
            <tr><td className="strong">Ridge (overs 1–18)</td><td>Remaining runs</td><td>Live projected total</td><td><Chip tone="good">Champion</Chip></td></tr>
            <tr><td className="strong">Par table (over 19)</td><td>Remaining runs</td><td>Last-over projection</td><td><Chip tone="good">Champion</Chip></td></tr>
            <tr><td className="strong">CalibratedRange</td><td>80% interval</td><td>Range around the projection</td><td><Chip tone="good">2 seasons × 1.05</Chip></td></tr>
            <tr><td className="strong">Logistic (full state)</td><td>Chase win %</td><td>Live chase probability</td><td><Chip tone="good">Champion</Chip></td></tr>
            <tr><td className="strong">Gradient boosting</td><td>Chase win %</td><td>Comparison</td><td><Chip tone="warn">Overconfident</Chip></td></tr>
            <tr><td className="strong">Start-of-chase</td><td>Chase win % at the break</td><td>Pre-chase probability, par anchor</td><td><Chip tone="good">Gain {f3s(D.START_MODEL.gain)}</Chip></td></tr>
            <tr><td className="strong">Score distribution → win %</td><td>Batting-first win %</td><td>First-innings win %, scenarios</td><td><Chip tone="mute">Equal to direct</Chip></td></tr>
            <tr><td className="strong">Playing-XI ridge / logistic</td><td>Runs, chase win %</td><td>Player-feature test</td><td><Chip tone="mute">Not adopted</Chip></td></tr>
          </tbody>
        </table></div>
      </Card>
    </div>
  );
}

/* ---------- module: Data & Method ---------- */
function Method() {
  const pal = usePal();
  const seasons = []; for (let y = D.seasons[0]; y <= D.seasons[1]; y++) seasons.push(y);
  const role = (y) => (y === 2026 ? "hold" : y >= 2021 ? "val" : "train");
  const gloss = [
    ["Log loss", "Penalises confident wrong answers. 0.693 is a 50/50 coin; lower is better."],
    ["ECE", "Expected calibration error: the average gap between predicted and observed win rates across bins."],
    ["Gain", "Reference error minus challenger error. Positive favours the challenger."],
    ["Verdict rule", "If the 95% paired match-bootstrap interval includes zero, the difference is called noise."],
    ["Par score", "Smallest runs on the board for a 50% chase at that stage, assuming steady pace. Not Duckworth-Lewis."],
    ["Leak-safe", "Every feature uses only matches on strictly earlier dates; same-day matches never see each other."],
  ];
  return (
    <div className="stack">
      <Card title="Evaluation design" sub="Rolling-origin season folds, then one look at 2026">
        <div className="seasons" style={{ gridTemplateColumns: `repeat(${seasons.length}, minmax(0, 1fr))` }}>
          {seasons.map((y) => <div key={y} className={"season s-" + role(y)}><b>{y}</b></div>)}
        </div>
        <div className="legend"><span><i className="sw sw-train" />training history</span><span><i className="sw sw-val" />validation fold (2021–25)</span><span><i className="sw sw-hold" />holdout, evaluated once (2026)</span></div>
        <p className="note">Notebooks 03 and 04 used an earlier 2025–26 holdout that informed decisions. From notebook 05 on, folds are 2021–25 and 2026 stays untouched until the end.</p>
      </Card>
      <div className="grid g2">
        <Card title="Leak safety" sub="Why the numbers can be trusted">
          <ul className="facts">
            <li><b>Strictly earlier dates.</b> Context features (league average, venue effect, chase rate) never include the match being predicted.</li>
            <li><b>Date-by-date player history.</b> Ratings for a day's matches are built before that day's results are added.</li>
            <li><b>Legal balls only.</b> Wides and no-balls do not count as balls faced.</li>
            <li><b>Selection on validation.</b> Interval scale and model choices were fixed on validation, never on the holdout.</li>
          </ul>
        </Card>
        <Card title="Match filters" sub={`${(D.files - D.matches).toLocaleString()} of ${D.files.toLocaleString()} matches removed`}>
          <div className="funnel">
            {D.FUNNEL.slice(1).map((f) => (
              <div key={f.name} className="fun-row"><div className="fun-n"><span>{f.name}</span><b>{f.value}</b></div>
                <div className="fun-bar"><i style={{ width: (f.value / Math.max(...D.FUNNEL.slice(1).map((x) => x.value))) * 100 + "%", background: pal.warn }} /></div></div>
            ))}
          </div>
        </Card>
      </div>
      <Card title="Glossary">
        <dl className="gloss">{gloss.map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd>{v}</dd></React.Fragment>)}</dl>
      </Card>
    </div>
  );
}

/* ---------- module: Connect data ---------- */
function DataSources({ status, reloadServer }) {
  const [drag, setDrag] = useState(false);
  const [log, setLog] = useState([]);
  const inputRef = useRef(null);
  const take = async (files) => { const r = await ingestFiles(files); setLog(r); };
  return (
    <div className="stack">
      <Card title="Add your notebook exports" sub="Drop the JSON files your notebooks wrote. They are kept in this browser, so you do not have to drop them again.">
        <div className={"drop" + (drag ? " on" : "")} onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); take(e.dataTransfer.files); }}>
          <p><b>Drop nb03, nb04, nb05, nb06, explorer, matches and predictions (.json) here</b></p>
          <p className="sub">or</p>
          <input ref={inputRef} id="file-in" type="file" accept=".json,application/json" multiple hidden onChange={(e) => take(e.target.files)} />
          <button className="btn" onClick={() => inputRef.current && inputRef.current.click()}>Choose files</button>
        </div>
        {log.length > 0 && <ul className="loglist">{log.map((l, i) => <li key={i} className={l.ok ? "ok" : "bad"}>{l.file}: {l.ok ? "loaded as " + l.name : l.msg}</li>)}</ul>}
      </Card>
      <Card title="What is loaded" right={<><button className="btn ghost sm" onClick={reloadServer}>Re-read data folder</button><button className="btn ghost sm" onClick={() => resetData()}>Reset to sample numbers</button></>}>
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>File</th><th>Feeds</th><th>Status</th><th>Exported</th><th className="r">Records</th><th>Seasons</th><th>Schema</th></tr></thead>
          <tbody>{FILES.map((f) => { const l = D.live[f.name]; const ck = D.checks && D.checks[f.name]; return (
            <tr key={f.name}><td className="mono">{f.name}.json</td><td>{f.feeds}</td><td>{l ? <Chip tone="good">Loaded</Chip> : <Chip tone="warn">Not loaded</Chip>}</td><td className="mono">{l && l.generated ? l.generated.replace("T", " ") : "–"}</td><td className="r mono">{ck && ck.records != null ? ck.records.toLocaleString() : l && l.matches ? l.matches.toLocaleString() : "–"}</td><td className="mono">{ck && ck.seasons ? ck.seasons : l && l.first ? `${l.first}–${l.last}` : "–"}</td>
              <td>{ck ? (ck.status === "ok" ? <Chip tone="good">Compatible</Chip> : <Chip tone="bad" >Missing {ck.missing.join(", ")}</Chip>) : "–"}{ck && ck.notes.length > 0 && <div className="note">{ck.notes.join(" · ")}</div>}</td></tr>
          ); })}</tbody>
        </table></div>
        <p className="note">{status}</p>
        <p className="note">These are static JSON exports written by your notebooks. Nothing here is a live cricket feed.</p>
      </Card>
      <Card title="How to produce the files" sub="One cell at the end of each notebook">
        <ol className="facts steps">
          <li>Open notebooks 03, 04, 05 and 06 in the order you ran them and run the new last cell, <b>Export for the dashboard</b>. If the notebook is still open with its results in memory, only that cell needs to run.</li>
          <li>Run <b>07_dashboard_data_explorer.ipynb</b> and <b>08_match_index_export.ipynb</b> top to bottom. They need no model and write <code>explorer.json</code> and <code>matches.json</code>.</li>
          <li>After Run All in notebooks 03, 04 and 06, paste the per-match cell as a new last cell and run it. Each writes its own section of <code>predictions.json</code>.</li>
          <li>The files land in <code>cricket-analytics-lab/dashboard/public/data/</code>. With the local dashboard running, press <b>Re-read data folder</b>. In this hosted page, drop the files above instead.</li>
        </ol>
      </Card>
    </div>
  );
}

/* ---------- shell ---------- */
const MODULES = [
  { id: "overview", label: "Overview", icon: "M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z", c: Overview, title: "Overview", sub: "The notebooks, one whole-match picture" },
  { id: "match-centre", label: "Match Centre", icon: "M4 19V9m5 10V5m5 14v-7m5 7V8", c: MatchCentre, title: "Match Centre", sub: "Real matches with model output, or a hypothetical match state" },
  { id: "par-lab", label: "Par Lab", icon: "M3 17l6-6 4 4 8-9M3 21h18", c: ParLab, title: "Par Lab", sub: "What a chase needs on the board, for any target or any real chase" },
  { id: "replays", label: "Replays", icon: "M8 5v14l11-7z", c: Replays, title: "Replays", sub: "Replay any historical match over by over" },
  { id: "score", label: "Score Engine", icon: "M4 20V10m6 10V4m6 16v-8m5 8H3", c: ScoreEngine, title: "Score Engine", sub: "Notebook 03: live first-innings projection and range" },
  { id: "winprob", label: "Win Probability", icon: "M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0zm9-5v5l3 2", c: WinProb, title: "Win Probability", sub: "Notebook 04: the live chase model, in one match and across all" },
  { id: "evidence", label: "Model Evidence", icon: "M5 3v18h16M9 15l3-4 3 3 4-6", c: Evidence, title: "Model Evidence", sub: "Notebook 06 results with intervals" },
  { id: "players", label: "Player Impact", icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-8 9a8 8 0 0 1 16 0", c: Players, title: "Player Impact", sub: "Notebook 05: do playing XIs add signal?" },
  { id: "explorer", label: "Data Explorer", icon: "M4 6h16M4 12h16M4 18h10", c: Explorer, title: "Data Explorer", sub: "Seasons, venues, teams and scoring by over" },
  { id: "models", label: "Model Cards", icon: "M4 5h16v14H4zM4 10h16M9 10v9", c: Models, title: "Model Cards", sub: "What each notebook built and where it stops" },
  { id: "method", label: "Data & Method", icon: "M12 3v18M3 12h18M6 6l12 12", c: Method, title: "Data & Method", sub: "How the evaluation is set up" },
  { id: "data", label: "Connect data", icon: "M12 3v12m0 0l-4-4m4 4l4-4M4 17v3h16v-3", c: DataSources, title: "Connect data", sub: "Load your notebook exports" },
];
function Icon({ d }) { return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>; }

function Palette({ open, setOpen, go, setTheme }) {
  const [q, setQ] = useState(""); const [idx, setIdx] = useState(0);
  const inputRef = useRef(null);
  const items = [
    ...MODULES.map((m) => ({ label: "Go to " + m.label, run: () => go(m.id) })),
    { label: "Theme: light", run: () => setTheme("light") }, { label: "Theme: dark", run: () => setTheme("dark") }, { label: "Theme: match system", run: () => setTheme("system") },
    ...D.LIVE_DEMOS.map((d) => ({ label: "Load: " + d.name, run: () => { go("match-centre"); setTimeout(() => { window.__tab_mc && window.__tab_mc("sim"); setTimeout(() => window.__loadDemo && window.__loadDemo(d), 80); }, 50); } })),
  ].filter((i) => i.label.toLowerCase().includes(q.toLowerCase()));
  useEffect(() => { if (open) { setQ(""); setIdx(0); setTimeout(() => inputRef.current && inputRef.current.focus(), 20); } }, [open]);
  if (!open) return null;
  const run = (i) => { if (i) { i.run(); setOpen(false); } };
  return (
    <div className="pal-back" onMouseDown={() => setOpen(false)}>
      <div className="pal" role="dialog" aria-label="Command palette" onMouseDown={(e) => e.stopPropagation()}>
        <input ref={inputRef} id="pal-q" placeholder="Jump to a module or load a match state" value={q} onChange={(e) => { setQ(e.target.value); setIdx(0); }}
          onKeyDown={(e) => { if (e.key === "ArrowDown") { e.preventDefault(); setIdx(Math.min(items.length - 1, idx + 1)); } else if (e.key === "ArrowUp") { e.preventDefault(); setIdx(Math.max(0, idx - 1)); } else if (e.key === "Enter") run(items[idx]); else if (e.key === "Escape") setOpen(false); }} />
        <ul>{items.map((it, k) => <li key={it.label} className={k === idx ? "on" : ""} onMouseEnter={() => setIdx(k)} onClick={() => run(it)}>{it.label}</li>)}{items.length === 0 && <li className="none">No match</li>}</ul>
      </div>
    </div>
  );
}

function App() {
  const pal = usePalette();
  const getHash = () => { const h = (location.hash || "").replace("#", ""); return MODULES.some((m) => m.id === h) ? h : "overview"; };
  const [mod, setMod] = useState(getHash());
  const [theme, setThemeState] = useState(store.get("cal-theme", "system"));
  const [palOpen, setPalOpen] = useState(false);
  const [, force] = useState(0);
  const [status, setStatus] = useState("");
  const go = useCallback((id) => { setMod(id); try { history.replaceState(null, "", "#" + id); } catch (e) { location.hash = id; } window.scrollTo(0, 0); }, []);
  useEffect(() => { const f = () => setMod(getHash()); window.addEventListener("hashchange", f); return () => window.removeEventListener("hashchange", f); }, []);
  useEffect(() => { const f = () => force((x) => x + 1); listeners.add(f); return () => listeners.delete(f); }, []);
  const reloadServer = useCallback(async () => {
    const got = await loadFromServer();
    setStatus(got.length ? `Read ${got.length} file${got.length > 1 ? "s" : ""} from the data folder: ${got.join(", ")}.` : "No files found in the data folder. Run the export cells, or drop the files on this screen.");
  }, []);
  useEffect(() => { (async () => { await loadFromBrowserStore(); await reloadServer(); })(); }, []);
  const setTheme = (t) => { setThemeState(t); store.set("cal-theme", t); };
  useEffect(() => { const r = document.documentElement; if (theme === "system") r.removeAttribute("data-theme"); else r.setAttribute("data-theme", theme); }, [theme]);
  useEffect(() => {
    const f = (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalOpen((o) => !o); } };
    window.addEventListener("keydown", f); return () => window.removeEventListener("keydown", f);
  }, []);
  const M = MODULES.find((m) => m.id === mod) || MODULES[0];
  const Cmp = M.c;
  const nextTheme = theme === "system" ? "light" : theme === "light" ? "dark" : "system";
  const nLive = Object.keys(D.live).length;
  return (
    <PalCtx.Provider value={pal}>
      <div className="app">
        <aside className="side">
          <div className="brand"><span className="logo" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M5.5 8.5c3 1.5 3 6.5 0 8M18.5 8.5c-3 1.5-3 6.5 0 8" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg></span>
            <div><b>Cricket Analytics Lab</b><small>IPL {D.seasons[0]}–{D.seasons[1]}</small></div></div>
          <nav aria-label="Modules">{MODULES.map((m) => <a key={m.id} href={"#" + m.id} className={m.id === mod ? "on" : ""} onClick={(e) => { e.preventDefault(); go(m.id); }}><Icon d={m.icon} />{m.label}</a>)}</nav>
          <div className="side-f">
            <button className="btn ghost sm full" onClick={() => setPalOpen(true)}>Search <kbd>Ctrl K</kbd></button>
            <button className="btn ghost sm full" onClick={() => setTheme(nextTheme)}>Theme: {theme}</button>
          </div>
        </aside>
        <main className="main">
          <header className="top">
            <div><h1>{M.title}</h1><p>{M.sub}</p></div>
            <div className="top-r">
              <button className="chip-btn" onClick={() => go("data")} title="Connect data">{nLive ? <Chip tone="good">{nLive} of {FILES.length} exports loaded</Chip> : <Chip tone="warn">Sample numbers</Chip>}</button>
              <Chip tone="mute">Holdout 2026 · {D.holdN} matches</Chip>
              <button className="btn ghost sm top-search" onClick={() => setPalOpen(true)}>Search</button></div>
          </header>
          <div className="content"><Cmp go={go} status={status} reloadServer={reloadServer} /></div>
          <footer className="foot">{nLive ? "Showing results exported from your notebooks." : "Showing numbers copied from your notebook 05 and 06 printouts. Connect your exports for the full data."}</footer>
        </main>
        <Palette open={palOpen} setOpen={setPalOpen} go={go} setTheme={setTheme} />
      </div>
    </PalCtx.Provider>
  );
}
ReactDOM.createRoot(document.getElementById("root")).render(<SelectionProvider><App /></SelectionProvider>);
