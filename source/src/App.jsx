import React, { useState, useMemo, useEffect, useRef } from "react";
import { RAW } from "./data.js";
import { DonutChart, LineChart } from "./charts.jsx";
import CSS from "./styles.css";

/* ============================== 共通ユーティリティ ============================== */
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const TODAY = ymd(new Date());
const THIS_MONTH = TODAY.slice(0, 7);
const monthKey = (s) => (s || "").slice(0, 7);
const monthLabel = (k) => { const [y, m] = (k || "").split("-"); return y ? `${y}年${Number(m)}月` : "—"; };
const lastDay = (y, m) => new Date(y, m, 0).getDate();
const fmtMD = (s) => { if (!s) return ""; const [, m, d] = s.split("-"); return `${Number(m)}/${Number(d)}`; };
const addMonth = (k, n) => { let [y, m] = k.split("-").map(Number); m += n; while (m > 12) { m -= 12; y++; } while (m < 1) { m += 12; y--; } return `${y}-${pad(m)}`; };
const WK = ["日", "月", "火", "水", "木", "金", "土"];
const dayTitle = (ds) => { const [y, m, d] = ds.split("-").map(Number); return `${m}月${d}日(${WK[new Date(y, m - 1, d).getDay()]})`; };
const compact = (n) => (n >= 10000 ? Math.round(n / 1000) + "k" : n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, "") + "k" : String(n));
const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

function monthRange(a, b) {
  const out = []; let k = a, guard = 0;
  while (k <= b && guard++ < 240) { out.push(k); k = addMonth(k, 1); }
  return out;
}

const CATS = [
  { key: "食費", color: "#e2725b" }, { key: "コンビニ", color: "#e8a13a" }, { key: "スーパー", color: "#5fa052" },
  { key: "通販", color: "#4f86e8" }, { key: "固定費", color: "#8e7cc3" }, { key: "交通", color: "#36b3a8" },
  { key: "娯楽・課金", color: "#d96ba0" }, { key: "衣類・日用", color: "#c9a227" }, { key: "その他", color: "#9aa0a6" },
];
const catColor = (k) => (CATS.find((c) => c.key === k) || {}).color || "#9aa0a6";
function autoCat(m) {
  if (/すき家|マクドナルド|ケンタッキー|menu|マックデリバリー|温野菜|横浜屋|吉野家|松屋|ガスト|スタバ|スターバックス/.test(m)) return "食費";
  if (/セブン|ローソン|ミニストップ|ファミリーマート|ファミマ/.test(m)) return "コンビニ";
  if (/ライフ|OK|イオン|スーパー|まいばすけっと/.test(m)) return "スーパー";
  if (/Amazon|アマゾン|楽天|Yahoo|メルカリ/.test(m)) return "通販";
  if (/Netflix|Spotify|Adobe|携帯|電気|ガス|水道|保険/.test(m)) return "固定費";
  if (/Suica|PASMO|京急|S\.RIDE|定期|JR|タクシー|ENEOS|ガソリン/.test(m)) return "交通";
  if (/Google|eFootball|SPWN|シーモア|ピッコマ|DRAMABOX|LOOP|Steam|PlayStation|Nintendo|Apple/.test(m)) return "娯楽・課金";
  if (/ユニクロ|ワークマン|無印|GU|ニトリ|ダイソー|ドラッグ|マツキヨ/.test(m)) return "衣類・日用";
  return "その他";
}

const CARD_PALETTE = ["#4f86e8", "#e2725b", "#5fa052", "#8e7cc3", "#e8a13a", "#36b3a8", "#d96ba0", "#c9a227"];

function defaultRule(c) {
  if (/デビット/.test(c)) return { bank: "", type: "debit", closeDay: 31, payMonthOffset: 1, payDay: 27 };
  if (/JCB/i.test(c)) return { bank: "", type: "credit", closeDay: 15, payMonthOffset: 1, payDay: 10 };
  if (/三井住友/.test(c)) return { bank: "", type: "credit", closeDay: 31, payMonthOffset: 1, payDay: 26 };
  return { bank: "", type: "credit", closeDay: 31, payMonthOffset: 1, payDay: 27 };
}
function paymentDateFor(date, rule) {
  if (!rule || !date) return null;
  if (rule.type === "debit") return date;
  const [y, m, d] = date.split("-").map(Number);
  const close = Math.min(rule.closeDay, lastDay(y, m));
  let cy = y, cm = m;
  if (d > close) { cm++; if (cm > 12) { cm = 1; cy++; } }
  let py = cy, pm = cm + (rule.payMonthOffset || 1);
  while (pm > 12) { pm -= 12; py++; }
  return `${py}-${pad(pm)}-${pad(Math.min(rule.payDay, lastDay(py, pm)))}`;
}

/* ---- 端末内保存（キーは旧版と互換の st_*） ---- */
function loadPref(k, d) { try { const v = localStorage.getItem("st_" + k); return v != null ? JSON.parse(v) : d; } catch { return d; } }
function savePref(k, v) { try { localStorage.setItem("st_" + k, JSON.stringify(v)); } catch {} }
function delPref(k) { try { localStorage.removeItem("st_" + k); } catch {} }

const sigOf = (r) => `${r.c}|${r.d}|${r.m}|${r.a}`;
function keysFor(list) { const cnt = {}; return list.map((r) => { const s = sigOf(r); cnt[s] = (cnt[s] || 0) + 1; return s + "#" + cnt[s]; }); }

/* 旧版は明細を「配列の番号」で記録していたので、安定したキーへ移行する */
const INIT = (() => {
  const liveTx = loadPref("liveTx", null);
  const parsed = liveTx && liveTx.length ? liveTx : RAW;
  const keys = keysFor(parsed);
  const migrate = (name) => {
    const m = loadPref(name, {}); let changed = false; const out = {};
    Object.entries(m).forEach(([k, v]) => { if (/^\d+$/.test(k)) { changed = true; if (keys[+k]) out[keys[+k]] = v; } else out[k] = v; });
    if (changed) savePref(name, out);
    return out;
  };
  const ruleMap = loadPref("ruleMap", {});
  const accts = (loadPref("accounts", []) || []).map((a) => (typeof a === "string" ? { name: a } : a)).filter((a) => a && a.name);
  const names = new Set(accts.map((a) => a.name));
  Object.values(ruleMap).forEach((r) => { const b = (r && r.bank || "").trim(); if (b && !names.has(b)) { names.add(b); accts.push({ name: b }); } });
  const layout = (loadPref("homeLayout", null) || ["stats", "upcoming", "pie", "trend"]).filter((k) => k !== "budget" && k !== "accounts");
  return {
    liveTx, catMap: migrate("catMap"), billDateMap: migrate("billDateMap"), ruleMap, accts, layout,
  };
})();

const WIDGET_KEYS = ["stats", "upcoming", "calendar", "pie", "trend", "categories", "recent"];
const WLABEL = { stats: "利用・支払いサマリー", upcoming: "引落予定（今月・来月）", calendar: "カレンダー", pie: "カテゴリ構成（円）", trend: "月次推移", categories: "項目別集計", recent: "直近の利用" };

