/* enqueinvertir — frontend (no framework)
   - Combobox (búsqueda + dropdown unificados)
   - Análisis por score 0–100
   - Top movers / Watchlist / Dividendos
*/

const $ = (id) => document.getElementById(id);

const POPULAR = [
  { symbol: "AAPL", name: "Apple Inc.", exchange: "NASDAQ" },
  { symbol: "MSFT", name: "Microsoft", exchange: "NASDAQ" },
  { symbol: "NVDA", name: "NVIDIA", exchange: "NASDAQ" },
  { symbol: "TSLA", name: "Tesla", exchange: "NASDAQ" },
  { symbol: "JPM", name: "JPMorgan", exchange: "NYSE" },
];

const state = {
  selected: { ...POPULAR[0] },
  suggestions: [],
  activeIndex: -1,
  suggestOpen: false,
  searchTimer: null,
  lastQuery: "",
};

function fmtNum(n, d=2){
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return "—";
  return Number(n).toFixed(d);
}
function fmtPct(dec, d=1){
  if (dec === null || dec === undefined || !Number.isFinite(Number(dec))) return "—";
  return `${(Number(dec)*100).toFixed(d)}%`;
}
function fmtPrice(n){
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return "—";
  return `$${Number(n).toFixed(2)}`;
}
function fmtMoneyShort(n){
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return "—";
  const abs = Math.abs(Number(n));
  const sign = Number(n) < 0 ? "-" : "";
  const units = [
    { v: 1e12, s: "T" },
    { v: 1e9, s: "B" },
    { v: 1e6, s: "M" },
  ];
  for (const u of units){
    if (abs >= u.v) return `${sign}$${(abs/u.v).toFixed(2)}${u.s}`;
  }
  return `${sign}$${abs.toFixed(0)}`;
}

function normalizeExchangeForTV(ex){
  const s = String(ex || "").toUpperCase();
  if (s.includes("NASDAQ")) return "NASDAQ";
  if (s.includes("NYSE AMERICAN") || s.includes("AMEX")) return "AMEX";
  if (s.includes("NYSE") || s.includes("NEW YORK")) return "NYSE";
  // best-effort
  return "NASDAQ";
}

function setSelected({ symbol, name, exchange }, { updateInput=true } = {}){
  if (!symbol) return;
  const sym = String(symbol).toUpperCase();
  const nm = name ? String(name) : sym;
  const ex = exchange ? String(exchange) : "";
  state.selected = { symbol: sym, name: nm, exchange: ex };

  if (updateInput){
    const val = nm && nm !== sym ? `${nm} (${sym})` : sym;
    $("tickerInput").value = val;
  }

  const exLabel = ex ? ` · ${ex}` : "";
  $("selectedMeta").textContent = `Seleccionado: ${nm} (${sym})${exLabel}`;
}

function getSymbolFromInput(){
  const v = String($("tickerInput").value || "").trim();
  // allow "Nombre (TICKER)" pattern
  const m = v.match(/\(([A-Za-z\.\-]{1,10})\)\s*$/);
  if (m) return m[1].toUpperCase();
  // or just ticker
  if (/^[A-Za-z\.\-]{1,10}$/.test(v)) return v.toUpperCase();
  return "";
}

function openSuggest(){
  state.suggestOpen = true;
  $("suggestPanel").classList.remove("hidden");
}
function closeSuggest(){
  state.suggestOpen = false;
  state.activeIndex = -1;
  $("suggestPanel").classList.add("hidden");
  $("suggestPanel").innerHTML = "";
}
function setActiveIndex(i){
  state.activeIndex = i;
  const items = Array.from($("suggestPanel").querySelectorAll(".suggest__item"));
  items.forEach((el, idx)=>{
    el.classList.toggle("is-active", idx === i);
  });
}

