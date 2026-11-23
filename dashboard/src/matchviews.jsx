import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, BarChart, Bar, Cell, ComposedChart, Area,
} from "recharts";
import { D, pivotT, colMean } from "./lib.js";
import { MD, deriveMatch, turningPoints, aggregate, resultText, splitOf, SPLIT_LABEL, teamCode } from "./matchdata.js";
import { useSelection } from "./selection.jsx";
import { Chip, Seg, Card, Kpi, ChartTip, Empty, axisProps, usePal, Gauge, CopyBtn, toCsv, f2s, pct } from "./ui.jsx";

const pc = (v, d = 0) => (v === null || v === undefined || Number.isNaN(v) ? "–" : (v * 100).toFixed(d) + "%");
const num = (v, d = 0) => (v === null || v === undefined || Number.isNaN(v) ? "–" : Number(v).toFixed(d));
const sgn = (v, d = 0) => (v === null || v === undefined ? "–" : (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toFixed(d));
const score = (r, w) => (r === null || r === undefined ? "–" : `${r}/${w ?? "?"}`);

/* ---------- shared pieces ---------- */
function useMatch() {
  const s = useSelection();
  const d = s && s.ready && s.matchId ? deriveMatch(s.matchId) : null;
  return { s, d };
}
function NeedMatches({ s, go }) {
  if (s && s.ready && s.match) return null;
  return <Empty title="No historical matches loaded" go={go}>Run <b>08_match_index_export.ipynb</b> to write <code>matches.json</code>, then press Re-read data folder on Connect data. Season and match selection, match scorecards and replays all read that file.</Empty>;
}
function SplitNote({ d }) {
  if (!d) return null;
  const sp = d.split;
  if (!MD.loaded.predictions) return <p className="note">predictions.json is not loaded, so only actual match data is shown. Run the paste cells at the end of notebooks 03, 04 and 06.</p>;
  if (!sp) return <p className="note">This match has no out-of-sample model prediction. Out-of-sample predictions exist for validation seasons 2021–25 and the 2026 holdout only; nothing is estimated for other matches.</p>;
  return <p className="note"><b>{SPLIT_LABEL[sp]}.</b> {sp === "train" ? "Par comes from the final model, which was fitted on this match, so treat it as a reference curve, not a test." : "These predictions were made without seeing this match."}</p>;
}
const innOf = (d, n) => (n === 1 ? d.inn1 : d.inn2);
const liveRows = (rows) => (rows ? rows.filter((r) => r.live) : []);

function MatchBanner({ d }) {
  const m = d.m;
  const teamFirst = m.first || m.team1, teamSecond = m.chaser || m.team2;
  return (
    <Card className="score-card">
      <div className="mbanner">
        <div className="mb-team"><div className="sb-team">{teamFirst} · batted first</div><div className="sb-score">{m.first_runs ?? "–"}<span>/{m.first_wkts ?? "–"}</span></div></div>
        <div className="mb-vs">v</div>
        <div className="mb-team"><div className="sb-team">{teamSecond} · chased {d.target ?? "–"}</div><div className="sb-score">{m.second_runs ?? "–"}<span>/{m.second_wkts ?? "–"}</span></div></div>
      </div>
      <p className="mb-res"><b>{resultText(m)}</b></p>
      <div className="mb-meta">
        <Chip tone="mute">{m.date}</Chip><Chip tone="mute">IPL {m.season}{m.stage && m.stage !== "League" ? " · " + m.stage : ""}</Chip>
        {m.venue && <Chip tone="mute">{m.venue}{m.city ? ", " + m.city : ""}</Chip>}
        {m.toss_winner && <Chip tone="mute">{m.toss_winner} won the toss and chose to {m.toss_decision}</Chip>}
        {m.player_of_match && <Chip tone="mute">Player of the match: {m.player_of_match}</Chip>}
        {!m.usable && <Chip tone="warn">Excluded from models: {String(m.status).replace(/_/g, " ")}</Chip>}
      </div>
    </Card>
  );
}

function ChartNote({ children }) { return <p className="note">{children}</p>; }

/* probability axis for the whole match: batting-first side, 1st innings then chase */
const tickX = (v) => (v <= 19 ? "1st " + v : v === 20 ? "Start" : "C " + (v - 20));
function WinTimeline({ d, marker }) {
  const pal = usePal();
  if (!d.timeline.length) return <p className="note">No out-of-sample win probabilities exist for this match.</p>;
  const data = d.timeline.map((t) => ({ x: t.x, p: +(t.p * 100).toFixed(1) }));
  const first = d.m.first || d.m.team1;
  return (
    <div className="chart h280"><ResponsiveContainer><ComposedChart data={data} margin={{ top: 8, right: 14, left: -6, bottom: 0 }}>
      <CartesianGrid stroke={pal.line} strokeDasharray="3 4" vertical={false} />
      <XAxis dataKey="x" type="number" domain={[1, 39]} ticks={[1, 5, 10, 15, 19, 20, 25, 30, 35, 39]} tickFormatter={tickX} {...axisProps(pal)} />
      <YAxis domain={[0, 100]} unit="%" {...axisProps(pal)} />
      <Tooltip content={<ChartTip fmt={(v) => v + "%"} labelFmt={(l) => (l <= 19 ? "1st innings, over " + l : l === 20 ? "Start of chase" : "Chase, over " + (l - 20))} />} />
      <ReferenceLine y={50} stroke={pal.mute} strokeDasharray="4 4" />
      <ReferenceLine x={19.5} stroke={pal.line} />
      {marker !== undefined && <ReferenceLine x={marker} stroke={pal.s2} strokeWidth={2} />}
      <Area type="linear" dataKey="p" name={first + " win %"} stroke={pal.s1} fill={pal.s1} fillOpacity={0.14} strokeWidth={2.6} dot={false} connectNulls />
    </ComposedChart></ResponsiveContainer></div>
  );
}

function TurningPoints({ d, onPick }) {
  const tp = turningPoints(d, 4); const first = d.m.first || d.m.team1;
  if (!tp.length) return <p className="note">Turning points need out-of-sample probabilities, which this match does not have.</p>;
  return (
    <div className="tbl-wrap"><table className="tbl">
      <thead><tr><th>When</th><th className="r">{teamCode(first)} win %</th><th className="r">Move</th><th>What happened in that over</th></tr></thead>
      <tbody>{tp.map((t, i) => (
        <tr key={i} className={onPick ? "click" : ""} onClick={() => onPick && onPick(t)}>
          <td>{t.inn === 1 ? "1st innings" : "Chase"}, {t.over === 0 ? "start" : "over " + t.over}</td>
          <td className="r mono">{Math.round(t.from * 100)} → {Math.round(t.to * 100)}</td>
          <td className={"r mono strong " + (t.delta >= 0 ? "t-good" : "t-bad")}>{sgn(t.delta * 100, 0)} pts</td>
          <td>{t.runs === null ? "–" : `${t.runs} runs, ${t.wkts} wicket${t.wkts === 1 ? "" : "s"}, ${t.bnd} boundar${t.bnd === 1 ? "y" : "ies"}`}</td>
        </tr>))}</tbody>
    </table></div>
  );
}

/* ================= MATCH CENTRE: historical view ================= */
function HistoricalMatchCentre({ go }) {
  const { s, d } = useMatch(); const pal = usePal();
  if (!s || !s.ready || !d) return <NeedMatches s={s} go={go} />;
  const both = Array.from({ length: 21 }, (_, o) => {
    const a = d.inn1 && d.inn1[o], b = d.inn2 && d.inn2[o];
    return { over: o, r1: a && a.live ? a.runs : null, r2: b && b.live ? b.runs : null, w1: a && a.live ? a.wkts : null, w2: b && b.live ? b.wkts : null };
  });
  const inn = innOf(d, s.innings); const cur = inn ? inn[Math.min(s.over, 20)] : null;
  const perOver = inn ? inn.slice(1).map((r) => ({ over: r.over, runs: r.ovRuns, crr: r.crr === null ? null : +r.crr.toFixed(2), rrr: r.rrr === null || r.rrr === undefined ? null : +r.rrr.toFixed(2) })) : [];
  const teamNow = s.innings === 1 ? (d.m.first || d.m.team1) : (d.m.chaser || d.m.team2);
  const pNow = s.innings === 2 && cur ? cur.pChase : cur ? cur.pFirst : null;
  const parRows = d.inn2 ? d.inn2.filter((r) => r.live && r.par !== null && r.par !== undefined).map((r) => ({ over: r.over, runs: r.runs, par: r.par })) : [];
  return (
    <div className="stack">
      <MatchBanner d={d} />
      <Card title={`${teamNow} after over ${s.over}`} sub="Selected over (change it in the bar above). Actual match data next to model output where the model has one." right={<Chip tone="mute">{s.innings === 1 ? "1st innings" : "Chase"}</Chip>}>
        {cur && cur.live ? (
          <div className="grid g4">
            <Kpi label="Score" value={score(cur.runs, cur.wkts)} note={`${cur.ovRuns} runs, ${cur.ovWkts} wkt${cur.ovWkts === 1 ? "" : "s"} in over ${cur.over}`} />
            <Kpi label="Run rate" value={num(cur.crr, 2)} note={s.innings === 2 && cur.rrr != null ? `required ${num(cur.rrr, 2)}` : "runs per over so far"} />
            {s.innings === 1
              ? <Kpi label="Projected total" value={cur.pred != null ? num(cur.pred, 0) : "–"} note={cur.pred != null ? `80% range ${num(cur.lo)}–${num(cur.hi)} · final ${d.m.first_runs}` : "no out-of-sample projection"} />
              : <Kpi label="Par score" value={cur.par != null ? num(cur.par) : "–"} note={cur.par != null ? `${sgn(cur.runs - cur.par)} vs par` : "no par for this match"} tone={cur.par != null ? (cur.runs >= cur.par ? "good" : "warn") : undefined} />}
            <Kpi label={s.innings === 1 ? "Batting side wins" : "Chasing side wins"} value={pc(pNow)} note={pNow == null ? "no out-of-sample probability" : "model estimate at this over"} />
          </div>
        ) : <p className="note">{teamNow} was already {s.innings === 2 && d.m.chase_won === 1 ? "home" : "out"} by over {s.over}. Choose an earlier over.</p>}
        <SplitNote d={d} />
      </Card>
      <div className="grid g2">
        <Card title="Score progression" sub="Cumulative runs after each over, both innings">
          <div className="chart h280"><ResponsiveContainer><LineChart data={both} margin={{ top: 8, right: 14, left: -6, bottom: 0 }}>
            <CartesianGrid stroke={pal.line} strokeDasharray="3 4" vertical={false} />
            <XAxis dataKey="over" type="number" domain={[0, 20]} ticks={[0, 4, 8, 12, 16, 20]} {...axisProps(pal)} />
            <YAxis {...axisProps(pal)} />
            <Tooltip content={<ChartTip fmt={(v) => v + " runs"} labelFmt={(l) => "Over " + l} />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {d.target && <ReferenceLine y={d.target} stroke={pal.s2} strokeDasharray="5 4" label={{ value: "Target " + d.target, fill: pal.mute, fontSize: 11, position: "insideTopLeft" }} />}
            <ReferenceLine x={s.over} stroke={pal.s2} strokeWidth={1.5} />
            <Line dataKey="r1" name={d.m.first || "1st innings"} stroke={pal.s1} strokeWidth={2.6} dot={false} />
            <Line dataKey="r2" name={d.m.chaser || "Chase"} stroke={pal.s3} strokeWidth={2.6} dot={false} />
          </LineChart></ResponsiveContainer></div>
        </Card>
        <Card title="Wickets progression" sub="Wickets lost after each over">
          <div className="chart h280"><ResponsiveContainer><LineChart data={both} margin={{ top: 8, right: 14, left: -6, bottom: 0 }}>
            <CartesianGrid stroke={pal.line} strokeDasharray="3 4" vertical={false} />
            <XAxis dataKey="over" type="number" domain={[0, 20]} ticks={[0, 4, 8, 12, 16, 20]} {...axisProps(pal)} />
            <YAxis domain={[0, 10]} allowDecimals={false} {...axisProps(pal)} />
            <Tooltip content={<ChartTip fmt={(v) => v + " down"} labelFmt={(l) => "Over " + l} />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ReferenceLine x={s.over} stroke={pal.s2} strokeWidth={1.5} />
            <Line type="stepAfter" dataKey="w1" name={d.m.first || "1st innings"} stroke={pal.s1} strokeWidth={2.4} dot={false} />
            <Line type="stepAfter" dataKey="w2" name={d.m.chaser || "Chase"} stroke={pal.s3} strokeWidth={2.4} dot={false} />
          </LineChart></ResponsiveContainer></div>
        </Card>
      </div>
      <div className="grid g2">
        <Card title="Run rate" sub={s.innings === 2 ? "Runs in each over, current run rate and required run rate" : "Runs in each over and the running rate"}>
          <div className="chart h280"><ResponsiveContainer><ComposedChart data={perOver} margin={{ top: 8, right: 14, left: -6, bottom: 0 }}>
            <CartesianGrid stroke={pal.line} strokeDasharray="3 4" vertical={false} />
            <XAxis dataKey="over" {...axisProps(pal)} />
            <YAxis {...axisProps(pal)} />
            <Tooltip content={<ChartTip fmt={(v, p) => (p.dataKey === "runs" ? v + " runs" : v + " per over")} labelFmt={(l) => "Over " + l} />} cursor={{ fill: pal.line, opacity: 0.3 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="runs" name="Runs in over" fill={s.innings === 1 ? pal.s1 : pal.s3} radius={[3, 3, 0, 0]}>{perOver.map((r) => <Cell key={r.over} fill={r.over === s.over ? pal.s2 : (s.innings === 1 ? pal.s1 : pal.s3)} fillOpacity={r.over === s.over ? 1 : 0.6} />)}</Bar>
            <Line dataKey="crr" name="Current run rate" stroke={pal.s4} strokeWidth={2.2} dot={false} />
            {s.innings === 2 && <Line dataKey="rrr" name="Required run rate" stroke={pal.mute} strokeWidth={2} strokeDasharray="5 4" dot={false} />}
          </ComposedChart></ResponsiveContainer></div>
        </Card>
        <Card title="Win probability across the match" sub={`${d.m.first || d.m.team1}: model estimate through innings 1, then the chase`}>
          <WinTimeline d={d} marker={s.innings === 1 ? Math.min(s.over, 19) : 20 + Math.min(s.over, 19)} />
          <SplitNote d={d} />
        </Card>
      </div>
      <div className="grid g2">
        <Card title="Chase against par" sub="Runs on the board against the model's 50% line" right={<button className="btn ghost sm" onClick={() => go("par-lab")}>Open Par Lab</button>}>
          {parRows.length ? (
            <div className="chart h260"><ResponsiveContainer><LineChart data={parRows} margin={{ top: 8, right: 14, left: -6, bottom: 0 }}>
              <CartesianGrid stroke={pal.line} strokeDasharray="3 4" vertical={false} />
              <XAxis dataKey="over" type="number" domain={[1, 19]} {...axisProps(pal)} />
              <YAxis {...axisProps(pal)} />
              <Tooltip content={<ChartTip fmt={(v) => Math.round(v)} labelFmt={(l) => "Over " + l} />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line dataKey="par" name="Par" stroke={pal.s2} strokeWidth={2.4} strokeDasharray="5 4" dot={false} />
              <Line dataKey="runs" name="Runs" stroke={pal.s3} strokeWidth={2.6} dot={false} />
            </LineChart></ResponsiveContainer></div>
          ) : <p className="note">No par curve for this match (it needs a chase with a target and a notebook 06 export).</p>}
        </Card>
        <Card title="Turning points" sub="Largest single-over moves in the batting-first side's win probability">
          <TurningPoints d={d} onPick={(t) => s.setMatch(s.matchId, { innings: t.inn, over: Math.max(1, t.over) })} />
        </Card>
      </div>
    </div>
  );
}

/* ================= REPLAYS: any historical match ================= */
function HistoricalReplay({ go }) {
  const { s, d } = useMatch(); const pal = usePal();
  const [play, setPlay] = useState(false);
  const ref = useRef(s); ref.current = s;
  useEffect(() => {
    if (!play) return;
    const t = setInterval(() => {
      const c = ref.current; const inn = c.innings === 1 ? deriveMatch(c.matchId).inn1 : deriveMatch(c.matchId).inn2;
      const last = inn ? Math.max(...inn.filter((r) => r.live && r.over > 0).map((r) => r.over), 1) : 1;
      if (c.over >= last) { setPlay(false); return; }
      c.setOver(c.over + 1);
    }, 700);
    return () => clearInterval(t);
  }, [play]);
  useEffect(() => { setPlay(false); }, [s && s.matchId, s && s.innings]);
  if (!s || !s.ready || !d) return <NeedMatches s={s} go={go} />;
  const inn = innOf(d, s.innings);
  if (!inn) return <Empty title="No over-by-over data for this match">This match has no parsed {s.innings === 1 ? "first" : "second"} innings in matches.json.</Empty>;
  const lastOver = Math.max(...inn.filter((r) => r.live && r.over > 0).map((r) => r.over), 1);
  const o = Math.min(s.over, lastOver); const cur = inn[o];
  const team = s.innings === 1 ? (d.m.first || d.m.team1) : (d.m.chaser || d.m.team2);
  const p = s.innings === 1 ? cur.pFirst : cur.pChase;
  const rows = inn.slice(1).filter((r) => r.live);
  const chart = inn.filter((r) => r.live).map((r) => ({
    over: r.over, runs: r.runs, pred: r.pred ?? null, band: r.lo != null ? [r.lo, r.hi] : null, par: r.par ?? null,
    p: (s.innings === 1 ? r.pFirst : r.pChase) == null ? null : +(((s.innings === 1 ? r.pFirst : r.pChase)) * 100).toFixed(1),
  }));
  const csv = () => toCsv([["over", "runs", "wkts", "runs_in_over", "boundaries_in_over", s.innings === 1 ? "projected" : "par", "win_pct"], ...rows.map((r) => [r.over, r.runs, r.wkts, r.ovRuns, r.ovBnd, s.innings === 1 ? r.pred ?? "" : r.par ?? "", (s.innings === 1 ? r.pFirst : r.pChase) == null ? "" : Math.round((s.innings === 1 ? r.pFirst : r.pChase) * 100)])]);
  return (
    <div className="stack">
      <Card className="score-card">
        <div className="sb">
          <div className="sb-main">
            <div className="sb-team">{team} · {d.m.label} · {d.m.date}</div>
            <div className="sb-score">{cur.runs}<span>/{cur.wkts}</span></div>
            <div className="sb-over">after {o} overs{o === lastOver && lastOver < 20 ? " (innings ended)" : ""}</div>
          </div>
          <div className="sb-mid">
            <div className="sb-line">Over {o}: <b>{cur.ovRuns}</b> runs, <b>{cur.ovWkts}</b> wicket{cur.ovWkts === 1 ? "" : "s"}, <b>{cur.ovBnd}</b> boundar{cur.ovBnd === 1 ? "y" : "ies"}</div>
            {s.innings === 2
              ? <><div className="sb-line">Target <b>{d.target}</b> · need <b>{cur.need}</b> off <b>{cur.ballsLeft}</b> · required rate <b>{num(cur.rrr, 2)}</b></div>
                <div className="sb-line">Par <b>{cur.par != null ? Math.round(cur.par) : "–"}</b> · margin <b className={cur.margin >= 0 ? "t-good" : "t-bad"}>{cur.margin != null ? sgn(Math.round(cur.margin)) : "–"}</b></div></>
              : <><div className="sb-line">Run rate <b>{num(cur.crr, 2)}</b></div>
                <div className="sb-line">Projected total <b>{cur.pred != null ? num(cur.pred) : "–"}</b>{cur.lo != null && <> (80% {num(cur.lo)}–{num(cur.hi)})</>} · final <b>{d.m.first_runs}/{d.m.first_wkts}</b></div></>}
          </div>
          {p != null ? <Gauge p={p} label={s.innings === 2 ? "Chase wins" : "Batting side wins"} tone={s.innings === 2 ? "chase" : "first"} /> : <div className="note">No out-of-sample win probability for this match.</div>}
        </div>
        <div className="scrub">
          <button className="btn" onClick={() => { if (s.over >= lastOver) s.setOver(1); setPlay(!play); }}>{play ? "Pause" : "Play"}</button>
          <button className="btn ghost sm" aria-label="Previous over" onClick={() => { setPlay(false); s.setOver(Math.max(1, o - 1)); }}>‹ over</button>
          <input className="range" type="range" min="1" max={lastOver} value={o} onChange={(e) => { setPlay(false); s.setOver(+e.target.value); }} aria-label="Over" />
          <button className="btn ghost sm" aria-label="Next over" onClick={() => { setPlay(false); s.setOver(Math.min(lastOver, o + 1)); }}>over ›</button>
        </div>
        <p className="note">Over-by-over replay. The export holds the state after each over; ball-by-ball events are not exported. {resultText(d.m)}.</p>
      </Card>
      <div className="grid g2">
        <Card title={s.innings === 1 ? "Projected total and runs" : "Runs against par"} sub={s.innings === 1 ? "Champion projection with its 80% range, against runs scored" : "Staying below par is what a low probability looks like"}>
          <div className="chart h280"><ResponsiveContainer><ComposedChart data={chart} margin={{ top: 8, right: 14, left: -6, bottom: 0 }}>
            <CartesianGrid stroke={pal.line} strokeDasharray="3 4" vertical={false} />
            <XAxis dataKey="over" type="number" domain={[1, 20]} ticks={[1, 4, 8, 12, 16, 20]} {...axisProps(pal)} />
            <YAxis {...axisProps(pal)} />
            <Tooltip content={<ChartTip fmt={(v) => (Array.isArray(v) ? v.join("–") : Math.round(v))} labelFmt={(l) => "Over " + l} />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ReferenceLine x={o} stroke={pal.s2} strokeWidth={2} />
            {s.innings === 1 ? <>
              <Area dataKey="band" name="80% range" stroke="none" fill={pal.s1} fillOpacity={0.14} />
              <Line dataKey="pred" name="Projected total" stroke={pal.s1} strokeWidth={2.4} strokeDasharray="5 4" dot={false} connectNulls />
              <ReferenceLine y={d.m.first_runs} stroke={pal.mute} strokeDasharray="4 4" />
            </> : <>
              {d.target && <ReferenceLine y={d.target} stroke={pal.mute} strokeDasharray="4 4" />}
              <Line dataKey="par" name="Par" stroke={pal.s2} strokeWidth={2.4} strokeDasharray="5 4" dot={false} connectNulls />
            </>}
            <Line dataKey="runs" name="Runs" stroke={s.innings === 1 ? pal.s4 : pal.s3} strokeWidth={2.6} dot={false} />
          </ComposedChart></ResponsiveContainer></div>
        </Card>
        <Card title="Win probability" sub={s.innings === 2 ? "Chasing side" : "Batting-first side"}>
          {chart.some((r) => r.p !== null) ? (
            <div className="chart h280"><ResponsiveContainer><ComposedChart data={chart} margin={{ top: 8, right: 14, left: -6, bottom: 0 }}>
              <CartesianGrid stroke={pal.line} strokeDasharray="3 4" vertical={false} />
              <XAxis dataKey="over" type="number" domain={[1, 20]} ticks={[1, 4, 8, 12, 16, 20]} {...axisProps(pal)} />
              <YAxis domain={[0, 100]} unit="%" {...axisProps(pal)} />
              <Tooltip content={<ChartTip fmt={(v) => v + "%"} labelFmt={(l) => "Over " + l} />} />
              <ReferenceLine y={50} stroke={pal.mute} strokeDasharray="4 4" />
              <ReferenceLine x={o} stroke={pal.s2} strokeWidth={2} />
              <Area type="linear" dataKey="p" name="Win %" stroke={s.innings === 2 ? pal.s3 : pal.s1} fill={s.innings === 2 ? pal.s3 : pal.s1} fillOpacity={0.15} strokeWidth={2.6} dot={false} connectNulls />
            </ComposedChart></ResponsiveContainer></div>
          ) : <p className="note">No out-of-sample probabilities for this match.</p>}
          <SplitNote d={d} />
        </Card>
      </div>
      <Card title="Key turning points" sub="Click a row to jump to that over"><TurningPoints d={d} onPick={(t) => { setPlay(false); s.setMatch(s.matchId, { innings: t.inn, over: Math.max(1, t.over) }); }} /></Card>
      <Card title="Over by over" right={<CopyBtn get={csv} />}>
        <div className="tbl-wrap tall"><table className="tbl">
          <thead><tr><th>Over</th><th className="r">Score</th><th className="r">In over</th><th className="r">4s/6s</th><th className="r">{s.innings === 1 ? "Projected" : "Par"}</th><th className="r">Win %</th></tr></thead>
          <tbody>{rows.map((r) => {
            const pp = s.innings === 1 ? r.pFirst : r.pChase;
            return (<tr key={r.over} className={r.over === o ? "sel" : ""} onClick={() => { setPlay(false); s.setOver(r.over); }}>
              <td className="mono">{r.over}</td><td className="r mono">{score(r.runs, r.wkts)}</td><td className="r mono">{r.ovRuns}{r.ovWkts ? " · " + r.ovWkts + "w" : ""}</td><td className="r mono">{r.ovBnd}</td>
              <td className="r mono">{s.innings === 1 ? (r.pred != null ? num(r.pred) : "–") : (r.par != null ? num(r.par) : "–")}</td><td className="r mono strong">{pp == null ? "–" : pc(pp)}</td></tr>);
          })}</tbody>
        </table></div>
      </Card>
    </div>
  );
}

/* ================= PAR LAB: selected match ================= */
function ParMatchView({ go }) {
  const { s, d } = useMatch(); const pal = usePal();
  if (!s || !s.ready || !d) return <NeedMatches s={s} go={go} />;
  const inn = d.inn2;
  if (!inn || d.target == null) return <Empty title="Par needs a chase with a target">{d.m.label} on {d.m.date} has no usable chase ({String(d.m.status).replace(/_/g, " ")}).</Empty>;
  const rows = inn.filter((r) => r.live && r.over > 0);
  const o = Math.min(s.over, rows.length ? rows[rows.length - 1].over : 1); const cur = inn[o];
  const withPar = rows.filter((r) => r.par != null);
  const chart = rows.map((r) => ({ over: r.over, runs: r.runs, par: r.par ?? null, diff: r.margin ?? null, wkts: r.wkts, rrr: r.rrr == null ? null : +r.rrr.toFixed(2) }));
  const lastPar = withPar[withPar.length - 1];
  return (
    <div className="stack">
      <MatchBanner d={d} />
      <div className="grid g4">
        <Kpi label={`Runs after over ${o}`} value={score(cur.runs, cur.wkts)} note={`target ${d.target}`} />
        <Kpi label="Model par" value={cur.par != null ? num(cur.par) : "–"} note="runs for a 50% chase here" />
        <Kpi label="Actual − par" value={cur.margin != null ? sgn(Math.round(cur.margin)) : "–"} note={cur.margin == null ? "no par at this over" : cur.margin >= 0 ? "ahead of par" : "behind par"} tone={cur.margin == null ? undefined : cur.margin >= 0 ? "good" : "bad"} />
        <Kpi label="Required rate" value={num(cur.rrr, 2)} note={`need ${cur.need} off ${cur.ballsLeft} balls`} />
      </div>
      <div className="grid g2">
        <Card title="Runs against par" sub="Chasing side, over by over">
          <div className="chart h280"><ResponsiveContainer><ComposedChart data={chart} margin={{ top: 8, right: 14, left: -6, bottom: 0 }}>
            <CartesianGrid stroke={pal.line} strokeDasharray="3 4" vertical={false} />
            <XAxis dataKey="over" type="number" domain={[1, 19]} ticks={[1, 4, 7, 10, 13, 16, 19]} {...axisProps(pal)} />
            <YAxis domain={[0, d.target]} {...axisProps(pal)} />
            <Tooltip content={<ChartTip fmt={(v) => Math.round(v)} labelFmt={(l) => "Over " + l} />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ReferenceLine y={d.target} stroke={pal.mute} strokeDasharray="4 4" />
            <ReferenceLine x={o} stroke={pal.s2} strokeWidth={2} />
            <Line dataKey="par" name="Par" stroke={pal.s2} strokeWidth={2.4} strokeDasharray="5 4" dot={false} connectNulls />
            <Line dataKey="runs" name="Runs" stroke={pal.s3} strokeWidth={2.6} dot={false} />
          </ComposedChart></ResponsiveContainer></div>
        </Card>
        <Card title="Gap to par" sub="Runs ahead (above zero) or behind (below zero) at each over">
          <div className="chart h280"><ResponsiveContainer><BarChart data={chart} margin={{ top: 8, right: 14, left: -6, bottom: 0 }}>
            <CartesianGrid stroke={pal.line} strokeDasharray="3 4" vertical={false} />
            <XAxis dataKey="over" {...axisProps(pal)} />
            <YAxis {...axisProps(pal)} />
            <Tooltip content={<ChartTip fmt={(v) => sgn(Math.round(v)) + " runs"} labelFmt={(l) => "Over " + l} />} cursor={{ fill: pal.line, opacity: 0.3 }} />
            <ReferenceLine y={0} stroke={pal.text} />
            <Bar dataKey="diff" name="Actual − par" radius={[3, 3, 0, 0]}>{chart.map((r) => <Cell key={r.over} fill={r.diff == null ? pal.line : r.diff >= 0 ? pal.good : pal.bad} fillOpacity={r.over === o ? 1 : 0.65} />)}</Bar>
          </BarChart></ResponsiveContainer></div>
        </Card>
      </div>
      <div className="grid g21">
        <Card title="Over by over" right={<Chip tone="mute">{withPar.length} overs with par</Chip>}>
          <div className="tbl-wrap tall"><table className="tbl">
            <thead><tr><th>Over</th><th className="r">Score</th><th className="r">Par</th><th className="r">vs par</th><th className="r">Need</th><th className="r">Req. rate</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.over} className={r.over === o ? "sel" : ""} onClick={() => s.setOver(r.over)}>
                <td className="mono">{r.over}</td><td className="r mono">{score(r.runs, r.wkts)}</td><td className="r mono">{r.par != null ? num(r.par) : "–"}</td>
                <td className={"r mono " + (r.margin == null ? "" : r.margin >= 0 ? "t-good" : "t-bad")}>{r.margin != null ? sgn(Math.round(r.margin)) : "–"}</td>
                <td className="r mono">{r.need}</td><td className="r mono">{num(r.rrr, 2)}</td></tr>))}</tbody>
          </table></div>
        </Card>
        <Card title="How par is calculated">
          <ul className="facts">
            <li><b>Par</b> is the smallest number of runs on the board, at this over and this many wickets lost, for which the chase model gives the chasing side at least a 50% chance.</li>
            <li>It is found by trying every score with the same wickets and a steady pace for the rest of the innings, so it is a model line, not the DLS method.</li>
            <li>It depends on the target, the wickets down, the over and the venue and recent-form context from the notebook.</li>
            <li>{d.split === "train" ? "For this match the model had already seen the match when it was fitted, so this curve is a reference, not a test." : "For this match the par model was fitted without it (2026 holdout)."}</li>
            {lastPar && <li>Final gap to par at over {lastPar.over}: <b>{sgn(Math.round(lastPar.margin))}</b> runs.</li>}
          </ul>
        </Card>
      </div>
      <SplitNote d={d} />
    </div>
  );
}

/* ================= WIN PROBABILITY: selected match ================= */
function WinProbMatchView({ go }) {
  const { s, d } = useMatch(); const pal = usePal();
  if (!s || !s.ready || !d) return <NeedMatches s={s} go={go} />;
  const inn = d.inn2;
  const y = d.m.chase_won;
  const rows = inn ? inn.filter((r) => r.over >= 1 && r.over <= 19 && r.live && r.pChase != null) : [];
  const ll = (p) => (y === 0 || y === 1 ? -(y * Math.log(Math.max(p, 1e-9)) + (1 - y) * Math.log(Math.max(1 - p, 1e-9))) : null);
  const br = (p) => (y === 0 || y === 1 ? (p - y) ** 2 : null);
  const meanLL = rows.length && y != null ? rows.reduce((a, r) => a + ll(r.pChase), 0) / rows.length : null;
  const meanBr = rows.length && y != null ? rows.reduce((a, r) => a + br(r.pChase), 0) / rows.length : null;
  let champMean = null; try { const j = D.NB04; if (j) champMean = colMean(pivotT(j.logloss_by_over).cols[j.champion] || []); } catch (e) {}
  const full = inn ? inn.filter((r) => r.over <= 19 && (r.pChase != null || r.over === 0)).map((r) => ({ over: r.over, nb04: r.pChase == null ? null : +(r.pChase * 100).toFixed(1), nb06: r.pChase6 == null ? null : +(r.pChase6 * 100).toFixed(1) })) : [];
  const swings = rows.map((r, i) => { const prev = i === 0 ? (inn[0].pChase ?? null) : rows[i - 1].pChase; return prev == null ? null : { over: r.over, from: prev, to: r.pChase, delta: r.pChase - prev, runs: r.ovRuns, wkts: r.ovWkts }; }).filter(Boolean);
  const top = swings.slice().sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 5);
  return (
    <div className="stack">
      <MatchBanner d={d} />
      {!rows.length ? (
        <Card title="Win probability"><p className="note">This match has no out-of-sample chase win probability from notebook 04. {MD.loaded.predictions ? "Only validation (2021–25) and holdout (2026) matches have one." : "predictions.json is not loaded."}</p>
          <WinTimeline d={d} /></Card>
      ) : (
        <>
          <div className="grid g4">
            <Kpi label="Actual result" value={y === 1 ? "Chase won" : y === 0 ? "Defended" : "–"} note={resultText(d.m)} />
            <Kpi label="Chase win % at start" value={d.pStart != null ? pc(d.pStart) : (inn[0].pChase != null ? pc(inn[0].pChase) : "–")} note="once the target is known" />
            <Kpi label="This match: log loss" value={num(meanLL, 3)} note={champMean != null ? `mean of overs 1–19 · model average ${champMean.toFixed(3)}` : "mean of overs 1–19"} tone={meanLL != null && champMean != null ? (meanLL <= champMean ? "good" : "warn") : undefined} />
            <Kpi label="This match: Brier" value={num(meanBr, 3)} note="mean squared gap to the result (0 is perfect)" />
          </div>
          <div className="grid g2">
            <Card title="Chasing side's win probability" sub="Notebook 04 champion, with notebook 06's chase model for comparison" right={<Chip tone={y === 1 ? "good" : "bad"}>Actual: {y === 1 ? "chase won" : "chase lost"}</Chip>}>
              <div className="chart h280"><ResponsiveContainer><ComposedChart data={full} margin={{ top: 8, right: 14, left: -6, bottom: 0 }}>
                <CartesianGrid stroke={pal.line} strokeDasharray="3 4" vertical={false} />
                <XAxis dataKey="over" type="number" domain={[0, 19]} ticks={[0, 4, 8, 12, 16, 19]} {...axisProps(pal)} />
                <YAxis domain={[0, 100]} unit="%" {...axisProps(pal)} />
                <Tooltip content={<ChartTip fmt={(v) => v + "%"} labelFmt={(l) => "After over " + l} />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <ReferenceLine y={50} stroke={pal.mute} strokeDasharray="4 4" />
                <ReferenceLine x={s.over > 19 ? 19 : s.over} stroke={pal.s2} strokeWidth={1.5} />
                <Line dataKey="nb04" name="Notebook 04 (champion)" stroke={pal.s3} strokeWidth={2.8} dot={false} connectNulls />
                <Line dataKey="nb06" name="Notebook 06 chase model" stroke={pal.s1} strokeWidth={1.8} strokeDasharray="5 4" dot={false} connectNulls />
              </ComposedChart></ResponsiveContainer></div>
              <p className="note">The result is known only at the end: a good probability line drifts toward {y === 1 ? "100%" : "0%"}. One match says little about calibration; see the evaluation tab for that.</p>
            </Card>
            <Card title="Score against the target" sub="What the probability was reacting to">
              <div className="chart h280"><ResponsiveContainer><LineChart data={inn.filter((r) => r.live)} margin={{ top: 8, right: 14, left: -6, bottom: 0 }}>
                <CartesianGrid stroke={pal.line} strokeDasharray="3 4" vertical={false} />
                <XAxis dataKey="over" type="number" domain={[0, 20]} ticks={[0, 4, 8, 12, 16, 20]} {...axisProps(pal)} />
                <YAxis {...axisProps(pal)} />
                <Tooltip content={<ChartTip fmt={(v) => Math.round(v)} labelFmt={(l) => "Over " + l} />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <ReferenceLine y={d.target} stroke={pal.mute} strokeDasharray="4 4" />
                <Line dataKey="runs" name="Runs" stroke={pal.s3} strokeWidth={2.6} dot={false} />
                <Line dataKey="par" name="Par" stroke={pal.s2} strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls />
              </LineChart></ResponsiveContainer></div>
            </Card>
          </div>
          <div className="grid g2">
            <Card title="Largest probability swings" sub="Chase win %, one over to the next">
              <div className="tbl-wrap"><table className="tbl">
                <thead><tr><th>Over</th><th className="r">Before → after</th><th className="r">Swing</th><th>In that over</th></tr></thead>
                <tbody>{top.map((t) => <tr key={t.over} className="click" onClick={() => s.setMatch(s.matchId, { innings: 2, over: t.over })}><td className="mono">{t.over}</td><td className="r mono">{Math.round(t.from * 100)} → {Math.round(t.to * 100)}</td>
                  <td className={"r mono strong " + (t.delta >= 0 ? "t-good" : "t-bad")}>{sgn(t.delta * 100)} pts</td><td>{t.runs} runs{t.wkts ? `, ${t.wkts} wicket${t.wkts === 1 ? "" : "s"}` : ""}</td></tr>)}</tbody>
              </table></div>
            </Card>
            <Card title="Calibration context">
              <ul className="facts">
                <li>Calibration is a property of many matches, not one. The reliability chart and ECE are on the <b>Model evaluation</b> tab.</li>
                <li>This match's log loss {meanLL != null && champMean != null ? <><b>{meanLL.toFixed(3)}</b> against a validation average of <b>{champMean.toFixed(3)}</b></> : "is shown above"}; a single match can sit well above or below the average without the model being wrong.</li>
                <li>{d.split ? SPLIT_LABEL[d.split] + "." : ""}</li>
              </ul>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

/* ================= SCORE ENGINE: used when nb03.json has no match_history ================= */
function ScoreMatchView({ go }) {
  const { s, d } = useMatch(); const pal = usePal();
  if (!s || !s.ready || !d || !d.inn1) return null;
  const rows = d.inn1.filter((r) => r.over >= 1 && r.over <= 19 && r.pred != null);
  if (!rows.length) return (<Card title="Selected match projection"><p className="note">No out-of-sample projection for this match. {MD.loaded.predictions ? "Only 2021–26 matches have one." : "predictions.json is not loaded."}</p></Card>);
  const fin = d.m.first_runs; const last = rows[rows.length - 1];
  const data = rows.map((r) => ({ over: r.over, runs: r.runs, pred: r.pred, band: [r.lo, r.hi], err: r.pred - fin }));
  return (
    <Card title="Selected match: actual versus projected" sub={`${d.m.first || d.m.team1} · ${d.m.date} · ${SPLIT_LABEL[d.split] || ""}`}>
      <div className="grid g4">
        <Kpi label="Actual final score" value={fin} note="first innings" />
        <Kpi label="Projection after over 19" value={num(last.pred, 1)} note={`80% range ${num(last.lo)}–${num(last.hi)}`} />
        <Kpi label="Error at over 19" value={sgn(last.pred - fin, 1)} note="projected − actual" tone={Math.abs(last.pred - fin) <= 5 ? "good" : "warn"} />
        <Kpi label="80% range" value={fin >= last.lo && fin <= last.hi ? "Covered" : "Missed"} note="at over 19" tone={fin >= last.lo && fin <= last.hi ? "good" : "warn"} />
      </div>
      <div className="chart h300"><ResponsiveContainer><ComposedChart data={data} margin={{ top: 8, right: 14, left: -6, bottom: 0 }}>
        <CartesianGrid stroke={pal.line} strokeDasharray="3 4" vertical={false} />
        <XAxis dataKey="over" type="number" domain={[1, 19]} {...axisProps(pal)} /><YAxis {...axisProps(pal)} />
        <Tooltip content={<ChartTip fmt={(v) => (Array.isArray(v) ? v.map((x) => Math.round(x)).join("–") : Number(v).toFixed(1))} labelFmt={(l) => "Over " + l} />} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Area dataKey="band" name="80% range" stroke="none" fill={pal.s1} fillOpacity={0.14} />
        <Line dataKey="pred" name="Projected final" stroke={pal.s1} strokeWidth={2.5} dot={false} />
        <Line dataKey="runs" name="Runs so far" stroke={pal.s3} strokeWidth={2.5} dot={false} />
        <ReferenceLine y={fin} stroke={pal.s2} strokeDasharray="5 4" label={{ value: "Actual final", fill: pal.mute, fontSize: 11, position: "insideTopLeft" }} />
      </ComposedChart></ResponsiveContainer></div>
    </Card>
  );
}

/* ================= OVERVIEW: historical cricket statistics ================= */
function HistoryStats({ go }) {
  const pal = usePal();
  const [season, setSeason] = useState("all");
  if (!MD.loaded.matches) return null;
  const rows = season === "all" ? MD.rows : MD.rows.filter((r) => r.season === season);
  const a = aggregate(rows);
  const bySeason = MD.seasons.map((y) => { const g = aggregate(MD.rows.filter((r) => r.season === y)); return { season: y, avg_first: g.avgFirst, avg_second: g.avgSecond, chase_win: g.chaseWin }; });
  const top = rows.filter((r) => r.usable).sort((x, y) => y.first_runs - x.first_runs).slice(0, 5);
  return (
    <Card title="IPL history" sub="Historical cricket statistics counted from your YAML files. Model evaluation is the next section." right={<>
      <Chip tone="mute">Cricket statistics, not model output</Chip>
      <select className="sel-input" id="ov-season" aria-label="Season" value={season} onChange={(e) => setSeason(e.target.value === "all" ? "all" : Number(e.target.value))}>
        <option value="all">All seasons</option>{[...MD.seasons].reverse().map((y) => <option key={y} value={y}>IPL {y}</option>)}</select></>}>
      <div className="grid g4">
        <Kpi label="Matches" value={a.matches.toLocaleString()} note={`${a.usable.toLocaleString()} with two full innings`} />
        <Kpi label="Teams · venues" value={`${a.teams} · ${a.venues}`} note={season === "all" ? `${MD.seasons.length} seasons` : "in this season"} />
        <Kpi label="Average score" value={`${num(a.avgFirst, 1)} / ${num(a.avgSecond, 1)}`} note="1st innings / 2nd innings" />
        <Kpi label="Chase success" value={pc(a.chaseWin, 1)} note={`${a.decided} decided matches`} />
      </div>
      <div className="grid g21" style={{ marginTop: 16 }}>
        <div>
          <div className="chart h260"><ResponsiveContainer><ComposedChart data={bySeason} margin={{ top: 8, right: 8, left: -6, bottom: 0 }}>
            <CartesianGrid stroke={pal.line} strokeDasharray="3 4" vertical={false} />
            <XAxis dataKey="season" {...axisProps(pal)} />
            <YAxis yAxisId="l" domain={[120, "auto"]} {...axisProps(pal)} />
            <YAxis yAxisId="r" orientation="right" domain={[0.3, 0.7]} tickFormatter={(v) => Math.round(v * 100) + "%"} {...axisProps(pal)} />
            <Tooltip content={<ChartTip fmt={(v, p) => (p.dataKey === "chase_win" ? pct(v) : v.toFixed(1))} />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {season !== "all" && <ReferenceLine yAxisId="l" x={season} stroke={pal.s2} strokeWidth={2} />}
            <Line yAxisId="l" dataKey="avg_first" name="Avg 1st innings" stroke={pal.s1} strokeWidth={2.6} dot={{ r: 3 }} />
            <Line yAxisId="l" dataKey="avg_second" name="Avg 2nd innings" stroke={pal.s2} strokeWidth={2.2} dot={{ r: 3 }} />
            <Line yAxisId="r" dataKey="chase_win" name="Chase win %" stroke={pal.s3} strokeDasharray="5 4" strokeWidth={2} dot={false} />
          </ComposedChart></ResponsiveContainer></div>
        </div>
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>Highest 1st-innings totals</th><th className="r">Score</th></tr></thead>
          <tbody>{top.map((r) => <tr key={r.id} className="click" onClick={() => go("explorer")}><td>{r.first} <span className="note">{r.date}</span></td><td className="r mono strong">{r.first_runs}/{r.first_wkts}</td></tr>)}</tbody>
        </table></div>
      </div>
    </Card>
  );
}

/* ================= DATA EXPLORER: filters + match list with drill-down ================= */
const EMPTY_FLT = { season: "all", team: "all", venue: "all", role: "any", result: "all" };
function filterRows(f) {
  return MD.rows.filter((r) => {
    if (f.season !== "all" && r.season !== f.season) return false;
    if (f.venue !== "all" && r.venue !== f.venue) return false;
    if (f.team !== "all") {
      if (r.team1 !== f.team && r.team2 !== f.team) return false;
      if (f.role === "first" && r.first !== f.team) return false;
      if (f.role === "chase" && r.chaser !== f.team) return false;
    }
    if (f.result === "chase" && r.chase_won !== 1) return false;
    if (f.result === "defend" && r.chase_won !== 0) return false;
    if (f.result === "excluded" && r.usable) return false;
    return true;
  });
}
function MatchList({ flt, setFlt, go }) {
  const s = useSelection(); const pal = usePal();
  const [shown, setShown] = useState(40);
  useEffect(() => setShown(40), [flt]);
  const rows = useMemo(() => filterRows(flt).slice().sort((a, b) => String(b.date).localeCompare(String(a.date))), [flt, MD.rows]);
  const a = aggregate(rows);
  const hist = useMemo(() => { const b = {}; rows.filter((r) => r.usable).forEach((r) => { const k = Math.floor(r.first_runs / 10) * 10; b[k] = (b[k] || 0) + 1; }); return Object.keys(b).map(Number).sort((x, y) => x - y).map((k) => ({ band: k + "s", matches: b[k] })); }, [rows]);
  if (!MD.loaded.matches) return <Card title="Match list"><p className="note">Load matches.json (notebook 08) to filter and open individual matches.</p></Card>;
  const set = (k, v) => setFlt({ ...flt, [k]: v });
  const active = Object.entries(flt).filter(([k, v]) => v !== EMPTY_FLT[k]);
  const open = (r) => { s.setMatch(r.id, { innings: 1 }); go("match-centre"); };
  return (
    <div className="stack" id="match-list">
      <Card title="Match filters" sub="Filters apply to the statistics, the score distribution and the match list below. Click a venue, team or season above to filter."
        right={active.length ? <button className="btn ghost sm" onClick={() => setFlt(EMPTY_FLT)}>Clear filters</button> : null}>
        <div className="fgrid">
          <label>Season<select id="f-season" className="sel-input" value={flt.season} onChange={(e) => set("season", e.target.value === "all" ? "all" : Number(e.target.value))}><option value="all">All</option>{[...MD.seasons].reverse().map((y) => <option key={y} value={y}>{y}</option>)}</select></label>
          <label>Team<select id="f-team" className="sel-input" value={flt.team} onChange={(e) => set("team", e.target.value)}><option value="all">All</option>{MD.teams.map((t) => <option key={t}>{t}</option>)}</select></label>
          <label>Venue<select id="f-venue" className="sel-input" value={flt.venue} onChange={(e) => set("venue", e.target.value)}><option value="all">All</option>{MD.venues.map((t) => <option key={t}>{t}</option>)}</select></label>
          <label>Innings (team's role)<Seg value={flt.role} onChange={(v) => set("role", v)} label="Role" options={[{ value: "any", label: "Any" }, { value: "first", label: "Batted first" }, { value: "chase", label: "Chased" }]} /></label>
          <label>Result<Seg value={flt.result} onChange={(v) => set("result", v)} label="Result" options={[{ value: "all", label: "All" }, { value: "chase", label: "Chase won" }, { value: "defend", label: "Defended" }, { value: "excluded", label: "Excluded" }]} /></label>
        </div>
        <div className="grid g4" style={{ marginTop: 14 }}>
          <Kpi label="Matches" value={a.matches.toLocaleString()} note={`${a.usable} usable for score statistics`} />
          <Kpi label="Average 1st innings" value={num(a.avgFirst, 1)} note="runs" />
          <Kpi label="Average 2nd innings" value={num(a.avgSecond, 1)} note="runs" />
          <Kpi label="Chase success" value={pc(a.chaseWin, 1)} note={a.top ? `highest total ${a.top.first_runs} (${a.top.first}, ${a.top.season})` : ""} />
        </div>
      </Card>
      <div className="grid g21">
        <Card title="Score distribution" sub="First-innings totals for the filtered matches">
          {hist.length ? <div className="chart h260"><ResponsiveContainer><BarChart data={hist} margin={{ top: 8, right: 8, left: -6, bottom: 0 }}>
            <CartesianGrid stroke={pal.line} strokeDasharray="3 4" vertical={false} /><XAxis dataKey="band" {...axisProps(pal)} /><YAxis allowDecimals={false} {...axisProps(pal)} />
            <Tooltip content={<ChartTip fmt={(v) => v + " matches"} />} cursor={{ fill: pal.line, opacity: 0.3 }} /><Bar dataKey="matches" name="Matches" fill={pal.s1} radius={[3, 3, 0, 0]} />
          </BarChart></ResponsiveContainer></div> : <p className="note">No matches with a full first innings under these filters.</p>}
        </Card>
        <Card title="Selected filters">
          {active.length ? <div className="chips">{active.map(([k, v]) => <Chip key={k} tone="good">{k}: {String(v)}</Chip>)}</div> : <p className="note">No filters: every match in the export.</p>}
          <p className="note">Click a row below to open that match in Match Centre; the season and match selection follows you to the other pages.</p>
        </Card>
      </div>
      <Card title={`Matches (${rows.length.toLocaleString()})`} right={<CopyBtn get={() => toCsv([["date", "season", "team1", "team2", "venue", "first_runs", "first_wkts", "second_runs", "second_wkts", "winner"], ...rows.map((r) => [r.date, r.season, r.team1, r.team2, r.venue, r.first_runs ?? "", r.first_wkts ?? "", r.second_runs ?? "", r.second_wkts ?? "", r.winner ?? ""])])} />}>
        <div className="tbl-wrap tall"><table className="tbl">
          <thead><tr><th>Date</th><th>Match</th><th>Venue</th><th className="r">1st inn</th><th className="r">2nd inn</th><th>Result</th></tr></thead>
          <tbody>{rows.slice(0, shown).map((r) => (
            <tr key={r.id} className={"click" + (r.id === s.matchId ? " sel" : "")} onClick={() => open(r)}>
              <td className="mono">{r.date}</td><td>{r.team1} v {r.team2}{!r.usable && <> <Chip tone="warn">{String(r.status).replace(/_/g, " ")}</Chip></>}</td><td>{r.venue}</td>
              <td className="r mono">{score(r.first_runs, r.first_wkts)}</td><td className="r mono">{score(r.second_runs, r.second_wkts)}</td><td>{resultText(r)}</td></tr>))}</tbody>
        </table></div>
        {rows.length > shown && <button className="btn ghost sm" onClick={() => setShown(shown + 60)}>Show 60 more</button>}
      </Card>
    </div>
  );
}

export { HistoricalMatchCentre, HistoricalReplay, ParMatchView, WinProbMatchView, ScoreMatchView, HistoryStats, MatchList, EMPTY_FLT };
