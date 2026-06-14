import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import type { IncomingMessage, ServerResponse } from 'node:http'

async function fetchBCV(): Promise<number | null> {
  // Fuente 1: ve.dolarapi.com endpoint directo /bcv
  for (const url of [
    'https://ve.dolarapi.com/v1/dolares/bcv',
    'https://ve.dolarapi.com/v1/dolares/oficial',
  ]) {
    try {
      const data = await fetch(url, { signal: AbortSignal.timeout(5000) }).then((r) => r.json())
      console.log(`[BCV] ${url}:`, JSON.stringify(data).slice(0, 200))
      const raw = data?.promedio ?? data?.venta ?? data?.compra ?? data?.precio ?? data?.price
      const val = parseFloat(String(raw))
      if (!isNaN(val) && val > 1) return val
    } catch (e) { console.log(`[BCV] ${url} falló:`, e) }
  }

  // Fuente 2: ve.dolarapi.com lista completa → buscar BCV
  try {
    const data = await fetch('https://ve.dolarapi.com/v1/dolares', { signal: AbortSignal.timeout(5000) }).then((r) => r.json())
    console.log('[BCV] lista completa:', JSON.stringify(data).slice(0, 300))
    const list = Array.isArray(data) ? data : Object.values(data)
    for (const item of list as Record<string, unknown>[]) {
      const fuente = String(item?.fuente ?? item?.nombre ?? '').toLowerCase()
      if (fuente.includes('bcv') || fuente.includes('oficial')) {
        const raw = item?.promedio ?? item?.venta ?? item?.compra ?? item?.precio ?? item?.price
        const val = parseFloat(String(raw))
        if (!isNaN(val) && val > 1) return val
      }
    }
  } catch (e) { console.log('[BCV] lista falló:', e) }

  // Fuente 3: pydolarve.org
  try {
    const data = await fetch('https://pydolarve.org/api/v1/dollar?page=bcv', { signal: AbortSignal.timeout(5000) }).then((r) => r.json())
    console.log('[BCV] pydolarve:', JSON.stringify(data).slice(0, 200))
    const val = parseFloat(data?.monitors?.usd?.price ?? data?.price ?? '')
    if (!isNaN(val) && val > 1) return val
  } catch (e) { console.log('[BCV] pydolarve falló:', e) }

  // Fuente 4: scraping BCV.org.ve
  try {
    const html = await fetch('https://www.bcv.org.ve/', {
      signal: AbortSignal.timeout(8000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
        Accept: 'text/html',
      },
    }).then((r) => r.text())
    for (const re of [
      /id="dolar"[\s\S]{0,600}?<strong[^>]*>([\d,.]+)<\/strong>/i,
      /id="dolar"[\s\S]{0,400}?>([\d]+[,.][\d]+)</i,
      /class="[^"]*tasa-valor[^"]*"[^>]*>([\d,.]+)</i,
    ]) {
      const m = html.match(re)
      if (m) {
        const val = parseFloat(m[1].replace(/\./g, '').replace(',', '.'))
        if (!isNaN(val) && val > 1 && val < 10000) { console.log('[BCV] scraping OK:', val); return val }
      }
    }
    console.log('[BCV] scraping: sin coincidencia')
  } catch (e) { console.log('[BCV] scraping falló:', e) }

  return null
}

async function fetchJPY(): Promise<number | null> {
  // Fuente 1 y 2: misma data, distinto host (CDN espejo)
  for (const url of [
    'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/jpy.json',
    'https://latest.currency-api.pages.dev/v1/currencies/jpy.json',
  ]) {
    try {
      const data = await fetch(url, { signal: AbortSignal.timeout(5000) }).then((r) => r.json())
      const val = parseFloat(data?.jpy?.usd ?? '')
      if (!isNaN(val) && val > 0) return val
    } catch {}
  }
  // Fuente 3: open.er-api.com
  try {
    const data = await fetch('https://open.er-api.com/v6/latest/JPY', { signal: AbortSignal.timeout(5000) }).then((r) => r.json())
    const val = parseFloat(data?.rates?.USD ?? '')
    if (!isNaN(val) && val > 0) return val
  } catch {}
  return null
}

