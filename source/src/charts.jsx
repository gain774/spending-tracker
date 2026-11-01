import React, { useEffect, useRef, useState } from "react";

/* 親要素の幅を測る（グラフを実ピクセルで描くため） */
function useWidth(initial = 280) {
  const ref = useRef(null);
  const [w, setW] = useState(initial);
  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const set = () => setW(Math.max(240, Math.round(el.clientWidth)));
    set();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/* ===== ドーナツ円グラフ（各スライスに名前と割合を直接表示） ===== */
export function DonutChart({ data, money, centerLabel = "合計" }) {
  const [ref, w] = useWidth();
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total) return <div ref={ref}><p className="empty">データがありません</p></div>;

  const H = Math.max(240, Math.ceil(data.length / 2 + 2) * 19 + 40);
  const cx = w / 2, cy = H / 2;
  const r = Math.max(48, Math.min(88, w / 2 - 102));
  const ir = r * 0.6;
  const labelX = (side) => cx + side * (r + 20);

  let a0 = -Math.PI / 2;
  const slices = data.map((d) => {
    const ang = (d.value / total) * Math.PI * 2;
    const s = { ...d, a0, a1: a0 + ang, mid: a0 + ang / 2, pct: Math.round((d.value / total) * 100) };
    a0 += ang;
    return s;
  });

  const arcPath = (s) => {
    const large = s.a1 - s.a0 > Math.PI ? 1 : 0;
    const p = (rad, a) => [cx + rad * Math.cos(a), cy + rad * Math.sin(a)];
    if (s.a1 - s.a0 >= Math.PI * 2 - 1e-6) {
      return `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r} L ${cx - 0.01} ${cy - ir} A ${ir} ${ir} 0 1 0 ${cx} ${cy - ir} Z`;
    }
    const [x0, y0] = p(r, s.a0), [x1, y1] = p(r, s.a1), [x2, y2] = p(ir, s.a1), [x3, y3] = p(ir, s.a0);
    return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} L ${x2} ${y2} A ${ir} ${ir} 0 ${large} 0 ${x3} ${y3} Z`;
  };

  // ラベル位置（左右に振り分け、重なりを避けて縦に並べる）
  const gap = 18, top = 12, bottom = H - 8;
  const sides = { "-1": [], "1": [] };
  slices.forEach((s) => {
    const side = Math.cos(s.mid) >= 0 ? 1 : -1;
    sides[side].push({ s, side, y: cy + (r + 14) * Math.sin(s.mid) });
  });
  Object.values(sides).forEach((arr) => {
    arr.sort((a, b) => a.y - b.y);
    for (let i = 0; i < arr.length; i++) arr[i].y = Math.max(arr[i].y, i ? arr[i - 1].y + gap : top);
    const over = arr.length ? arr[arr.length - 1].y - bottom : 0;
    if (over > 0) arr.forEach((l) => (l.y -= over));
    for (let i = arr.length - 2; i >= 0; i--) arr[i].y = Math.min(arr[i].y, arr[i + 1].y - gap);
  });
  const labels = [...sides["-1"], ...sides["1"]];

  return (
    <div ref={ref} className="donutWrap">
      <svg width={w} height={H} role="img" aria-label="カテゴリ構成">
        {slices.map((s) => <path key={s.name} d={arcPath(s)} fill={s.color} stroke="var(--panel)" strokeWidth="1.5" />)}
        {labels.map(({ s, side, y }) => {
          const ex = cx + (r + 3) * Math.cos(s.mid), ey = cy + (r + 3) * Math.sin(s.mid);
          const bx = cx + (r + 14) * Math.cos(s.mid);
          const lx = labelX(side);
          return (
            <g key={"l" + s.name}>
              <polyline points={`${ex},${ey} ${bx},${y} ${lx - side * 4},${y}`} fill="none" stroke={s.color} strokeWidth="1.2" />
              <text x={lx} y={y} dy="0.35em" textAnchor={side > 0 ? "start" : "end"} className="donutLabel">
                {s.name}<tspan className="donutPct"> {s.pct}%</tspan>
              </text>
            </g>
          );
        })}
        <text x={cx} y={cy - 7} textAnchor="middle" className="donutCenterSub">{centerLabel}</text>
        <text x={cx} y={cy + 12} textAnchor="middle" className="donutCenter">{money(total)}</text>
      </svg>
      <div className="pieLegend">
        {slices.map((s) => (
          <div className="plRow" key={s.name}>
            <span className="plL"><span className="dot" style={{ background: s.color }} />{s.name}</span>
            <span className="plR"><span className="num">{money(s.value)}</span><span className="plPct">{s.pct}%</span></span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ===== 折れ線グラフ（タップで値表示） ===== */
export function LineChart({ labels, series, money, privacy, height = 230 }) {
  const [ref, w] = useWidth();
  const [hover, setHover] = useState(null);
  const n = labels.length;
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const step = Math.pow(10, Math.floor(Math.log10(max)));
  const niceMax = Math.ceil(max / step) * step;
  const L = 44, R = 12, T = 12, B = 26;
  const pw = w - L - R, ph = height - T - B;
  const x = (i) => L + (n <= 1 ? pw / 2 : (pw * i) / (n - 1));
  const y = (v) => T + ph - (v / niceMax) * ph;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * niceMax);
  const fmtK = (v) => (privacy ? "" : v >= 10000 ? Math.round(v / 1000) + "k" : v >= 1000 ? (v / 1000).toFixed(1).replace(/\.0$/, "") + "k" : String(v));
  const every = Math.ceil(n / Math.max(1, Math.floor(pw / 46)));

  return (
    <div ref={ref} className="lineWrap">
      <svg width={w} height={height} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={w - R} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeDasharray="3 3" />
            <text x={L - 6} y={y(t)} dy="0.35em" textAnchor="end" className="axisText">{fmtK(t)}</text>
          </g>
        ))}
        {labels.map((lb, i) => (i % every === 0 || i === n - 1) && <text key={lb + i} x={x(i)} y={height - 8} textAnchor="middle" className="axisText">{lb}</text>)}
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={T} y2={T + ph} stroke="var(--sub)" strokeWidth="1" />}
        {series.map((s) => (
          <g key={s.name}>
            <polyline points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")} fill="none" stroke={s.color} strokeWidth={series.length > 1 ? 2 : 2.5} strokeLinejoin="round" strokeLinecap="round" />
            {s.values.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r={hover === i ? 4.5 : series.length > 1 ? 0 : 3} fill={s.color} />)}
          </g>
        ))}
        {labels.map((lb, i) => (
          <rect key={"h" + i} x={x(i) - (n <= 1 ? pw : pw / (n - 1)) / 2} y={T} width={n <= 1 ? pw : pw / (n - 1)} height={ph} fill="transparent"
            onMouseEnter={() => setHover(i)} onClick={() => setHover(hover === i ? null : i)} />
        ))}
      </svg>
      {hover != null && (
        <div className="lineTip">
          <b>{labels[hover]}</b>
          {series.map((s) => <span key={s.name}><i style={{ background: s.color }} />{series.length > 1 ? s.name + " " : ""}<span className="num">{money(s.values[hover])}</span></span>)}
        </div>
      )}
      {series.length > 1 && (
        <div className="lineLegend">{series.map((s) => <span key={s.name}><i style={{ background: s.color }} />{s.name}</span>)}</div>
      )}
    </div>
  );
}
