const { mustKey, sendJson, nowIsoLocal, fmpFetch } = require("./_fmp");

function normalize(items){
  if (!Array.isArray(items)) return [];
  return items.map(it => ({
    symbol: it.symbol,
    name: it.name || it.companyName || "",
    price: Number(it.price) || null,
    changesPercentage: Number(String(it.changesPercentage || "").replace("%","")) || null,
  })).filter(x => x.symbol);
}

module.exports = async (req, res) => {
  const key = mustKey(res);
  if (!key) return;

  const type = String((req.query && req.query.type) || "gainers").toLowerCase();
  let path = "/biggest-gainers";
  if (type === "losers") path = "/biggest-losers";
  if (type === "active" || type === "mostactive") path = "/most-actives";

  try{
    // Docs: biggest-gainers, biggest-losers, most-actives 
    const data = await fmpFetch(path, { apikey: key });
    return sendJson(res, 200, { ok:true, updatedAt: nowIsoLocal(), items: normalize(data) });
  }catch(e){
    return sendJson(res, e.status || 500, { ok:false, error: e.message || "Movers error" });
  }
};