function renderSuggest(items){
  state.suggestions = Array.isArray(items) ? items : [];
  const panel = $("suggestPanel");
  if (!state.suggestions.length){
    panel.innerHTML = `<div class="suggest__item"><div class="suggest__left"><div class="suggest__name">Sin resultados</div><div class="suggest__meta">Probá con otro término o un ticker exacto.</div></div></div>`;
    openSuggest();
    return;
  }

  panel.innerHTML = state.suggestions.map((it, idx)=>{
    const nm = it.name || it.symbol;
    const ex = it.exchange || "";
    return `
      <div class="suggest__item" role="option" data-idx="${idx}">
        <div class="suggest__left">
          <div class="suggest__name">${escapeHtml(nm)}</div>
          <div class="suggest__meta">${escapeHtml(it.symbol)}</div>
        </div>
        <div class="suggest__right">
          <div class="suggest__sym">${escapeHtml(it.symbol)}</div>
          <div class="suggest__ex">${escapeHtml(ex)}</div>
        </div>
      </div>
    `;
  }).join("");

  openSuggest();
  setActiveIndex(0);

  panel.querySelectorAll(".suggest__item[data-idx]").forEach((row)=>{
    row.addEventListener("mousedown", (e)=>{
      // prevent blur before click
      e.preventDefault();
      const idx = Number(row.dataset.idx);
      const it = state.suggestions[idx];
      if (!it) return;
      setSelected({ symbol: it.symbol, name: it.name, exchange: it.exchange });
      closeSuggest();
      analyze();
    });
  });
}

function escapeHtml(str){
  return String(str || "").replace(/[&<>"']/g, (c)=>({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    "\"":"&quot;",
    "'":"&#039;"
  })[c]);
}

async function apiJson(url){
  const r = await fetch(url, { headers: { "Accept": "application/json" } });
  const data = await r.json().catch(()=>null);
  if (!r.ok) throw new Error((data && data.error) || `HTTP ${r.status}`);
  return data;
}

async function searchTickers(q){
  const query = String(q || "").trim();
  if (!query){
    renderSuggest(POPULAR);
    return;
  }
  const data = await apiJson(`/api/search?query=${encodeURIComponent(query)}`);
  renderSuggest((data && data.results) ? data.results : []);
}

function bindCombobox(){
  const input = $("tickerInput");

  input.addEventListener("focus", ()=>{
    // if empty, show popular
    if (!String(input.value || "").trim()){
      renderSuggest(POPULAR);
    }
  });

  input.addEventListener("blur", ()=>{
    // Allow click selection (mousedown) first
    setTimeout(()=> closeSuggest(), 120);
  });

  input.addEventListener("input", ()=>{
    const q = String(input.value || "");
    state.lastQuery = q;
    if (state.searchTimer) clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(()=>{
      searchTickers(q).catch(()=>{
        // silently fail in UI, but keep app usable
        renderSuggest([]);
      });
    }, 220);
  });

  input.addEventListener("keydown", (e)=>{
    if (!state.suggestOpen && (e.key === "ArrowDown" || e.key === "ArrowUp")){
      renderSuggest(POPULAR);
      return;
    }

    if (!state.suggestOpen) return;

    if (e.key === "ArrowDown"){
      e.preventDefault();
      const n = state.suggestions.length;
      if (!n) return;
      setActiveIndex((state.activeIndex + 1) % n);
    } else if (e.key === "ArrowUp"){
      e.preventDefault();
      const n = state.suggestions.length;
      if (!n) return;
      setActiveIndex((state.activeIndex - 1 + n) % n);
    } else if (e.key === "Enter"){
      // pick active if any
      e.preventDefault();
      const it = state.suggestions[state.activeIndex];
      if (it && it.symbol){
        setSelected({ symbol: it.symbol, name: it.name, exchange: it.exchange });
        closeSuggest();
        analyze();
      } else {
        closeSuggest();
        analyze();
      }
    } else if (e.key === "Escape"){
      e.preventDefault();
      closeSuggest();
    }
  });

  // quick picks
  $("quickPicks").querySelectorAll("[data-pick]").forEach((btn)=>{
    btn.addEventListener("click", ()=>{
      const sym = String(btn.dataset.pick || "").toUpperCase();
      setSelected({ symbol: sym, name: sym, exchange: "" });
      analyze();
    });
  });
}

