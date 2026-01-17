// Shared helpers for Vercel serverless functions (Node.js)
// Financial Modeling Prep (Stable API): https://financialmodelingprep.com/stable/
const BASE = "https://financialmodelingprep.com/stable";

function getApiKey(){
  // Support a few common variable names to reduce deployment errors.
  return (
    process.env.FMP_API_KEY ||
    process.env.FMP_KEY ||
    process.env.FMP_APIKEY ||
    ""
  ).trim();
}

function sendJson(res, status, payload){
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  // Avoid aggressive caching for "real time" feel
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function mustKey(res){
  const key = getApiKey();
  if (!key){
    sendJson(res, 500, {
      ok: false,
      error: "Falta la variable de entorno FMP_API_KEY en Vercel (Project Settings → Environment Variables).",
      hint: "Asegurate de setearla para Preview/Production y luego Redeploy (Deployments → Redeploy)."
    });
    return null;
  }
  return key;
}

async function fmpFetch(path, params){
  const url = new URL(BASE + path);
  Object.entries(params || {}).forEach(([k,v])=>{
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  });
  const res = await fetch(url.toString(), {
    headers: {
      "Accept": "application/json",
      "User-Agent": "enqueinvertir/1.0",
    },
  });

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = null; }

  if (!res.ok){
    const msg = (data && (data.error || data.message)) ? (data.error || data.message) : text;
    const err = new Error(msg || `HTTP ${res.status}`);
    err.status = res.status;
    err.payload = data;
    throw err;
  }
  return data;
}

function nowIsoLocal(){
  // Human readable timestamp (server time). Good enough for UI.
  const d = new Date();
  const pad = (n)=> String(n).padStart(2,"0");
  return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

module.exports = { getApiKey, sendJson, mustKey, fmpFetch, nowIsoLocal };
