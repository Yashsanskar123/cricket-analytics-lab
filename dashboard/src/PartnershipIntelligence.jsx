import React, { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  LineChart, Line, AreaChart, Area, PieChart, Pie, Cell, Legend
} from "recharts";
import "./partnership-intelligence.css";

const COLORS = ["#65e0bd", "#7aa7ff", "#f6bd60", "#c49bff", "#ff8e9e"];
const PHASES = ["Powerplay", "Middle", "Death"];
const fmt = (v) => Number(v || 0).toLocaleString("en-IN");
const num = (v) => Number(v || 0);
const rate = (v) => v == null || !Number.isFinite(Number(v)) ? "—" : Number(v).toFixed(2);
const pct = (v) => v == null || !Number.isFinite(Number(v)) ? "—" : `${Number(v).toFixed(1)}%`;
const safe = (v, fallback = "—") => v == null || v === "" ? fallback : v;

function Metric({ label, value, note, accent = false }) {
  return <article className={`p2-metric ${accent ? "is-accent" : ""}`}><span>{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</article>;
}
function Panel({ title, subtitle, action, children, className = "" }) {
  return <section className={`p2-panel ${className}`}><div className="p2-panel-head"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</div>{children}</section>;
}
function Empty({ title = "No matching records", children }) {
  return <div className="p2-empty"><span className="p2-empty-mark">◎</span><b>{title}</b><p>{children}</p></div>;
}
function Select({ label, value, onChange, options, allLabel = "All" }) {
  return <label className="p2-select"><span>{label}</span><select value={value} onChange={e => onChange(e.target.value)}><option value="All">{allLabel}</option>{options.map(x => <option key={String(x)} value={String(x)}>{x}</option>)}</select></label>;
}
function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return <div className="p2-tooltip"><b>{label}</b>{payload.map((x, i) => <div key={i}><span style={{ background: x.color || x.fill }} />{x.name}: <strong>{fmt(x.value)}</strong></div>)}</div>;
}

