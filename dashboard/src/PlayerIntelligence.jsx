import React, { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  BarChart, Bar, Legend, RadarChart, Radar, PolarGrid, PolarAngleAxis,
  PolarRadiusAxis, AreaChart, Area, PieChart, Pie, Cell,
} from "recharts";
import "./player-intelligence.css";

const COLORS = ["#6C63FF", "#19B5A5", "#FF9F43", "#EC6090", "#4D9DE0", "#A78BFA"];
const PHASES = ["Powerplay", "Middle", "Death"];
const fmt = (v, d = 1) => v == null || !Number.isFinite(Number(v)) ? "—" : Number(v).toFixed(d);
const num = (v) => Number(v || 0);
const compact = (v) => num(v).toLocaleString("en-IN");
const safePct = (v) => v == null ? "—" : `${fmt(v, 0)}%`;
const initials = (name = "") => name.split(/\s+/).slice(0, 2).map(x => x[0] || "").join("").toUpperCase();
const getStats = (player, season) => {
  if (!player) return { batting: {}, bowling: {}, battingIntel: {}, bowlingIntel: {}, seasons: [] };
  const seasons = player.season_stats || [];
  if (season === "all") return {
    batting: player.batting || {}, bowling: player.bowling || {},
    battingIntel: player.batting_intelligence || {}, bowlingIntel: player.bowling_intelligence || {},
    seasons,
  };
  const row = seasons.find(x => String(x.season) === String(season));
  return {
    batting: row?.batting || {}, bowling: row?.bowling || {},
    battingIntel: row?.batting_intelligence || {}, bowlingIntel: row?.bowling_intelligence || {},
    seasons: row ? [row] : [],
  };
};
const metricLabel = (key) => ({
  "batting.average": "Batting average", "batting.strike_rate": "Strike rate",
  "batting.dot_pct": "Batting dot-ball rate", "batting.boundary_pct": "Boundary rate",
  "bowling.economy": "Bowling economy", "bowling.average": "Bowling average",
  "bowling.strike_rate": "Bowling strike rate", "bowling.dot_pct": "Bowling dot-ball rate",
}[key] || key);
const metricValue = (player, key) => {
  const [section, field] = key.split(".");
  return player?.[section]?.[field];
};

