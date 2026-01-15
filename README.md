# StockVerdict (Vercel)

Webapp estática + funciones serverless en `/api` usando Financial Modeling Prep **Stable API** (FMP).

## 1) Variables de entorno (Vercel)

En tu proyecto de Vercel:

- **Settings → Environment Variables**
- Agregá: `FMP_API_KEY` = tu API key de FMP

Luego: **Deployments → Redeploy** (o push a GitHub para disparar un redeploy).

## 2) Verificación rápida

- `/api/diagnose` debe devolver `ok: true`
- `/api/metrics?symbol=AAPL&template=AUTO` debe devolver métricas y score

## 3) Nota de cobertura

Algunos tickers (por ejemplo ADRs o instrumentos no-US) pueden devolver menos campos en los endpoints TTM.
En esos casos el score baja la confianza automáticamente.
