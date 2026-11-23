import React, { useState, useEffect } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine } from "recharts";
import { D, clamp, CHECK_OVERS } from "./lib.js";

/* Shared UI helpers (moved out of main.jsx unchanged so new modules can reuse them). */
/* ---------- helpers ---------- */
const f2s = (x) => (x > 0 ? "+" : x < 0 ? "−" : "") + Math.abs(x).toFixed(2);
const f3s = (x) => (x > 0 ? "+" : x < 0 ? "−" : "") + Math.abs(x).toFixed(3);
const pct = (x, d = 0) => (x * 100).toFixed(d) + "%";
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
};
function copyText(text) {
  const fallback = () => {
    const ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch (e) {} document.body.removeChild(ta);
  };
  try { navigator.clipboard.writeText(text).catch(fallback); } catch (e) { fallback(); }
}
function toCsv(rows) { return rows.map((r) => r.map((c) => (typeof c === "string" && c.includes(",") ? '"' + c + '"' : c)).join(",")).join("\n"); }

function usePalette() {
  const read = () => {
    const cs = getComputedStyle(document.documentElement);
    const g = (n) => cs.getPropertyValue(n).trim();
    return { s1: g("--s1"), s2: g("--s2"), s3: g("--s3"), s4: g("--s4"), mute: g("--muted"), line: g("--line"), text: g("--text"), good: g("--good"), warn: g("--warn"), bad: g("--bad"), panel: g("--panel"), accent: g("--accent") };
  };
  const [p, setP] = useState(read);
  useEffect(() => {
    const f = () => setP(read());
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener ? mq.addEventListener("change", f) : mq.addListener(f);
    const mo = new MutationObserver(f); mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    f();
    return () => { mo.disconnect(); mq.removeEventListener && mq.removeEventListener("change", f); };
  }, []);
  return p;
}
const PalCtx = React.createContext(null);
const usePal = () => React.useContext(PalCtx);
const seriesColors = (pal) => [pal.s1, pal.s2, pal.s3, pal.s4, pal.mute, pal.warn];

/* ---------- small ui ---------- */
function Chip({ tone = "mute", children }) { return <span className={"chip chip-" + tone}>{children}</span>; }
function Seg({ value, onChange, options, label }) {
  return (
    <div className="seg" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} className={value === o.value ? "on" : ""} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}
function Card({ title, sub, right, children, className = "" }) {
  return (
    <section className={"card " + className}>
      {(title || right) && (
        <header className="card-h">
          <div><h3>{title}</h3>{sub && <p className="sub">{sub}</p>}</div>
          {right && <div className="card-r">{right}</div>}
        </header>
      )}
      {children}
    </section>
  );
}
function Kpi({ label, value, note, tone }) {
  return (
    <div className="kpi">
      <div className="kpi-l">{label}</div>
      <div className={"kpi-v " + (tone ? "t-" + tone : "")}>{value}</div>
      {note && <div className="kpi-n">{note}</div>}
    </div>
  );
}
function CopyBtn({ get, label = "Copy CSV" }) {
  const [done, setDone] = useState(false);
  return <button className="btn ghost sm" onClick={() => { copyText(get()); setDone(true); setTimeout(() => setDone(false), 1400); }}>{done ? "Copied" : label}</button>;
}
function VerdictChip({ v }) {
  return v === "better" ? <Chip tone="good">better</Chip> : v === "worse" ? <Chip tone="bad">worse</Chip> : <Chip tone="mute">noise</Chip>;
}
function ChartTip({ active, payload, label, fmt, labelFmt }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="tip">
      <div className="tip-t">{labelFmt ? labelFmt(label) : label}</div>
      {payload.filter((p) => p.value !== null && p.value !== undefined && p.name !== "band").map((p, i) => (
        <div key={i} className="tip-r"><span className="dot" style={{ background: p.color || p.stroke }} />{p.name}<b>{fmt ? fmt(p.value, p) : p.value}</b></div>
      ))}
    </div>
  );
}
const axisProps = (pal) => ({ stroke: pal.line, tick: { fill: pal.mute, fontSize: 11, fontFamily: "IBM Plex Mono, monospace" }, tickLine: false });
function Empty({ title, children, go }) {
  return (
    <div className="empty">
      <h4>{title}</h4><p>{children}</p>
      {go && <button className="btn" onClick={() => go("data")}>Connect data</button>}
    </div>
  );
}
function SourceChip({ names }) {
  const have = names.filter((n) => D.live[n]);
  if (have.length === names.length) return <Chip tone="good">Exported · {D.live[have[0]].generated ? D.live[have[0]].generated.slice(0, 10) : "loaded"}</Chip>;
  return <Chip tone="warn">Sample numbers</Chip>;
}

