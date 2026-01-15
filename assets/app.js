/* StockVerdict — Frontend (Vercel) */
const $ = (id) => document.getElementById(id);

const API = {
  async json(path) {
    const res = await fetch(path, { headers: { "Accept": "application/json" } });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { error: text }; }
    if (!res.ok) {
      const err = new Error(data?.error || data?.detail || `HTTP ${res.status}`);
      err.status = res.status;
      err.payload = data;
      throw err;
    }
    return data;
  },
  diagnose(){ return this.json("/api/diagnose"); },
  search(q){ return this.json(`/api/search?query=${encodeURIComponent(q||"")}`); },
  metrics(symbol, template){ return this.json(`/api/metrics?symbol=${encodeURIComponent(symbol||"")}&template=${encodeURIComponent(template||"AUTO")}`); },
  movers(type){ return this.json(`/api/movers?type=${encodeURIComponent(type||"gainers")}`); },
  dividends(range, filter){ return this.json(`/api/dividends?range=${encodeURIComponent(range||90)}&filter=${encodeURIComponent(filter||"")}`); },
  quote(symbols){ return this.json(`/api/quote?symbols=${encodeURIComponent(symbols||"")}`); },
};

function fmtMoney(n){
  if (n == null || Number.isNaN(Number(n))) return "—";
  try { return new Intl.NumberFormat("en-US",{ style:"currency", currency:"USD" }).format(Number(n)); }
  catch { return `$${Number(n).toFixed(2)}`; }
}
function fmtPct(n){
  if (n == null || Number.isNaN(Number(n))) return "—";
  return `${(Number(n)*100).toFixed(1)}%`;
}
function fmtNum(n){
  if (n == null || Number.isNaN(Number(n))) return "—";
  return new Intl.NumberFormat("en-US").format(Number(n));
}
function fmtMaybe(n, digits=2){
  if (n == null || Number.isNaN(Number(n))) return "—";
  const v = Number(n);
  return v.toFixed(digits);
}
function setVerdictPill(verdict){
  const pill = $("verdictPill");
  pill.classList.remove("pill--good","pill--mid","pill--bad","pill--neutral");
  if (!verdict) {
    pill.classList.add("pill--neutral");
    pill.textContent = "—";
    return;
  }
  if (verdict.type === "good") pill.classList.add("pill--good");
  else if (verdict.type === "mid") pill.classList.add("pill--mid");
  else if (verdict.type === "bad") pill.classList.add("pill--bad");
  else pill.classList.add("pill--neutral");
  pill.textContent = verdict.label;
}

function showError(msg){
  $("errorCard").classList.remove("hidden");
  $("errorText").textContent = msg || "Error";
}
function clearError(){
  $("errorCard").classList.add("hidden");
  $("errorText").textContent = "";
}

function setActiveTab(tab){
  document.querySelectorAll(".nav__item").forEach(b=>{
    b.classList.toggle("is-active", b.dataset.tab === tab);
  });
  document.querySelectorAll(".tab").forEach(s=>{
    s.classList.toggle("is-active", s.id === `tab-${tab}`);
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.querySelectorAll(".nav__item").forEach(btn=>{
  btn.addEventListener("click", ()=> setActiveTab(btn.dataset.tab));
});
$("brandHome").addEventListener("click", ()=> setActiveTab("analisis"));

document.querySelectorAll(".collapse").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    const sel = btn.getAttribute("data-collapse");
    const body = document.querySelector(sel);
    if (!body) return;
    const hidden = body.classList.toggle("hidden");
    btn.textContent = hidden ? "+" : "—";
  });
});

function tvExchangePrefix(exchange){
  const ex = String(exchange||"").toUpperCase();
  if (ex.includes("NASDAQ")) return "NASDAQ";
  if (ex.includes("NYSE")) return "NYSE";
  return "NASDAQ";
}

