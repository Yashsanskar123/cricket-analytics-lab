import React, { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  LineChart, Line, Cell, Legend
} from "recharts";
import "./partnership-intelligence.css";

const fmt = (v) => Number(v || 0).toLocaleString("en-IN");
const rate = (v) => v == null ? "—" : Number(v).toFixed(2);
const unique = (xs) => [...new Set(xs.filter(Boolean))];

function Filter({ label, value, onChange, options }) {
  return <label className="pi-filter"><span>{label}</span><select value={value} onChange={e => onChange(e.target.value)}>
    <option value="All">All</option>{options.map(v => <option key={v} value={String(v)}>{v}</option>)}
  </select></label>;
}
function Metric({ label, value, note }) {
  return <div className="pi-metric"><span>{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</div>;
}
function Empty({ children }) { return <div className="pi-empty">{children}</div>; }

export default function PartnershipIntelligence() {
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [season, setSeason] = useState("All");
  const [team, setTeam] = useState("All");
  const [venue, setVenue] = useState("All");
  const [wicket, setWicket] = useState("All");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("runs");
  const [selected, setSelected] = useState(null);
  const [tab, setTab] = useState("overview");

  useEffect(() => {
    let alive = true;
    fetch("/data/partnership_intelligence.json")
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(json => { if (alive) setData(json); })
      .catch(e => { if (alive) setLoadError(e.message || "Unable to load export"); });
    return () => { alive = false; };
  }, []);

  const all = data?.partnerships || [];
  const seasons = data?.meta?.seasons || [];
  const teams = data?.meta?.teams || [];
  const venues = data?.meta?.venues || [];
  const filtered = useMemo(() => all.filter(p =>
    (season === "All" || String(p.season) === season) &&
    (team === "All" || p.team === team) &&
    (venue === "All" || p.venue === venue) &&
    (wicket === "All" || String(p.wicket_number) === wicket)
  ), [all, season, team, venue, wicket]);

  const sorted = useMemo(() => [...filtered].sort((a,b) => {
    const av = a[sort] ?? 0, bv = b[sort] ?? 0;
    return bv - av;
  }), [filtered, sort]);

  const pairRows = useMemo(() => {
    const map = new Map();
    filtered.forEach(p => {
      const key = [p.batter1, p.batter2].sort().join("::");
      const row = map.get(key) || { batter1: p.batter1, batter2: p.batter2, pair: `${p.batter1} & ${p.batter2}`, partnerships: 0, runs: 0, balls: 0, fifties: 0, hundreds: 0 };
      row.partnerships += 1; row.runs += p.runs; row.balls += p.balls;
      row.fifties += Number(p.runs >= 50); row.hundreds += Number(p.runs >= 100);
      map.set(key, row);
    });
    return [...map.values()].map(p => ({ ...p, average_runs: p.runs / p.partnerships, run_rate: p.balls ? p.runs * 6 / p.balls : null }))
      .sort((a,b) => b.runs - a.runs);
  }, [filtered]);

  const byWicket = useMemo(() => Array.from({length:10}, (_,i) => {
    const rows = filtered.filter(p => p.wicket_number === i+1);
    const runs = rows.reduce((s,p)=>s+p.runs,0), balls = rows.reduce((s,p)=>s+p.balls,0);
    return { wicket: `${i+1}${["st","nd","rd"][i] || "th"}`, wicket_number:i+1, partnerships:rows.length,
      average: rows.length ? runs/rows.length : 0, runs, run_rate: balls ? runs*6/balls : 0 };
  }), [filtered]);

  const totalRuns = filtered.reduce((s,p)=>s+p.runs,0);
  const totalBalls = filtered.reduce((s,p)=>s+p.balls,0);
  const highest = [...filtered].sort((a,b)=>b.runs-a.runs)[0];
  const avg = filtered.length ? totalRuns / filtered.length : 0;
  const selectedRow = selected ? filtered.find(p=>p.id===selected) : null;
  const trend = useMemo(() => {
    const map = new Map();
    filtered.forEach(p => { const x=map.get(p.season)||{season:p.season,runs:0,count:0}; x.runs+=p.runs; x.count++; map.set(p.season,x); });
    return [...map.values()].sort((a,b)=>a.season-b.season).map(x=>({...x,average:x.count?x.runs/x.count:0}));
  }, [filtered]);

  if (loadError) return <div className="pi-root"><div className="pi-error"><b>Partnership data not loaded</b><p>{loadError}</p><span>Run partnership_intelligence_pipeline.py from the project root, then refresh this page.</span></div></div>;
  if (!data) return <div className="pi-root"><div className="pi-loading">Loading partnership intelligence…</div></div>;

  return <div className="pi-root">
    <header className="pi-hero">
      <div><div className="pi-eyebrow">IPL · HISTORICAL PERFORMANCE INTELLIGENCE</div>
        <h1>Partnership <em>Intelligence</em></h1>
        <p>Understand how batting pairs build innings, absorb pressure and change the game.</p>
      </div>
      <div className="pi-hero-stat"><span>DATASET</span><strong>{fmt(data.meta.matches_parsed)}</strong><small>matches · {seasons.length} seasons</small></div>
    </header>

    <section className="pi-filterbar">
      <div className="pi-filter-title"><b>Explore dataset</b><small>Filters update every metric, chart and table below</small></div>
      <Filter label="Season" value={season} onChange={v=>{setSeason(v);setSelected(null);}} options={seasons.map(String)} />
      <Filter label="Team" value={team} onChange={v=>{setTeam(v);setSelected(null);}} options={teams} />
      <Filter label="Venue" value={venue} onChange={v=>{setVenue(v);setSelected(null);}} options={venues} />
      <Filter label="Wicket" value={wicket} onChange={v=>{setWicket(v);setSelected(null);}} options={Array.from({length:10},(_,i)=>String(i+1))} />
      <button className="pi-reset" onClick={()=>{setSeason("All");setTeam("All");setVenue("All");setWicket("All");setQuery("");setSelected(null);}}>Reset</button>
    </section>

    <nav className="pi-tabs">
      {[["overview","Overview"],["explorer","Partnership explorer"],["pairs","Pair intelligence"],["trends","Season trends"]].map(([id,label])=>
        <button key={id} className={tab===id?"active":""} onClick={()=>setTab(id)}>{label}</button>)}
      <span>{fmt(filtered.length)} partnerships in current view</span>
    </nav>

    {tab==="overview" && <>
      <section className="pi-metrics">
        <Metric label="Partnerships analysed" value={fmt(filtered.length)} note="After current filters" />
        <Metric label="Partnership runs" value={fmt(totalRuns)} note="Includes extras while pair was together" />
        <Metric label="Average partnership" value={rate(avg)} note="Runs per recorded partnership" />
        <Metric label="Partnership run rate" value={rate(totalBalls?totalRuns*6/totalBalls:null)} note={`${fmt(totalBalls)} legal balls`} />
        <Metric label="Highest partnership" value={highest?fmt(highest.runs):"—"} note={highest?highest.pair:"No records"} />
      </section>
      <div className="pi-grid pi-grid-main">
        <section className="pi-panel pi-span-2">
          <div className="pi-panel-head"><div><h2>Partnership strength by wicket</h2><p>Average runs added before the next wicket fell</p></div><span className="pi-chip">WICKET ANALYSIS</span></div>
          <div className="pi-chart"><ResponsiveContainer><BarChart data={byWicket} margin={{top:12,right:12,left:0,bottom:4}}>
            <CartesianGrid stroke="#283244" strokeDasharray="3 5" vertical={false}/><XAxis dataKey="wicket" tick={{fill:"#a7b2c4",fontSize:12}} axisLine={false} tickLine={false}/><YAxis tick={{fill:"#8290a5",fontSize:11}} axisLine={false} tickLine={false}/><Tooltip contentStyle={{background:"#111a28",border:"1px solid #344155",borderRadius:10,color:"#fff"}} formatter={(v,n)=>[Number(v).toFixed(1),n]}/><Bar dataKey="average" name="Average runs" radius={[6,6,0,0]}>{byWicket.map((x,i)=><Cell key={i} fill={i<3?"#47c7a5":i<6?"#5c8ee8":"#d49b54"}/>)}</Bar>
          </BarChart></ResponsiveContainer></div>
        </section>
        <section className="pi-panel">
          <div className="pi-panel-head"><div><h2>Top partnership</h2><p>Highest individual stand in this view</p></div></div>
          {highest?<div className="pi-feature"><div className="pi-feature-score">{fmt(highest.runs)}<small>RUNS</small></div><h3>{highest.pair}</h3><p>{highest.team} · {highest.season} · {highest.venue}</p><div className="pi-feature-meta"><span>{highest.balls} balls</span><span>{rate(highest.run_rate)} RR</span><span>Wicket {highest.wicket_number}</span></div><button onClick={()=>{setSelected(highest.id);setTab("explorer");}}>Inspect partnership ↗</button></div>:<Empty>No partnership records match these filters.</Empty>}
        </section>
        <section className="pi-panel">
          <div className="pi-panel-head"><div><h2>Most productive pairs</h2><p>Combined partnership runs in current view</p></div><button className="pi-link" onClick={()=>setTab("pairs")}>View all ↗</button></div>
          <div className="pi-ranklist">{pairRows.slice(0,6).map((p,i)=><div className="pi-rank" key={p.pair}><span>{String(i+1).padStart(2,"0")}</span><div><b>{p.pair}</b><small>{p.partnerships} stands · avg {rate(p.average_runs)}</small></div><strong>{fmt(p.runs)}</strong></div>)}</div>
        </section>
        <section className="pi-panel pi-span-2">
          <div className="pi-panel-head"><div><h2>Partnership profile by wicket</h2><p>Average runs and scoring tempo through the innings</p></div></div>
          <div className="pi-chart"><ResponsiveContainer><LineChart data={byWicket} margin={{top:12,right:18,left:0,bottom:4}}>
            <CartesianGrid stroke="#283244" strokeDasharray="3 5" vertical={false}/>
            <XAxis dataKey="wicket" tick={{fill:"#a7b2c4",fontSize:12}} axisLine={false} tickLine={false}/>
            <YAxis yAxisId="runs" tick={{fill:"#8290a5",fontSize:11}} axisLine={false} tickLine={false} width={34}/>
            <YAxis yAxisId="rate" orientation="right" tick={{fill:"#8290a5",fontSize:11}} axisLine={false} tickLine={false} width={34}/>
            <Tooltip contentStyle={{background:"#111a28",border:"1px solid #344155",borderRadius:10,color:"#fff"}}/>
            <Legend verticalAlign="bottom" height={30} wrapperStyle={{fontSize:11,color:"#a7b2c4"}}/>
            <Line yAxisId="runs" type="monotone" dataKey="average" name="Average stand (runs)" stroke="#47c7a5" strokeWidth={3} dot={{r:4,fill:"#47c7a5"}} activeDot={{r:6}}/>
            <Line yAxisId="rate" type="monotone" dataKey="run_rate" name="Scoring rate" stroke="#e0a85e" strokeWidth={2.5} dot={false} activeDot={{r:5}}/>
          </LineChart></ResponsiveContainer></div>
        </section>
      </div>
    </>}

    {tab==="explorer" && <section className="pi-panel">
      <div className="pi-panel-head pi-wrap-head"><div><h2>Partnership explorer</h2><p>Search individual stands and inspect their contribution</p></div><div className="pi-explorer-tools"><input className="pi-search" placeholder="Search batter, pair, team or match…" value={query} onChange={e=>setQuery(e.target.value)}/><select className="pi-sort" value={sort} onChange={e=>setSort(e.target.value)}><option value="runs">Sort: Runs</option><option value="balls">Sort: Balls</option><option value="run_rate">Sort: Run rate</option><option value="wicket_number">Sort: Wicket</option><option value="season">Sort: Season</option></select></div></div>
      <div className="pi-table-wrap"><table className="pi-table"><thead><tr><th>Partnership</th><th>Team</th><th>Season</th><th>Wkt</th><th>Runs</th><th>Balls</th><th>Run rate</th><th>Extras</th><th></th></tr></thead>
        <tbody>{sorted.filter(p=>`${p.pair} ${p.team} ${p.opposition} ${p.match_id}`.toLowerCase().includes(query.toLowerCase())).slice(0,500).map(p=><tr key={p.id} className={selected===p.id?"chosen":""} onClick={()=>setSelected(p.id)}><td><b>{p.pair}</b><small>{p.opposition} · {p.date}</small></td><td>{p.team}</td><td>{p.season}</td><td>{p.wicket_number}</td><td className="pi-num">{fmt(p.runs)}</td><td>{p.balls}</td><td>{rate(p.run_rate)}</td><td>{fmt(p.extras)}</td><td><button className="pi-view" onClick={e=>{e.stopPropagation();setSelected(p.id);}}>View</button></td></tr>)}</tbody>
      </table></div>
      {selectedRow && <div className="pi-detail">
        <div className="pi-panel-head"><div><span className="pi-chip">PARTNERSHIP DETAIL</span><h2>{selectedRow.pair}</h2><p>{selectedRow.team} vs {selectedRow.opposition} · {selectedRow.date} · innings {selectedRow.innings}</p></div><button className="pi-reset" onClick={()=>setSelected(null)}>Close</button></div>
        <div className="pi-detail-score"><strong>{fmt(selectedRow.runs)}</strong><span>runs from {selectedRow.balls} legal balls · RR {rate(selectedRow.run_rate)}</span></div>
        <div className="pi-detail-grid"><Metric label={selectedRow.batter1} value={fmt(selectedRow.batter1_runs)} note={`${selectedRow.batter1_balls} balls faced`}/><Metric label={selectedRow.batter2} value={fmt(selectedRow.batter2_runs)} note={`${selectedRow.batter2_balls} balls faced`}/><Metric label="Extras" value={fmt(selectedRow.extras)} note="Team runs not credited to batters"/><Metric label="Boundaries" value={`${selectedRow.fours} fours · ${selectedRow.sixes} sixes`} note={`${selectedRow.dot_balls} zero-run deliveries`}/></div>
      </div>}
    </section>}

    {tab==="pairs" && <section className="pi-panel">
      <div className="pi-panel-head"><div><h2>Pair intelligence</h2><p>Aggregate stands for each unordered batting pair within the current filters</p></div></div>
      <div className="pi-table-wrap"><table className="pi-table"><thead><tr><th>Batting pair</th><th>Stands</th><th>Total runs</th><th>Average stand</th><th>Run rate</th><th>50+ stands</th><th>100+ stands</th></tr></thead><tbody>{pairRows.slice(0,500).map(p=><tr key={p.pair}><td><b>{p.pair}</b></td><td>{p.partnerships}</td><td className="pi-num">{fmt(p.runs)}</td><td>{rate(p.average_runs)}</td><td>{rate(p.run_rate)}</td><td>{p.fifties}</td><td>{p.hundreds}</td></tr>)}</tbody></table></div>
    </section>}

    {tab==="trends" && <section className="pi-panel">
      <div className="pi-panel-head"><div><h2>Season trends</h2><p>Partnership scoring output across the selected seasons</p></div></div>
      <div className="pi-chart"><ResponsiveContainer><LineChart data={trend} margin={{top:12,right:18,left:0,bottom:4}}><CartesianGrid stroke="#283244" strokeDasharray="3 5" vertical={false}/><XAxis dataKey="season" tick={{fill:"#a7b2c4",fontSize:12}} axisLine={false} tickLine={false}/><YAxis tick={{fill:"#8290a5",fontSize:11}} axisLine={false} tickLine={false}/><Tooltip contentStyle={{background:"#111a28",border:"1px solid #344155",borderRadius:10,color:"#fff"}}/><Line type="monotone" dataKey="average" name="Average stand" stroke="#47c7a5" strokeWidth={3} dot={{r:4}}/><Line type="monotone" dataKey="count" name="Partnership count" stroke="#6c91ec" strokeWidth={2} dot={false}/></LineChart></ResponsiveContainer></div>
    </section>}
    <footer className="pi-foot">Source: Cricsheet IPL ball-by-ball data · Generated {data.meta.generated?.replace("T"," ") || "—"} · Partnerships include extras and count legal balls only.</footer>
  </div>;
}