function pillForVerdict(verdict){
  const pill = $("verdictPill");
  pill.classList.remove("pill--good","pill--neutral","pill--bad");
  if (!verdict){
    pill.textContent = "—";
    pill.classList.add("pill--neutral");
    return;
  }
  pill.textContent = verdict.label || "—";
  if (verdict.tone === "good") pill.classList.add("pill--good");
  else if (verdict.tone === "bad") pill.classList.add("pill--bad");
  else pill.classList.add("pill--neutral");
}

function renderChart(symbol, exchangeGuess){
  $("tvFallback").classList.add("hidden");
  const ex = exchangeGuess || "NASDAQ";
  const container = $("tvContainer");
  container.innerHTML = "";

  // TradingView widget
  const script = document.createElement("script");
  script.src = "https://s3.tradingview.com/tv.js";
  script.async = true;
  script.onload = () => {
    try{
      // eslint-disable-next-line no-undef
      new TradingView.widget({
        container_id: "tvContainer",
        symbol: `${ex}:${symbol}`,
        interval: "D",
        timezone: "America/New_York",
        theme: "light",
        style: "1",
        locale: "es",
        allow_symbol_change: false,
        hide_top_toolbar: false,
        autosize: true,
      });
    }catch(_e){
      $("tvFallback").classList.remove("hidden");
    }
  };
  script.onerror = () => $("tvFallback").classList.remove("hidden");
  container.appendChild(script);
}

function setError(msg){
  if (!msg){
    $("errorCard").classList.add("hidden");
    $("errorText").textContent = "";
    return;
  }
  $("errorCard").classList.remove("hidden");
  $("errorText").textContent = msg;
}

function renderBrief(data){
  const sym = data.symbol || state.selected.symbol;
  $("briefTitle").textContent = `${sym} — puntos clave`;

  const summary = (data.analysis && data.analysis.summary) || data.brief || "";
  $("briefSummary").textContent = summary || "Sin datos suficientes para construir el análisis.";

  // pros/cons
  const pros = (data.analysis && Array.isArray(data.analysis.pros)) ? data.analysis.pros : [];
  const cons = (data.analysis && Array.isArray(data.analysis.cons)) ? data.analysis.cons : [];

  const prosUl = $("briefPros");
  prosUl.innerHTML = (pros.length ? pros : ["—"]).map(t => `<li>${escapeHtml(t)}</li>`).join("");

  const consUl = $("briefCons");
  consUl.innerHTML = (cons.length ? cons : ["—"]).map(t => `<li>${escapeHtml(t)}</li>`).join("");

  // tags
  const chips = $("briefChips");
  const tags = Array.isArray(data.tags) ? data.tags : [];
  chips.innerHTML = tags.map(t => `<span class="chip">${escapeHtml(t)}</span>`).join("");
}

function renderSnapshot(data){
  $("snapName").textContent = data.name || state.selected.name || data.symbol;

  const metaParts = [];
  if (data.symbol) metaParts.push(data.symbol);
  if (data.exchange) metaParts.push(data.exchange);
  if (data.sector) metaParts.push(data.sector);

  const yL = data.snapshot && data.snapshot.yearLow;
  const yH = data.snapshot && data.snapshot.yearHigh;
  if (Number.isFinite(Number(yL)) && Number.isFinite(Number(yH))) metaParts.push(`Rango 52s: ${fmtPrice(yL)}–${fmtPrice(yH)}`);

  $("snapMeta").textContent = metaParts.join(" · ") || "—";

  $("snapPrice").textContent = fmtPrice(data.price);
  $("snapUpdated").textContent = data.updatedAt ? `Actualizado: ${data.updatedAt}` : "";

  const m = data.metrics || {};
  $("m_mcap").textContent = fmtMoneyShort(m.marketCap);
  $("m_pe").textContent = fmtNum(m.pe, 1);
  $("m_roe").textContent = fmtPct(m.roe, 1);
  $("m_ps").textContent = fmtNum(m.ps, 2);
  $("m_pb").textContent = fmtNum(m.pb, 2);
  $("m_de").textContent = fmtNum(m.de, 2);
  $("m_net").textContent = fmtPct(m.netMargin, 1);
  $("m_cr").textContent = fmtNum(m.currentRatio, 2);
  $("m_beta").textContent = fmtNum(m.beta, 2);

  $("scoreBox").textContent = (data.score !== null && data.score !== undefined) ? `${Math.round(data.score)}/100` : "—";

  const reasons = Array.isArray(data.reasons) ? data.reasons : [];
  const ul = $("reasonsList");
  ul.innerHTML = reasons.length ? reasons.map(r => `<li>${escapeHtml(r)}</li>`).join("") : `<li class="muted">Sin razones (datos incompletos).</li>`;
}

