const { mustKey, sendJson, nowIsoLocal, fmpFetch } = require("./_fmp");

function isUsListing(r){
  const ex1 = String(r.exchangeShortName || "").toUpperCase();
  const ex2 = String(r.exchange || "").toUpperCase();
  const hay = `${ex1} ${ex2}`;
  return hay.includes("NASDAQ") || hay.includes("NYSE") || hay.includes("AMEX") || hay.includes("NYSE AMERICAN");
}

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
    const raw = Array.isArray(rows) ? rows : [];

    const wanted = query.toUpperCase();
    const seen = new Set();
    let results = raw
      .filter(r => r && r.symbol && isUsListing(r))
      .map(r => ({
        symbol: String(r.symbol).toUpperCase(),
        name: r.name || r.companyName || r.symbol,
        exchange: r.exchangeShortName || r.exchange || "",
        currency: r.currency || "",
      }))
      .filter(it => {
        if (seen.has(it.symbol)) return false;
        seen.add(it.symbol);
        return true;
      });

    // Sort: exact symbol match first, then prefix match, then name match.
    results.sort((a,b)=>{
      const aS = a.symbol;
      const bS = b.symbol;
      const aExact = aS === wanted ? 0 : 1;
      const bExact = bS === wanted ? 0 : 1;
      if (aExact !== bExact) return aExact - bExact;
      const aPre = aS.startsWith(wanted) ? 0 : 1;
      const bPre = bS.startsWith(wanted) ? 0 : 1;
      if (aPre !== bPre) return aPre - bPre;
      return aS.localeCompare(bS);
    });

    // Keep it responsive.
    results = results.slice(0, 80);

    return sendJson(res, 200, { ok:true, updatedAt: nowIsoLocal(), results });
  }catch(e){
    return sendJson(res, e.status || 500, { ok:false, error: e.message || "Search error" });
  }
};
