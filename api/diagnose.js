const { getApiKey, sendJson, nowIsoLocal, fmpFetch } = require("./_fmp");

module.exports = async (req, res) => {
  const key = getApiKey();
  if (!key){
    return sendJson(res, 200, { ok:false, hasKey:false, updatedAt: nowIsoLocal(), note:"Configurar FMP_API_KEY y redeploy." });
  }
  try{
    // Smoke test a cheap endpoint
    await fmpFetch("/quote-short", { symbol: "AAPL", apikey: key });
    return sendJson(res, 200, { ok:true, hasKey:true, updatedAt: nowIsoLocal() });
  }catch(e){
    return sendJson(res, 200, { ok:false, hasKey:true, updatedAt: nowIsoLocal(), error: e.message, status: e.status || null });
  }
};