async function analyze(){
  setError(null);

  // Determine symbol
  const typedSymbol = getSymbolFromInput();
  const symbol = state.selected.symbol || typedSymbol;
  if (!symbol){
    setError("Ingresá un ticker o elegí una empresa de la lista.");
    return;
  }

  const template = $("templateSelect").value || "AUTO";

  // Optimistic UI: show chart immediately
  $("chartTitle").textContent = symbol;
  renderChart(symbol, state.selected.exchange ? normalizeExchangeForTV(state.selected.exchange) : "NASDAQ");

  $("analyzeBtn").disabled = true;
  $("analyzeBtn").textContent = "Analizando...";

  try{
    const data = await apiJson(`/api/metrics?symbol=${encodeURIComponent(symbol)}&template=${encodeURIComponent(template)}`);
    if (!data.ok) throw new Error(data.error || "Sin datos");

    // Update selection with canonical info
    setSelected({ symbol: data.symbol, name: data.name, exchange: data.exchange }, { updateInput: true });

    $("chartTitle").textContent = `${data.exchange ? `${normalizeExchangeForTV(data.exchange)}:` : ""}${data.symbol}`;
    renderChart(data.symbol, normalizeExchangeForTV(data.exchange));

    pillForVerdict(data.verdict);
    $("confidenceText").textContent = `Confianza: ${data.confidence || "—"}`;

    renderBrief(data);
    renderSnapshot(data);

  }catch(e){
    setError(e.message || "No se pudieron cargar datos.");
    pillForVerdict(null);
    $("confidenceText").textContent = "Confianza: —";
  }finally{
    $("analyzeBtn").disabled = false;
    $("analyzeBtn").textContent = "Analizar";
  }
}

function bindCollapse(){
  document.querySelectorAll("[data-collapse]").forEach(btn => {
    btn.addEventListener("click", ()=>{
      const sel = btn.getAttribute("data-collapse");
      const el = document.querySelector(sel);
      if (!el) return;
      el.classList.toggle("hidden");
      btn.textContent = el.classList.contains("hidden") ? "+" : "—";
    });
  });
}

function bindTabs(){
  const items = document.querySelectorAll(".nav__item");
  items.forEach(btn => {
    btn.addEventListener("click", ()=>{
      items.forEach(b=>b.classList.remove("is-active"));
      btn.classList.add("is-active");

      const tab = btn.dataset.tab;
      document.querySelectorAll(".tab").forEach(t=>t.classList.remove("is-active"));
      const active = $("tab-" + tab);
      if (active) active.classList.add("is-active");

      if (tab === "movers") loadMovers("gainers");
      if (tab === "watchlist") renderWatchlist();
    });
  });

  $("brandHome").addEventListener("click", ()=>{
    document.querySelector('.nav__item[data-tab="analisis"]').click();
  });
}

