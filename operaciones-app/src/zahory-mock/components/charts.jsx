import React, { useState, useRef, useEffect, useMemo } from 'react';
import { fmt, fmt2 } from './shell.jsx';

// ---------- Donut chart ----------
export const Donut = ({ data, currency, fx }) => {
  const [hover, setHover] = useState(null);
  const total = data.reduce((a, b) => a + b.value, 0);
  const size = 200, r = 70, cx = size / 2, cy = size / 2;
  let angle = -Math.PI / 2;
  const arcs = data.map(d => {
    const a = (d.value / total) * Math.PI * 2;
    const start = angle;
    const end = angle + a;
    angle = end;
    const large = a > Math.PI ? 1 : 0;
    const x1 = cx + r * Math.cos(start), y1 = cy + r * Math.sin(start);
    const x2 = cx + r * Math.cos(end),   y2 = cy + r * Math.sin(end);
    const mid = (start + end) / 2;
    return { ...d, path: `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`, mid, pct: (d.value / total * 100) };
  });

  return (
    <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ position: "relative", width: size, height: size }}>
        <svg width={size} height={size}>
          {arcs.map((a, i) => (
            <path key={i} d={a.path} fill={a.color}
              stroke="white" strokeWidth="2"
              style={{ transition: "opacity 0.12s", opacity: hover === null || hover === i ? 1 : 0.45, cursor: "pointer" }}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)} />
          ))}
          <circle cx={cx} cy={cy} r={42} fill="white"/>
        </svg>
        <div className="donut-center">
          <div className="lbl">Costo total</div>
          <div className="big">{fmt(total, currency, fx)}</div>
        </div>
        {hover !== null && (
          <div className="tooltip-box" style={{ left: "50%", top: "-6px" }}>
            <div className="bold">{arcs[hover].label}</div>
            <div className="t-row"><span className="t-label">Monto</span><span className="t-val">{fmt2(arcs[hover].value, currency, fx)}</span></div>
            <div className="t-row"><span className="t-label">Porcentaje</span><span className="t-val">{arcs[hover].pct.toFixed(1)}%</span></div>
          </div>
        )}
      </div>
      <div className="chart-legend">
        {arcs.map((a, i) => (
          <div className="item" key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ cursor: "pointer" }}>
            <span className="sw" style={{ background: a.color }}/>
            <span className="bold">{a.label}</span>
            <span className="amt">{a.pct.toFixed(0)}% · {fmt(a.value, currency, fx)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ---------- Grouped bars: cost vs revenue per OT ----------
export const GroupedBars = ({ data, currency, fx }) => {
  const [hover, setHover] = useState(null);
  const w = 780, h = 280, padL = 50, padR = 14, padT = 14, padB = 40;
  const max = Math.max(...data.map(d => Math.max(d.rev, d.cost)));
  const niceMax = Math.ceil(max / 2000) * 2000;
  const bw = (w - padL - padR) / data.length;
  const barW = bw * 0.36;
  const y = v => padT + (h - padT - padB) * (1 - v / niceMax);
  const ticks = 5;
  return (
    <div style={{ position: "relative", width: "100%", overflowX: "auto" }}>
      <svg width={w} height={h} style={{ display: "block" }}>
        {/* grid */}
        {Array.from({ length: ticks + 1 }).map((_, i) => {
          const v = (niceMax / ticks) * i;
          return (
            <g key={i}>
              <line x1={padL} x2={w - padR} y1={y(v)} y2={y(v)} stroke="#ECEFF1" />
              <text x={padL - 8} y={y(v) + 4} fontSize="10" fill="#607D8B" textAnchor="end">{fmt(v, currency, fx)}</text>
            </g>
          );
        })}
        {data.map((d, i) => {
          const cx = padL + bw * i + bw / 2;
          const revX = cx - barW - 2;
          const costX = cx + 2;
          const revH = (h - padT - padB) * (d.rev / niceMax);
          const costH = (h - padT - padB) * (d.cost / niceMax);
          const isHover = hover === i;
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ cursor: "pointer" }}>
              <rect x={padL + bw * i} y={padT} width={bw} height={h - padT - padB} fill="transparent"/>
              <rect x={revX} y={h - padB - revH} width={barW} height={revH} fill="#1A2B4A" opacity={isHover ? 1 : 0.92} rx="2"/>
              <rect x={costX} y={h - padB - costH} width={barW} height={costH} fill="#607D8B" opacity={isHover ? 1 : 0.92} rx="2"/>
              <text x={cx} y={h - padB + 14} fontSize="9.5" fill="#1A2B4A" textAnchor="middle" fontFamily="ui-monospace, monospace">{d.label}</text>
              <text x={cx} y={h - padB + 26} fontSize="10" fill={d.margin >= 60 ? "#4CAF50" : d.margin >= 30 ? "#FF9800" : "#E53935"} textAnchor="middle" fontWeight="700">{d.margin.toFixed(0)}%</text>
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div className="tooltip-box" style={{ left: padL + bw * hover + bw / 2, top: 8 }}>
          <div className="bold" style={{ marginBottom: 4 }}>{data[hover].label}</div>
          <div className="t-row"><span className="t-label">Ingreso</span><span className="t-val">{fmt(data[hover].rev, currency, fx)}</span></div>
          <div className="t-row"><span className="t-label">Costo</span><span className="t-val">{fmt(data[hover].cost, currency, fx)}</span></div>
          <div className="t-row"><span className="t-label">Margen</span><span className="t-val">{data[hover].margin.toFixed(1)}%</span></div>
        </div>
      )}
      <div className="chart-legend">
        <div className="item"><span className="sw" style={{ background: "#1A2B4A" }}/><span>Ingreso facturable</span></div>
        <div className="item"><span className="sw" style={{ background: "#607D8B" }}/><span>Costo total</span></div>
      </div>
    </div>
  );
};

// ---------- Horizontal bars: margin % ordered ----------
export const MarginBars = ({ data }) => {
  const [hover, setHover] = useState(null);
  const sorted = [...data].sort((a, b) => a.margin - b.margin);
  const rowH = 26;
  const w = 440, padL = 80, padR = 50, padT = 6;
  const h = sorted.length * rowH + padT + 20;
  const maxX = 100;
  const x = v => padL + (w - padL - padR) * (v / maxX);
  return (
    <div style={{ position: "relative" }}>
      <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`}>
        {/* threshold line at 60% */}
        <line x1={x(60)} x2={x(60)} y1={padT} y2={h - 20} stroke="#4CAF50" strokeDasharray="3 3" />
        <text x={x(60)} y={h - 6} fontSize="9.5" fill="#4CAF50" textAnchor="middle" fontWeight="700">60% umbral</text>
        {sorted.map((d, i) => {
          const yRow = padT + i * rowH + 6;
          const color = d.margin < 30 ? "#E53935" : d.margin < 60 ? "#FF9800" : "#4CAF50";
          const barW = x(d.margin) - padL;
          return (
            <g key={d.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ cursor: "pointer" }}>
              <text x={padL - 8} y={yRow + 12} fontSize="10.5" fill="#1A2B4A" textAnchor="end" fontFamily="ui-monospace, monospace">{d.label}</text>
              <rect x={padL} y={yRow} width={w - padL - padR} height={rowH - 10} fill="#F4F6F8" rx="3"/>
              <rect x={padL} y={yRow} width={barW} height={rowH - 10} fill={color} rx="3" opacity={hover === i ? 1 : 0.9}/>
              <text x={x(d.margin) + 4} y={yRow + 12} fontSize="10.5" fill={color} fontWeight="700">{d.margin.toFixed(1)}%</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

// ---------- Dual line: cumulative rev / cost ----------
export const CumulativeLines = ({ data, currency, fx }) => {
  const [hover, setHover] = useState(null);
  const w = 860, h = 260, padL = 60, padR = 14, padT = 14, padB = 34;
  const maxY = Math.max(...data.map(d => d.rev));
  const niceMax = Math.ceil(maxY / 20000) * 20000;
  const x = i => padL + (w - padL - padR) * (i / (data.length - 1));
  const y = v => padT + (h - padT - padB) * (1 - v / niceMax);
  const linePath = (key) => data.map((d, i) => (i === 0 ? "M" : "L") + x(i) + " " + y(d[key])).join(" ");
  const areaPath = "M" + data.map((d, i) => x(i) + " " + y(d.rev)).join(" L ") + " L " + x(data.length - 1) + " " + y(0) + " L " + x(0) + " " + y(0) + " Z";
  const ticks = 5;
  return (
    <div style={{ position: "relative", width: "100%", overflowX: "auto" }}>
      <svg width={w} height={h} style={{ display: "block" }}>
        {/* grid */}
        {Array.from({ length: ticks + 1 }).map((_, i) => {
          const v = (niceMax / ticks) * i;
          return (
            <g key={i}>
              <line x1={padL} x2={w - padR} y1={y(v)} y2={y(v)} stroke="#ECEFF1"/>
              <text x={padL - 8} y={y(v) + 4} fontSize="10" fill="#607D8B" textAnchor="end">{fmt(v, currency, fx)}</text>
            </g>
          );
        })}
        {/* x labels */}
        {data.filter((_, i) => i % 3 === 0 || i === data.length - 1).map((d, i) => (
          <text key={i} x={x(data.indexOf(d))} y={h - padB + 14} fontSize="9.5" fill="#607D8B" textAnchor="middle">{d.d}</text>
        ))}
        {/* margin area (below rev line, above cost) — tint when rev>cost */}
        <path d={"M" + data.map((d, i) => x(i) + " " + y(d.rev)).join(" L ") + " L " + data.slice().reverse().map((d, i) => x(data.length - 1 - i) + " " + y(d.cost)).join(" L ") + " Z"} fill="#E8F5E9"/>
        {/* cost line (red) */}
        <path d={linePath("cost")} fill="none" stroke="#E53935" strokeWidth="2.2"/>
        {/* revenue line (green) */}
        <path d={linePath("rev")} fill="none" stroke="#4CAF50" strokeWidth="2.6"/>
        {/* dots + interaction */}
        {data.map((d, i) => (
          <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ cursor: "pointer" }}>
            <rect x={x(i) - (w / data.length / 2)} y={padT} width={w / data.length} height={h - padT - padB} fill="transparent"/>
            {hover === i && (
              <>
                <line x1={x(i)} x2={x(i)} y1={padT} y2={h - padB} stroke="#1A2B4A" strokeDasharray="3 3"/>
                <circle cx={x(i)} cy={y(d.rev)} r="4" fill="#4CAF50"/>
                <circle cx={x(i)} cy={y(d.cost)} r="4" fill="#E53935"/>
              </>
            )}
          </g>
        ))}
      </svg>
      {hover !== null && (
        <div className="tooltip-box" style={{ left: padL + (w - padL - padR) * (hover / (data.length - 1)), top: 8 }}>
          <div className="bold" style={{ marginBottom: 4 }}>Día {data[hover].d} abril</div>
          <div className="t-row"><span className="t-label">Ingreso acum.</span><span className="t-val" style={{ color: "#7FD889" }}>{fmt(data[hover].rev, currency, fx)}</span></div>
          <div className="t-row"><span className="t-label">Costo acum.</span><span className="t-val" style={{ color: "#FF8A82" }}>{fmt(data[hover].cost, currency, fx)}</span></div>
          <div className="t-row"><span className="t-label">Margen acum.</span><span className="t-val">{fmt(data[hover].rev - data[hover].cost, currency, fx)}</span></div>
        </div>
      )}
      <div className="chart-legend">
        <div className="item"><span className="sw" style={{ background: "#4CAF50" }}/><span>Ingreso acumulado</span></div>
        <div className="item"><span className="sw" style={{ background: "#E53935" }}/><span>Costo acumulado</span></div>
        <div className="item"><span className="sw" style={{ background: "#E8F5E9", border: "1px solid #CDE7CE" }}/><span>Margen del período</span></div>
      </div>
    </div>
  );
};