export default function PartnershipIntelligence() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [season, setSeason] = useState("All");
  const [team, setTeam] = useState("All");
  const [venue, setVenue] = useState("All");
  const [wicket, setWicket] = useState("All");
  const [tab, setTab] = useState("overview");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("runs");
  const [selectedId, setSelectedId] = useState("");
  const [phase, setPhase] = useState("Powerplay");
  const [teamFocus, setTeamFocus] = useState("All");
  const [opponentFocus, setOpponentFocus] = useState("All");
  const [venueFocus, setVenueFocus] = useState("All");

  useEffect(() => {
    let alive = true;
    fetch(`/data/partnership_intelligence.json?v=${Date.now()}`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(json => { if (alive) setData(json); })
      .catch(e => { if (alive) setError(e.message || "Unable to load partnership export"); });
    return () => { alive = false; };
  }, []);

  const all = data?.partnerships || [];
  const seasons = data?.meta?.seasons || [...new Set(all.map(x => x.season).filter(Boolean))].sort();
  const teams = data?.meta?.teams || [...new Set(all.map(x => x.team).filter(Boolean))].sort();
  const venues = data?.meta?.venues || [...new Set(all.map(x => x.venue).filter(Boolean))].sort();
  const filtered = useMemo(() => all.filter(p =>
    (season === "All" || String(p.season) === season) &&
    (team === "All" || p.team === team) &&
    (venue === "All" || p.venue === venue) &&
    (wicket === "All" || String(p.wicket_number) === wicket)
  ), [all, season, team, venue, wicket]);

  // Use the exported phase index when present; derive it from each partnership as a fallback.
  // This prevents an empty phase page when an older export lacks the top-level index.
  const rawPhaseRows = useMemo(() => {
    if (Array.isArray(data?.phase_partnerships) && data.phase_partnerships.length) return data.phase_partnerships;
    return all.flatMap(p => {
      if (Array.isArray(p.phase_splits) && p.phase_splits.length) return p.phase_splits.map(s => ({
        partnership_id: p.id, match_id: p.match_id, date: p.date, season: p.season,
        team: p.team, opposition: p.opposition, venue: p.venue, innings: p.innings,
        wicket_number: p.wicket_number, batter1: p.batter1, batter2: p.batter2,
        pair: p.pair, ...s, legal_balls: s.legal_balls ?? s.balls ?? 0
      }));
      // Last-resort compatibility: rebuild phase segments from over progression.
      const grouped = new Map();
      (p.over_progression || []).forEach(o => {
        const name = o.phase || (Number(o.over) <= 6 ? "Powerplay" : Number(o.over) <= 15 ? "Middle" : "Death");
        const x = grouped.get(name) || { phase: name, runs: 0, legal_balls: 0, deliveries: 0, batter1_runs: 0, batter2_runs: 0, extras: 0, dot_balls: 0, fours: 0, sixes: 0 };
        x.runs += num(o.runs); x.legal_balls += num(o.legal_balls); x.deliveries += num(o.deliveries ?? o.legal_balls);
        x.batter1_runs += num(o.batter1_runs); x.batter2_runs += num(o.batter2_runs); x.extras += num(o.extras);
        x.dot_balls += num(o.dot_balls); x.fours += num(o.fours); x.sixes += num(o.sixes); grouped.set(name, x);
      });
      return [...grouped.values()].map(s => ({
        partnership_id: p.id, match_id: p.match_id, date: p.date, season: p.season,
        team: p.team, opposition: p.opposition, venue: p.venue, innings: p.innings,
        wicket_number: p.wicket_number, batter1: p.batter1, batter2: p.batter2,
        pair: p.pair, ...s, run_rate: s.legal_balls ? s.runs * 6 / s.legal_balls : null
      }));
    });
  }, [data, all]);
  const phaseRows = useMemo(() => rawPhaseRows.filter(p =>
    (season === "All" || String(p.season) === season) &&
    (team === "All" || p.team === team) &&
    (venue === "All" || p.venue === venue) &&
    (wicket === "All" || String(p.wicket_number) === wicket)
  ), [rawPhaseRows, season, team, venue, wicket]);

  const phaseSummary = useMemo(() => PHASES.map(name => {
    const rows = phaseRows.filter(x => x.phase === name);
    const runs = rows.reduce((s, x) => s + num(x.runs), 0);
    const balls = rows.reduce((s, x) => s + num(x.legal_balls ?? x.balls), 0);
    const deliveries = rows.reduce((s, x) => s + num(x.deliveries ?? x.legal_balls ?? x.balls), 0);
    const dots = rows.reduce((s, x) => s + num(x.dot_balls), 0);
    return { phase: name, segments: rows.length, runs, balls, deliveries, dots,
      average: rows.length ? runs / rows.length : 0, run_rate: balls ? runs * 6 / balls : 0,
      extras: rows.reduce((s, x) => s + num(x.extras), 0), fours: rows.reduce((s, x) => s + num(x.fours), 0),
      sixes: rows.reduce((s, x) => s + num(x.sixes), 0), dot_pct: deliveries ? dots * 100 / deliveries : 0,
      batter1_runs: rows.reduce((s, x) => s + num(x.batter1_runs), 0), batter2_runs: rows.reduce((s, x) => s + num(x.batter2_runs), 0) };
  }), [phaseRows]);
  const activePhase = phaseSummary.find(x => x.phase === phase) || phaseSummary[0];
  const activePhaseRows = phaseRows.filter(x => x.phase === phase).sort((a, b) => num(b.runs) - num(a.runs));

  const sorted = useMemo(() => [...filtered].sort((a, b) => num(b[sort]) - num(a[sort])), [filtered, sort]);
  const visiblePartnerships = sorted.filter(p => `${p.pair} ${p.team} ${p.opposition} ${p.match_id} ${p.venue}`.toLowerCase().includes(search.toLowerCase())).slice(0, 80);
  const selected = filtered.find(p => p.id === selectedId) || sorted[0] || null;
  const progression = selected?.over_progression || [];
  const progressionOptions = useMemo(() => sorted.filter(p => p.over_progression?.length).slice(0, 600), [sorted]);
  const totalRuns = filtered.reduce((s, p) => s + num(p.runs), 0);
  const totalBalls = filtered.reduce((s, p) => s + num(p.balls), 0);
  const avgRuns = filtered.length ? totalRuns / filtered.length : 0;
  const best = sorted[0];

  const pairRows = useMemo(() => {
    if (season === "All" && team === "All" && venue === "All" && wicket === "All" && data?.pairs?.length) return data.pairs;
    const map = new Map();
    filtered.forEach(p => {
      const key = [p.batter1, p.batter2].sort().join("::");
      const x = map.get(key) || { pair: [p.batter1, p.batter2].sort().join(" & "), partnerships: 0, runs: 0, balls: 0, fifties: 0, hundreds: 0, matches: new Set() };
      x.partnerships++; x.runs += num(p.runs); x.balls += num(p.balls); x.fifties += num(p.runs >= 50); x.hundreds += num(p.runs >= 100); x.matches.add(p.match_id); map.set(key, x);
    });
    return [...map.values()].map(x => ({ ...x, matches: x.matches.size, average_runs: x.partnerships ? x.runs / x.partnerships : 0, run_rate: x.balls ? x.runs * 6 / x.balls : 0 })).sort((a, b) => b.runs - a.runs);
  }, [data, filtered, season, team, venue, wicket]);

  const teamRows = (data?.team_intelligence || data?.by_team || []).filter(x => team === "All" || x.team === team);
  const teamSeasonRows = (data?.team_season_intelligence || []).filter(x => (teamFocus === "All" || x.team === teamFocus) && (season === "All" || String(x.season) === season));
  const oppositionRows = (data?.opposition_intelligence || []).filter(x => (teamFocus === "All" || x.team === teamFocus) && (opponentFocus === "All" || x.opposition === opponentFocus));
  const venueRows = (data?.venue_intelligence || data?.by_venue || []).filter(x => venueFocus === "All" || x.venue === venueFocus);
  const wicketRows = (data?.wicket_intelligence || data?.by_wicket || []).filter(x => wicket === "All" || String(x.wicket_number) === wicket);
  const trendRows = useMemo(() => {
    const map = new Map();
    filtered.forEach(p => { const x = map.get(p.season) || { season: String(p.season), runs: 0, partnerships: 0, balls: 0 }; x.runs += num(p.runs); x.partnerships++; x.balls += num(p.balls); map.set(p.season, x); });
    return [...map.values()].sort((a, b) => Number(a.season) - Number(b.season)).map(x => ({ ...x, average: x.partnerships ? x.runs / x.partnerships : 0, run_rate: x.balls ? x.runs * 6 / x.balls : 0 }));
  }, [filtered]);

  const reset = () => { setSeason("All"); setTeam("All"); setVenue("All"); setWicket("All"); setSearch(""); setSelectedId(""); setTeamFocus("All"); setOpponentFocus("All"); setVenueFocus("All"); };
  const tabs = [
    ["overview", "Overview", "◈"], ["explorer", "Partnerships", "⌕"], ["pairs", "Pair lab", "♧"],
    ["phases", "Phase intelligence", "◷"], ["progression", "Progression", "⌁"], ["teams", "Teams", "▦"],
    ["opposition", "Opposition", "⇄"], ["venues", "Venues", "⌖"], ["wickets", "Wickets", "▥"], ["trends", "Trends", "↗"]
  ];

  if (error) return <div className="p2-root"><Empty title="Partnership data couldn't load">{error}. Check that partnership_intelligence.json exists in public/data.</Empty></div>;
  if (!data) return <div className="p2-root"><div className="p2-loading"><span className="p2-spinner"/> Loading partnership intelligence…</div></div>;

  return <main className="p2-root">
    <header className="p2-hero">
      <div><div className="p2-eyebrow">CRICKET ANALYTICS LAB / IPL INTELLIGENCE</div><h1>Partnership <em>Intelligence</em></h1><p>Explore how batting pairs build innings, manage phases and shape team performance.</p></div>
      <div className="p2-hero-side"><span>DATASET COVERAGE</span><strong>{fmt(data.meta?.matches_parsed)}</strong><small>matches · {seasons.length} seasons · {fmt(all.length)} partnerships</small></div>
    </header>
    <section className="p2-toolbar">
      <div className="p2-toolbar-label"><b>Analysis filters</b><small>Every view responds to these filters</small></div>
      <Select label="Season" value={season} onChange={setSeason} options={seasons.map(String)} />
      <Select label="Batting team" value={team} onChange={setTeam} options={teams} />
      <Select label="Venue" value={venue} onChange={setVenue} options={venues} />
      <Select label="Wicket" value={wicket} onChange={setWicket} options={Array.from({ length: 10 }, (_, i) => i + 1)} />
      <button className="p2-reset" onClick={reset}>Reset filters ↺</button>
    </section>
    <nav className="p2-tabs">{tabs.map(([id, label, icon]) => <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}><span>{icon}</span>{label}</button>)}</nav>
    <div className="p2-view-meta"><span>{fmt(filtered.length)} partnerships in current selection</span><span>Generated {data.meta?.generated?.slice(0, 10) || "—"}</span></div>

    {tab === "overview" && <>
      <section className="p2-metrics"><Metric label="Partnerships analysed" value={fmt(filtered.length)} note="Current selection"/><Metric label="Runs added together" value={fmt(totalRuns)} note="Includes extras" accent/><Metric label="Average stand" value={rate(avgRuns)} note="Runs per partnership"/><Metric label="Partnership run rate" value={rate(totalBalls ? totalRuns * 6 / totalBalls : null)} note={`${fmt(totalBalls)} legal balls`}/><Metric label="Highest stand" value={best ? fmt(best.runs) : "—"} note={best?.pair || "No records"}/></section>
      <div className="p2-grid p2-grid-main">
        <Panel title="Where partnerships are built" subtitle="Share of partnership runs by innings phase" className="p2-span-2">
          {phaseSummary.some(x => x.segments) ? <div className="p2-chart p2-chart-lg"><ResponsiveContainer><BarChart data={phaseSummary} barGap={12}><CartesianGrid stroke="#253247" strokeDasharray="3 5" vertical={false}/><XAxis dataKey="phase" tick={{ fill: "#9aabc1", fontSize: 12 }} axisLine={false} tickLine={false}/><YAxis tick={{ fill: "#788ba4", fontSize: 11 }} axisLine={false} tickLine={false}/><Tooltip content={<ChartTip/>}/><Bar dataKey="runs" name="Partnership runs" fill="#65e0bd" radius={[7,7,0,0]}/><Bar dataKey="extras" name="Extras" fill="#f6bd60" radius={[7,7,0,0]}/></BarChart></ResponsiveContainer></div> : <Empty title="Phase data not available">Regenerate the partnership export using the latest pipeline to populate phase breakdowns.</Empty>}
        </Panel>
        <Panel title="Record partnership" subtitle="Highest stand in the current selection">
          {best ? <div className="p2-record"><div className="p2-record-runs">{fmt(best.runs)}<small>RUNS</small></div><h3>{best.pair}</h3><p>{best.team} vs {best.opposition} · {best.season} · {best.venue}</p><div className="p2-tag-row"><span>{best.balls} balls</span><span>{rate(best.run_rate)} RR</span><span>Wicket {best.wicket_number}</span></div><button className="p2-text-btn" onClick={() => { setSelectedId(best.id); setTab("explorer"); }}>Inspect this stand →</button></div> : <Empty/>}
        </Panel>
        <Panel title="Top batting pairs" subtitle="Most partnership runs in this selection" action={<button className="p2-text-btn" onClick={() => setTab("pairs")}>Explore pairs →</button>}>
          <div className="p2-rank-list">{pairRows.slice(0, 5).map((x, i) => <div className="p2-rank" key={x.pair}><span className="p2-rank-no">{String(i + 1).padStart(2, "0")}</span><div><b>{x.pair}</b><small>{x.partnerships} stands · avg {rate(x.average_runs)}</small></div><strong>{fmt(x.runs)}</strong></div>)}</div>
        </Panel>
        <Panel title="Partnership scoring trend" subtitle="Average stand size and total partnerships by season" className="p2-span-2">
          <div className="p2-chart"><ResponsiveContainer><AreaChart data={trendRows}><defs><linearGradient id="p2trend" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#65e0bd" stopOpacity={0.28}/><stop offset="100%" stopColor="#65e0bd" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#253247" strokeDasharray="3 5" vertical={false}/><XAxis dataKey="season" tick={{ fill: "#9aabc1", fontSize: 11 }} axisLine={false} tickLine={false}/><YAxis tick={{ fill: "#788ba4", fontSize: 11 }} axisLine={false} tickLine={false}/><Tooltip content={<ChartTip/>}/><Area dataKey="average" name="Average partnership" stroke="#65e0bd" fill="url(#p2trend)" strokeWidth={2.5}/><Line dataKey="partnerships" name="Partnership count" stroke="#7aa7ff" strokeWidth={2} dot={false}/></AreaChart></ResponsiveContainer></div>
        </Panel>
      </div>
    </>}

    {tab === "explorer" && <>
      <div className="p2-section-intro"><div><h2>Partnership explorer</h2><p>Search individual stands, then open a scorecard to understand who contributed and how.</p></div><div className="p2-explorer-controls"><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search pair, team, opponent, venue…"/><select value={sort} onChange={e => setSort(e.target.value)}><option value="runs">Sort by runs</option><option value="run_rate">Sort by run rate</option><option value="balls">Sort by balls</option><option value="wicket_number">Sort by wicket</option></select></div></div>
      <div className="p2-card-grid">{visiblePartnerships.slice(0, 24).map((p, i) => <button className={`p2-partnership-card ${selected?.id === p.id ? "selected" : ""}`} key={p.id} onClick={() => setSelectedId(p.id)}><div className="p2-card-top"><span>#{i + 1} · {p.season}</span><span>{p.team}</span></div><h3>{p.pair}</h3><div className="p2-card-score"><strong>{fmt(p.runs)}</strong><span>runs</span><small>{p.balls} balls · {rate(p.run_rate)} RR</small></div><div className="p2-progress-track"><i style={{ width: `${Math.min(100, num(p.runs))}%` }}/></div><div className="p2-card-foot"><span>vs {p.opposition}</span><span>Wicket {p.wicket_number} ↗</span></div></button>)}</div>
      {selected && <Panel title={`${selected.pair} — partnership scorecard`} subtitle={`${selected.team} vs ${selected.opposition} · ${selected.date} · innings ${selected.innings}`} className="p2-detail-panel"><div className="p2-metrics p2-detail-metrics"><Metric label="Partnership runs" value={fmt(selected.runs)} accent/><Metric label={selected.batter1} value={fmt(selected.batter1_runs)} note={`${fmt(selected.batter1_balls)} balls faced`}/><Metric label={selected.batter2} value={fmt(selected.batter2_runs)} note={`${fmt(selected.batter2_balls)} balls faced`}/><Metric label="Extras" value={fmt(selected.extras)} note="Team runs not credited to batters"/><Metric label="Boundary runs" value={fmt(selected.boundary_runs ?? (num(selected.fours) * 4 + num(selected.sixes) * 6))} note={`${selected.fours} fours · ${selected.sixes} sixes`}/></div><div className="p2-detail-bottom"><span>{selected.start_over ? `Overs ${selected.start_over}–${selected.end_over}` : "Over span unavailable"}</span><span>{selected.dot_ball_pct == null ? "—" : pct(selected.dot_ball_pct)} dot deliveries</span><span>{selected.ended_by_wicket ? "Ended by wicket" : "Unfinished stand"}</span><button className="p2-text-btn" onClick={() => setTab("progression")}>View progression →</button></div></Panel>}
    </>}

    {tab === "pairs" && <>
      <div className="p2-section-intro"><div><h2>Pair intelligence</h2><p>Discover the combinations that repeatedly build runs, not just one-off big stands.</p></div><input className="p2-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Find a batting pair…"/></div>
      <div className="p2-card-grid p2-pair-grid">{pairRows.filter(x => x.pair.toLowerCase().includes(search.toLowerCase())).slice(0, 30).map((p, i) => <article className="p2-pair-card" key={p.pair}><div className="p2-pair-rank">TOP {i + 1}</div><h3>{p.pair}</h3><div className="p2-pair-total">{fmt(p.runs)} <small>career partnership runs</small></div><div className="p2-pair-stats"><span><b>{p.partnerships}</b><small>stands</small></span><span><b>{rate(p.average_runs)}</b><small>avg stand</small></span><span><b>{rate(p.run_rate)}</b><small>run rate</small></span><span><b>{fmt(p.matches)}</b><small>matches</small></span></div><div className="p2-pair-tags"><span>{p.fifties || 0} × 50+</span><span>{p.hundreds || 0} × 100+</span><span>Best {fmt(p.best_partnership ?? p.runs)}</span></div></article>)}</div>
    </>}

    {tab === "phases" && <>
      <div className="p2-phase-switch">{PHASES.map((x, i) => <button key={x} className={phase === x ? "active" : ""} onClick={() => setPhase(x)}><span>0{i + 1}</span>{x}<small>{i === 0 ? "Overs 1–6" : i === 1 ? "Overs 7–15" : "Overs 16–20"}</small></button>)}</div>
      {phaseRows.length ? <>
        <section className="p2-metrics"><Metric label={`${phase} partnership runs`} value={fmt(activePhase.runs)} note={`${fmt(activePhase.segments)} partnership segments`} accent/><Metric label="Average segment" value={rate(activePhase.average)} note="Runs per phase segment"/><Metric label="Phase run rate" value={rate(activePhase.run_rate)} note={`${fmt(activePhase.balls)} legal balls`}/><Metric label="Boundary count" value={fmt(activePhase.fours + activePhase.sixes)} note={`${activePhase.fours} fours · ${activePhase.sixes} sixes`}/><Metric label="Dot-ball rate" value={pct(activePhase.dot_pct)} note={`${fmt(activePhase.dots)} dot deliveries`}/></section>
        <div className="p2-grid p2-grid-main"><Panel title="Phase scoring profile" subtitle="Compare runs, batter contributions and extras"><div className="p2-chart p2-chart-lg"><ResponsiveContainer><BarChart data={[{name: phase, batter1: activePhase.batter1_runs, batter2: activePhase.batter2_runs, extras: activePhase.extras}]}><CartesianGrid stroke="#253247" strokeDasharray="3 5" vertical={false}/><XAxis dataKey="name" tick={{fill:"#9aabc1"}} axisLine={false}/><YAxis tick={{fill:"#788ba4",fontSize:11}} axisLine={false}/><Tooltip content={<ChartTip/>}/><Legend/><Bar dataKey="batter1" name="Batter 1 runs" stackId="a" fill="#65e0bd"/><Bar dataKey="batter2" name="Batter 2 runs" stackId="a" fill="#7aa7ff"/><Bar dataKey="extras" name="Extras" stackId="a" fill="#f6bd60" radius={[6,6,0,0]}/></BarChart></ResponsiveContainer></div></Panel><Panel title="Phase comparison" subtitle="How the three innings phases differ"><div className="p2-chart p2-chart-lg"><ResponsiveContainer><BarChart data={phaseSummary}><CartesianGrid stroke="#253247" strokeDasharray="3 5" vertical={false}/><XAxis dataKey="phase" tick={{fill:"#9aabc1",fontSize:11}} axisLine={false}/><YAxis tick={{fill:"#788ba4",fontSize:11}} axisLine={false}/><Tooltip content={<ChartTip/>}/><Bar dataKey="run_rate" name="Run rate" fill="#7aa7ff" radius={[6,6,0,0]}/></BarChart></ResponsiveContainer></div><div className="p2-phase-mini">{phaseSummary.map(x=><button key={x.phase} className={phase===x.phase?"active":""} onClick={()=>setPhase(x.phase)}><b>{x.phase}</b><strong>{rate(x.run_rate)}</strong><small>run rate</small></button>)}</div></Panel></div>
        <Panel title={`${phase} partnership highlights`} subtitle="Select a stand to inspect its match context and individual output"><div className="p2-highlight-list">{activePhaseRows.slice(0, 12).map((p, i)=><button key={`${p.partnership_id}-${i}`} className="p2-highlight" onClick={() => { setSelectedId(p.partnership_id); setTab("explorer"); }}><span className="p2-highlight-index">{String(i+1).padStart(2,"0")}</span><span className="p2-highlight-main"><b>{p.pair}</b><small>{p.team} vs {p.opposition} · {p.season} · wicket {p.wicket_number}</small></span><strong>{fmt(p.runs)}<small>runs</small></strong><span className="p2-highlight-rate">{rate(p.run_rate)} RR</span><span className="p2-highlight-arrow">↗</span></button>)}</div></Panel>
      </> : <Empty title="Phase records are missing from this export">The page can derive phase segments from each partnership's <code>phase_splits</code>. No phase segments were found either there or in the exported phase index. Run the latest cumulative pipeline from the repository root and refresh the page.</Empty>}
    </>}

    {tab === "progression" && <>
      <div className="p2-section-intro"><div><h2>Partnership progression</h2><p>Track how a stand builds momentum over the overs it shares at the crease.</p></div><select className="p2-large-select" value={selected?.id || ""} onChange={e => setSelectedId(e.target.value)}><option value="">Select a partnership</option>{progressionOptions.map(p=><option key={p.id} value={p.id}>{p.pair} · {p.team} · {p.season} · {p.runs} runs</option>)}</select></div>
      {selected && progression.length ? <><div className="p2-feature-strip"><div><small>PARTNERSHIP</small><b>{selected.pair}</b></div><div><small>RUNS</small><b>{fmt(selected.runs)}</b></div><div><small>OVERS ACTIVE</small><b>{safe(selected.start_over)}–{safe(selected.end_over)}</b></div><div><small>RUN RATE</small><b>{rate(selected.run_rate)}</b></div></div><Panel title="Cumulative scoring journey" subtitle="Each point is the cumulative partnership score at the end of that over"><div className="p2-chart p2-chart-xl"><ResponsiveContainer><AreaChart data={progression}><defs><linearGradient id="p2cum" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#65e0bd" stopOpacity={0.35}/><stop offset="100%" stopColor="#65e0bd" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#253247" strokeDasharray="3 5" vertical={false}/><XAxis dataKey="over" tick={{fill:"#9aabc1"}} tickFormatter={v=>`Ov ${v}`} axisLine={false}/><YAxis tick={{fill:"#788ba4",fontSize:11}} axisLine={false}/><Tooltip content={<ChartTip/>}/><Area dataKey="cumulative_runs" name="Cumulative runs" stroke="#65e0bd" fill="url(#p2cum)" strokeWidth={3}/><Line dataKey="runs" name="Runs in over" stroke="#f6bd60" strokeWidth={2} dot={{r:3}}/></AreaChart></ResponsiveContainer></div></Panel><div className="p2-grid p2-grid-main"><Panel title="Who scored the runs?" subtitle="Batter contributions across the partnership"><div className="p2-chart p2-chart-donut"><ResponsiveContainer><PieChart><Pie data={[{name:selected.batter1,value:num(selected.batter1_runs)},{name:selected.batter2,value:num(selected.batter2_runs)},{name:"Extras",value:num(selected.extras)}].filter(x=>x.value>0)} dataKey="value" nameKey="name" innerRadius={65} outerRadius={100} paddingAngle={3}>{COLORS.slice(0,3).map((c,i)=><Cell key={i} fill={c}/>)}</Pie><Tooltip/><Legend/></PieChart></ResponsiveContainer></div></Panel><Panel title="Over-by-over output" subtitle="Select an over to see the detail"><div className="p2-over-grid">{progression.map(o=><div className="p2-over-card" key={o.over}><span>OVER {o.over}</span><b>{fmt(o.runs)} <small>runs</small></b><div>{o.phase} · {o.legal_balls} legal balls</div><small>{o.batter1_runs} + {o.batter2_runs} batter runs · {o.extras} extras</small></div>)}</div></Panel></div></> : <Empty title="No progression data available">Select a partnership with over-by-over records. If none are available, regenerate the JSON with the latest pipeline.</Empty>}
    </>}

    {tab === "teams" && <>
      <div className="p2-section-intro"><div><h2>Team intelligence</h2><p>Compare how franchises build partnerships across seasons.</p></div><Select label="Focus team" value={teamFocus} onChange={setTeamFocus} options={teams}/></div>
      {teamRows.length ? <><div className="p2-card-grid p2-team-grid">{teamRows.slice(0, 12).map((x,i)=><button key={x.team} className={`p2-team-card ${teamFocus===x.team?"selected":""}`} onClick={()=>setTeamFocus(teamFocus===x.team?"All":x.team)}><span>TEAM {String(i+1).padStart(2,"0")}</span><b>{x.team}</b><strong>{fmt(x.runs)}</strong><small>{fmt(x.partnerships)} partnerships · {rate(x.average_runs)} avg · {rate(x.run_rate)} RR</small><div className="p2-mini-track"><i style={{width:`${Math.max(4,100*num(x.runs)/Math.max(1,...teamRows.map(t=>num(t.runs)) ))}%`}}/></div></button>)}</div><Panel title="Season-by-season partnership output" subtitle={teamFocus === "All" ? "Select a team above to isolate its season profile" : `Season trend for ${teamFocus}`}><div className="p2-chart p2-chart-lg"><ResponsiveContainer><BarChart data={teamSeasonRows.filter(x=>teamFocus==="All"||x.team===teamFocus)}><CartesianGrid stroke="#253247" strokeDasharray="3 5" vertical={false}/><XAxis dataKey="season" tick={{fill:"#9aabc1"}}/><YAxis tick={{fill:"#788ba4",fontSize:11}}/><Tooltip content={<ChartTip/>}/><Bar dataKey="runs" name="Partnership runs" fill="#65e0bd" radius={[6,6,0,0]}/></BarChart></ResponsiveContainer></div></Panel></> : <Empty title="Team intelligence unavailable">Run the cumulative pipeline containing team_intelligence.</Empty>}
    </>}

    {tab === "opposition" && <>
      <div className="p2-section-intro"><div><h2>Opposition intelligence</h2><p>Directional view: the selected team batting against each opponent.</p></div><div className="p2-explorer-controls"><Select label="Batting team" value={teamFocus} onChange={v=>{setTeamFocus(v);setOpponentFocus("All");}} options={teams}/><Select label="Opponent" value={opponentFocus} onChange={setOpponentFocus} options={teams.filter(x=>x!==teamFocus)}/></div></div>
      {oppositionRows.length ? <><section className="p2-metrics"><Metric label="Opposition records" value={fmt(oppositionRows.length)} note="Directional team matchups"/><Metric label="Partnership runs" value={fmt(oppositionRows.reduce((s,x)=>s+num(x.runs),0))} note="Across displayed opponents" accent/><Metric label="Best matchup average" value={rate(Math.max(...oppositionRows.map(x=>num(x.average_runs))))} note="Runs per partnership"/><Metric label="Highest partnership" value={fmt(Math.max(...oppositionRows.map(x=>num(x.best_partnership))))} note="Single stand"/></section><Panel title="Partnership output against opponents" subtitle="Select a bar to focus on one opponent"><div className="p2-chart p2-chart-xl"><ResponsiveContainer><BarChart data={oppositionRows.slice().sort((a,b)=>b.runs-a.runs).slice(0,14)} layout="vertical" margin={{left:24}}><CartesianGrid stroke="#253247" strokeDasharray="3 5" horizontal={false}/><XAxis type="number" tick={{fill:"#788ba4",fontSize:11}}/><YAxis type="category" dataKey="opposition" width={145} tick={{fill:"#9aabc1",fontSize:11}}/><Tooltip content={<ChartTip/>}/><Bar dataKey="runs" name="Partnership runs" fill="#7aa7ff" radius={[0,7,7,0]} onClick={x=>setOpponentFocus(x.opposition)}/></BarChart></ResponsiveContainer></div></Panel><div className="p2-card-grid">{oppositionRows.slice().sort((a,b)=>b.runs-a.runs).slice(0,12).map(x=><button className={`p2-context-card ${opponentFocus===x.opposition?"selected":""}`} key={`${x.team}-${x.opposition}`} onClick={()=>setOpponentFocus(x.opposition)}><span>{x.team} vs</span><b>{x.opposition}</b><strong>{fmt(x.runs)} <small>runs</small></strong><div>{x.partnerships} stands · avg {rate(x.average_runs)} · RR {rate(x.run_rate)}</div><small>Best: {fmt(x.best_partnership)} · {x.best_pair || "—"}</small></button>)}</div></> : <Empty title="No opposition records match">Choose a batting team or clear the opponent filter.</Empty>}
    </>}

    {tab === "venues" && <>
      <div className="p2-section-intro"><div><h2>Venue intelligence</h2><p>Understand how partnership scoring behaves across different grounds.</p></div><Select label="Focus venue" value={venueFocus} onChange={setVenueFocus} options={venues}/></div>
      {venueRows.length ? <><div className="p2-card-grid p2-venue-grid">{venueRows.slice().sort((a,b)=>b.runs-a.runs).slice(0,18).map((x,i)=><button className={`p2-venue-card ${venueFocus===x.venue?"selected":""}`} key={x.venue} onClick={()=>setVenueFocus(venueFocus===x.venue?"All":x.venue)}><span>GROUND {String(i+1).padStart(2,"0")}</span><b>{x.venue}</b><strong>{fmt(x.runs)}</strong><small>{x.partnerships} stands · avg {rate(x.average_runs)} · RR {rate(x.run_rate)}</small><div className="p2-mini-track"><i style={{width:`${Math.max(4,100*num(x.runs)/Math.max(1,...venueRows.map(v=>num(v.runs))))}%`}}/></div></button>)}</div><Panel title="Venue comparison" subtitle="Total partnership runs and average stand"><div className="p2-chart p2-chart-xl"><ResponsiveContainer><BarChart data={venueRows.slice().sort((a,b)=>b.runs-a.runs).slice(0,12)}><CartesianGrid stroke="#253247" strokeDasharray="3 5" vertical={false}/><XAxis dataKey="venue" tick={{fill:"#9aabc1",fontSize:10}} interval={0} angle={-18} textAnchor="end" height={65}/><YAxis tick={{fill:"#788ba4",fontSize:11}}/><Tooltip content={<ChartTip/>}/><Bar dataKey="runs" name="Partnership runs" fill="#65e0bd" radius={[6,6,0,0]}/></BarChart></ResponsiveContainer></div></Panel></> : <Empty title="Venue intelligence unavailable">Run the cumulative pipeline containing venue_intelligence.</Empty>}
    </>}

    {tab === "wickets" && <>
      <div className="p2-section-intro"><div><h2>Wicket-wise intelligence</h2><p>See how partnership value changes as the innings progresses through wicket positions.</p></div></div>
      {wicketRows.length ? <><Panel title="Average partnership by wicket" subtitle="Tap a column to filter the entire page to that wicket"><div className="p2-chart p2-chart-xl"><ResponsiveContainer><BarChart data={wicketRows} onClick={e=>{if(e?.activePayload?.[0])setWicket(String(e.activePayload[0].payload.wicket_number));}}><CartesianGrid stroke="#253247" strokeDasharray="3 5" vertical={false}/><XAxis dataKey="wicket_number" tick={{fill:"#9aabc1"}} tickFormatter={x=>`${x}${["st","nd","rd"][x-1]||"th"}`}/><YAxis tick={{fill:"#788ba4",fontSize:11}}/><Tooltip content={<ChartTip/>}/><Bar dataKey="average_runs" name="Average partnership" fill="#f6bd60" radius={[6,6,0,0]}/></BarChart></ResponsiveContainer></div></Panel><div className="p2-card-grid p2-wicket-grid">{wicketRows.map(x=><button key={x.wicket_number} className={`p2-wicket-card ${wicket===String(x.wicket_number)?"selected":""}`} onClick={()=>setWicket(wicket===String(x.wicket_number)?"All":String(x.wicket_number))}><span>WICKET {x.wicket_number}</span><strong>{rate(x.average_runs)}</strong><small>average runs</small><div>{fmt(x.partnerships)} stands · {fmt(x.runs)} total runs</div><small>{fmt(x.dismissal_ended_partnerships)} ended by wicket · {fmt(x.unfinished_partnerships)} unfinished</small></button>)}</div></> : <Empty title="Wicket intelligence unavailable">Run the cumulative pipeline containing wicket_intelligence.</Empty>}
    </>}

    {tab === "trends" && <><div className="p2-section-intro"><div><h2>Season trends</h2><p>Track partnership volume, average stand size and scoring rate over time.</p></div></div><div className="p2-grid p2-grid-main"><Panel title="Partnership runs by season" subtitle="Total runs added in partnership across seasons" className="p2-span-2"><div className="p2-chart p2-chart-xl"><ResponsiveContainer><AreaChart data={trendRows}><defs><linearGradient id="p2season" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#7aa7ff" stopOpacity={0.3}/><stop offset="100%" stopColor="#7aa7ff" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#253247" strokeDasharray="3 5" vertical={false}/><XAxis dataKey="season" tick={{fill:"#9aabc1"}}/><YAxis tick={{fill:"#788ba4",fontSize:11}}/><Tooltip content={<ChartTip/>}/><Area dataKey="runs" name="Partnership runs" stroke="#7aa7ff" fill="url(#p2season)" strokeWidth={2.5}/></AreaChart></ResponsiveContainer></div></Panel><Panel title="Average stand by season" subtitle="Mean partnership runs"><div className="p2-chart"><ResponsiveContainer><LineChart data={trendRows}><CartesianGrid stroke="#253247" strokeDasharray="3 5" vertical={false}/><XAxis dataKey="season" tick={{fill:"#9aabc1",fontSize:10}}/><YAxis tick={{fill:"#788ba4",fontSize:11}}/><Tooltip content={<ChartTip/>}/><Line dataKey="average" name="Average stand" stroke="#65e0bd" strokeWidth={3} dot={{r:3}}/></LineChart></ResponsiveContainer></div></Panel><Panel title="Scoring rate trend" subtitle="Runs per six legal balls"><div className="p2-chart"><ResponsiveContainer><LineChart data={trendRows}><CartesianGrid stroke="#253247" strokeDasharray="3 5" vertical={false}/><XAxis dataKey="season" tick={{fill:"#9aabc1",fontSize:10}}/><YAxis tick={{fill:"#788ba4",fontSize:11}}/><Tooltip content={<ChartTip/>}/><Line dataKey="run_rate" name="Run rate" stroke="#f6bd60" strokeWidth={3} dot={{r:3}}/></LineChart></ResponsiveContainer></div></Panel></div></>}

    <footer className="p2-footer">Cricsheet IPL ball-by-ball data · {fmt(all.length)} partnership records · Partnership runs include extras; partnership balls count legal deliveries only.</footer>
  </main>;
}