// ---------- MOVERS ----------
let moversType = "gainers";
async function loadMovers(type){
  moversType = type || moversType;
  $("moversList").innerHTML = `<div class="muted">Cargando...</div>`;
  try{
    const data = await apiJson(`/api/movers?type=${encodeURIComponent(moversType)}`);
    $("moversUpdated").textContent = data.updatedAt ? `Actualizado: ${data.updatedAt}` : "";

    const items = (data.items || []).slice(0, 24);
    if (!items.length){
      $("moversList").innerHTML = `<div class="muted">No disponible ahora.</div>`;
      return;
    }

    $("moversList").innerHTML = items.map(it => {
      const chg = (it.changesPercentage == null) ? "—" : `${it.changesPercentage.toFixed(2)}%`;
      const cls = (it.changesPercentage == null) ? "" : (it.changesPercentage >= 0 ? "good" : "bad");
      return `
        <button class="mover" data-sym="${escapeHtml(it.symbol)}" type="button">
          <div class="mover__left">
            <div class="mover__sym">${escapeHtml(it.symbol)}</div>
            <div class="mover__name">${escapeHtml(it.name || "")}</div>
          </div>
          <div class="mover__right">
            <div class="mover__price">${it.price == null ? "—" : fmtPrice(it.price)}</div>
            <div class="mover__chg ${cls}">${chg}</div>
          </div>
        </button>
      `;
    }).join("");

    $("moversList").querySelectorAll("[data-sym]").forEach(btn => {
      btn.addEventListener("click", ()=>{
        const sym = btn.dataset.sym;
        setSelected({ symbol: sym, name: sym, exchange: "" });
        document.querySelector('.nav__item[data-tab="analisis"]').click();
        analyze();
      });
    });
  }catch(e){
    $("moversList").innerHTML = `<div class="muted">No disponible ahora.</div>`;
  }
}

function bindMovers(){
  document.querySelectorAll("[data-mover]").forEach(btn => {
    btn.addEventListener("click", ()=>{
      document.querySelectorAll("[data-mover]").forEach(b=>b.classList.remove("is-active"));
      btn.classList.add("is-active");
      loadMovers(btn.dataset.mover);
    });
  });
}

// ---------- WATCHLIST ----------
const WATCH_KEY = "enqueinvertir_watchlist";
function getWatchlist(){
  try{
    const raw = localStorage.getItem(WATCH_KEY);
    const arr = JSON.parse(raw || "[]");
    return Array.isArray(arr) ? arr : [];
  }catch{ return []; }
}
function setWatchlist(arr){
  localStorage.setItem(WATCH_KEY, JSON.stringify(arr || []));
}

function addToWatchlist(symbol){
  const sym = String(symbol || "").toUpperCase();
  if (!sym) return;
  const wl = getWatchlist();
  if (!wl.includes(sym)) wl.unshift(sym);
  setWatchlist(wl.slice(0, 40));
}

async function refreshWatchPrices(symbols){
  if (!symbols.length) return [];
  try{
    const data = await apiJson(`/api/quote?symbols=${encodeURIComponent(symbols.join(","))}`);
    return data.items || [];
  }catch{ return []; }
}

async function renderWatchlist(refresh=false){
  const wl = getWatchlist();
  const list = $("watchList");
  if (!wl.length){
    list.innerHTML = `<div class="muted">Tu watchlist está vacía.</div>`;
    return;
  }

  let quotes = [];
  if (refresh){
    list.innerHTML = `<div class="muted">Actualizando...</div>`;
    quotes = await refreshWatchPrices(wl);
    $("watchUpdated").textContent = `Actualizado: ${new Date().toLocaleString()}`;
  }

  const map = new Map((quotes || []).map(q => [q.symbol, q]));

  list.innerHTML = wl.map(sym => {
    const q = map.get(sym);
    const price = q && Number.isFinite(Number(q.price)) ? fmtPrice(q.price) : "—";
    const chg = q && Number.isFinite(Number(q.changesPercentage)) ? q.changesPercentage.toFixed(2) : null;
    const cls = chg == null ? "" : (chg >= 0 ? "good" : "bad");
    const chgTxt = chg == null ? "—" : `${chg}%`;

    return `
      <button class="watchItem" data-sym="${escapeHtml(sym)}" type="button">
        <div class="watch__left">
          <div class="watch__sym">${escapeHtml(sym)}</div>
          <div class="watch__meta">Abrir análisis</div>
        </div>
        <div class="watch__right">
          <div class="watch__price">${price}</div>
          <div class="watch__chg ${cls}">${chgTxt}</div>
        </div>
      </button>
    `;
  }).join("");

  list.querySelectorAll("[data-sym]").forEach(btn => {
    btn.addEventListener("click", ()=>{
      const sym = btn.dataset.sym;
      setSelected({ symbol: sym, name: sym, exchange: "" });
      document.querySelector('.nav__item[data-tab="analisis"]').click();
      analyze();
    });
  });
}