/* Forest plot (interval chart) in SVG */
function Forest({ rows, zero = 0, unit = "", xdomain, fmt = f2s, note, padL = 262 }) {
  const pal = usePal();
  const rowH = 38, padR = 22, padT = 8, padB = 30, W = 900;
  const lo = xdomain ? xdomain[0] : Math.min(...rows.map((r) => r.lo)) * 1.15;
  const hi = xdomain ? xdomain[1] : Math.max(...rows.map((r) => r.hi)) * 1.15;
  const x = (v) => padL + ((clamp(v, lo, hi) - lo) / (hi - lo)) * (W - padL - padR);
  const H = padT + rows.length * rowH + padB;
  const ticks = []; const step = (hi - lo) / 6;
  for (let i = 0; i <= 6; i++) ticks.push(lo + step * i);
  return (
    <div className="forest-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="forest" role="img" aria-label="Gain with 95% confidence intervals">
        {ticks.map((t, i) => (
          <g key={i}><line x1={x(t)} x2={x(t)} y1={padT} y2={H - padB} stroke={pal.line} strokeWidth="1" opacity="0.5" />
            <text x={x(t)} y={H - 10} textAnchor="middle" fontSize="10.5" fill={pal.mute} fontFamily="IBM Plex Mono, monospace">{t.toFixed(Math.abs(hi - lo) < 1 ? 2 : 1)}</text></g>
        ))}
        <line x1={x(zero)} x2={x(zero)} y1={padT} y2={H - padB} stroke={pal.text} strokeWidth="1.4" strokeDasharray="4 3" />
        {rows.map((r, i) => {
          const y = padT + i * rowH + rowH / 2;
          const col = r.verdict === "better" ? pal.good : r.verdict === "worse" ? pal.bad : pal.mute;
          return (
            <g key={i}>
              <text x={padL - 12} y={y + 4} textAnchor="end" fontSize="12" fill={pal.text}>{r.label}</text>
              <line x1={x(r.lo)} x2={x(r.hi)} y1={y} y2={y} stroke={col} strokeWidth="2.4" strokeLinecap="round" />
              <line x1={x(r.lo)} x2={x(r.lo)} y1={y - 5} y2={y + 5} stroke={col} strokeWidth="2" />
              <line x1={x(r.hi)} x2={x(r.hi)} y1={y - 5} y2={y + 5} stroke={col} strokeWidth="2" />
              <circle cx={x(r.gain)} cy={y} r="5.5" fill={col} stroke={pal.panel} strokeWidth="2" />
              <title>{`${r.label}: ${fmt(r.gain)} [${fmt(r.lo)}, ${fmt(r.hi)}] ${unit}`}</title>
            </g>
          );
        })}
      </svg>
      {note && <p className="note">{note}</p>}
    </div>
  );
}
/* gain map: comparisons x overs, colored by verdict */
function GainMap({ gains, digits = 3 }) {
  const keys = Object.keys(gains);
  const overs = [...CHECK_OVERS, "ALL"];
  const fm = (x) => (x > 0 ? "+" : x < 0 ? "−" : "") + Math.abs(x).toFixed(digits);
  if (!keys.length) return <p className="note">No comparison table in this export.</p>;
  return (
    <>
      <div className="tbl-wrap"><table className="tbl map">
        <thead><tr><th>Comparison</th>{overs.map((o) => <th key={o} className="r">{o === "ALL" ? "All" : "Over " + o}</th>)}</tr></thead>
        <tbody>{keys.map((k) => (
          <tr key={k}><td>{k}</td>{overs.map((o) => { const g = gains[k].find((x) => String(x.over) === String(o)); return g ? <td key={o} className={"r mono cell cell-" + g.verdict} title={`${fm(g.gain)} [${fm(g.lo)}, ${fm(g.hi)}]`}>{fm(g.gain)}</td> : <td key={o} className="r">–</td>; })}</tr>
        ))}</tbody>
      </table></div>
      <div className="legend"><span><i className="sw sw-better" />challenger better</span><span><i className="sw sw-noise" />noise</span><span><i className="sw sw-worse" />reference better</span></div>
    </>
  );
}
/* multi-line chart helper for by-over tables */
function ByOver({ overs, series, domain, fmt, height = "h320", refY }) {
  const pal = usePal(); const cols = seriesColors(pal);
  const data = overs.map((o, i) => Object.fromEntries([["over", o], ...series.map((s) => [s.name, s.values[i]])]));
  return (
    <div className={"chart " + height}><ResponsiveContainer><LineChart data={data} margin={{ top: 8, right: 14, left: -6, bottom: 0 }}>
      <CartesianGrid stroke={pal.line} strokeDasharray="3 4" vertical={false} />
      <XAxis dataKey="over" type="number" domain={[1, 19]} ticks={[1, 3, 5, 7, 9, 11, 13, 15, 17, 19]} {...axisProps(pal)} />
      <YAxis domain={domain || ["auto", "auto"]} {...axisProps(pal)} />
      <Tooltip content={<ChartTip fmt={fmt} labelFmt={(l) => "Over " + l} />} />
      <Legend wrapperStyle={{ fontSize: 11 }} />
      {refY !== undefined && <ReferenceLine y={refY} stroke={pal.mute} strokeDasharray="4 4" />}
      {series.map((s, i) => <Line key={s.name} dataKey={s.name} stroke={s.color || cols[i % cols.length]} strokeWidth={s.bold ? 3 : 2} strokeDasharray={s.dash ? "5 4" : undefined} dot={false} connectNulls />)}
    </LineChart></ResponsiveContainer></div>
  );
}