let tvLibPromise = null;
function loadTradingViewLib(){
  if (window.TradingView) return Promise.resolve();
  if (tvLibPromise) return tvLibPromise;
  tvLibPromise = new Promise((resolve, reject)=>{
    const s = document.createElement("script");
    s.src = "https://s3.tradingview.com/tv.js";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("TradingView script no cargó"));
    document.head.appendChild(s);
  });
  return tvLibPromise;
}

async function renderChart(symbol, exchange){
  $("chartTitle").textContent = symbol ? symbol : "—";
  $("tvFallback").classList.add("hidden");
  const container = $("tvContainer");
  container.innerHTML = "";

  if (!symbol) return;

  const tvSymbol = `${tvExchangePrefix(exchange)}:${symbol}`;
  try{
    await loadTradingViewLib();
    // eslint-disable-next-line no-undef
    new TradingView.widget({
      autosize: true,
      symbol: tvSymbol,
      interval: "D",
      timezone: "Etc/UTC",
      theme: "light",
      style: "1",
      locale: "es",
      toolbar_bg: "#ffffff",
      enable_publishing: false,
      hide_top_toolbar: false,
      hide_legend: true,
      container_id: "tvContainer",
    });
  }catch(e){
    $("tvFallback").classList.remove("hidden");
    console.warn(e);
  }
}

function fillMetric(id, value){
  const el = $(id);
  el.textContent = value;
}

function renderAnalysis(data){
  $("snapName").textContent = data.name || data.symbol || "—";
  $("snapMeta").textContent = `${data.symbol || "—"} · ${data.exchange || "—"} · ${data.sector || "—"}`;
  $("snapPrice").textContent = fmtMoney(data.price);
  $("snapUpdated").textContent = data.updatedAt ? `Actualizado: ${data.updatedAt}` : "—";

  fillMetric("m_pe", data.metrics?.pe != null ? fmtMaybe(data.metrics.pe, 1) : "—");
  fillMetric("m_roe", data.metrics?.roe != null ? fmtPct(data.metrics.roe) : "—");
  fillMetric("m_ps", data.metrics?.ps != null ? fmtMaybe(data.metrics.ps, 1) : "—");
  fillMetric("m_de", data.metrics?.de != null ? fmtMaybe(data.metrics.de, 2) : "—");
  fillMetric("m_net", data.metrics?.netMargin != null ? fmtPct(data.metrics.netMargin) : "—");
  fillMetric("m_fcfy", data.metrics?.fcfYield != null ? fmtPct(data.metrics.fcfYield) : "—");

  $("scoreBox").textContent = data.score != null ? `${data.score}` : "—";

  setVerdictPill(data.verdict);
  $("confidenceText").textContent = `Confianza: ${data.confidence || "—"}`;

  const reasons = $("reasonsList");
  reasons.innerHTML = "";
  (data.reasons || []).slice(0,4).forEach(r=>{
    const li = document.createElement("li");
    li.textContent = r;
    reasons.appendChild(li);
  });
  if (!data.reasons || data.reasons.length === 0){
    const li = document.createElement("li");
    li.className = "muted";
    li.textContent = "No hay razones disponibles.";
    reasons.appendChild(li);
  }

  // brief
  $("briefTitle").textContent = `${data.symbol} — puntos clave`;
  $("briefText").textContent = data.brief || "—";
  const chips = $("briefChips");
  chips.innerHTML = "";
  (data.tags || []).slice(0,6).forEach(t=>{
    const b = document.createElement("button");
    b.className = "chip";
    b.type = "button";
    b.textContent = t;
    chips.appendChild(b);
  });

  renderChart(data.symbol, data.exchange);
}

function currentSymbol(){
  return $("tickerSelect").value;
}
function currentTemplate(){
  return $("templateSelect").value;
}

