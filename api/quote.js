const { mustKey, sendJson, nowIsoLocal, fmpFetch } = require("./_fmp");

module.exports = async (req, res) => {
  const key = mustKey(res);
  if (!key) return;

  const symbols = String((req.query && req.query.symbols) || "").trim().toUpperCase();
  if (!symbols){
    return sendJson(res, 200, { ok:true, updatedAt: nowIsoLocal(), quotes: {} });
  }

  try{
    // Use batch quote if available; otherwise fallback to quote (comma-separated works for many endpoints)
    const rows = await fmpFetch("/quote", { symbol: symbols, apikey: key });
    const quotes = {};
    if (Array.isArray(rows)){
      rows.forEach(r=>{
        if (!r || !r.symbol) return;
        quotes[String(r.symbol).toUpperCase()] = {
          price: Number(r.price) || null,
          changesPercentage: Number(String(r.changesPercentage||"").replace("%","")) || null
        };
      });
    }
    return sendJson(res, 200, { ok:true, updatedAt: nowIsoLocal(), quotes });
  }catch(e){
    return sendJson(res, e.status || 500, { ok:false, error: e.message || "Quote error" });
  }
};
