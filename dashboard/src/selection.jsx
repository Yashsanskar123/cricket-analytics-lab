import React, { useState, useEffect, useContext, useMemo, useCallback } from "react";
import { listeners } from "./lib.js";
import { MD, hasPred, splitOf, SPLIT_LABEL } from "./matchdata.js";
import { Seg, Chip, store } from "./ui.jsx";

/* One selection (season -> match -> innings -> over) shared by every page that works on a historical match.
   Kept in localStorage so it survives page changes and refreshes. */
const SelCtx = React.createContext(null);
const useSelection = () => useContext(SelCtx);

function readSaved() {
  try { return JSON.parse(store.get("cal-selection", "{}")) || {}; } catch (e) { return {}; }
}

function SelectionProvider({ children }) {
  const [saved, setSaved] = useState(readSaved);
  const [ver, setVer] = useState(0);
  useEffect(() => { const f = () => setVer((v) => v + 1); listeners.add(f); return () => listeners.delete(f); }, []);
  const persist = (next) => { setSaved(next); store.set("cal-selection", JSON.stringify(next)); };

  const value = useMemo(() => {
    const rows = MD.rows;
    const ready = MD.loaded.matches && rows.length > 0;
    const withData = rows.filter((r) => MD.progress[r.id]);
    const seasons = [...new Set(withData.map((r) => r.season))].sort((a, b) => b - a);
    const defaultMatch = (season) => {
      const pool = withData.filter((r) => season === "all" || r.season === season);
      const preds = pool.filter((r) => hasPred(r.id));
      const pick = (preds.length ? preds : pool).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.id).localeCompare(String(a.id)))[0];
      return pick ? pick.id : "";
    };
    let season = saved.season === "all" || seasons.includes(saved.season) ? saved.season : (seasons[0] ?? "all");
    let matchId = saved.matchId && MD.byId.has(String(saved.matchId)) && MD.progress[String(saved.matchId)] ? String(saved.matchId) : defaultMatch(season);
    const m = matchId ? MD.byId.get(matchId) : null;
    if (m && season !== "all" && m.season !== season) matchId = defaultMatch(season);
    const match = matchId ? MD.byId.get(matchId) : null;
    const innings = saved.innings === 2 ? 2 : 1;
    const over = Math.min(20, Math.max(1, Number(saved.over) || 12));
    const seasonMatches = withData.filter((r) => season === "all" || r.season === season).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.id).localeCompare(String(b.id)));
    const idx = seasonMatches.findIndex((r) => r.id === matchId);
    return {
      ready, seasons, season, matchId, match, innings, over, seasonMatches,
      setSeason: (s) => persist({ ...saved, season: s, matchId: "" }),
      setMatch: (id, extra = {}) => { const r = MD.byId.get(String(id)); persist({ ...saved, ...extra, matchId: String(id), season: saved.season === "all" ? "all" : (r ? r.season : saved.season) }); },
      setInnings: (i) => persist({ ...saved, innings: i }),
      setOver: (o) => persist({ ...saved, over: o }),
      step: (d) => { const n = seasonMatches[idx + d]; if (n) persist({ ...saved, matchId: n.id }); },
      canPrev: idx > 0, canNext: idx >= 0 && idx < seasonMatches.length - 1,
    };
  }, [saved, ver]);
  return <SelCtx.Provider value={value}>{children}</SelCtx.Provider>;
}

const mLabel = (r) => `${String(r.date).slice(5)} · ${r.label}${r.stage && r.stage !== "League" && r.stage !== "null" ? " · " + r.stage : ""}`;

/* Compact bar under the page header. `opts` says which controls matter for the page. */
function SelectorBar({ opts = {}, go }) {
  const s = useSelection();
  if (!s) return null;
  if (!s.ready) {
    return <div className="selbar"><span className="selbar-l">Historical match</span><span className="note">matches.json is not loaded yet. Run notebook 08, then press Re-read data folder on Connect data.</span>
      <button className="btn ghost sm" onClick={() => go("data")}>Connect data</button></div>;
  }
  const m = s.match;
  const sp = m ? splitOf(m.id) : null;
  return (
    <div className="selbar" role="group" aria-label="Historical match selection">
      <span className="selbar-l">Historical match</span>
      <select id="sel-season" className="sel-input" aria-label="IPL season" value={s.season} onChange={(e) => s.setSeason(e.target.value === "all" ? "all" : Number(e.target.value))}>
        <option value="all">All seasons</option>{s.seasons.map((x) => <option key={x} value={x}>IPL {x}</option>)}
      </select>
      <button className="btn ghost sm" aria-label="Previous match" disabled={!s.canPrev} onClick={() => s.step(-1)}>‹</button>
      <select id="sel-match" className="sel-input selbar-m" aria-label="Match" value={s.matchId} onChange={(e) => s.setMatch(e.target.value)}>
        {s.seasonMatches.map((r) => <option key={r.id} value={r.id}>{(s.season === "all" ? r.season + " · " : "") + mLabel(r)}</option>)}
      </select>
      <button className="btn ghost sm" aria-label="Next match" disabled={!s.canNext} onClick={() => s.step(1)}>›</button>
      {opts.innings && <Seg value={s.innings} onChange={s.setInnings} label="Innings" options={[{ value: 1, label: "1st innings" }, { value: 2, label: "Chase" }]} />}
      {opts.over && (
        <label className="selbar-o">Over <b>{s.over}</b>
          <input id="sel-over" className="range" type="range" min="1" max="20" value={s.over} onChange={(e) => s.setOver(+e.target.value)} aria-label="Over" /></label>
      )}
      <span className="grow" />
      {m && (sp ? <Chip tone={sp === "train" ? "warn" : "good"}>{sp === "val" ? "Validation" : sp === "hold" ? "Holdout" : "In-sample"}</Chip>
        : <Chip tone="mute">{MD.loaded.predictions ? "No out-of-sample prediction" : "predictions.json not loaded"}</Chip>)}
    </div>
  );
}

export { SelectionProvider, useSelection, SelectorBar, mLabel };
