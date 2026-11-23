import React, { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  BarChart, Bar, Legend,
} from "recharts";
import "./player-intelligence.css";

const fmt = (v, d = 1) => v == null || !Number.isFinite(Number(v)) ? "—" : Number(v).toFixed(d);
const nfmt = (v) => Number(v || 0).toLocaleString("en-IN");
const PHASES = ["Powerplay", "Middle", "Death"];
const EMPTY_LINE = { runs: 0, balls: 0, dismissals: 0, fours: 0, sixes: 0, wickets: 0, runs_conceded: 0, dots: 0, dot_balls: 0, boundary_runs: 0 };

function statsFor(player, season) {
  if (!player) return { batting: EMPTY_LINE, bowling: EMPTY_LINE, seasonStats: [] };
  if (season === "all") return { batting: player.batting || EMPTY_LINE, bowling: player.bowling || EMPTY_LINE, seasonStats: player.season_stats || [] };
  const row = (player.season_stats || []).find((x) => String(x.season) === String(season));
  return { batting: row?.batting || EMPTY_LINE, bowling: row?.bowling || EMPTY_LINE, seasonStats: row ? [row] : [] };
}

export default function PlayerIntelligence() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [season, setSeason] = useState("all");
  const [role, setRole] = useState("all");
  const [sort, setSort] = useState("runs");
  const [selectedId, setSelectedId] = useState("");
  const [compareIds, setCompareIds] = useState([]);
  const [tab, setTab] = useState("overview");
  const [matchupQuery, setMatchupQuery] = useState("");

  useEffect(() => {
    fetch("/data/player_intelligence.json", { cache: "no-store" })
      .then((r) => { if (!r.ok) throw new Error("Player export not found. Run the Python pipeline first."); return r.json(); })
      .then((j) => { setData(j); setSelectedId(j.players?.[0]?.id || ""); })
      .catch((e) => setError(e.message));
  }, []);

  const players = data?.players || [];
  const seasons = data?.meta?.seasons || [];
  const phaseRows = data?.phase_splits || [];
  const matchups = data?.matchups || [];

  const filtered = useMemo(() => players.filter((p) => {
    const seasonOk = season === "all" || (p.season_stats || []).some((x) => String(x.season) === String(season));
    const roleOk = role === "all" || p.role === role;
    const queryOk = !query.trim() || p.name.toLowerCase().includes(query.trim().toLowerCase());
    return seasonOk && roleOk && queryOk;
  }).sort((a, b) => {
    const av = statsFor(a, season), bv = statsFor(b, season);
    const aa = sort === "wickets" ? av.bowling.wickets : sort === "sr" ? (av.batting.strike_rate || 0) : sort === "average" ? (av.batting.average || 0) : sort === "economy" ? -(av.bowling.economy || 0) : av.batting.runs;
    const bb = sort === "wickets" ? bv.bowling.wickets : sort === "sr" ? (bv.batting.strike_rate || 0) : sort === "average" ? (bv.batting.average || 0) : sort === "economy" ? -(bv.bowling.economy || 0) : bv.batting.runs;
    return bb - aa;
  }), [players, season, role, query, sort]);

  useEffect(() => {
    if (filtered.length && !filtered.some((p) => p.id === selectedId)) setSelectedId(filtered[0].id);
  }, [filtered, selectedId]);

  const selected = filtered.find((p) => p.id === selectedId) || filtered[0] || null;
  const selectedStats = statsFor(selected, season);
  const selectedBat = selectedStats.batting;
  const selectedBowl = selectedStats.bowling;
  const selectedSeasonStats = selectedStats.seasonStats;

  const selectedPhases = useMemo(() => PHASES.map((phase) => {
    const rows = phaseRows.filter((x) => x.player_id === selected?.id && x.phase === phase && (season === "all" || String(x.season) === String(season)));
    const bat = rows.reduce((a, x) => { for (const k of ["runs", "balls", "fours", "sixes", "dismissals", "dot_balls"]) a[k] = (a[k] || 0) + (x.batting?.[k] || 0); return a; }, {});
    const bowl = rows.reduce((a, x) => { for (const k of ["runs_conceded", "balls", "wickets", "dots"]) a[k] = (a[k] || 0) + (x.bowling?.[k] || 0); return a; }, {});
    return { phase, runs: bat.runs || 0, balls: bat.balls || 0, strike_rate: bat.balls ? 100 * bat.runs / bat.balls : 0, wickets: bowl.wickets || 0, economy: bowl.balls ? 6 * bowl.runs_conceded / bowl.balls : 0 };
  }), [phaseRows, selected?.id, season]);

  const selectedMatchups = useMemo(() => matchups
    .filter((m) => m.batter_id === selected?.id || m.bowler_id === selected?.id)
    .filter((m) => season === "all" || String(m.season) === String(season))
    .filter((m) => !matchupQuery || (m.batter_id === selected?.id ? m.bowler : m.batter).toLowerCase().includes(matchupQuery.toLowerCase()))
    .sort((a, b) => b.balls - a.balls).slice(0, 50), [matchups, selected?.id, season, matchupQuery]);

  const comparePlayers = compareIds.map((id) => filtered.find((p) => p.id === id)).filter(Boolean);
  const kpis = [
    ["Player profiles", nfmt(players.length)], ["Matches parsed", nfmt(data?.meta?.matches_parsed)],
    ["Season coverage", seasons.length ? `${seasons[0]}–${seasons[seasons.length - 1]}` : "—"], ["Batter–bowler records", nfmt(matchups.length)],
  ];

  if (error) return <div className="pi-shell"><div className="pi-empty"><h2>Player Intelligence data unavailable</h2><p>{error}</p><p>Run <code>python player_intelligence_pipeline.py</code> from the project root, then refresh.</p></div></div>;
  if (!data) return <div className="pi-shell"><div className="pi-empty">Loading player intelligence…</div></div>;

  return <div className="pi-shell">
    <section className="pi-hero">
      <div><div className="pi-eyebrow">CRICKET ANALYTICS LAB <span>/</span> SCOUTING INTELLIGENCE</div><h2>Player Intelligence</h2><p>Explore player output, role profiles, phase impact and head-to-head matchups across the IPL archive.</p></div>
      <div className="pi-hero-meta"><span className="pi-live-dot"/> CRICSHEET BALL-BY-BALL <b>{data.meta.generated?.slice(0, 10)}</b></div>
    </section>
    <section className="pi-kpis">{kpis.map(([label, value]) => <div className="pi-kpi" key={label}><span>{label}</span><b>{value}</b></div>)}</section>

    <section className="pi-controlbar">
      <div className="pi-control-heading"><div><span className="pi-eyebrow">SCOUTING CONTROLS</span><b>Global filters</b></div><button className="pi-reset" onClick={() => { setSeason("all"); setRole("all"); setQuery(""); setSort("runs"); setMatchupQuery(""); }}>Reset all</button></div>
      <div className="pi-filters">
        <label className="pi-search"><span>Search player</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by player name…" /></label>
        <label><span>Season · applies to every panel</span><select value={season} onChange={(e) => setSeason(e.target.value)}><option value="all">All IPL seasons</option>{seasons.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
        <label><span>Player role</span><select value={role} onChange={(e) => setRole(e.target.value)}><option value="all">All roles</option>{["Batter", "Bowler", "All-rounder", "Other"].map((x) => <option key={x} value={x}>{x}</option>)}</select></label>
        <label><span>Rank players by</span><select value={sort} onChange={(e) => setSort(e.target.value)}><option value="runs">Most runs</option><option value="wickets">Most wickets</option><option value="average">Batting average</option><option value="sr">Strike rate</option><option value="economy">Bowling economy</option></select></label>
      </div>
      <div className="pi-filter-note">{season === "all" ? "Showing career totals and all-season matchup records." : `Every player statistic, phase split, comparison and matchup is scoped to IPL ${season}.`} <b>{filtered.length.toLocaleString("en-IN")} players</b> match the current filters.</div>
    </section>

    <div className="pi-layout">
      <aside className="pi-directory"><div className="pi-panel-head"><div><b>Player directory</b><small>Ranked by {sort === "runs" ? "runs" : sort === "wickets" ? "wickets" : sort === "sr" ? "strike rate" : sort === "average" ? "average" : "economy"}</small></div><span className="pi-count">{filtered.length}</span></div>
        <div className="pi-player-list">{filtered.map((p, i) => { const st = statsFor(p, season); const score = sort === "wickets" ? nfmt(st.bowling.wickets) : sort === "sr" ? fmt(st.batting.strike_rate, 0) : sort === "average" ? fmt(st.batting.average, 1) : sort === "economy" ? fmt(st.bowling.economy, 1) : nfmt(st.batting.runs); return <button key={p.id} className={`pi-player-row ${selected?.id === p.id ? "active" : ""}`} onClick={() => setSelectedId(p.id)}><span className="pi-rank">{String(i + 1).padStart(2, "0")}</span><span className="pi-player-ident"><b>{p.name}</b><small>{p.role} <i>·</i> {p.matches} matches</small></span><span className="pi-player-score">{score}</span></button>; })}{!filtered.length && <div className="pi-empty-small">No players match these filters.</div>}</div>
      </aside>

      {selected ? <main className="pi-profile">
        <section className="pi-profile-head"><div><span className={`pi-tag pi-role-${selected.role.toLowerCase().replace(/[^a-z]+/g, "-")}`}>{selected.role}</span><h3>{selected.name}</h3><p>{selected.matches} matches in indexed data <i>·</i> {season === "all" ? `${selected.seasons?.[0]}–${selected.seasons?.[selected.seasons.length - 1]}` : `IPL ${season} season view`}</p></div><button className={`pi-compare-btn ${compareIds.includes(selected.id) ? "selected" : ""}`} onClick={() => setCompareIds((old) => old.includes(selected.id) ? old.filter((x) => x !== selected.id) : [...old, selected.id].slice(-4))}>{compareIds.includes(selected.id) ? "✓ In comparison" : "+ Add to compare"}</button></section>
        <nav className="pi-tabs">{[["overview", "Overview"], ["batting", "Batting"], ["bowling", "Bowling"], ["matchups", "Matchups"], ["compare", "Compare"]].map(([id, label]) => <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{label}</button>)}</nav>

        {tab === "overview" && <>
          <div className="pi-stat-grid"><div><span>Runs scored</span><b>{nfmt(selectedBat.runs)}</b><small>{nfmt(selectedBat.balls)} balls faced</small></div><div><span>Batting average</span><b>{fmt(selectedBat.average, 2)}</b><small>Runs per dismissal</small></div><div><span>Strike rate</span><b>{fmt(selectedBat.strike_rate, 1)}</b><small>{nfmt(selectedBat.fours)} fours · {nfmt(selectedBat.sixes)} sixes</small></div><div><span>Wickets</span><b>{nfmt(selectedBowl.wickets)}</b><small>Bowler-credited wickets</small></div><div><span>Bowling economy</span><b>{fmt(selectedBowl.economy, 2)}</b><small>{selectedBowl.overs || "0.0"} overs</small></div><div><span>Boundary runs</span><b>{nfmt(selectedBat.boundary_runs)}</b><small>Runs from fours and sixes</small></div></div>
          <div className="pi-chart-grid"><div className="pi-card"><div className="pi-card-title"><div><b>Season batting trend</b><small>{season === "all" ? "Career timeline" : `Selected season: ${season}`}</small></div></div><div className="pi-chart"><ResponsiveContainer><LineChart data={selectedSeasonStats}><CartesianGrid strokeDasharray="3 3" stroke="var(--pi-grid)"/><XAxis dataKey="season"/><YAxis/><Tooltip/><Legend/><Line type="monotone" dataKey="batting.runs" name="Runs" stroke="#5687ee" strokeWidth={2.5} dot={false}/><Line type="monotone" dataKey="batting.strike_rate" name="Strike rate" stroke="#e4a64b" strokeWidth={2} dot={false}/></LineChart></ResponsiveContainer></div></div>
            <div className="pi-card"><div className="pi-card-title"><div><b>Phase impact</b><small>Powerplay · Middle · Death</small></div></div><div className="pi-chart"><ResponsiveContainer><BarChart data={selectedPhases}><CartesianGrid strokeDasharray="3 3" stroke="var(--pi-grid)"/><XAxis dataKey="phase"/><YAxis/><Tooltip/><Legend/><Bar dataKey="runs" name="Batting runs" fill="#5687ee" radius={[5, 5, 0, 0]}/><Bar dataKey="wickets" name="Bowling wickets" fill="#25a987" radius={[5, 5, 0, 0]}/></BarChart></ResponsiveContainer></div></div></div>
          <div className="pi-card"><div className="pi-card-title"><div><b>Season performance ledger</b><small>Season selector above controls this table too</small></div></div><div className="pi-table-wrap"><table><thead><tr><th>Season</th><th>Runs</th><th>Avg</th><th>SR</th><th>4s</th><th>6s</th><th>Wickets</th><th>Economy</th></tr></thead><tbody>{selectedSeasonStats.map((x) => <tr key={x.season}><td>{x.season}</td><td>{nfmt(x.batting.runs)}</td><td>{fmt(x.batting.average, 2)}</td><td>{fmt(x.batting.strike_rate, 1)}</td><td>{x.batting.fours}</td><td>{x.batting.sixes}</td><td>{x.bowling.wickets}</td><td>{fmt(x.bowling.economy, 2)}</td></tr>)}</tbody></table></div></div>
        </>}
        {tab === "batting" && <div className="pi-card"><div className="pi-card-title"><div><b>Batting profile</b><small>{season === "all" ? "Career totals" : `IPL ${season} only`}</small></div></div><div className="pi-stat-grid"><div><span>Runs</span><b>{nfmt(selectedBat.runs)}</b></div><div><span>Average</span><b>{fmt(selectedBat.average, 2)}</b></div><div><span>Strike rate</span><b>{fmt(selectedBat.strike_rate, 2)}</b></div><div><span>Balls faced</span><b>{nfmt(selectedBat.balls)}</b></div><div><span>Fours / Sixes</span><b>{selectedBat.fours || 0} / {selectedBat.sixes || 0}</b></div><div><span>Dot-ball rate</span><b>{fmt(selectedBat.dot_pct, 1)}%</b></div></div></div>}
        {tab === "bowling" && <div className="pi-card"><div className="pi-card-title"><div><b>Bowling profile</b><small>{season === "all" ? "Career totals" : `IPL ${season} only`}</small></div></div><div className="pi-stat-grid"><div><span>Wickets</span><b>{nfmt(selectedBowl.wickets)}</b></div><div><span>Economy</span><b>{fmt(selectedBowl.economy, 2)}</b></div><div><span>Average</span><b>{fmt(selectedBowl.average, 2)}</b></div><div><span>Strike rate</span><b>{fmt(selectedBowl.strike_rate, 2)}</b></div><div><span>Dot-ball rate</span><b>{fmt(selectedBowl.dot_pct, 1)}%</b></div><div><span>Overs</span><b>{selectedBowl.overs || "0.0"}</b></div></div><div className="pi-chart"><ResponsiveContainer><BarChart data={selectedPhases}><CartesianGrid strokeDasharray="3 3" stroke="var(--pi-grid)"/><XAxis dataKey="phase"/><YAxis/><Tooltip/><Legend/><Bar dataKey="wickets" name="Wickets" fill="#25a987"/><Bar dataKey="economy" name="Economy" fill="#e4a64b"/></BarChart></ResponsiveContainer></div></div>}
        {tab === "matchups" && <div className="pi-card"><div className="pi-card-title"><div><b>Head-to-head matchup explorer</b><small>{season === "all" ? "All seasons" : `IPL ${season}`} · bowler-credited dismissals only</small></div><input className="pi-inline-search" value={matchupQuery} onChange={(e) => setMatchupQuery(e.target.value)} placeholder="Filter opponent…"/></div><div className="pi-table-wrap"><table><thead><tr><th>Opponent</th><th>Season</th><th>Role</th><th>Balls</th><th>Runs</th><th>Dismissals</th><th>SR</th><th>Average</th></tr></thead><tbody>{selectedMatchups.map((m, i) => { const batting = m.batter_id === selected.id; return <tr key={`${m.batter_id}-${m.bowler_id}-${m.season}-${i}`}><td>{batting ? m.bowler : m.batter}</td><td>{m.season}</td><td>{batting ? "Bowler faced" : "Batter bowled to"}</td><td>{m.balls}</td><td>{m.runs}</td><td>{m.dismissals}</td><td>{fmt(m.strike_rate, 1)}</td><td>{fmt(m.average, 1)}</td></tr>; })}</tbody></table>{!selectedMatchups.length && <div className="pi-empty-small">No matchup records for this player and season.</div>}</div></div>}
        {tab === "compare" && <div className="pi-card"><div className="pi-card-title"><div><b>Player comparison</b><small>Up to four players · current season filter applies to every comparison</small></div><button className="pi-reset" onClick={() => setCompareIds([])}>Clear</button></div>{comparePlayers.length < 2 ? <p className="pi-empty-small">Add at least two players from the directory. Players outside the current filters are excluded.</p> : <><div className="pi-compare-grid">{comparePlayers.map((p) => { const st = statsFor(p, season); return <div key={p.id}><b>{p.name}</b><span>{p.role}</span><strong>{nfmt(st.batting.runs)} runs</strong><small>Avg {fmt(st.batting.average, 1)} · SR {fmt(st.batting.strike_rate, 1)}</small><small>{st.bowling.wickets} wkts · Econ {fmt(st.bowling.economy, 2)}</small><button onClick={() => setCompareIds((old) => old.filter((x) => x !== p.id))}>Remove</button></div>; })}</div><div className="pi-chart"><ResponsiveContainer><BarChart data={comparePlayers.map((p) => { const st = statsFor(p, season); return { player: p.name, runs: st.batting.runs, wickets: st.bowling.wickets }; })}><CartesianGrid strokeDasharray="3 3" stroke="var(--pi-grid)"/><XAxis dataKey="player"/><YAxis/><Tooltip/><Legend/><Bar dataKey="runs" name="Runs" fill="#5687ee"/><Bar dataKey="wickets" name="Wickets" fill="#25a987"/></BarChart></ResponsiveContainer></div></>}</div>}
      </main> : <div className="pi-no-selection">No players match the current filters. Clear a filter or choose another season.</div>}
    </div>
    <div className="pi-footnote">Role labels are workload-based estimates, not official squad designations. Batting balls faced exclude wides; bowler balls exclude wides and no-balls. Matchup dismissals count bowler-credited wickets only. Phase boundaries: overs 1–6, 7–15 and 16–20.</div>
  </div>;
}