async function analyze(){
  clearError();
  const symbol = currentSymbol();
  const tpl = currentTemplate();
  if (!symbol) return;
  $("analyzeBtn").disabled = true;
  try{
    const data = await API.metrics(symbol, tpl);
    if (!data.ok) throw new Error(data.error || "No se pudo analizar");
    renderAnalysis(data);
    // Prefill search box for UX
    $("searchInput").value = `${data.symbol}`;
    setActiveTab("analisis");
  }catch(e){
    showError(e.message || "Error");
    console.error(e);
  }finally{
    $("analyzeBtn").disabled = false;
  }
}

$("analyzeBtn").addEventListener("click", analyze);

// SEARCH → populate dropdown options
$("searchBtn").addEventListener("click", async ()=>{
  clearError();
  const q = $("searchInput").value.trim();
  if (!q) return;
  $("searchBtn").disabled = true;
  try{
    const data = await API.search(q);
    const select = $("tickerSelect");
    select.innerHTML = "";
    (data.results || []).slice(0, 60).forEach(it=>{
      const opt = document.createElement("option");
      opt.value = it.symbol;
      opt.textContent = `${it.name} (${it.symbol})`;
      select.appendChild(opt);
    });
    if ((data.results || []).length === 0){
      const opt = document.createElement("option");
      opt.value = q.toUpperCase();
      opt.textContent = `${q.toUpperCase()} (sin resultados, intentar igualmente)`;
      select.appendChild(opt);
    }
    select.value = select.options[0]?.value || q.toUpperCase();
  }catch(e){
    showError(e.message || "Error en búsqueda");
  }finally{
    $("searchBtn").disabled = false;
  }
});

$("tickerSelect").addEventListener("change", ()=>{
  // Update chart quickly even before analyzing
  renderChart(currentSymbol(), "");
});

function loadWatchlist(){
  try{
    return JSON.parse(localStorage.getItem("sv_watchlist") || "[]");
  }catch{ return []; }
}
function saveWatchlist(list){
  localStorage.setItem("sv_watchlist", JSON.stringify(list));
}
function addToWatchlist(sym){
  const s = String(sym||"").toUpperCase();
  if (!s) return;
  const list = loadWatchlist();
  if (!list.includes(s)) list.unshift(s);
  saveWatchlist(list.slice(0,50));
  renderWatchlist();
}
function clearWatchlist(){
  saveWatchlist([]);
  renderWatchlist();
}

$("watchAddBtn").addEventListener("click", ()=>{
  addToWatchlist(currentSymbol());
  setActiveTab("watchlist");
});
$("watchClearBtn").addEventListener("click", clearWatchlist);

async function renderWatchlist(prices=null){
  const list = loadWatchlist();
  const el = $("watchList");
  el.innerHTML = "";
  if (list.length === 0){
    const p = document.createElement("div");
    p.className = "muted";
    p.textContent = "Tu watchlist está vacía.";
    el.appendChild(p);
    return;
  }
  list.forEach(sym=>{
    const item = document.createElement("div");
    item.className = "watch__item";
    item.addEventListener("click", ()=>{
      $("tickerSelect").innerHTML = `<option value="${sym}">${sym}</option>`;
      $("tickerSelect").value = sym;
      setActiveTab("analisis");
      analyze();
    });

    const left = document.createElement("div");
    left.className = "watch__left";
    left.innerHTML = `<div class="watch__sym">${sym}</div><div class="watch__meta">Click para analizar</div>`;

    const right = document.createElement("div");
    right.className = "watch__right";
    const q = prices?.[sym];
    const chg = q?.changesPercentage ?? null;
    const chgCls = chg != null && chg < 0 ? "bad" : "good";
    right.innerHTML = `<div class="watch__price">${q ? fmtMoney(q.price) : "—"}</div>
      <div class="watch__chg ${chgCls}">${chg != null ? `${(chg).toFixed(2)}%` : "—"}</div>`;

    item.appendChild(left);
    item.appendChild(right);
    el.appendChild(item);
  });
}

