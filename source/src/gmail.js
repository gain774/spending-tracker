// Google Sign-In (GIS) + Gmail API (readonly) — クライアントのみ・サーバー不要
const SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const QUERY = "subject:(ご利用のお知らせ OR カード利用のお知らせ OR ショッピングご利用のお知らせ OR ご利用速報 OR ご利用内容) newer_than:6m";

export function loadGis() {
  return new Promise((resolve, reject) => {
    if (window.google && window.google.accounts && window.google.accounts.oauth2) return resolve();
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Google認証スクリプトの読み込みに失敗しました"));
    document.head.appendChild(s);
  });
}

export async function gmailConnect(clientId) {
  await loadGis();
  return new Promise((resolve, reject) => {
    try {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPE,
        callback: (resp) => (resp && resp.access_token ? resolve(resp.access_token) : reject(new Error("認証がキャンセルされました"))),
        error_callback: (err) => reject(new Error((err && err.message) || "認証エラー")),
      });
      client.requestAccessToken({ prompt: "" });
    } catch (e) { reject(e); }
  });
}

export async function gmailProfile(token) {
  const r = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", { headers: { Authorization: "Bearer " + token } });
  if (!r.ok) throw new Error("プロフィール取得失敗 (" + r.status + ")");
  return (await r.json()).emailAddress;
}

export async function gmailFetch(token, onProgress) {
  const base = "https://gmail.googleapis.com/gmail/v1/users/me";
  const auth = { Authorization: "Bearer " + token };
  const ids = [];
  let pageToken = "";
  do {
    const u = base + "/messages?maxResults=100&q=" + encodeURIComponent(QUERY) + (pageToken ? "&pageToken=" + pageToken : "");
    const r = await fetch(u, { headers: auth });
    if (!r.ok) throw new Error("メール一覧取得失敗 (" + r.status + ")");
    const d = await r.json();
    (d.messages || []).forEach((m) => ids.push(m.id));
    pageToken = d.nextPageToken || "";
  } while (pageToken && ids.length < 250);

  const msgs = [];
  for (let i = 0; i < ids.length; i++) {
    const r = await fetch(base + "/messages/" + ids[i] + "?format=full", { headers: auth });
    if (r.ok) msgs.push(await r.json());
    if (onProgress) onProgress(i + 1, ids.length);
  }
  return parseMessages(msgs);
}

const header = (p, name) => { const h = (p.headers || []).find((x) => x.name.toLowerCase() === name.toLowerCase()); return h ? h.value : ""; };
function b64(data) {
  const s = data.replace(/-/g, "+").replace(/_/g, "/");
  try { return new TextDecoder("utf-8").decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0))); } catch { try { return atob(s); } catch { return ""; } }
}
function decodeBody(payload) {
  let txt = "";
  (function walk(p) { if (!p) return; if (p.body && p.body.data) txt += "\n" + b64(p.body.data); (p.parts || []).forEach(walk); })(payload);
  return txt.replace(/<[^>]+>/g, " ");
}

export function cardFrom(from, subject) {
  const s = (from + " " + subject).toLowerCase();
  if (s.includes("vpass")) return "三井住友カード";
  if (s.includes("smbc-debit") || s.includes("debit")) return "Oliveデビット";
  if (s.includes("jcb")) return "JCBカードW";
  if (s.includes("rakuten") || subject.includes("楽天")) return "楽天カード";
  if (s.includes("epos") || subject.includes("エポス")) return "エポスカード";
  if (s.includes("aeon") || subject.includes("イオン")) return "イオンカード";
  if (s.includes("saison") || subject.includes("セゾン")) return "セゾンカード";
  if (s.includes("paypay")) return "PayPayカード";
  if (s.includes("nicos") || s.includes("mufg") || subject.includes("三菱")) return "三菱UFJニコス";
  if (s.includes("orico") || subject.includes("オリコ")) return "オリコカード";
  if (s.includes("viewsnet") || s.includes("jreast") || subject.includes("ビュー")) return "ビューカード";
  if (s.includes("lifecard") || subject.includes("ライフカード")) return "ライフカード";
  if (s.includes("dcard") || subject.includes("dカード")) return "dカード";
  const disp = (from.match(/^\s*"?([^"<]+?)"?\s*</) || [])[1];
  if (disp && disp.replace(/\s/g, "")) return disp.trim().slice(0, 20);
  const dom = (from.match(/@([A-Za-z0-9.\-]+)/) || [])[1];
  return dom || "その他カード";
}

export function parseMessages(msgs) {
  const out = [];
  msgs.forEach((d) => {
    const p = d.payload || {};
    const subject = header(p, "Subject");
    const from = header(p, "From");
    if (/ポイント|キャンペーン|還元|アンケート|変更|登録|認証コード/.test(subject)) return;
    let body = ((d.snippet || "") + "\n" + decodeBody(p)).replace(/\r/g, " ").replace(/[ \t　]+/g, " ");
    if (/取消|キャンセル/.test(body)) return;
    const amtM = body.match(/(?:ご?利用金額|ご請求金額|金額)[^0-9]{0,8}([0-9][0-9,]*)\s*円/) || body.match(/([0-9][0-9,]{2,})\s*円/);
    const amount = amtM ? Number(amtM[1].replace(/,/g, "")) : 0;
    let date = "";
    const dM = body.match(/(20[0-9]{2})[\/年.\-](1[0-2]|0?[1-9])[\/月.\-](3[01]|[12][0-9]|0?[1-9])/);
    if (dM) date = dM[1] + "-" + String(dM[2]).padStart(2, "0") + "-" + String(dM[3]).padStart(2, "0");
    else if (d.internalDate) { const t = new Date(Number(d.internalDate)); date = t.getFullYear() + "-" + String(t.getMonth() + 1).padStart(2, "0") + "-" + String(t.getDate()).padStart(2, "0"); }
    let merchant = "";
    const mM = body.match(/(?:ご利用先|利用先|ご利用店名|ご利用場所|加盟店名?)[：:　 ]*([^\n　]{1,30})/);
    if (mM) merchant = mM[1].trim().replace(/様$/, "");
    if (!merchant) merchant = subject.replace(/【.*?】/g, "").replace(/.*のお知らせ/, "").trim().slice(0, 24) || "不明";
    if (amount > 0 && date) out.push({ c: cardFrom(from, subject), d: date, m: merchant, a: amount });
  });
  return out.sort((a, b) => (a.d < b.d ? 1 : -1));
}