async function fetchAllRates(): Promise<{ binance: number | null; bcv: number | null; jpy: number | null }> {
  const [binanceRes, bcv, jpy] = await Promise.all([
    fetch('https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
      body: JSON.stringify({ asset: 'USDT', fiat: 'VES', merchantCheck: true, page: 1, rows: 20, side: 'BUY', tradeType: 'BUY' }),
      signal: AbortSignal.timeout(8000),
    }).then((r) => r.json()).catch(() => null),
    fetchBCV(),
    fetchJPY(),
  ])

  let binance: number | null = null
  if (binanceRes?.data?.length) {
    const prices: number[] = binanceRes.data
      .map((item: { adv: { price: string } }) => parseFloat(item?.adv?.price ?? ''))
      .filter((p: number) => !isNaN(p) && p > 0)
      .sort((a: number, b: number) => a - b)
    if (prices.length > 0) {
      const mid = Math.floor(prices.length / 2)
      binance = prices.length % 2 === 0 ? (prices[mid - 1] + prices[mid]) / 2 : prices[mid]
    }
    console.log('[Binance] precios P2P:', prices, '→ mediana:', binance)
  }

  console.log('[/api/rates]', { binance, bcv, jpy })
  return { binance, bcv, jpy }
}

function parseMercariPrice(html: string): { priceJPY: number | null; title: string | null } {
  const toInt = (s: string) => { const v = parseInt(s.replace(/[,\s¥]/g, ''), 10); return isNaN(v) || v <= 0 ? null : v }

  // Helpers para og title
  const ogTitle = () =>
    (html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i)
    ?? html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:title"/i))?.[1] ?? null

  // 1. Meta tags de precio (product:price:amount o og:price:amount, ambos órdenes)
  for (const re of [
    /<meta[^>]+name="product:price:amount"[^>]+content="([^"]+)"/i,
    /<meta[^>]+content="([^"]+)"[^>]+name="product:price:amount"/i,
    /<meta[^>]+property="og:price:amount"[^>]+content="([^"]+)"/i,
    /<meta[^>]+content="([^"]+)"[^>]+property="og:price:amount"/i,
  ]) {
    const m = html.match(re)
    const price = m ? toInt(m[1]) : null
    if (price) return { priceJPY: price, title: ogTitle() }
  }

  // 2. JSON-LD
  for (const tag of html.match(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi) ?? []) {
    try {
      const json = JSON.parse(tag.replace(/<\/?script[^>]*>/gi, '').trim())
      for (const item of Array.isArray(json) ? json : [json]) {
        const offers = item?.offers
        const offer  = Array.isArray(offers) ? offers[0] : offers
        const raw    = offer?.price ?? offer?.lowPrice
        if (raw !== undefined) {
          const price = toInt(String(raw))
          if (price) return { priceJPY: price, title: item?.name ?? null }
        }
      }
    } catch {}
  }

  // 3. __NEXT_DATA__ — recorre rutas conocidas de Mercari Japan
  const nd = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
  if (nd) {
    try {
      const pp = JSON.parse(nd[1])?.props?.pageProps
      for (const candidate of [
        pp?.item,
        pp?.data?.item,
        pp?.initialData?.item,
        pp?.serverData?.item,
        pp?.fetchedData?.item,
      ]) {
        if (candidate?.price !== undefined) {
          const price = toInt(String(candidate.price))
          if (price) return { priceJPY: price, title: candidate.name ?? null }
        }
      }
    } catch {}
  }

  // 4. Patrones específicos de Mercari (evita capturar fees genéricos)
  for (const re of [
    /data-testid="item-price"[^>]*>\s*¥?([\d,]+)/i,
    /class="[^"]*merPrice[^"]*"[^>]*>[^<]*¥?([\d,]+)/i,
    /"selling_price"\s*:\s*(\d+)/,
    /"itemPrice"\s*:\s*"?([\d,]+)"?/,
  ]) {
    const m = html.match(re)
    const price = m ? toInt(m[1]) : null
    if (price) return { priceJPY: price, title: null }
  }

  return { priceJPY: null, title: null }
}

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'dev-api',
      configureServer(server) {
        server.middlewares.use('/api/rates', async (_req: IncomingMessage, res: ServerResponse) => {
          try {
            const rates = await fetchAllRates()
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(rates))
          } catch (e) {
            console.error('[/api/rates] error:', e)
            res.statusCode = 500
            res.end(JSON.stringify({ binance: null, bcv: null, jpy: null }))
          }
        })

        server.middlewares.use('/api/mercari', async (req: IncomingMessage, res: ServerResponse) => {
          const mercariUrl = new URL(req.url!, 'http://localhost').searchParams.get('url') ?? ''
          if (!mercariUrl.includes('mercari.com')) {
            res.statusCode = 400
            res.end(JSON.stringify({ error: 'URL de Mercari inválida' }))
            return
          }
          try {
            const html = await fetch(mercariUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'ja,en;q=0.9',
              },
              signal: AbortSignal.timeout(10000),
            }).then((r) => r.text())
            const result = parseMercariPrice(html)
            console.log('[/api/mercari]', mercariUrl, '→', result)
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(result))
          } catch (e) {
            console.error('[/api/mercari] error:', e)
            res.statusCode = 500
            res.end(JSON.stringify({ priceJPY: null, title: null, error: 'No se pudo obtener el precio' }))
          }
        })
      },
    },
  ],
})