function Icon({ name }) {
  const c = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" };
  let b;
  if (name === "home") b = (<><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.8V20h14V9.8" /></>);
  else if (name === "cal") b = (<><rect x="3" y="4.5" width="18" height="16" rx="2" /><path d="M3 9.5h18M8 2.5v4M16 2.5v4" /></>);
  else if (name === "pay") b = (<><rect x="2.5" y="5" width="19" height="14" rx="2" /><path d="M2.5 10h19" /></>);
  else if (name === "chart") b = (<><path d="M3 17l5-6 4 3 6-8" /><path d="M3 21h18" /></>);
  else if (name === "eye") b = (<><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>);
  else if (name === "eyeoff") b = (<><path d="M3 3l18 18" /><path d="M10.6 10.6a3 3 0 0 0 4.2 4.2" /><path d="M9.9 5.1A9.6 9.6 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.1 6.1A17 17 0 0 0 2 12s3.6 7 10 7a9.6 9.6 0 0 0 3.9-.8" /></>);
  else if (name === "refresh") b = (<><path d="M21 12a9 9 0 1 1-2.6-6.4" /><path d="M21 3.5v6h-6" /></>);
  else if (name === "gear") b = (<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></>);
  else if (name === "plus") b = (<><path d="M12 5v14M5 12h14" /></>);
  else b = (<><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" /></>);
  return <svg viewBox="0 0 24 24" width="22" height="22" {...c}>{b}</svg>;
}

/* ============================== メイン ============================== */
export default function App() {
  /* ---------- 保存される状態 ---------- */
  const [liveTx, setLiveTx] = useState(INIT.liveTx);
  const [manualTx, setManualTx] = useState(() => loadPref("manualTx", []));
  const [manualCards, setManualCards] = useState(() => loadPref("manualCards", []));
  const [txEditMap, setTxEditMap] = useState(() => loadPref("txEditMap", {}));
  const [catMap, setCatMap] = useState(INIT.catMap);
  const [billDateMap, setBillDateMap] = useState(INIT.billDateMap);
  const [billExclude, setBillExclude] = useState(() => loadPref("billExclude", {}));
  const [billExtras, setBillExtras] = useState(() => loadPref("billExtras", []));
  const [billOverride, setBillOverride] = useState(() => loadPref("billOverride", {}));
  const [paidMap, setPaidMap] = useState(() => loadPref("paidMap", {}));
  const [ruleMap, setRuleMap] = useState(INIT.ruleMap);
  const [bankAccts, setBankAccts] = useState(INIT.accts);
  const [cardNameMap, setCardNameMap] = useState(() => loadPref("cardNameMap", {}));
  const [homeLayout, setHomeLayout] = useState(INIT.layout);
  const [theme, setTheme] = useState(() => loadPref("theme", "light"));
  const [privacy, setPrivacy] = useState(() => loadPref("privacy", false));
  const [mergeDup, setMergeDup] = useState(() => loadPref("mergeDup", false));
  const [defaultTab, setDefaultTab] = useState(() => loadPref("defaultTab", "use"));
  const [gasUrl, setGasUrl] = useState(() => loadPref("gasUrl", ""));
  const [lastSync, setLastSync] = useState(() => loadPref("gasSyncAt", 0));

  /* ---------- 画面の状態 ---------- */
  const [tab, setTab] = useState(() => { const t = loadPref("defaultTab", "use"); return ["use", "cal", "bill", "analyze", "items"].includes(t) ? t : "use"; });
  const [sel, setSel] = useState(THIS_MONTH);
  const [cardFilter, setCardFilter] = useState("all");
  const [byCardLine, setByCardLine] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [editing, setEditing] = useState(null); // {type:'tx',key} | {type:'extra',id} | {type:'total',key}
  const [calDay, setCalDay] = useState(null);
  const [billBank, setBillBank] = useState("all");
  const [showPast, setShowPast] = useState(false);
  const [showPaid, setShowPaid] = useState(false);
  const [sortKey, setSortKey] = useState("amount");
  const [sortDir, setSortDir] = useState("desc");
  const [itemScope, setItemScope] = useState("month");
  const [expandedCat, setExpandedCat] = useState(null);
  const [homeEdit, setHomeEdit] = useState(false);
  const [newCard, setNewCard] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const [toast, setToast] = useState("");
  const toastRef = useRef();
  const [gasBusy, setGasBusy] = useState(false);
  const [gasMsg, setGasMsg] = useState({ ok: "", err: "" });

  /* 状態を変えて保存するヘルパー */
  const persist = (setter, key) => (fn) => setter((p) => { const n = typeof fn === "function" ? fn(p) : fn; savePref(key, n); return n; });
  const putManualTx = persist(setManualTx, "manualTx");
  const putManualCards = persist(setManualCards, "manualCards");
  const putTxEdit = persist(setTxEditMap, "txEditMap");
  const putCat = persist(setCatMap, "catMap");
  const putBillDate = persist(setBillDateMap, "billDateMap");
  const putExclude = persist(setBillExclude, "billExclude");
  const putExtras = persist(setBillExtras, "billExtras");
  const putOverride = persist(setBillOverride, "billOverride");
  const putPaid = persist(setPaidMap, "paidMap");
  const putRule = persist(setRuleMap, "ruleMap");
  const putAccts = persist(setBankAccts, "accounts");
  const putCardName = persist(setCardNameMap, "cardNameMap");
  const putLayout = persist(setHomeLayout, "homeLayout");

  const money = (n) => (privacy ? "¥•••" : (n < 0 ? "−¥" : "¥") + Math.abs(Math.round(n || 0)).toLocaleString("ja-JP"));
  const showToast = (m) => { setToast(m); clearTimeout(toastRef.current); toastRef.current = setTimeout(() => setToast(""), 2400); };
  const go = (t) => { setTab(t); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const cardName = (c) => cardNameMap[c] || c;

  /* ---------- 明細データ ---------- */
  const parsed = liveTx && liveTx.length ? liveTx : RAW;
  const tx = useMemo(() => {
    const keys = keysFor(parsed);
    const base = parsed.map((r, i) => {
      const key = keys[i], sig = sigOf(r);
      const ov = txEditMap[key] || (key.endsWith("#1") ? txEditMap[sig] : null);
      return { ...r, ...(ov || {}), key, orig: r, edited: !!ov };
    });
    let all = [...base, ...manualTx.map((r) => ({ ...r, key: r.id, manual: true }))];
    if (mergeDup) { const seen = new Set(); all = all.filter((r) => { const s = sigOf(r); if (seen.has(s)) return false; seen.add(s); return true; }); }
    return all.sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : 0));
  }, [parsed, manualTx, txEditMap, mergeDup]);

  const allCards = useMemo(() => [...new Set([...tx.map((r) => r.c), ...manualCards])].filter(Boolean), [tx, manualCards]);
  const ruleFor = (c) => ({ ...defaultRule(c), ...(ruleMap[c] || {}) });
  const effCat = (r) => catMap[r.key] || autoCat(r.m);
  const bankOf = (c) => ruleFor(c).bank || cardName(c) + "（口座未設定）";

  /* ---------- 引落（請求） ---------- */
  const billGroups = useMemo(() => {
    const g = {};
    const put = (bank, pd) => (g[bank + "|" + pd] = g[bank + "|" + pd] || { bank, pd, items: [], extras: [], sum: 0 });
    tx.forEach((r) => {
      if (billExclude[r.key]) return;
      const pd = billDateMap[r.key] || paymentDateFor(r.d, ruleFor(r.c));
      if (!pd) return;
      const grp = put(bankOf(r.c), pd);
      grp.items.push({ ...r, payDate: pd });
      grp.sum += r.a;
    });
    billExtras.forEach((x) => { if (!x.pd || !x.bank) return; const grp = put(x.bank, x.pd); grp.extras.push(x); grp.sum += Number(x.amount) || 0; });
    return Object.entries(g).map(([key, grp]) => {
      const ov = billOverride[key];
      return { ...grp, key, override: ov, total: ov != null && ov !== "" ? Number(ov) : grp.sum, paid: !!paidMap[key] };
    }).sort((a, b) => (a.pd < b.pd ? -1 : a.pd > b.pd ? 1 : a.bank < b.bank ? -1 : 1));
  }, [tx, billExclude, billDateMap, billExtras, billOverride, paidMap, ruleMap, cardNameMap]);

  const billBanks = useMemo(() => {
    const set = [...new Set([...billGroups.map((g) => g.bank), ...bankAccts.map((a) => a.name)])];
    const nextOf = (b) => (billGroups.find((g) => g.bank === b && !g.paid && g.pd >= TODAY) || {}).pd || "9999";
    return set.sort((a, b) => (nextOf(a) < nextOf(b) ? -1 : 1));
  }, [billGroups, bankAccts]);

  const groupsInMonth = (m) => billGroups.filter((g) => monthKey(g.pd) === m);
  const sumGroups = (arr) => arr.reduce((s, g) => s + g.total, 0);

  /* ---------- 月の範囲 ---------- */
  const allMonths = useMemo(() => {
    const ks = tx.map((r) => monthKey(r.d)).concat(billGroups.map((g) => monthKey(g.pd)), [THIS_MONTH]).filter(Boolean).sort();
    return monthRange(ks[0], ks[ks.length - 1]);
  }, [tx, billGroups]);
  const selIdx = allMonths.indexOf(sel);
  const stepMonth = (d) => { const i = selIdx + d; if (i >= 0 && i < allMonths.length) setSel(allMonths[i]); };
  useEffect(() => { if (!allMonths.includes(sel)) setSel(allMonths.includes(THIS_MONTH) ? THIS_MONTH : allMonths[allMonths.length - 1]); }, [allMonths]);

  /* ---------- 利用集計 ---------- */
  const fTx = useMemo(() => (cardFilter === "all" ? tx : tx.filter((r) => r.c === cardFilter)), [tx, cardFilter]);
  const usageMonths = useMemo(() => { const ks = tx.map((r) => monthKey(r.d)).sort(); if (!ks.length) return [THIS_MONTH]; const end = ks[ks.length - 1] > THIS_MONTH ? ks[ks.length - 1] : THIS_MONTH; return monthRange(ks[0], end).slice(-12); }, [tx]);
  const totalByMonth = useMemo(() => { const m = {}; fTx.forEach((r) => { const k = monthKey(r.d); m[k] = (m[k] || 0) + r.a; }); return m; }, [fTx]);
  const selTx = useMemo(() => fTx.filter((r) => monthKey(r.d) === sel), [fTx, sel]);
  const selTotal = selTx.reduce((s, r) => s + r.a, 0);
  const prevTotal = totalByMonth[addMonth(sel, -1)];
  const diff = prevTotal == null ? null : selTotal - prevTotal;

  const pieData = useMemo(() => {
    const m = {}; selTx.forEach((r) => { const c = effCat(r); m[c] = (m[c] || 0) + r.a; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value, color: catColor(name) }));
  }, [selTx, catMap]);

  const catAgg = useMemo(() => {
    const src = itemScope === "all" ? fTx : selTx;
    const m = {};
    src.forEach((r) => { const c = effCat(r); m[c] = m[c] || { key: c, amount: 0, count: 0, items: [] }; m[c].amount += r.a; m[c].count++; m[c].items.push(r); });
    const arr = Object.values(m), dir = sortDir === "desc" ? -1 : 1;
    arr.sort((a, b) => (sortKey === "name" ? a.key.localeCompare(b.key, "ja") * dir : (a[sortKey] - b[sortKey]) * dir));
    return arr;
  }, [fTx, selTx, itemScope, sortKey, sortDir, catMap]);
  const itemTotal = catAgg.reduce((s, c) => s + c.amount, 0);
  const setSort = (k) => { if (sortKey === k) setSortDir((d) => (d === "desc" ? "asc" : "desc")); else { setSortKey(k); setSortDir(k === "name" ? "asc" : "desc"); } };

  const usageByDay = useMemo(() => { const m = {}; tx.forEach((r) => { if (monthKey(r.d) === sel) { (m[r.d] = m[r.d] || { sum: 0, txs: [] }); m[r.d].sum += r.a; m[r.d].txs.push(r); } }); return m; }, [tx, sel]);
  const billByDay = useMemo(() => { const m = {}; billGroups.forEach((g) => { if (monthKey(g.pd) === sel) { (m[g.pd] = m[g.pd] || { sum: 0, groups: [] }); m[g.pd].sum += g.total; m[g.pd].groups.push(g); } }); return m; }, [billGroups, sel]);

  /* ---------- 編集操作 ---------- */
  const setTxField = (r, f, v) => {
    if (r.manual) return putManualTx((p) => p.map((x) => (x.id === r.key ? { ...x, [f]: v } : x)));
    putTxEdit((p) => {
      const cur = { ...(p[r.key] || {}) };
      if (v === r.orig[f] || v === "" || v == null) delete cur[f]; else cur[f] = v;
      const n = { ...p }; delete n[sigOf(r.orig)];
      if (Object.keys(cur).length) n[r.key] = cur; else delete n[r.key];
      return n;
    });
  };
  const resetTx = (r) => putTxEdit((p) => { const n = { ...p }; delete n[r.key]; delete n[sigOf(r.orig)]; return n; });
  const addManualTx = (preset = {}) => {
    const id = uid("m_");
    putManualTx((p) => [...p, { id, c: cardFilter !== "all" ? cardFilter : allCards[0] || "", d: TODAY, m: "", a: 0, ...preset }]);
    setEditing({ type: "tx", key: id, isNew: true });
  };
  const delManualTx = (id) => putManualTx((p) => p.filter((x) => x.id !== id));
  const addExtra = (bank, pd) => {
    const id = uid("x_");
    putExtras((p) => [...p, { id, bank: bank || bankAccts[0]?.name || billBanks[0] || "", pd: pd || TODAY, label: "", amount: "" }]);
    setEditing({ type: "extra", id, isNew: true });
  };
  const updExtra = (id, f, v) => putExtras((p) => p.map((x) => (x.id === id ? { ...x, [f]: v } : x)));
  const delExtra = (id) => putExtras((p) => p.filter((x) => x.id !== id));
  const togglePaid = (key) => putPaid((p) => { const n = { ...p }; if (n[key]) delete n[key]; else n[key] = true; return n; });
  const closeEditor = () => {
    if (editing && editing.isNew) {
      if (editing.type === "tx") { const r = manualTx.find((x) => x.id === editing.key); if (r && !r.m && !Number(r.a)) delManualTx(r.id); }
      if (editing.type === "extra") { const x = billExtras.find((e) => e.id === editing.id); if (x && !x.label && !Number(x.amount)) delExtra(x.id); }
    }
    setEditing(null);
  };

  /* カード・口座 */
  const updRule = (card, f, v) => putRule((p) => ({ ...p, [card]: { ...ruleFor(card), ...(p[card] || {}), [f]: v } }));
  const setCardName = (c, name) => putCardName((p) => { const n = { ...p }; if (name && name !== c) n[c] = name; else delete n[c]; return n; });
  const addCard = () => {
    const name = newCard.trim();
    if (!name) return;
    if (allCards.includes(name) || Object.values(cardNameMap).includes(name)) { showToast("同じ名前のカードがあります"); return; }
    putManualCards((p) => [...p, name]);
    setNewCard("");
    showToast("「" + name + "」を追加しました");
  };
  const delCard = (c) => { putManualCards((p) => p.filter((x) => x !== c)); setCardName(c, ""); };
  const addAccount = () => putAccts((a) => [...a, { name: "口座" + (a.length + 1) }]);
  const renameAccount = (i, name) => {
    const old = bankAccts[i]?.name;
    putAccts((a) => a.map((x, j) => (j === i ? { ...x, name } : x)));
    if (old && old !== name) {
      putRule((p) => { const n = {}; Object.entries(p).forEach(([k, r]) => (n[k] = r && r.bank === old ? { ...r, bank: name } : r)); return n; });
      putExtras((p) => p.map((x) => (x.bank === old ? { ...x, bank: name } : x)));
    }
  };
  const delAccount = (i) => putAccts((a) => a.filter((_, j) => j !== i));

  /* ホーム */
  const toggleHome = (k) => putLayout((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));
  const moveHome = (k, d) => putLayout((p) => { const i = p.indexOf(k), j = i + d; if (i < 0 || j < 0 || j >= p.length) return p; const n = [...p]; [n[i], n[j]] = [n[j], n[i]]; return n; });

  /* ---------- 取得（Apps Script / Gmail） ---------- */
  async function gasSync(url) {
    const u = (url || gasUrl || "").trim();
    if (!u) { setGasMsg({ ok: "", err: "Apps Script のURLを入力してください" }); return; }
    setGasBusy(true); setGasMsg({ ok: "", err: "" });
    try {
      const r = await fetch(u, { redirect: "follow" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const data = await r.json();
      if (data && data.error) throw new Error("アクセス拒否（URLのkeyを確認）");
      if (!Array.isArray(data)) throw new Error("形式が違います");
      if (!data.length) { setGasMsg({ ok: "", err: "0件でした" }); }
      else {
        setLiveTx(data); savePref("liveTx", data);
        const now = Date.now(); setLastSync(now); savePref("gasSyncAt", now);
        setGasMsg({ ok: "取得完了: " + data.length + "件", err: "" }); showToast("最新の明細を取得しました（" + data.length + "件）");
      }
    } catch (e) { setGasMsg({ ok: "", err: "失敗: " + (e.message || e) }); showToast("取得に失敗しました"); }
    setGasBusy(false);
  }
  useEffect(() => { if (gasUrl) gasSync(gasUrl); }, []);

  const syncLabel = (ts) => { if (!ts) return ""; const m = Math.floor((Date.now() - ts) / 60000); if (m < 1) return "たった今更新"; if (m < 60) return m + "分前に更新"; const h = Math.floor(m / 60); return h < 24 ? h + "時間前に更新" : Math.floor(h / 24) + "日前に更新"; };

  const copyCsv = async () => {
    const rows = tx.map((r) => [cardName(r.c), r.d, (r.m || "").replace(/,/g, " "), r.a, effCat(r), billDateMap[r.key] || paymentDateFor(r.d, ruleFor(r.c)) || ""].join(","));
    try { await navigator.clipboard.writeText("カード,利用日,内容,金額,カテゴリ,引落日\n" + rows.join("\n")); showToast("CSVをコピーしました"); } catch { showToast("コピーできませんでした"); }
  };
  const resetAll = () => {
    ["theme", "privacy", "ruleMap", "catMap", "billDateMap", "defaultTab", "mergeDup", "paidMap", "liveTx", "gasUrl", "gasSyncAt", "accounts", "cardNameMap", "homeLayout", "manualTx", "manualCards", "txEditMap", "billExclude", "billExtras", "billOverride", "gClientId", "budget", "shiftMap"].forEach(delPref);
    location.reload();
  };

  /* ============================== 部品 ============================== */
  const TxRow = (r) => {
    const cat = effCat(r), ov = billDateMap[r.key];
    return (
      <button className="item" key={r.key} onClick={() => setEditing({ type: "tx", key: r.key })}>
        <div className="itemL">
          <span className="dot" style={{ background: catColor(cat) }} />
          <span className="itemMerch">{r.m || "（内容未入力）"}</span>
          <span className="itemDate num">{fmtMD(r.d)}</span>
          {cardFilter === "all" && <span className="itemCard">{cardName(r.c)}</span>}
          {r.manual && <span className="tagMini">手入力</span>}
          {r.edited && <span className="tagMini">修正</span>}
          {ov && <span className="tagMini">{fmtMD(ov)}引落</span>}
          {billExclude[r.key] && <span className="tagMini warn">引落除外</span>}
        </div>
        <span className="itemAmt num">{money(r.a)}</span>
      </button>
    );
  };

  const CardChips = () => (
    <div className="chips full">
      <button className={"chip" + (cardFilter === "all" ? " on" : "")} onClick={() => setCardFilter("all")}>すべて</button>
      {allCards.map((c) => <button key={c} className={"chip" + (cardFilter === c ? " on" : "")} onClick={() => setCardFilter(c)}>{cardName(c)}</button>)}
    </div>
  );

  const MonthNav = (extraClass = "") => (
    <div className={"heroNav " + extraClass}>
      <button onClick={() => stepMonth(-1)} disabled={selIdx <= 0} aria-label="前の月">‹</button>
      <span>{monthLabel(sel)}</span>
      <button onClick={() => stepMonth(1)} disabled={selIdx >= allMonths.length - 1} aria-label="次の月">›</button>
    </div>
  );

  const CalGrid = () => {
    const [cy, cm] = sel.split("-").map(Number);
    const firstW = new Date(cy, cm - 1, 1).getDay(), nd = lastDay(cy, cm), cells = [];
    for (let i = 0; i < firstW; i++) cells.push(<span className="cell empty" key={"e" + i} />);
    for (let dd = 1; dd <= nd; dd++) {
      const ds = `${sel}-${pad(dd)}`, u = usageByDay[ds], b = billByDay[ds];
      cells.push(
        <button className={"cell" + (ds === TODAY ? " today" : "") + (ds === calDay ? " sel" : "")} key={ds} onClick={() => { setCalDay(ds); if (tab !== "cal") go("cal"); }}>
          <span className="cellDay">{dd}</span>
          {u && <span className="cellChip use">{privacy ? "•" : "¥" + compact(u.sum)}</span>}
          {b && <span className="cellChip bill">{privacy ? "引•" : "引" + compact(b.sum)}</span>}
        </button>
      );
    }
    return (
      <>
        <div className="calGridHead">{WK.map((w, i) => <span key={w} className={"wk" + (i === 0 ? " sun" : i === 6 ? " sat" : "")}>{w}</span>)}</div>
        <div className="calGrid">{cells}</div>
      </>
    );
  };

  const CatList = () => (
    <div className="catList">
      {catAgg.map((c) => {
        const open = expandedCat === c.key, mg = {};
        c.items.forEach((r) => (mg[r.m] = mg[r.m] || []).push(r));
        const merchants = Object.entries(mg).sort((a, b) => b[1].reduce((s, x) => s + x.a, 0) - a[1].reduce((s, x) => s + x.a, 0));
        return (
          <div className="catBlock" key={c.key}>
            <button className="catRow" onClick={() => setExpandedCat(open ? null : c.key)}>
              <span className="catLeft"><span className="dot" style={{ background: catColor(c.key) }} />{c.key}<span className="catCnt">{c.count}件</span></span>
              <span className="catRight"><span className="num">{money(c.amount)}</span><span className="catPct">{Math.round((c.amount / (itemTotal || 1)) * 100)}%</span><span className="caret">{open ? "▲" : "▼"}</span></span>
            </button>
            <div className="catBar"><span style={{ width: (c.amount / (catAgg[0]?.amount || 1)) * 100 + "%", background: catColor(c.key) }} /></div>
            {open && (
              <div className="merchList">
                {merchants.map(([name, items]) => (
                  <div className="merchGroup" key={name}>
                    <div className="merchHead"><span className="merchName">{name || "（内容未入力）"}</span><span className="num">{money(items.reduce((s, x) => s + x.a, 0))}</span></div>
                    {items.map(TxRow)}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {catAgg.length === 0 && <p className="empty">データがありません</p>}
    </div>
  );

  const BillGroup = (g, showBank) => (
    <section className={"panel billGroup" + (g.paid ? " paidGroup" : "")} key={g.key}>
      <div className="payGroupHead">
        <span className={"payGroupDate" + (g.pd >= TODAY ? " future" : "")}>
          {fmtMD(g.pd)} 引落{g.paid ? "・支払済" : g.pd >= TODAY ? "予定" : ""}
          {showBank && <span className="payRowBank">{g.bank}</span>}
        </span>
        <button className="payGroupSum num linkBtn" onClick={() => setEditing({ type: "total", key: g.key })} title="金額を修正">
          {money(g.total)}<span className="editPen">✎</span>
        </button>
      </div>
      {g.override != null && g.override !== "" && (
        <p className="overrideNote">確定額に修正済み（明細合計 {money(g.sum)}・差額 {money(g.total - g.sum)}）</p>
      )}
      <div className="list">
        {g.items.map(TxRow)}
        {g.extras.map((x) => (
          <button className="item" key={x.id} onClick={() => setEditing({ type: "extra", id: x.id })}>
            <div className="itemL"><span className="dot" style={{ background: "var(--sub)" }} /><span className="itemMerch">{x.label || "（追加した引落）"}</span><span className="tagMini">追加</span></div>
            <span className="itemAmt num">{money(Number(x.amount) || 0)}</span>
          </button>
        ))}
      </div>
      <div className="groupActions">
        <button className="miniBtn" onClick={() => addExtra(g.bank, g.pd)}>＋ 項目を追加</button>
        <button className="miniBtn" onClick={() => setEditing({ type: "total", key: g.key })}>金額を修正</button>
        <button className={"miniBtn" + (g.paid ? "" : " strong")} onClick={() => togglePaid(g.key)}>{g.paid ? "支払済みを取消" : "支払済みにする"}</button>
      </div>
    </section>
  );

  /* ---------- ホームのウィジェット ---------- */
  const thisBill = groupsInMonth(THIS_MONTH), nextBillG = groupsInMonth(addMonth(THIS_MONTH, 1));
  const upcoming = billGroups.filter((g) => !g.paid && (monthKey(g.pd) === THIS_MONTH || monthKey(g.pd) === addMonth(THIS_MONTH, 1)));
  const renderWidget = (k) => {
    switch (k) {
      case "stats": {
        const mBill = groupsInMonth(sel), unpaid = mBill.filter((g) => !g.paid);
        return (
          <section className="panel full" key={k}>
            {MonthNav("compact")}
            <div className="dashStats">
              <div className="dStat"><span className="dLabel">今月の利用</span><span className="dNum num">{money(selTotal)}</span><span className="dSub">{selTx.length}件{diff != null ? "・前月比 " + (diff >= 0 ? "+" : "−") + money(Math.abs(diff)).replace("−", "") : ""}</span></div>
              <div className="dStat bill" onClick={() => go("bill")}><span className="dLabel">今月の引落</span><span className="dNum num">{money(sumGroups(mBill))}</span><span className="dSub">未払い {money(sumGroups(unpaid))}・翌月 {money(sumGroups(groupsInMonth(addMonth(sel, 1))))}</span></div>
            </div>
          </section>
        );
      }
      case "upcoming": return (
        <section className="panel" key={k}>
          <div className="panelHead"><h2>引落予定（今月・来月）</h2><button className="linkBtn tapHint" onClick={() => go("bill")}>すべて見る →</button></div>
          <div className="list">
            {upcoming.length === 0 && <p className="empty">未払いの引落予定はありません</p>}
            {upcoming.map((g) => (
              <button className="payRow" key={g.key} onClick={() => { setBillBank(g.bank); go("bill"); }}>
                <span className="payRowL"><span className={"dateBadge" + (g.pd < TODAY ? " late" : "")}>{fmtMD(g.pd)}</span>{g.bank}</span>
                <span className="num">{money(g.total)}</span>
              </button>
            ))}
          </div>
          {upcoming.length > 0 && <div className="sumLine"><span>合計</span><span className="num">{money(sumGroups(upcoming))}</span></div>}
        </section>
      );
      case "calendar": return (
        <section className="panel full calPanel" key={k}>
          <div className="panelHead"><h2>カレンダー（{monthLabel(sel)}）</h2><button className="linkBtn tapHint" onClick={() => go("cal")}>開く →</button></div>
          {CalGrid()}
        </section>
      );
      case "pie": return (
        <section className="panel" key={k}>
          <h2>カテゴリ構成（{monthLabel(sel)}{cardFilter !== "all" ? "・" + cardName(cardFilter) : ""}）</h2>
          <DonutChart data={pieData} money={money} centerLabel={Number(sel.slice(5)) + "月の利用"} />
        </section>
      );
      case "trend": return (
        <section className="panel" key={k}>
          <h2>月次推移（利用）</h2>
          <div className="bars">
            {usageMonths.map((m) => {
              const v = totalByMonth[m] || 0, max = Math.max(1, ...usageMonths.map((x) => totalByMonth[x] || 0));
              return (
                <button key={m} className={"bar" + (m === sel ? " active" : "")} onClick={() => setSel(m)} title={monthLabel(m)}>
                  <span className="barVal num">{!privacy && v ? compact(v) : ""}</span>
                  <span className="barFill" style={{ height: Math.max(4, (v / max) * 100) + "%" }} />
                  <span className="barLab">{Number(m.slice(5))}月</span>
                </button>
              );
            })}
          </div>
        </section>
      );
      case "categories": return (
        <section className="panel full" key={k}>
          <div className="panelHead"><h2>項目別集計（{monthLabel(sel)}）</h2><span className="num itemTotal">{money(itemTotal)}</span></div>
          {CatList()}
        </section>
      );
      case "recent": return (
        <section className="panel" key={k}>
          <div className="panelHead"><h2>直近の利用</h2><button className="linkBtn tapHint" onClick={() => addManualTx()}>＋ 追加</button></div>
          <div className="list">{tx.slice(0, 8).map(TxRow)}{tx.length === 0 && <p className="empty">明細がありません</p>}</div>
        </section>
      );
      default: return null;
    }
  };

  /* ---------- 支払いタブの表示対象 ---------- */
  const bankGroups = billBank === "all" ? billGroups : billGroups.filter((g) => g.bank === billBank);
  const pastCount = bankGroups.filter((g) => monthKey(g.pd) < THIS_MONTH && !g.paid).length;
  const paidCount = bankGroups.filter((g) => g.paid).length;
  const shownGroups = bankGroups.filter((g) => (showPaid || !g.paid) && (showPast || g.paid || monthKey(g.pd) >= THIS_MONTH));

  /* ---------- 編集シートの対象 ---------- */
  const editTx = editing?.type === "tx" ? tx.find((r) => r.key === editing.key) : null;
  const editExtra = editing?.type === "extra" ? billExtras.find((x) => x.id === editing.id) : null;
  const editGroup = editing?.type === "total" ? billGroups.find((g) => g.key === editing.key) : null;
  const bankChoices = [...new Set([...bankAccts.map((a) => a.name), ...billBanks])].filter(Boolean);

  const lineSeries = byCardLine
    ? allCards.map((c, i) => ({ name: cardName(c), color: CARD_PALETTE[i % CARD_PALETTE.length], values: usageMonths.map((m) => tx.filter((r) => r.c === c && monthKey(r.d) === m).reduce((s, r) => s + r.a, 0)) }))
    : [{ name: "合計", color: "var(--ink)", values: usageMonths.map((m) => totalByMonth[m] || 0) }];

  /* ============================== 描画 ============================== */
  return (
    <div className="app" data-theme={theme}>
      <style>{CSS}</style>
      {toast && <div className="toast" role="status">{toast}</div>}

      <div className="shell">
        <header className="head">
          <div className="headL">
            <h1>支出トラッカー</h1>
            <p className="tag">{allCards.length}枚 · {tx.length}件{lastSync ? " · " + syncLabel(lastSync) : ""}</p>
          </div>
          <div className="headActions">
            <button className="iconBtn" onClick={() => setPrivacy((v) => { savePref("privacy", !v); return !v; })} aria-label="金額の表示切替" title="金額を隠す/表示"><Icon name={privacy ? "eyeoff" : "eye"} /></button>
            {gasUrl && <button className={"iconBtn" + (gasBusy ? " spin" : "")} onClick={() => gasSync()} disabled={gasBusy} aria-label="最新を取得" title="最新を取得"><Icon name="refresh" /></button>}
            <button className="iconBtn" onClick={() => setSettingsOpen(true)} aria-label="設定" title="設定"><Icon name="gear" /></button>
          </div>
        </header>

        {/* ============ ホーム ============ */}
        {tab === "use" && (
          <div className="grid">
            <div className="full dashEditRow">
              <button className="miniBtn" onClick={() => addManualTx()}>＋ 明細を追加</button>
              <button className="miniBtn" onClick={() => setHomeEdit((v) => !v)}>{homeEdit ? "完了" : "ホームを編集"}</button>
            </div>
            {homeEdit && (
              <section className="panel full">
                <h2>ホームに表示する機能</h2>
                {homeLayout.map((k, i) => (
                  <div className="editRow" key={k}>
                    <span>{WLABEL[k]}</span>
                    <span className="editBtns">
                      <button onClick={() => moveHome(k, -1)} disabled={i === 0} aria-label="上へ">↑</button>
                      <button onClick={() => moveHome(k, 1)} disabled={i === homeLayout.length - 1} aria-label="下へ">↓</button>
                      <button onClick={() => toggleHome(k)}>外す</button>
                    </span>
                  </div>
                ))}
                {WIDGET_KEYS.filter((k) => !homeLayout.includes(k)).length > 0 && <p className="setSub" style={{ marginTop: 14 }}>追加できる機能</p>}
                {WIDGET_KEYS.filter((k) => !homeLayout.includes(k)).map((k) => (
                  <div className="editRow" key={k}><span>{WLABEL[k]}</span><button className="addBtn small" onClick={() => toggleHome(k)}>＋ 追加</button></div>
                ))}
              </section>
            )}
            {homeLayout.filter((k) => WIDGET_KEYS.includes(k)).map(renderWidget)}
            {homeLayout.length === 0 && !homeEdit && <p className="empty full">「ホームを編集」で表示する機能を選んでください</p>}
          </div>
        )}

        {/* ============ カレンダー ============ */}
        {tab === "cal" && (
          <div className="grid">
            <div className="full">{MonthNav("calNav")}</div>
            <div className="calLegend full"><span><i className="lg use" />利用</span><span><i className="lg bill" />引落</span><span className="calHint">日付をタップで内訳</span></div>
            <section className="panel full calPanel">{CalGrid()}</section>
            {calDay && monthKey(calDay) === sel && (
              <section className="panel full">
                <h2>{dayTitle(calDay)}</h2>
                <div className="dayBlock">
                  <div className="dayHead"><span className="dayHeadL"><span className="dot" />利用</span><span className="num">{money(usageByDay[calDay]?.sum || 0)}</span></div>
                  <div className="list">{(usageByDay[calDay]?.txs || []).map(TxRow)}{!usageByDay[calDay] && <p className="empty">この日の利用はありません</p>}</div>
                  <button className="miniBtn" onClick={() => addManualTx({ d: calDay })}>＋ この日に明細を追加</button>
                </div>
                <div className="dayBlock">
                  <div className="dayHead"><span className="dayHeadL"><span className="dot bill" />この日の引落</span><span className="num">{money(billByDay[calDay]?.sum || 0)}</span></div>
                  {(billByDay[calDay]?.groups || []).map((g) => (
                    <button className="payRow" key={g.key} onClick={() => { setBillBank(g.bank); go("bill"); }}>
                      <span className="payRowL">{g.bank}{g.paid && <span className="tagMini">支払済</span>}</span><span className="num">{money(g.total)}</span>
                    </button>
                  ))}
                  {!billByDay[calDay] && <p className="empty">この日の引落はありません</p>}
                  <button className="miniBtn" onClick={() => addExtra(undefined, calDay)}>＋ この日に引落を追加</button>
                </div>
              </section>
            )}
          </div>
        )}

        {/* ============ 支払い（引落） ============ */}
        {tab === "bill" && (
          <div className="grid">
            <div className="billHead full">
              <p className="lead">今月・来月の引落を先に表示。金額をタップで修正、項目の追加もできます。</p>
              <div className="billHeadBtns">
                <button className="miniBtn" onClick={() => addExtra(billBank !== "all" ? billBank : undefined)}>＋ 引落を追加</button>
                <button className="miniBtn" onClick={() => setRulesOpen(true)}>カード・口座</button>
              </div>
            </div>
            <div className="hscroll full">
              <button className={"summcard" + (billBank === "all" ? " on" : "")} onClick={() => setBillBank("all")}>
                <span className="scLabel">すべての口座</span>
                <span className="scTotal num">{money(sumGroups(thisBill.filter((g) => !g.paid)))}</span>
                <span className="scSub">今月の未払い・来月 {money(sumGroups(nextBillG))}</span>
              </button>
              {billBanks.map((b) => {
                const gs = billGroups.filter((g) => g.bank === b);
                const next = gs.find((g) => !g.paid && g.pd >= TODAY);
                return (
                  <button key={b} className={"summcard" + (billBank === b ? " on" : "")} onClick={() => setBillBank(b)}>
                    <span className="scLabel">{b}</span>
                    <span className="scTotal num">{money(next ? next.total : 0)}</span>
                    <span className="scSub">{next ? "次回 " + fmtMD(next.pd) : "予定なし"}</span>
                  </button>
                );
              })}
            </div>
            {(pastCount > 0 || paidCount > 0) && (
              <div className="toggleRow full">
                {pastCount > 0 && <button className="miniBtn" onClick={() => setShowPast((v) => !v)}>{showPast ? "過去の未払いを隠す" : "過去の未払い " + pastCount + "件"}</button>}
                {paidCount > 0 && <button className="miniBtn" onClick={() => setShowPaid((v) => !v)}>{showPaid ? "支払済みを隠す" : "支払済み " + paidCount + "件"}</button>}
              </div>
            )}
            {shownGroups.map((g) => BillGroup(g, billBank === "all"))}
            {shownGroups.length === 0 && <p className="empty full">表示する引落はありません</p>}
            <p className="bnote full">分割・リボ・年会費などはメールに出ないため「＋ 引落を追加」で登録してください。カード会社の確定額と違うときは金額をタップして修正できます。</p>
          </div>
        )}

        {/* ============ 分析 ============ */}
        {tab === "analyze" && (
          <div className="grid">
            {CardChips()}
            <section className="panel full">
              <div className="panelHead"><h2>月次推移</h2><button className="miniToggle" onClick={() => setByCardLine((v) => !v)}>{byCardLine ? "合計で見る" : "カード別に見る"}</button></div>
              <LineChart labels={usageMonths.map((m) => Number(m.slice(5)) + "月")} series={lineSeries} money={money} privacy={privacy} />
            </section>
            <section className="panel">
              <div className="panelHead"><h2>カテゴリ構成</h2></div>
              {MonthNav("compact")}
              <DonutChart data={pieData} money={money} centerLabel={Number(sel.slice(5)) + "月の利用"} />
            </section>
            <section className="panel">
              <h2>カード別（{monthLabel(sel)}）</h2>
              <div className="list">
                {allCards.map((c, i) => {
                  const v = tx.filter((r) => r.c === c && monthKey(r.d) === sel).reduce((s, r) => s + r.a, 0);
                  return <div className="payRow" key={c}><span className="payRowL"><span className="dot" style={{ background: CARD_PALETTE[i % CARD_PALETTE.length] }} />{cardName(c)}</span><span className="num">{money(v)}</span></div>;
                })}
              </div>
            </section>
          </div>
        )}

        {/* ============ カテゴリ ============ */}
        {tab === "items" && (
          <div className="grid">
            <div className="full dashEditRow"><button className="miniBtn" onClick={() => addManualTx()}>＋ 明細を追加</button></div>
            {CardChips()}
            <div className="scopeBar full">
              <div className="scopeToggle">
                <button className={itemScope === "month" ? "on" : ""} onClick={() => setItemScope("month")}>{monthLabel(sel)}</button>
                <button className={itemScope === "all" ? "on" : ""} onClick={() => setItemScope("all")}>全期間</button>
              </div>
              <div className="sortToggle">
                <span>並び替え</span>
                {[["amount", "金額"], ["count", "件数"], ["name", "名前"]].map(([k, l]) => (
                  <button key={k} className={sortKey === k ? "on" : ""} onClick={() => setSort(k)}>{l}{sortKey === k ? (sortDir === "desc" ? "↓" : "↑") : ""}</button>
                ))}
              </div>
            </div>
            {itemScope === "month" && <div className="full">{MonthNav("compact")}</div>}
            <section className="panel full">
              <div className="panelHead"><h2>項目別 集計</h2><span className="num itemTotal">{money(itemTotal)}</span></div>
              {CatList()}
            </section>
          </div>
        )}

        <footer className="foot">{liveTx && liveTx.length ? "Gmail取得データ" : "サンプルデータ（2026-05-21時点）"} · 端末内にのみ保存</footer>
      </div>

      <nav className="bottomNav">
        <div className="navInner">
          {[["use", "ホーム", "home"], ["cal", "カレンダー", "cal"], ["bill", "支払い", "pay"], ["analyze", "分析", "chart"], ["items", "カテゴリ", "tag"]].map(([k, l, ic]) => (
            <button key={k} className={"navBtn" + (tab === k ? " on" : "")} onClick={() => go(k)} aria-current={tab === k ? "page" : undefined}><Icon name={ic} /><span>{l}</span></button>
          ))}
        </div>
      </nav>

      {/* ============ 明細の編集 ============ */}
      {editTx && (
        <div className="overlay sheetOverlay" onClick={closeEditor}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheetHandle" />
            <div className="sheetTitle">{editTx.manual ? (editing.isNew ? "明細を追加" : "手入力の明細") : "明細を修正"}</div>
            <div className="editFields">
              <label className="fLabel">カード
                <select className="bankInput" value={editTx.c} onChange={(e) => setTxField(editTx, "c", e.target.value)}>
                  {[...new Set([editTx.c, ...allCards])].filter(Boolean).map((c) => <option key={c} value={c}>{cardName(c)}</option>)}
                </select>
              </label>
              <label className="fLabel">内容・店名<input className="bankInput" value={editTx.m} placeholder="例: Amazon" onChange={(e) => setTxField(editTx, "m", e.target.value)} /></label>
              <div className="efRow">
                <label className="fLabel">利用日<input className="bdate" type="date" value={editTx.d} onChange={(e) => e.target.value && setTxField(editTx, "d", e.target.value)} /></label>
                <label className="fLabel">金額<input className="bAmt num" type="number" inputMode="numeric" value={editTx.a || ""} placeholder="0" onChange={(e) => setTxField(editTx, "a", Number(e.target.value) || 0)} /></label>
              </div>
              {editTx.edited && <p className="setSub">取得時: {editTx.orig.m} / {editTx.orig.d} / {money(editTx.orig.a)} <button className="inlineBtn" onClick={() => resetTx(editTx)}>元に戻す</button></p>}
            </div>
            <div className="sheetLabel">カテゴリ</div>
            <div className="catChips">
              {CATS.map((c) => { const on = effCat(editTx) === c.key; return <button key={c.key} className={"catChip" + (on ? " on" : "")} style={on ? { background: c.color, borderColor: c.color, color: "#fff" } : {}} onClick={() => putCat((p) => ({ ...p, [editTx.key]: c.key }))}>{c.key}</button>; })}
            </div>
            <div className="sheetLabel">引落（後払い・スキップ払いは日付を指定）</div>
            <div className="billDateRow">
              <input className="bdate" type="date" disabled={!!billExclude[editTx.key]} value={billDateMap[editTx.key] || paymentDateFor(editTx.d, ruleFor(editTx.c)) || ""} onChange={(e) => putBillDate((p) => { const n = { ...p }; if (e.target.value) n[editTx.key] = e.target.value; else delete n[editTx.key]; return n; })} />
              {billDateMap[editTx.key] && <button className="shiftBtn" onClick={() => putBillDate((p) => { const n = { ...p }; delete n[editTx.key]; return n; })}>標準に戻す</button>}
            </div>
            <div className="setRow"><div><div>引落予定に含めない</div><div className="setSub">返品・取消・二重計上などのとき</div></div><button className={"switch" + (billExclude[editTx.key] ? " on" : "")} onClick={() => putExclude((p) => { const n = { ...p }; if (n[editTx.key]) delete n[editTx.key]; else n[editTx.key] = true; return n; })}><span className="knob" /></button></div>
            <div className="sheetBtns">
              {editTx.manual && <button className="dangerBtn" onClick={() => { delManualTx(editTx.key); setEditing(null); }}>削除</button>}
              <button className="primary" onClick={closeEditor}>完了</button>
            </div>
          </div>
        </div>
      )}

      {/* ============ 追加した引落の編集 ============ */}
      {editExtra && (
        <div className="overlay sheetOverlay" onClick={closeEditor}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheetHandle" />
            <div className="sheetTitle">{editing.isNew ? "引落を追加" : "追加した引落"}</div>
            <div className="editFields">
              <label className="fLabel">内容<input className="bankInput" value={editExtra.label} placeholder="例: 年会費 / 分割2回目 / 楽天カード請求" onChange={(e) => updExtra(editExtra.id, "label", e.target.value)} /></label>
              <label className="fLabel">引落口座
                <select className="bankInput" value={editExtra.bank} onChange={(e) => updExtra(editExtra.id, "bank", e.target.value)}>
                  {!bankChoices.includes(editExtra.bank) && <option value={editExtra.bank}>{editExtra.bank || "選択してください"}</option>}
                  {bankChoices.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </label>
              <div className="efRow">
                <label className="fLabel">引落日<input className="bdate" type="date" value={editExtra.pd} onChange={(e) => updExtra(editExtra.id, "pd", e.target.value)} /></label>
                <label className="fLabel">金額<input className="bAmt num" type="number" inputMode="numeric" value={editExtra.amount} placeholder="0" onChange={(e) => updExtra(editExtra.id, "amount", e.target.value)} /></label>
              </div>
              {bankAccts.length === 0 && <p className="setSub">口座は「カード・口座」から登録できます。</p>}
            </div>
            <div className="sheetBtns">
              <button className="dangerBtn" onClick={() => { delExtra(editExtra.id); setEditing(null); }}>削除</button>
              <button className="primary" onClick={closeEditor}>完了</button>
            </div>
          </div>
        </div>
      )}

      {/* ============ 引落額の修正 ============ */}
      {editGroup && (
        <div className="overlay sheetOverlay" onClick={() => setEditing(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheetHandle" />
            <div className="sheetTitle">{fmtMD(editGroup.pd)} {editGroup.bank} の引落額</div>
            <p className="setSub">カード会社の確定額（明細書の金額）を入力すると、そちらを優先します。</p>
            <div className="editFields">
              <div className="brLine"><span>明細から計算</span><span className="num">{money(editGroup.sum)}</span></div>
              <label className="fLabel">確定額
                <input className="bAmt num wideAmt" type="number" inputMode="numeric" placeholder={String(editGroup.sum)} value={billOverride[editGroup.key] ?? ""} onChange={(e) => putOverride((p) => { const n = { ...p }; if (e.target.value === "") delete n[editGroup.key]; else n[editGroup.key] = Number(e.target.value); return n; })} />
              </label>
              {editGroup.override != null && <p className="setSub">差額 {money(editGroup.total - editGroup.sum)}</p>}
            </div>
            <div className="sheetBtns">
              {editGroup.override != null && <button className="dangerBtn" onClick={() => putOverride((p) => { const n = { ...p }; delete n[editGroup.key]; return n; })}>計算に戻す</button>}
              <button className="miniBtn" onClick={() => { setEditing(null); addExtra(editGroup.bank, editGroup.pd); }}>＋ 項目を追加</button>
              <button className="primary" onClick={() => setEditing(null)}>完了</button>
            </div>
          </div>
        </div>
      )}

      {/* ============ カード・口座 ============ */}
      {rulesOpen && (
        <div className="overlay" onClick={() => setRulesOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modalHead"><h3>カード・口座</h3><button className="iconBtn" onClick={() => setRulesOpen(false)} aria-label="閉じる">✕</button></div>

            <div className="setLabel">カードを追加</div>
            <p className="setHint">Gmailで読み取れないカードはここで追加し、明細は「＋ 明細を追加」、毎月の請求は支払いタブの「＋ 引落を追加」で登録できます。</p>
            <div className="addCardRow">
              <input className="bankInput" placeholder="例: 楽天カード" value={newCard} onChange={(e) => setNewCard(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addCard()} />
              <button className="primary" onClick={addCard}>追加</button>
            </div>

            <div className="setLabel" style={{ marginTop: 20 }}>引落口座</div>
            {bankAccts.map((ac, i) => (
              <div className="acctEditRow" key={i}>
                <input className="bankInput" placeholder="例: 三井住友銀行 普通" value={ac.name} onChange={(e) => renameAccount(i, e.target.value)} />
                <button className="bDel" onClick={() => delAccount(i)} aria-label="削除">✕</button>
              </div>
            ))}
            <button className="addBtn small" onClick={addAccount}>＋ 口座を追加</button>

            <div className="setLabel" style={{ marginTop: 20 }}>カードごとの設定</div>
            <p className="setHint">表示名・引落口座・締め日/支払日。締め日が月末なら 31。</p>
            {allCards.map((card) => {
              const r = ruleFor(card), manual = manualCards.includes(card);
              return (
                <div className="ruleCard" key={card}>
                  <div className="ruleHead">{manual ? "手動追加" : "取得: " + card}{manual && <button className="ruleDel" onClick={() => delCard(card)}>削除</button>}</div>
                  <input className="bankInput" placeholder="表示名" value={cardName(card)} onChange={(e) => setCardName(card, e.target.value)} />
                  <select className="bankInput selBank" value={r.bank || ""} onChange={(e) => updRule(card, "bank", e.target.value)}>
                    <option value="">引落口座を選択</option>
                    {bankAccts.map((a) => <option key={a.name} value={a.name}>{a.name}</option>)}
                  </select>
                  <div className="seg">
                    <button className={r.type === "credit" ? "on" : ""} onClick={() => updRule(card, "type", "credit")}>クレジット</button>
                    <button className={r.type === "debit" ? "on" : ""} onClick={() => updRule(card, "type", "debit")}>デビット（即時）</button>
                  </div>
                  {r.type === "credit" && (
                    <div className="ruleGrid">
                      <label>締め日<input type="number" min="1" max="31" value={r.closeDay} onChange={(e) => updRule(card, "closeDay", Math.max(1, Math.min(31, Number(e.target.value) || 1)))} /></label>
                      <label>支払い月<select value={r.payMonthOffset} onChange={(e) => updRule(card, "payMonthOffset", Number(e.target.value))}><option value={1}>翌月</option><option value={2}>翌々月</option></select></label>
                      <label>支払日<input type="number" min="1" max="31" value={r.payDay} onChange={(e) => updRule(card, "payDay", Math.max(1, Math.min(31, Number(e.target.value) || 1)))} /></label>
                    </div>
                  )}
                </div>
              );
            })}
            <button className="primary wide" onClick={() => setRulesOpen(false)}>閉じる</button>
          </div>
        </div>
      )}

      {/* ============ 設定 ============ */}
      {settingsOpen && (
        <div className="overlay" onClick={() => setSettingsOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modalHead"><h3>設定</h3><button className="iconBtn" onClick={() => setSettingsOpen(false)} aria-label="閉じる">✕</button></div>

            <div className="setSection">
              <button className="fullBtn" onClick={() => { setSettingsOpen(false); setRulesOpen(true); }}>カード・口座の設定 →</button>
            </div>

            <div className="setSection">
              <div className="setLabel">表示</div>
              <div className="setRow"><div>ダークモード</div><button className={"switch" + (theme === "dark" ? " on" : "")} onClick={() => { const n = theme === "dark" ? "light" : "dark"; setTheme(n); savePref("theme", n); }}><span className="knob" /></button></div>
              <div className="setRow"><div><div>金額を隠す</div><div className="setSub">人前で開くとき用</div></div><button className={"switch" + (privacy ? " on" : "")} onClick={() => setPrivacy((v) => { savePref("privacy", !v); return !v; })}><span className="knob" /></button></div>
              <div className="setRow"><div><div>同じ利用通知をまとめる</div><div className="setSub">同じカード・日付・店・金額を1件に（初期オフ）</div></div><button className={"switch" + (mergeDup ? " on" : "")} onClick={() => setMergeDup((v) => { savePref("mergeDup", !v); return !v; })}><span className="knob" /></button></div>
              <div className="setLabel" style={{ marginTop: 12 }}>起動時に開く画面</div>
              <div className="seg wrap">
                {[["use", "ホーム"], ["cal", "カレンダー"], ["bill", "支払い"], ["analyze", "分析"], ["items", "カテゴリ"]].map(([k, l]) => (
                  <button key={k} className={defaultTab === k ? "on" : ""} onClick={() => { setDefaultTab(k); savePref("defaultTab", k); }}>{l}</button>
                ))}
              </div>
            </div>

            <div className="setSection">
              <div className="setLabel">Apps Script 自動取得（おすすめ）</div>
              <p className="setHint">URLを保存すると起動時に自動で最新の明細を取得します。</p>
              <input className="bankInput" placeholder="https://script.google.com/macros/s/…/exec?key=…" value={gasUrl} onChange={(e) => setGasUrl(e.target.value)} onBlur={() => savePref("gasUrl", gasUrl.trim())} />
              <button className="fullBtn" style={{ marginTop: 8 }} onClick={() => { savePref("gasUrl", gasUrl.trim()); gasSync(); }} disabled={gasBusy}>{gasBusy ? "取得中…" : "今すぐ取得"}</button>
              {gasMsg.err && <p className="setSub errText">{gasMsg.err}</p>}
              {gasMsg.ok && <p className="setSub okText">{gasMsg.ok}</p>}
            </div>

            <div className="setSection">
              <div className="setLabel">データ</div>
              <p className="setSub">現在: {liveTx && liveTx.length ? "Gmail取得 " + liveTx.length + "件" : "サンプル"} / 手入力 {manualTx.length}件 / 追加した引落 {billExtras.length}件
                {liveTx && liveTx.length ? <button className="inlineBtn" onClick={() => { setLiveTx(null); delPref("liveTx"); }}>サンプルに戻す</button> : null}</p>
              <button className="fullBtn" onClick={copyCsv}>明細をCSVでコピー</button>
              {!confirmReset ? <button className="fullBtn danger" onClick={() => setConfirmReset(true)}>すべてリセット</button> : (
                <div className="confirmRow"><span>本当にすべて消しますか？</span><button className="dangerBtn" onClick={resetAll}>消す</button><button className="miniBtn" onClick={() => setConfirmReset(false)}>やめる</button></div>
              )}
            </div>
            <button className="primary wide" onClick={() => setSettingsOpen(false)}>閉じる</button>
          </div>
        </div>
      )}
    </div>
  );
}