$("watchRefreshBtn").addEventListener("click", async ()=>{
  clearError();
  const list = loadWatchlist();
  if (list.length === 0) return;
  $("watchRefreshBtn").disabled = true;
  try{
    const data = await API.quote(list.join(","));
    await renderWatchlist(data.quotes || {});
    $("watchUpdated").textContent = data.updatedAt ? `Actualizado: ${data.updatedAt}` : "—";
  }catch(e){
    showError(e.message || "Error al actualizar watchlist");
  }finally{
    $("watchRefreshBtn").disabled = false;
  }
});

// MOVERS
let currentMover = "gainers";
async function loadMovers(type){
  clearError();
  currentMover = type || currentMover;
  document.querySelectorAll("[data-mover]").forEach(b=>{
    b.classList.toggle("is-active", b.dataset.mover === currentMover);
  });
  const listEl = $("moversList");
  listEl.innerHTML = "";
  try{
    const data = await API.movers(currentMover);
    $("moversUpdated").textContent = data.updatedAt ? `Actualizado: ${data.updatedAt}` : "—";
    (data.items || []).slice(0, 12).forEach(it=>{
      const div = document.createElement("div");
      div.className = "mover";
      div.addEventListener("click", ()=>{
        $("tickerSelect").innerHTML = `<option value="${it.symbol}">${it.symbol}</option>`;
        $("tickerSelect").value = it.symbol;
        setActiveTab("analisis");
        analyze();
      });
      const chg = Number(it.changesPercentage);
      const good = !Number.isNaN(chg) && chg >= 0;
      div.innerHTML = `
        <div class="mover__top">
          <div class="mover__sym">${it.symbol}</div>
          <div class="mover__chg ${good ? "good" : "bad"}">${Number.isNaN(chg) ? "—" : `${chg.toFixed(2)}%`}</div>
        </div>
        <div class="mover__name">${it.name || ""}</div>
        <div class="mover__price">${fmtMoney(it.price)}</div>
      `;
      listEl.appendChild(div);
    });
  }catch(e){
    listEl.innerHTML = `<div class="muted">No disponible ahora.</div>`;
    showError(e.message || "Error al cargar movers");
  }
}
document.querySelectorAll("[data-mover]").forEach(btn=>{
  btn.addEventListener("click", ()=> loadMovers(btn.dataset.mover));
});

// DIVIDENDS
async function loadDividends(){
  clearError();
  const range = $("divRange").value;
  const filter = $("divFilter").value.trim();
  $("divLoadBtn").disabled = true;
  try{
    const data = await API.dividends(range, filter);
    $("divUpdated").textContent = data.updatedAt ? `Actualizado: ${data.updatedAt}` : "—";
    const tbody = $("divTbody");
    tbody.innerHTML = "";
    (data.items || []).slice(0, 250).forEach(it=>{
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><b>${it.symbol}</b><div class="muted">${it.name || ""}</div></td>
        <td>${it.quarter || "—"}</td>
        <td>${it.exDividendDate || "—"}</td>
        <td>${it.payableDate || "—"}</td>
        <td>${it.amount != null ? fmtMoney(it.amount).replace("$","$") : "—"}</td>
      `;
      tbody.appendChild(tr);
    });
    if ((data.items || []).length === 0){
      tbody.innerHTML = `<tr><td colspan="5" class="muted">Sin eventos para el filtro/rango seleccionado.</td></tr>`;
    }
  }catch(e){
    showError(e.message || "Error al cargar dividendos");
  }finally{
    $("divLoadBtn").disabled = false;
  }
}
$("divLoadBtn").addEventListener("click", loadDividends);

// init
(async function init(){
  try{
    const d = await API.diagnose();
    if (!d.ok){
      showError(d.error || "Diagnóstico falló");
    }
  }catch(e){
    // ignore, site can still load; show in console
    console.warn("Diagnose error", e);
  }
  await renderWatchlist();
  await loadMovers("gainers");
  // default chart for initial select
  renderChart(currentSymbol(), "");
})();
