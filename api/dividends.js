const { mustKey, sendJson, nowIsoLocal, fmpFetch } = require("./_fmp");

function pad(n){ return String(n).padStart(2,"0"); }
function isoDate(d){
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}
function quarterLabel(dateStr){
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  const q = Math.floor(d.getMonth()/3)+1;
  const yy = String(d.getFullYear()).slice(2);
  return `Q${q}/${yy}`;
}

module.exports = async (req, res) => {
  const key = mustKey(res);
  if (!key) return;

  const range = Math.max(1, Math.min(365, Number((req.query && req.query.range) || 90)));
  const filter = String((req.query && req.query.filter) || "").trim().toUpperCase();

  const from = new Date();
  const to = new Date(Date.now() + range*24*3600*1000);

  try{
    // Stable Dividends Calendar endpoint 
    // (Parameters aren't clearly documented in the visible snippet; we attempt from/to filtering, and fallback to unfiltered.)
    let rows = null;
    try{
      rows = await fmpFetch("/dividends-calendar", { from: isoDate(from), to: isoDate(to), apikey: key });
    }catch(_e){
      rows = await fmpFetch("/dividends-calendar", { apikey: key });
    }

    let items = Array.isArray(rows) ? rows : [];
    // Normalize keys based on typical FMP calendar fields
    items = items.map(r => ({
      symbol: (r.symbol || "").toUpperCase(),
      name: r.name || r.companyName || "",
      exDividendDate: r.exDividendDate || r.exDividendDateFormatted || r.date || r.exDividend || null,
      payableDate: r.paymentDate || r.payableDate || r.payment || null,
      amount: Number(r.dividend ?? r.amount ?? r.dividendPerShare ?? r.cashAmount) || null,
    })).filter(it => it.symbol);

    // Local filtering
    const fromIso = isoDate(from);
    const toIso = isoDate(to);
    items = items.filter(it => {
      const d = String(it.exDividendDate || "");
      const inRange = d ? (d >= fromIso && d <= toIso) : true;
      const matches = filter ? it.symbol.includes(filter) : true;
      return inRange && matches;
    });

    // add quarter label
    items = items.map(it => ({ ...it, quarter: quarterLabel(it.payableDate || it.exDividendDate) }));

    // sort by ex-dividend
    items.sort((a,b)=> String(a.exDividendDate||"").localeCompare(String(b.exDividendDate||"")));

    return sendJson(res, 200, { ok:true, updatedAt: nowIsoLocal(), items });
  }catch(e){
    return sendJson(res, e.status || 500, { ok:false, error: e.message || "Dividends error" });
  }
};