function MetricCard({ label, value, note, tone = "violet", suffix = "" }) {
  return <div className={`pi-metric pi-tone-${tone}`}><span>{label}</span><strong>{value == null ? "—" : `${value}${suffix}`}</strong>{note && <small>{note}</small>}</div>;
}
function SectionTitle({ eyebrow, title, note, action }) {
  return <div className="pi-section-title"><div><span className="pi-eyebrow">{eyebrow}</span><h3>{title}</h3>{note && <p>{note}</p>}</div>{action}</div>;
}
function EmptyState({ title, detail }) {
  return <div className="pi-empty-state"><div className="pi-empty-icon">✦</div><b>{title}</b><span>{detail}</span></div>;
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
  const [view, setView] = useState("discover");
  const [matchupSearch, setMatchupSearch] = useState("");
  const [targetId, setTargetId] = useState("");
  const [teamName, setTeamName] = useState("");
  const [teamSeason, setTeamSeason] = useState("all");
  const [showAllPlayers, setShowAllPlayers] = useState(false);

  useEffect(() => {
    fetch("/data/player_intelligence.json", { cache: "no-store" })
      .then(r => { if (!r.ok) throw new Error("Player intelligence export not found. Run python player_intelligence_pipeline.py first."); return r.json(); })
      .then(j => { setData(j); setSelectedId(j.players?.[0]?.id || ""); setTargetId(j.players?.[0]?.id || ""); })
      .catch(e => setError(e.message));
  }, []);

  const players = data?.players || [];
  const seasons = data?.meta?.seasons || [];
  const recruitment = data?.recruitment || {};
  const teamSquads = recruitment.team_squads || [];
  const phaseRows = data?.phase_splits || [];
  const seasonMatchups = data?.matchups || [];
  const careerMatchups = data?.career_matchups || [];
  const phaseMatchups = data?.phase_matchups || [];

  const filtered = useMemo(() => players.filter(p => {
    const q = query.trim().toLowerCase();
    const seasonOk = season === "all" || (p.season_stats || []).some(x => String(x.season) === String(season));
    return seasonOk && (role === "all" || p.role === role) && (!q || p.name.toLowerCase().includes(q));
  }).sort((a, b) => {
    const A = getStats(a, season), B = getStats(b, season);
    const av = sort === "wickets" ? num(A.bowling.wickets) : sort === "sr" ? num(A.batting.strike_rate) :
      sort === "average" ? num(A.batting.average) : sort === "economy" ? -num(A.bowling.economy) : num(A.batting.runs);
    const bv = sort === "wickets" ? num(B.bowling.wickets) : sort === "sr" ? num(B.batting.strike_rate) :
      sort === "average" ? num(B.batting.average) : sort === "economy" ? -num(B.bowling.economy) : num(B.batting.runs);
    return bv - av;
  }), [players, season, role, query, sort]);

  useEffect(() => {
    if (filtered.length && !filtered.some(p => p.id === selectedId)) setSelectedId(filtered[0].id);
  }, [filtered, selectedId]);

  const selected = players.find(p => p.id === selectedId) || filtered[0] || null;
  const selectedStats = getStats(selected, season);
  const bat = selectedStats.batting, bowl = selectedStats.bowling;
  const comparePlayers = compareIds.map(id => players.find(p => p.id === id)).filter(Boolean);
  const target = players.find(p => p.id === targetId) || selected;
  const targetCandidates = target?.recruitment?.replacement_candidates || [];
  const teamOptions = [...new Set(teamSquads.map(x => x.team))].sort();
  const selectedTeamRows = teamSquads.filter(x => (!teamName || x.team === teamName) && (teamSeason === "all" || String(x.season) === String(teamSeason)));
  const selectedPhases = PHASES.map(phase => {
    const rows = phaseRows.filter(x => x.player_id === selected?.id && x.phase === phase && (season === "all" || String(x.season) === String(season)));
    const battingRuns = rows.reduce((a, x) => a + num(x.batting?.runs), 0);
    const bowlingWickets = rows.reduce((a, x) => a + num(x.bowling?.wickets), 0);
    const battingBalls = rows.reduce((a, x) => a + num(x.batting?.balls), 0);
    const bowlingBalls = rows.reduce((a, x) => a + num(x.bowling?.balls), 0);
    const conceded = rows.reduce((a, x) => a + num(x.bowling?.runs_conceded), 0);
    return { phase, runs: battingRuns, wickets: bowlingWickets,
      strikeRate: battingBalls ? battingRuns * 100 / battingBalls : 0,
      economy: bowlingBalls ? conceded * 6 / bowlingBalls : 0 };
  });
  const matchupRows = useMemo(() => {
    const source = season === "all" ? careerMatchups : seasonMatchups.filter(x => String(x.season) === String(season));
    return source.filter(x => x.batter_id === selected?.id || x.bowler_id === selected?.id)
      .filter(x => !matchupSearch || (x.batter_id === selected?.id ? x.bowler : x.batter).toLowerCase().includes(matchupSearch.toLowerCase()))
      .sort((a, b) => num(b.balls) - num(a.balls)).slice(0, 80);
  }, [careerMatchups, seasonMatchups, selected?.id, season, matchupSearch]);

  const compareMetrics = useMemo(() => {
    const keys = [...new Set(comparePlayers.flatMap(p => Object.keys(p.peer_percentiles || {})))];
    return keys.map(key => ({ metric: metricLabel(key), key, ...Object.fromEntries(comparePlayers.map(p => [p.name, p.peer_percentiles?.[key] ?? 0])) }));
  }, [comparePlayers]);

  const phaseMatchupRows = phaseMatchups.filter(x =>
    (x.batter_id === selected?.id || x.bowler_id === selected?.id) &&
    (season === "all" || String(x.season) === String(season))
  );
  const phaseMatchupSummary = PHASES.map(phase => {
    const rows = phaseMatchupRows.filter(x => x.phase === phase);
    return { phase, runs: rows.reduce((a, x) => a + num(x.runs), 0),
      dismissals: rows.reduce((a, x) => a + num(x.dismissals), 0),
      balls: rows.reduce((a, x) => a + num(x.balls), 0) };
  });

  const toggleCompare = (id) => setCompareIds(old => old.includes(id) ? old.filter(x => x !== id) : old.length < 4 ? [...old, id] : [...old.slice(1), id]);
  const kpis = [
    { label: "Player profiles", value: compact(players.length), color: "violet", icon: "◉" },
    { label: "Matches analysed", value: compact(data?.meta?.matches_parsed), color: "cyan", icon: "▦" },
    { label: "Seasons covered", value: seasons.length ? `${seasons[0]}–${seasons[seasons.length - 1]}` : "—", color: "orange", icon: "◷" },
    { label: "Matchup records", value: compact(seasonMatchups.length), color: "pink", icon: "⇄" },
  ];

  if (error) return <div className="pi-shell"><div className="pi-empty-state"><b>Player Intelligence could not load</b><span>{error}</span><code>python player_intelligence_pipeline.py</code></div></div>;
  if (!data) return <div className="pi-shell"><div className="pi-loading"><span className="pi-spinner"/> Loading your scouting workspace…</div></div>;

  return <div className="pi-shell">
    <header className="pi-hero">
      <div className="pi-hero-copy"><div className="pi-eyebrow">CRICKET ANALYTICS LAB <span>/</span> IPL SCOUTING STUDIO</div>
        <h2>Player Intelligence <em>Studio</em></h2>
        <p>Find the right player, understand their game, compare their impact and build evidence-led recruitment shortlists.</p>
        <div className="pi-hero-chips"><span>● Ball-by-ball data</span><span>✦ Role-aware intelligence</span><span>↗ 2008–2026 archive</span></div>
      </div>
      <div className="pi-hero-orbit" aria-hidden="true"><div className="pi-orbit pi-orbit-one"/><div className="pi-orbit pi-orbit-two"/><div className="pi-orbit-core">IPL<br/><b>IQ</b></div><span className="pi-orbit-dot dot-a"/><span className="pi-orbit-dot dot-b"/><span className="pi-orbit-dot dot-c"/></div>
      <div className="pi-generated">DATA REFRESHED <b>{data.meta.generated?.slice(0, 10) || "—"}</b></div>
    </header>

    <section className="pi-kpis">{kpis.map((x, i) => <div className={`pi-kpi pi-kpi-${x.color}`} key={x.label}><div className="pi-kpi-icon">{x.icon}</div><div><span>{x.label}</span><b>{x.value}</b></div><i>{String(i + 1).padStart(2, "0")}</i></div>)}</section>

    <section className="pi-command">
      <div className="pi-command-title"><div><span className="pi-eyebrow">WORKSPACE CONTROLS</span><b>Shape your scouting view</b></div><button className="pi-quiet-btn" onClick={() => { setQuery(""); setRole("all"); setSeason("all"); setSort("runs"); setMatchupSearch(""); }}>↺ Reset filters</button></div>
      <div className="pi-filter-grid">
        <label className="pi-searchbox"><span>⌕</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search any IPL player…" /></label>
        <label><small>SEASON</small><select value={season} onChange={e => setSeason(e.target.value)}><option value="all">Career · all seasons</option>{seasons.map(s => <option key={s} value={s}>IPL {s}</option>)}</select></label>
        <label><small>PLAYER ROLE</small><select value={role} onChange={e => setRole(e.target.value)}><option value="all">All roles</option>{["Batter", "Bowler", "All-rounder", "Other"].map(x => <option key={x}>{x}</option>)}</select></label>
        <label><small>RANK BY</small><select value={sort} onChange={e => setSort(e.target.value)}><option value="runs">Most runs</option><option value="wickets">Most wickets</option><option value="average">Batting average</option><option value="sr">Strike rate</option><option value="economy">Bowling economy</option></select></label>
      </div>
      <div className="pi-filter-foot"><span>Filters update player discovery, profile context and comparisons.</span><b>{compact(filtered.length)} players in view</b></div>
    </section>

    <nav className="pi-workspace-nav" aria-label="Player intelligence sections">
      {[["discover","⌕","Discover"],["profile","◉","Player profile"],["compare","⇄","Compare"],["scouting","✦","Scouting"],["recruitment","♜","Recruitment"],["matchups","⚡","Matchups"]].map(([id, icon, label]) =>
        <button key={id} className={view === id ? "active" : ""} onClick={() => setView(id)}><span>{icon}</span>{label}</button>)}
    </nav>

    {view === "discover" && <section className="pi-view">
      <SectionTitle eyebrow="PLAYER DISCOVERY" title="Find your next match-winner" note="Explore the player pool, then open any profile to understand the numbers behind the name." action={<span className="pi-result-pill">{filtered.length} results</span>}/>
      <div className="pi-discovery-layout">
        <div className="pi-player-grid">{filtered.slice(0, showAllPlayers ? 120 : 24).map((p, index) => {
          const st = getStats(p, season); const active = p.id === selected?.id;
          const primary = p.role === "Bowler" ? `${compact(st.bowling.wickets)} wkts` : `${compact(st.batting.runs)} runs`;
          const secondary = p.role === "Bowler" ? `Econ ${fmt(st.bowling.economy, 2)}` : `SR ${fmt(st.batting.strike_rate, 1)}`;
          return <article className={`pi-player-card ${active ? "is-active" : ""}`} key={p.id} onClick={() => setSelectedId(p.id)}>
            <div className="pi-player-card-top"><div className={`pi-avatar avatar-${index % 6}`}>{initials(p.name)}</div><span className={`pi-role-pill role-${p.role.toLowerCase().replace(/[^a-z]+/g,"-")}`}>{p.role}</span></div>
            <h4>{p.name}</h4><p>{p.matches} appearances <span>·</span> {p.seasons?.length || 0} seasons</p>
            <div className="pi-player-card-stat"><strong>{primary}</strong><span>{secondary}</span></div>
            <div className="pi-card-actions"><button onClick={e => { e.stopPropagation(); setSelectedId(p.id); setView("profile"); }}>Explore profile ↗</button><button className={compareIds.includes(p.id) ? "chosen" : ""} onClick={e => { e.stopPropagation(); toggleCompare(p.id); }} title="Add to comparison">{compareIds.includes(p.id) ? "✓" : "+"}</button></div>
          </article>;
        })}{!filtered.length && <EmptyState title="No players found" detail="Try clearing a filter or searching another name."/>}</div>
        {filtered.length > 24 && <button className="pi-load-more" onClick={() => setShowAllPlayers(v => !v)}>{showAllPlayers ? "Show fewer players" : `Show more players (${filtered.length - 24} remaining)`}</button>}
        <aside className="pi-discovery-aside"><div className="pi-aside-gradient"><span>SCOUTING TIP</span><b>Start with a role, then explore the numbers.</b><p>Career filters help you understand long-term output. A single-season filter helps isolate form in that campaign.</p><button onClick={() => { setRole("Batter"); setSort("sr"); }}>Explore batters →</button></div>
          <div className="pi-aside-card"><span className="pi-eyebrow">CURRENT LEADER</span><b>{filtered[0]?.name || "—"}</b><strong>{sort === "wickets" ? `${compact(getStats(filtered[0], season).bowling.wickets)} wickets` : `${compact(getStats(filtered[0], season).batting.runs)} runs`}</strong><small>Based on your selected ranking</small><button onClick={() => { if (filtered[0]) { setSelectedId(filtered[0].id); setView("profile"); } }}>Open profile ↗</button></div>
          <div className="pi-aside-note"><b>How to read this</b><span>Role labels are inferred from sustained batting and bowling workload. They are not official squad positions.</span></div>
        </aside>
      </div>
    </section>}

    {view === "profile" && (selected ? <section className="pi-view">
      <div className="pi-profile-banner"><div className="pi-profile-person"><div className="pi-avatar pi-avatar-large">{initials(selected.name)}</div><div><span className={`pi-role-pill role-${selected.role.toLowerCase().replace(/[^a-z]+/g,"-")}`}>{selected.role}</span><h3>{selected.name}</h3><p>{selected.matches} indexed appearances · {selected.seasons?.[0]}–{selected.seasons?.[selected.seasons.length - 1]}</p></div></div><div className="pi-profile-actions"><button className="pi-secondary-btn" onClick={() => toggleCompare(selected.id)}>{compareIds.includes(selected.id) ? "✓ Added to compare" : "+ Add to compare"}</button><button className="pi-primary-btn" onClick={() => setView("scouting")}>Open scouting report ↗</button></div></div>
      <div className="pi-profile-kpis">
        <MetricCard label="Runs scored" value={compact(bat.runs)} note={`${compact(bat.balls)} balls faced`} tone="violet"/>
        <MetricCard label="Batting average" value={fmt(bat.average,2)} note="Runs per dismissal" tone="cyan"/>
        <MetricCard label="Strike rate" value={fmt(bat.strike_rate,1)} note="Runs per 100 balls" tone="orange"/>
        <MetricCard label="Wickets" value={compact(bowl.wickets)} note="Bowler-credited" tone="pink"/>
        <MetricCard label="Economy" value={fmt(bowl.economy,2)} note={`${bowl.overs || "0.0"} overs`} tone="green"/>
      </div>
      <div className="pi-profile-grid">
        <div className="pi-panel pi-panel-wide"><SectionTitle eyebrow="PERFORMANCE JOURNEY" title="Season-by-season form" note="See how output has changed across campaigns."/>
          <div className="pi-chart pi-chart-tall"><ResponsiveContainer><AreaChart data={selectedStats.seasons.map(x => ({season:x.season,runs:num(x.batting.runs),wickets:num(x.bowling.wickets),sr:num(x.batting.strike_rate)}))}><defs><linearGradient id="runsFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6C63FF" stopOpacity={.35}/><stop offset="100%" stopColor="#6C63FF" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke="var(--pi-grid)"/><XAxis dataKey="season"/><YAxis/><Tooltip/><Area type="monotone" dataKey="runs" name="Runs" stroke="#6C63FF" fill="url(#runsFill)" strokeWidth={3}/><Line type="monotone" dataKey="wickets" name="Wickets" stroke="#19B5A5" strokeWidth={2} yAxisId={0}/></AreaChart></ResponsiveContainer></div>
        </div>
        <div className="pi-panel"><SectionTitle eyebrow="ROLE PROFILE" title="Peer percentile snapshot" note="Percentiles compare this player with the same inferred role."/>
          {Object.keys(selected.peer_percentiles || {}).length ? <div className="pi-percentile-list">{Object.entries(selected.peer_percentiles).map(([key, value]) => <div className="pi-percentile-row" key={key}><div><span>{metricLabel(key)}</span><b>{fmt(value,0)}th</b></div><div className="pi-progress"><i style={{width:`${Math.max(0,Math.min(100,value))}%`}}/></div></div>)}</div> : <EmptyState title="Not enough peer data" detail="Percentiles are hidden when the role group does not meet the minimum peer threshold."/>}
        </div>
        <div className="pi-panel"><SectionTitle eyebrow="PHASE SPECIALISATION" title="Where impact happens" note="Batting runs and bowling wickets by match phase."/>
          <div className="pi-chart"><ResponsiveContainer><BarChart data={selectedPhases}><CartesianGrid strokeDasharray="3 3" stroke="var(--pi-grid)"/><XAxis dataKey="phase"/><YAxis/><Tooltip/><Legend/><Bar dataKey="runs" name="Batting runs" fill="#6C63FF" radius={[6,6,0,0]}/><Bar dataKey="wickets" name="Bowling wickets" fill="#19B5A5" radius={[6,6,0,0]}/></BarChart></ResponsiveContainer></div>
        </div>
        <div className="pi-panel"><SectionTitle eyebrow="BATTING SNAPSHOT" title="Scoring profile" note="A quick view of how runs are accumulated."/>
          <div className="pi-chart"><ResponsiveContainer><PieChart><Pie data={[{name:"Fours",value:num(bat.fours)},{name:"Sixes",value:num(bat.sixes)},{name:"Other runs",value:Math.max(0,num(bat.runs)-4*num(bat.fours)-6*num(bat.sixes))}]} dataKey="value" nameKey="name" innerRadius={55} outerRadius={86} paddingAngle={3}><Cell fill="#6C63FF"/><Cell fill="#FF9F43"/><Cell fill="#D9DCE8"/></Pie><Tooltip/><Legend/></PieChart></ResponsiveContainer></div>
        </div>
      </div>
    </section> : <EmptyState title="Choose a player" detail="Select a player from Discover to open their profile."/>)}

    {view === "compare" && <section className="pi-view">
      <SectionTitle eyebrow="COMPARISON LAB" title="Compare players on equal terms" note="Add up to four players from Discover. Percentiles are role-aware, so each player is assessed against their own peer group." action={<button className="pi-quiet-btn" onClick={() => setCompareIds([])}>Clear selection</button>}/>
      <div className="pi-compare-picker">{players.filter(p => compareIds.includes(p.id)).map(p => <span key={p.id}>{p.name}<button onClick={() => toggleCompare(p.id)}>×</button></span>)}<small>{compareIds.length}/4 selected · Add players using the + button on discovery cards.</small></div>
      {comparePlayers.length >= 2 ? <div className="pi-compare-layout"><div className="pi-panel"><SectionTitle eyebrow="ROLE-AWARE METRICS" title="Peer percentile comparison" note="100 means higher within the player's own inferred role group."/><div className="pi-chart pi-chart-tall"><ResponsiveContainer><BarChart data={compareMetrics} layout="vertical" margin={{left:20,right:20}}><CartesianGrid strokeDasharray="3 3" stroke="var(--pi-grid)"/><XAxis type="number" domain={[0,100]}/><YAxis type="category" dataKey="metric" width={125} tick={{fontSize:10}}/><Tooltip/><Legend/>{comparePlayers.map((p,i)=><Bar key={p.id} dataKey={p.name} fill={COLORS[i%COLORS.length]} radius={[0,5,5,0]}/>)}</BarChart></ResponsiveContainer></div></div><div className="pi-compare-cards">{comparePlayers.map((p,i)=>{const st=getStats(p,season);return <div className="pi-compare-card" key={p.id} style={{"--player-color":COLORS[i%COLORS.length]}}><div className="pi-compare-card-top"><span className="pi-avatar">{initials(p.name)}</span><button onClick={()=>toggleCompare(p.id)}>×</button></div><b>{p.name}</b><small>{p.role}</small><strong>{compact(st.batting.runs)} <em>runs</em></strong><div>Avg {fmt(st.batting.average,1)} · SR {fmt(st.batting.strike_rate,1)}</div><div>{compact(st.bowling.wickets)} wkts · Econ {fmt(st.bowling.economy,2)}</div></div>})}</div></div> : <EmptyState title="Build your comparison" detail="Go to Discover and add at least two players. You can compare up to four at once."/>}
    </section>}

    {view === "scouting" && (selected ? <section className="pi-view">
      <SectionTitle eyebrow="SCOUTING REPORT" title="Turn performance into a player story" note="Evidence-led archetypes, strengths and development areas based on career output and role-matched percentiles." action={<button className="pi-secondary-btn" onClick={()=>setView("profile")}>← Back to profile</button>}/>
      <div className="pi-scout-hero"><div className="pi-avatar pi-avatar-large">{initials(selected.name)}</div><div><span className={`pi-role-pill role-${selected.role.toLowerCase().replace(/[^a-z]+/g,"-")}`}>{selected.role}</span><h3>{selected.name}</h3><p>{selected.scouting?.basis || "Descriptive profile from career statistics."}</p></div></div>
      <div className="pi-scout-grid"><div className="pi-panel"><SectionTitle eyebrow="PLAYER ARCHETYPES" title="What kind of player?"/><div className="pi-chip-cloud">{(selected.scouting?.archetypes || []).length ? selected.scouting.archetypes.map(x=><span className="pi-archetype" key={x}>✦ {x}</span>) : <EmptyState title="No archetype assigned" detail="The player does not currently meet a defined workload and performance threshold."/>}</div></div>
        <div className="pi-panel"><SectionTitle eyebrow="RELATIVE STRENGTHS" title="Where they stand out"/><div className="pi-insight-list good">{(selected.scouting?.strengths || []).length ? selected.scouting.strengths.map(x=><div key={x}><b>↗</b><span>{metricLabel(x)}</span><strong>{fmt(selected.peer_percentiles?.[x],0)}th percentile</strong></div>) : <EmptyState title="No standout percentile flags" detail="No metric currently crosses the 75th percentile threshold."/>}</div></div>
        <div className="pi-panel"><SectionTitle eyebrow="DEVELOPMENT SIGNALS" title="Areas to investigate"/><div className="pi-insight-list watch">{(selected.scouting?.development_areas || []).length ? selected.scouting.development_areas.map(x=><div key={x}><b>↘</b><span>{metricLabel(x)}</span><strong>{fmt(selected.peer_percentiles?.[x],0)}th percentile</strong></div>) : <EmptyState title="No low-percentile flags" detail="No metric currently falls at or below the 25th percentile."/>}</div></div>
        <div className="pi-panel"><SectionTitle eyebrow="SIMILAR PLAYER FINDER" title="Players with a similar profile"/><div className="pi-similar-list">{(selected.similar_players || []).map((p,i)=><button key={p.player_id} onClick={()=>{setSelectedId(p.player_id);setView("profile");}}><span className="pi-similar-rank">0{i+1}</span><span><b>{p.name}</b><small>{p.role} · {p.shared_metrics} shared metrics</small></span><strong>{fmt(p.similarity_distance,1)}</strong><em>View ↗</em></button>)}{!(selected.similar_players || []).length && <EmptyState title="No similar profiles available" detail="The role group needs comparable percentile dimensions."/>}</div></div></div>
    </section> : <EmptyState title="Select a player" detail="Choose a player to open their scouting report."/>)}

    {view === "recruitment" && <section className="pi-view">
      <SectionTitle eyebrow="RECRUITMENT DESK" title="Find a like-for-like replacement" note="Select a target player to see the closest same-role statistical profiles from the indexed IPL archive."/>
      <div className="pi-recruit-controls"><label><small>TARGET PLAYER</small><select value={target?.id || ""} onChange={e=>setTargetId(e.target.value)}>{players.filter(p=>["Batter","Bowler","All-rounder"].includes(p.role)).sort((a,b)=>a.name.localeCompare(b.name)).map(p=><option key={p.id} value={p.id}>{p.name} · {p.role}</option>)}</select></label><div className="pi-target-summary"><span>REPLACEMENT ROLE</span><b>{target?.role || "—"}</b><small>Same inferred role only</small></div><div className="pi-target-summary"><span>CANDIDATES FOUND</span><b>{targetCandidates.length}</b><small>Maximum five per target</small></div></div>
      {target ? <div className="pi-replacement-grid">{targetCandidates.map((p,i)=>{const candidate=players.find(x=>x.id===p.player_id);return <article className="pi-replacement-card" key={p.player_id}><div className="pi-replacement-rank">MATCH {String(i+1).padStart(2,"0")}</div><div className="pi-avatar">{initials(p.name)}</div><h4>{p.name}</h4><span className="pi-role-pill">{p.role}</span><div className="pi-distance"><b>{fmt(p.similarity_distance,1)}</b><small>percentile distance · lower is closer</small></div><div className="pi-shared-metrics">{(p.shared_metrics||[]).map(x=><span key={x}>{metricLabel(x)}</span>)}</div><button onClick={()=>{setSelectedId(p.player_id);setView("profile");}}>Explore candidate ↗</button></article>})}{!targetCandidates.length && <EmptyState title="No comparable candidates" detail="No same-role peers with shared percentile metrics were available for this player."/>}</div> : <EmptyState title="No eligible target players" detail="The export does not contain a player with a defined specialist role."/>}
      <div className="pi-method-note"><b>How the shortlist works</b><span>{recruitment.methodology?.replacement_candidates || "Same inferred role; candidates are ranked by distance across shared role-peer percentile metrics."}</span></div>
      <SectionTitle eyebrow="TEAM SQUAD AUDIT" title="Understand historical squad balance" note="These are players recorded in Cricsheet playing XIs, grouped by team and season—not current squads."/>
      <div className="pi-team-controls"><label><small>TEAM</small><select value={teamName} onChange={e=>setTeamName(e.target.value)}><option value="">All teams</option>{teamOptions.map(x=><option key={x}>{x}</option>)}</select></label><label><small>SEASON</small><select value={teamSeason} onChange={e=>setTeamSeason(e.target.value)}><option value="all">All seasons</option>{seasons.map(x=><option key={x}>{x}</option>)}</select></label></div>
      <div className="pi-team-grid">{selectedTeamRows.slice(0,24).map((team,i)=><article className="pi-team-card" key={`${team.team}-${team.season}`}><div className="pi-team-card-head"><span className={`pi-team-mark team-${i%6}`}>{initials(team.team)}</span><div><b>{team.team}</b><small>IPL {team.season}</small></div><strong>{team.players_recorded_in_xi}</strong></div><div className="pi-role-bars">{Object.entries(team.role_counts||{}).filter(([k])=>k!=="Other").map(([k,v])=><div key={k}><span>{k}</span><b>{v}</b><i><em style={{width:`${team.players_recorded_in_xi?100*v/team.players_recorded_in_xi:0}%`}}/></i></div>)}</div><div className={`pi-gap-note ${team.role_coverage_gaps?.length?"has-gap":""}`}>{team.role_coverage_gaps?.length ? `Role coverage flags: ${team.role_coverage_gaps.join(", ")}` : "No missing role category flagged"}</div><details><summary>View recorded roster</summary><div className="pi-roster">{(team.roster||[]).map(p=><span key={p.player_id}>{p.name} <i>{p.role}</i></span>)}</div></details></article>)}</div>
      <div className="pi-method-note"><b>Important data boundary</b><span>{(recruitment.methodology?.limitations || []).join(" ")}</span></div>
    </section>}

    {view === "matchups" && (selected ? <section className="pi-view">
      <SectionTitle eyebrow="MATCHUP INTELLIGENCE" title="Explore batter vs bowler history" note="See who won the contest, how often they met and how the matchup changed by phase."/>
      <div className="pi-matchup-summary">{phaseMatchupSummary.map((x,i)=><div key={x.phase} className={`pi-phase-card phase-${i}`}><span>{x.phase}</span><b>{compact(x.runs)} <small>runs</small></b><strong>{compact(x.dismissals)} <small>dismissals</small></strong><em>{compact(x.balls)} balls</em></div>)}</div>
      <div className="pi-panel"><div className="pi-panel-headline"><div><span className="pi-eyebrow">HEAD-TO-HEAD RECORDS</span><h3>{selected.name}'s matchups</h3><p>{season === "all" ? "Career aggregate" : `IPL ${season} only`} · bowler-credited dismissals</p></div><input className="pi-search-inline" value={matchupSearch} onChange={e=>setMatchupSearch(e.target.value)} placeholder="Search opponent…"/></div>
        <div className="pi-matchup-list">{matchupRows.slice(0,30).map((m,i)=>{const batting=m.batter_id===selected.id;return <div className="pi-matchup-row" key={`${m.batter_id}-${m.bowler_id}-${m.season||"career"}-${i}`}><div className="pi-matchup-versus"><span className="pi-matchup-role">{batting?"BATTER VS BOWLER":"BOWLER VS BATTER"}</span><b>{batting?m.bowler:m.batter}</b><small>{m.season?`IPL ${m.season}`:"Career matchup"}</small></div><div><b>{compact(m.runs)}</b><small>Runs</small></div><div><b>{compact(m.balls)}</b><small>Balls</small></div><div><b>{fmt(m.strike_rate,1)}</b><small>Strike rate</small></div><div><b>{compact(m.dismissals)}</b><small>Dismissals</small></div><div className="pi-matchup-boundary"><b>{compact(m.fours)}×4 · {compact(m.sixes)}×6</b><small>{safePct(m.dot_pct)} dots</small></div></div>})}{!matchupRows.length&&<EmptyState title="No matchup records" detail="No recorded batter-bowler encounters match this player and filter."/>}</div>
      </div>
    </section> : <EmptyState title="Choose a player" detail="Select a player from Discover to explore their matchups."/>)}

    <footer className="pi-footer"><span>CRICKET ANALYTICS LAB · PLAYER INTELLIGENCE STUDIO</span><span>Roles are workload-inferred · Percentiles are role-relative · Recruitment outputs are descriptive, not predictions.</span></footer>
  </div>;
}