function Field({ id, label, children, hint }) {
  return <div className="field"><label htmlFor={id}>{label}</label>{children}{hint && <small>{hint}</small>}</div>;
}
function Num({ id, value, onChange, min, max, step = 1 }) {
  return (
    <div className="num">
      <button type="button" aria-label="decrease" onClick={() => onChange(clamp(value - step, min, max))}>−</button>
      <input id={id} type="number" value={value} min={min} max={max} step={step} onChange={(e) => onChange(clamp(parseFloat(e.target.value) || 0, min, max))} />
      <button type="button" aria-label="increase" onClick={() => onChange(clamp(value + step, min, max))}>+</button>
    </div>
  );
}
function Gauge({ p, label, tone }) {
  const pal = usePal();
  const R = 78, C = Math.PI * R, off = C * (1 - clamp(p, 0, 1));
  const col = tone === "chase" ? pal.s3 : pal.s1;
  return (
    <div className="gauge">
      <svg viewBox="0 0 200 118" aria-label={label + " " + pct(p, 1)}>
        <path d="M 22 100 A 78 78 0 0 1 178 100" fill="none" stroke={pal.line} strokeWidth="14" strokeLinecap="round" />
        <path d="M 22 100 A 78 78 0 0 1 178 100" fill="none" stroke={col} strokeWidth="14" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={off} style={{ transition: "stroke-dashoffset .5s ease" }} />
        <text x="100" y="86" textAnchor="middle" fontSize="34" fontWeight="600" fill={pal.text} fontFamily="Bricolage Grotesque, sans-serif">{pct(p, 1)}</text>
        <text x="100" y="108" textAnchor="middle" fontSize="11" fill={pal.mute}>{label}</text>
      </svg>
    </div>
  );
}

export { f2s, f3s, pct, store, copyText, toCsv, usePalette, PalCtx, usePal, seriesColors, Chip, Seg, Card, Kpi, CopyBtn, VerdictChip, ChartTip, axisProps, Empty, SourceChip, Forest, GainMap, ByOver, Field, Num, Gauge };
