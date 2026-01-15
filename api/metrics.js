const { mustKey, sendJson, nowIsoLocal, fmpFetch } = require("./_fmp");

function toNum(x){
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}
function pct(x){ return x == null ? null : x / 100; }

// Simple scoring helpers
function scoreLowerBetter(value, good, ok, bad){
  const v = toNum(value);
  if (v == null) return null;
  if (v <= good) return 100;
  if (v <= ok) return 75;
  if (v <= bad) return 45;
  return 20;
}
function scoreHigherBetter(value, bad, ok, good){
  const v = toNum(value);
  if (v == null) return null;
  if (v >= good) return 100;
  if (v >= ok) return 75;
  if (v >= bad) return 45;
  return 20;
}
function scoreBetween(value, lowBad, lowOk, lowGood, highGood, highOk, highBad){
  const v = toNum(value);
  if (v == null) return null;
  if (v >= lowGood && v <= highGood) return 100;
  if (v >= lowOk && v <= highOk) return 75;
  if (v >= lowBad && v <= highBad) return 45;
  return 20;
}
function mean(arr){
  const xs = arr.filter(x=>typeof x === "number" && Number.isFinite(x));
  if (xs.length === 0) return null;
  return xs.reduce((a,b)=>a+b,0)/xs.length;
}

function pickTemplate(autoTemplate, sector){
  if (autoTemplate !== "AUTO") return autoTemplate;
  const s = String(sector||"").toLowerCase();
  if (s.includes("financial")) return "BANKS";
  if (s.includes("energy")) return "ENERGY";
  if (s.includes("tech") || s.includes("communication") || s.includes("internet") || s.includes("software")) return "TECH";
  return "DEFAULT";
}

function weightsFor(template){
  // weights across [valuation, quality, risk]
  switch(template){
    case "TECH": return { v: 0.45, q: 0.40, r: 0.15 };
    case "BANKS": return { v: 0.35, q: 0.35, r: 0.30 };
    case "ENERGY": return { v: 0.40, q: 0.30, r: 0.30 };
    default: return { v: 0.40, q: 0.35, r: 0.25 };
  }
}

function verdictFrom(score){
  if (score == null) return { type:"neutral", label:"No disponible" };
  if (score >= 70) return { type:"good", label:`Atractiva · Score ${score}/100` };
  if (score >= 45) return { type:"mid", label:`En precio · Score ${score}/100` };
  return { type:"bad", label:`Exigida · Score ${score}/100` };
}

function confidenceFrom(coverage){
  if (coverage >= 0.8) return "Alta";
  if (coverage >= 0.55) return "Media";
  return "Baja";
}

