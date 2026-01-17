const { mustKey, sendJson, nowIsoLocal, fmpFetch } = require("./_fmp");

function toNum(x){
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

// Scoring helpers
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
  const xs = arr.filter(x => typeof x === "number" && Number.isFinite(x));
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

function confidenceFrom(ratio){
  if (ratio >= 0.8) return "Alta";
  if (ratio >= 0.55) return "Media";
  return "Baja";
}

function fmtPct(v){
  if (v == null) return null;
  return Math.round(v*1000)/10; // 1 decimal
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
    const [quoteRes, profileRes, ratiosTtmRes] = await Promise.allSettled([
      fmpFetch("/quote", { symbol, apikey: key }),
      fmpFetch("/profile", { symbol, apikey: key }),
      fmpFetch("/ratios-ttm", { symbol, apikey: key }),
    ]);

    const quote = (quoteRes.status === "fulfilled" && Array.isArray(quoteRes.value)) ? quoteRes.value[0] : null;
    const profile = (profileRes.status === "fulfilled" && Array.isArray(profileRes.value)) ? profileRes.value[0] : null;
    let ratios = (ratiosTtmRes.status === "fulfilled" && Array.isArray(ratiosTtmRes.value)) ? ratiosTtmRes.value[0] : null;

    // Fallback if TTM ratios are not available on the plan.
    if (!ratios){
      try{
        const rr = await fmpFetch("/ratios", { symbol, limit: 1, apikey: key });
        if (Array.isArray(rr) && rr.length) ratios = rr[0];
      }catch(_e){
        // ignore
      }
    }

    // Identity
    const name = profile?.companyName || profile?.name || quote?.name || symbol;
    const exchange = profile?.exchangeShortName || profile?.exchange || quote?.exchange || "";
    const sector = profile?.sector || "";
    const industry = profile?.industry || "";

    // Snapshot (fields that tend to be present on free tiers)
    const price = toNum(quote?.price ?? profile?.price);
    const marketCap = toNum(quote?.marketCap ?? profile?.mktCap ?? profile?.marketCap);
    const yearLow = toNum(quote?.yearLow ?? quote?.yearLowPrice);
    const yearHigh = toNum(quote?.yearHigh ?? quote?.yearHighPrice);
    const beta = toNum(profile?.beta ?? quote?.beta);

    // Fundamental ratios (prefer TTM)
    const pe = toNum(ratios?.priceEarningsRatioTTM ?? ratios?.priceEarningsRatio ?? quote?.pe);
    const ps = toNum(ratios?.priceToSalesRatioTTM ?? ratios?.priceToSalesRatio);
    const pb = toNum(ratios?.priceToBookRatioTTM ?? ratios?.priceToBookRatio);
    const roe = toNum(ratios?.returnOnEquityTTM ?? ratios?.returnOnEquity);
    const netMargin = toNum(ratios?.netProfitMarginTTM ?? ratios?.netProfitMargin);
    const de = toNum(ratios?.debtEquityRatioTTM ?? ratios?.debtEquityRatio);
    const currentRatio = toNum(ratios?.currentRatioTTM ?? ratios?.currentRatio);

    // Many FMP ratio fields come as % values (e.g. 35.0). Normalize ROE/Margins to decimals.
    const roeDec = (roe == null) ? null : roe / 100;
    const netMarginDec = (netMargin == null) ? null : netMargin / 100;

    // Template
    const template = pickTemplate(templateIn, sector);
    const w = weightsFor(template);

    // Thresholds (simple, sector-tuned)
    const peGood = (template === "TECH") ? 20 : (template === "BANKS") ? 12 : 15;
    const peOk   = (template === "TECH") ? 32 : (template === "BANKS") ? 18 : 25;
    const peBad  = (template === "TECH") ? 55 : (template === "BANKS") ? 28 : 40;

    const psGood = (template === "TECH") ? 6 : 3;
    const psOk   = (template === "TECH") ? 10 : 5;
    const psBad  = (template === "TECH") ? 18 : 9;

    const pbGood = (template === "BANKS") ? 1.2 : 3.0;
    const pbOk   = (template === "BANKS") ? 2.0 : 6.0;
    const pbBad  = (template === "BANKS") ? 3.5 : 10.0;

    // Subscores
    const vScores = [
      scoreLowerBetter(pe, peGood, peOk, peBad),
      scoreLowerBetter(ps, psGood, psOk, psBad),
      scoreLowerBetter(pb, pbGood, pbOk, pbBad),
    ];
    const qScores = [
      scoreHigherBetter(roeDec, 0.08, 0.15, 0.25),
      scoreHigherBetter(netMarginDec, 0.05, 0.12, 0.20),
    ];
    const rScores = [
      scoreLowerBetter(de, 0.5, 1.2, 2.5),
      scoreBetween(currentRatio, 0.8, 1.0, 1.2, 2.5, 3.5, 5.0),
      scoreLowerBetter(beta, 1.0, 1.4, 2.0),
    ];

    const valuation = mean(vScores);
    const quality = mean(qScores);
    const risk = mean(rScores);

    // Weighted final score
    const presentGroups = [valuation, quality, risk].filter(x => typeof x === "number").length;
    let score = null;
    if (presentGroups > 0){
      const vv = (valuation==null?0:valuation) * (valuation==null?0:w.v);
      const qq = (quality==null?0:quality) * (quality==null?0:w.q);
      const rr = (risk==null?0:risk) * (risk==null?0:w.r);
      const denom = (valuation==null?0:w.v) + (quality==null?0:w.q) + (risk==null?0:w.r);
      score = denom > 0 ? Math.round((vv+qq+rr)/denom) : null;
      if (presentGroups === 1 && score != null) score = Math.max(0, score - 8);
    }

    // Coverage / confidence (by individual fields)
    const metricFields = [pe, ps, pb, roeDec, netMarginDec, de, currentRatio, beta];
    const filled = metricFields.filter(v => v != null && Number.isFinite(Number(v))).length;
    const total = metricFields.length;
    const coverageRatio = total ? (filled / total) : 0;

    const verdict = verdictFrom(score);
    const confidence = confidenceFrom(coverageRatio);

    // Build user-friendly analysis
    const pros = [];
    const cons = [];
    const tags = [];

    if (pe != null){
      tags.push(`P/E ${pe.toFixed(1)}`);
      if (pe <= peGood) pros.push(`Valuación: P/E ${pe.toFixed(1)} en la zona baja para ${template}.`);
      else if (pe >= peBad) cons.push(`Valuación exigida: P/E ${pe.toFixed(1)} alto para ${template}.`);
    }
    if (ps != null){
      tags.push(`P/S ${ps.toFixed(1)}`);
      if (ps <= psGood) pros.push(`Ventas: P/S ${ps.toFixed(1)} relativamente contenido.`);
      else if (ps >= psBad) cons.push(`Ventas: P/S ${ps.toFixed(1)} elevado.`);
    }
    if (pb != null){
      tags.push(`P/B ${pb.toFixed(1)}`);
      if (pb <= pbGood) pros.push(`Balance: P/B ${pb.toFixed(1)} razonable.`);
      else if (pb >= pbBad) cons.push(`Balance: P/B ${pb.toFixed(1)} alto.`);
    }
    if (roeDec != null){
      tags.push(`ROE ${fmtPct(roeDec)}%`);
      if (roeDec >= 0.15) pros.push(`Rentabilidad: ROE ${fmtPct(roeDec)}% sólido.`);
      else if (roeDec < 0.08) cons.push(`Rentabilidad: ROE ${fmtPct(roeDec)}% bajo.`);
    }
    if (netMarginDec != null){
      tags.push(`Margen ${fmtPct(netMarginDec)}%`);
      if (netMarginDec >= 0.12) pros.push(`Márgenes: margen neto ${fmtPct(netMarginDec)}% saludable.`);
      else if (netMarginDec < 0.05) cons.push(`Márgenes: margen neto ${fmtPct(netMarginDec)}% ajustado.`);
    }
    if (de != null){
      tags.push(`D/E ${de.toFixed(2)}`);
      if (de <= 0.8) pros.push(`Solvencia: deuda moderada (D/E ${de.toFixed(2)}).`);
      else if (de >= 2.0) cons.push(`Riesgo financiero: deuda elevada (D/E ${de.toFixed(2)}).`);
    }
    if (beta != null){
      tags.push(`Beta ${beta.toFixed(2)}`);
      if (beta <= 1.0) pros.push(`Volatilidad: beta ${beta.toFixed(2)} (más defensiva).`);
      else if (beta >= 1.7) cons.push(`Volatilidad: beta ${beta.toFixed(2)} (más riesgosa).`);
    }

    // Reasons (for the right column)
    const reasons = [];
    if (template) reasons.push(`Plantilla: ${template} (ajusta umbrales por sector).`);
    if (valuation != null) reasons.push(`Valuación: ${Math.round(valuation)}/100.`);
    if (quality != null) reasons.push(`Calidad: ${Math.round(quality)}/100.`);
    if (risk != null) reasons.push(`Riesgo: ${Math.round(risk)}/100.`);
    if (coverageRatio < 0.8) reasons.push(`Cobertura de datos: ${Math.round(coverageRatio*100)}%.`);

    // Summary (simple, executive)
    const head = score != null ? `${verdict.label.split("·")[0].trim()}.` : "Análisis no disponible.";
    const why = pros[0] ? pros[0] : (cons[0] ? cons[0] : "Sin señales claras con los datos actuales.");
    const watch = cons[0] ? `A vigilar: ${cons[0].replace(/\.$/,"")}.` : "";
    const summary = `${head} ${why} ${watch}`.trim();

    return sendJson(res, 200, {
      ok: true,
      updatedAt: nowIsoLocal(),
      symbol,
      name,
      exchange,
      sector,
      industry,
      template,
      price,
      snapshot: { marketCap, yearLow, yearHigh, beta },
      metrics: {
        marketCap,
        yearLow,
        yearHigh,
        beta,
        pe,
        ps,
        pb,
        roe: roeDec,
        netMargin: netMarginDec,
        de,
        currentRatio,
      },
      subscores: { valuation, quality, risk },
      score,
      verdict,
      confidence,
      coverage: { filled, total, ratio: coverageRatio },
      // Back-compat keys used by the current frontend
      reasons,
      brief: summary,
      tags: tags.slice(0, 8),
      analysis: {
        summary,
        pros: pros.slice(0, 3),
        cons: cons.slice(0, 3),
      }
    });
  }catch(e){
    return sendJson(res, e.status || 500, { ok:false, error: e.message || "Metrics error" });
  }
};
