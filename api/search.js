const { mustKey, sendJson, nowIsoLocal, fmpFetch } = require("./_fmp");

module.exports = async (req, res) => {
  const key = mustKey(res);
  if (!key) return;

  const query = String((req.query && req.query.query) || "").trim();
  if (!query){
    return sendJson(res, 200, { ok:true, updatedAt: nowIsoLocal(), results: [] });
  }

  try{
    // Docs: https://financialmodelingprep.com/stable/search-symbol?query=AAPL 
    const rows = await fmpFetch("/search-symbol", { query, apikey: key });
    const results = Array.isArray(rows) ? rows
      .filter(r => r && r.symbol && (String(r.exchangeShortName||"").includes("NASDAQ") || String(r.exchangeShortName||"").includes("NYSE")))
      .map(r => ({
        symbol: String(r.symbol).toUpperCase(),
        name: r.name || r.companyName || r.symbol,
        exchange: r.exchangeShortName || r.exchange || "",
        currency: r.currency || "",
      })) : [];
    return sendJson(res, 200, { ok:true, updatedAt: nowIsoLocal(), results });
  }catch(e){
    return sendJson(res, e.status || 500, { ok:false, error: e.message || "Search error" });
  }
};