module.exports = async (req, res) => {
  const key = mustKey(res);
  if (!key) return;

  const symbol = String((req.query && req.query.symbol) || "").trim().toUpperCase();
  const templateIn = String((req.query && req.query.template) || "AUTO").trim().toUpperCase();

  if (!symbol){
    return sendJson(res, 400, { ok:false, error:"Falta parámetro symbol" });
  }

  try{
    // Stock Quote API: https://financialmodelingprep.com/stable/quote?symbol=AAPL 
    // Profile: https://financialmodelingprep.com/stable/profile?symbol=AAPL 
    // Ratios TTM: https://financialmodelingprep.com/stable/ratios-ttm?symbol=AAPL 
    // Key Metrics TTM: https://financialmodelingprep.com/stable/key-metrics-ttm?symbol=AAPL 
    const [quoteArr, profileArr, ratiosArr, keymArr] = await Promise.allSettled([
      fmpFetch("/quote", { symbol, apikey: key }),
      fmpFetch("/profile", { symbol, apikey: key }),
      fmpFetch("/ratios-ttm", { symbol, apikey: key }),
      fmpFetch("/key-metrics-ttm", { symbol, apikey: key }),
    ]);

    const quote = (quoteArr.status === "fulfilled" && Array.isArray(quoteArr.value)) ? quoteArr.value[0] : null;
    const profile = (profileArr.status === "fulfilled" && Array.isArray(profileArr.value)) ? profileArr.value[0] : null;
    const ratios = (ratiosArr.status === "fulfilled" && Array.isArray(ratiosArr.value)) ? ratiosArr.value[0] : null;
    const keym = (keymArr.status === "fulfilled" && Array.isArray(keymArr.value)) ? keymArr.value[0] : null;

    // Basic identity
    const name = profile?.companyName || profile?.name || quote?.name || symbol;
    const exchange = profile?.exchangeShortName || profile?.exchange || quote?.exchange || "";
    const sector = profile?.sector || "";
    const industry = profile?.industry || "";

    const price = toNum(quote?.price ?? profile?.price);
    const pe = toNum(ratios?.priceEarningsRatioTTM ?? quote?.pe ?? keym?.peRatioTTM);
    const ps = toNum(ratios?.priceToSalesRatioTTM ?? keym?.priceToSalesRatioTTM);
    const roe = toNum(ratios?.returnOnEquityTTM) != null ? (toNum(ratios?.returnOnEquityTTM)/100) : null;
    const de = toNum(ratios?.debtEquityRatioTTM);
    const netMargin = toNum(ratios?.netProfitMarginTTM) != null ? (toNum(ratios?.netProfitMarginTTM)/100) : null;
    const fcfYield = toNum(keym?.freeCashFlowYieldTTM) != null ? (toNum(keym?.freeCashFlowYieldTTM)/100) : null;
    const currentRatio = toNum(ratios?.currentRatioTTM);
    const beta = toNum(profile?.beta ?? quote?.beta);

    // Template by sector
    const template = pickTemplate(templateIn, sector);
    const w = weightsFor(template);

    // Sector-tuned thresholds (very simple)
    const peGood = (template === "TECH") ? 20 : (template === "BANKS") ? 12 : 15;
    const peOk   = (template === "TECH") ? 32 : (template === "BANKS") ? 18 : 25;
    const peBad  = (template === "TECH") ? 55 : (template === "BANKS") ? 28 : 40;

    const psGood = (template === "TECH") ? 6 : 3;
    const psOk   = (template === "TECH") ? 10 : 5;
    const psBad  = (template === "TECH") ? 18 : 9;

    const vScores = [
      scoreLowerBetter(pe, peGood, peOk, peBad),
      scoreLowerBetter(ps, psGood, psOk, psBad),
      // Higher FCF yield is better. thresholds are in decimals: 2% / 5% / 10%
      scoreHigherBetter(fcfYield, 0.01, 0.03, 0.08),
    ];
    const qScores = [
      // ROE thresholds: 8% / 15% / 25%
      scoreHigherBetter(roe, 0.08, 0.15, 0.25),
      // Net margin thresholds: 5% / 12% / 20%
      scoreHigherBetter(netMargin, 0.05, 0.12, 0.20),
    ];
    const rScores = [
      // Debt/Equity lower is better
      scoreLowerBetter(de, 0.5, 1.2, 2.5),
      // Current ratio in a healthy band
      scoreBetween(currentRatio, 0.8, 1.0, 1.2, 2.5, 3.5, 5.0),
      // Beta lower is better
      scoreLowerBetter(beta, 1.0, 1.4, 2.0),
    ];

    const v = mean(vScores);
    const q = mean(qScores);
    const r = mean(rScores);

    // Weighted score with coverage penalty if many are missing
    const allParts = [v, q, r];
    const present = allParts.filter(x=>typeof x === "number").length;
    const coverage = present / 3;

    let score = null;
    if (present > 0){
      const vv = (v==null?0:v) * (v==null?0:w.v);
      const qq = (q==null?0:q) * (q==null?0:w.q);
      const rr = (r==null?0:r) * (r==null?0:w.r);
      const denom = (v==null?0:w.v) + (q==null?0:w.q) + (r==null?0:w.r);
      score = denom > 0 ? Math.round((vv+qq+rr)/denom) : null;
      // penalty: if only 1 group present, reduce confidence/score slightly
      if (coverage < 0.67 && score != null) score = Math.max(0, score - 8);
    }

    const verdict = verdictFrom(score);
    const confidence = confidenceFrom(coverage);

    const reasons = [];
    const tags = [];

    if (pe != null){
      tags.push(`P/E ${pe.toFixed(1)}`);
      reasons.push(`P/E (TTM) = ${pe.toFixed(1)} (referencia sector: ${template}).`);
    }
    if (roe != null){
      tags.push(`ROE ${Math.round(roe*100)}%`);
      reasons.push(`ROE (TTM) = ${(roe*100).toFixed(1)}%.`);
    }
    if (fcfYield != null){
      tags.push(`FCF yield ${(fcfYield*100).toFixed(1)}%`);
      reasons.push(`Free Cash Flow Yield (TTM) = ${(fcfYield*100).toFixed(1)}%.`);
    }
    if (de != null){
      tags.push(`D/E ${de.toFixed(2)}`);
      reasons.push(`Deuda/Equity = ${de.toFixed(2)}.`);
    }
    if (netMargin != null){
      tags.push(`Margen ${(netMargin*100).toFixed(1)}%`);
      reasons.push(`Margen neto (TTM) = ${(netMargin*100).toFixed(1)}%.`);
    }

    const briefBits = [];
    if (score != null){
      briefBits.push(`Score ${score}/100 (${verdict.label.split("·")[0].trim().toLowerCase()}).`);
    }
    if (template === "BANKS"){
      briefBits.push("Plantilla Bancos prioriza solvencia y valuación.");
    }else if (template === "TECH"){
      briefBits.push("Plantilla Tech prioriza crecimiento y calidad.");
    }else if (template === "ENERGY"){
      briefBits.push("Plantilla Energía balancea valuación y riesgo.");
    }
    if (pe != null && roe != null){
      briefBits.push(`P/E ${pe.toFixed(1)} con ROE ${(roe*100).toFixed(0)}%.`);
    }else if (pe != null){
      briefBits.push(`P/E ${pe.toFixed(1)}.`);
    }
    if (fcfYield != null){
      briefBits.push(`FCF yield ${(fcfYield*100).toFixed(1)}%.`);
    }

    const response = {
      ok: true,
      updatedAt: nowIsoLocal(),
      symbol,
      name,
      exchange,
      sector,
      industry,
      template,
      price,
      metrics: { pe, ps, roe, de, netMargin, fcfYield, currentRatio, beta },
      score,
      verdict,
      confidence,
      reasons: reasons.slice(0,6),
      brief: briefBits.join(" "),
      tags: tags.slice(0,6),
    };

    return sendJson(res, 200, response);
  }catch(e){
    return sendJson(res, e.status || 500, { ok:false, error: e.message || "Metrics error" });
  }
};
