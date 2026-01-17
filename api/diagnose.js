const { getApiKey, sendJson, nowIsoLocal, fmpFetch } = require("./_fmp");

module.exports = async (req, res) => {
  const key = getApiKey();
  if (!key){
    return sendJson(res, 200, {
      ok: false,
      hasKey: false,
      updatedAt: nowIsoLocal(),
      note: "Configurar FMP_API_KEY en Vercel (Preview/Production) y redeploy."
    });
  }

  try{
    const quote = await fmpFetch("/quote", { symbol: "AAPL", apikey: key });
    const ok = Array.isArray(quote) && quote.length > 0;
    return sendJson(res, 200, {
      ok,
      hasKey: true,
      updatedAt: nowIsoLocal(),
      sample: ok ? { symbol: quote[0].symbol, price: quote[0].price } : null
    });
  }catch(e){
    return sendJson(res, 200, {
      ok: false,
      hasKey: true,
      updatedAt: nowIsoLocal(),
      status: e.status || null,
      error: e.message || "Diagnose error"
    });
  }
};