function bindWatchlist(){
  $("watchAddBtn").addEventListener("click", ()=>{
    const sym = state.selected.symbol || getSymbolFromInput();
    if (!sym) return;
    addToWatchlist(sym);
    renderWatchlist();
  });

  $("watchRefreshBtn").addEventListener("click", ()=> renderWatchlist(true));
  $("watchClearBtn").addEventListener("click", ()=>{
    setWatchlist([]);
    renderWatchlist();
  });
}

// ---------- DIVIDENDS ----------
async function loadDividends(){
  const range = $("divRange").value;
  const filter = String($("divFilter").value || "").trim();
  $("divTbody").innerHTML = `<tr><td colspan="5" class="muted">Cargando...</td></tr>`;
  try{
    const data = await apiJson(`/api/dividends?range=${encodeURIComponent(range)}&filter=${encodeURIComponent(filter)}`);
    $("divUpdated").textContent = data.updatedAt ? `Actualizado: ${data.updatedAt}` : "";

    const items = (data.items || []).slice(0, 250);
    if (!items.length){
      $("divTbody").innerHTML = `<tr><td colspan="5" class="muted">Sin resultados para el rango/filtro.</td></tr>`;
      return;
    }

    $("divTbody").innerHTML = items.map(it => {
      const empresa = `${it.name ? escapeHtml(it.name) : escapeHtml(it.symbol)} <span class="muted">(${escapeHtml(it.symbol)})</span>`;
      const amount = (it.amount == null) ? "—" : `$${Number(it.amount).toFixed(4)}`;
      return `
        <tr>
          <td>${empresa}</td>
          <td>${escapeHtml(it.quarter || "—")}</td>
          <td>${escapeHtml(it.exDividendDate || "—")}</td>
          <td>${escapeHtml(it.payableDate || "—")}</td>
          <td>${amount}</td>
        </tr>
      `;
    }).join("");
  }catch(e){
    $("divTbody").innerHTML = `<tr><td colspan="5" class="muted">Error: ${escapeHtml(e.message || "No se pudieron cargar dividendos")}</td></tr>`;
  }
}

function bindDividends(){
  $("divLoadBtn").addEventListener("click", loadDividends);
}

// ---------- INIT ----------
function init(){
  bindTabs();
  bindCollapse();
  bindCombobox();
  bindMovers();
  bindWatchlist();
  bindDividends();

  // initial selection (brand-consistent)
  setSelected(state.selected);

  // initial chart
  $("chartTitle").textContent = `${state.selected.symbol}`;
  renderChart(state.selected.symbol, state.selected.exchange);

  // initial watchlist render
  renderWatchlist();

  // analyze on click
  $("analyzeBtn").addEventListener("click", analyze);

  // convenience: Enter triggers analyze even if suggest is closed
  $("tickerInput").addEventListener("keydown", (e)=>{
    if (e.key === "Enter" && !state.suggestOpen){
      e.preventDefault();
      const sym = getSymbolFromInput();
      if (sym) setSelected({ symbol: sym, name: sym, exchange: "" }, { updateInput: false });
      analyze();
    }
  });
}

document.addEventListener("DOMContentLoaded", init);
