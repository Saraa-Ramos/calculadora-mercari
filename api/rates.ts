export const config = { runtime: 'edge' }

async function fetchBinanceP2P(): Promise<number | null> {
  const res = await fetch('https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ asset: 'USDT', fiat: 'VES', merchantCheck: true, page: 1, rows: 20, side: 'BUY', tradeType: 'BUY' }),
  })
  const data = await res.json()
  const prices: number[] = (data?.data ?? [])
    .map((item: { adv: { price: string } }) => parseFloat(item?.adv?.price ?? ''))
    .filter((p: number) => !isNaN(p) && p > 0)
    .sort((a: number, b: number) => a - b)
  if (prices.length === 0) return null
  const mid = Math.floor(prices.length / 2)
  return prices.length % 2 === 0 ? (prices[mid - 1] + prices[mid]) / 2 : prices[mid]
}

async function fetchBCV(): Promise<number | null> {
  // Fuente 1: endpoints directos dolarapi
  for (const url of ['https://ve.dolarapi.com/v1/dolares/bcv', 'https://ve.dolarapi.com/v1/dolares/oficial']) {
    try {
      const data = await fetch(url).then((r) => r.json())
      const raw = data?.promedio ?? data?.venta ?? data?.compra ?? data?.precio ?? data?.price
      const val = parseFloat(String(raw))
      if (!isNaN(val) && val > 1) return val
    } catch {}
  }
  // Fuente 2: lista completa
  try {
    const data = await fetch('https://ve.dolarapi.com/v1/dolares').then((r) => r.json())
    const list = Array.isArray(data) ? data : Object.values(data)
    for (const item of list as Record<string, unknown>[]) {
      const fuente = String(item?.fuente ?? item?.nombre ?? '').toLowerCase()
      if (fuente.includes('bcv') || fuente.includes('oficial')) {
        const raw = item?.promedio ?? item?.venta ?? item?.compra ?? item?.precio ?? item?.price
        const val = parseFloat(String(raw))
        if (!isNaN(val) && val > 1) return val
      }
    }
  } catch {}
  // Fuente 3: pydolarve.org
  try {
    const data = await fetch('https://pydolarve.org/api/v1/dollar?page=bcv').then((r) => r.json())
    const val = parseFloat(data?.monitors?.usd?.price ?? data?.price ?? '')
    if (!isNaN(val) && val > 1) return val
  } catch {}
  // Fuente 4: scraping BCV.org.ve
  try {
    const html = await fetch('https://www.bcv.org.ve/', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', Accept: 'text/html' },
    }).then((r) => r.text())
    for (const re of [
      /id="dolar"[\s\S]{0,600}?<strong[^>]*>([\d,.]+)<\/strong>/i,
      /id="dolar"[\s\S]{0,400}?>([\d]+[,.][\d]+)</i,
    ]) {
      const m = html.match(re)
      if (m) {
        const val = parseFloat(m[1].replace(/\./g, '').replace(',', '.'))
        if (!isNaN(val) && val > 1 && val < 10000) return val
      }
    }
  } catch {}
  return null
}

async function fetchJPY(): Promise<number | null> {
  for (const url of [
    'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/jpy.json',
    'https://latest.currency-api.pages.dev/v1/currencies/jpy.json',
  ]) {
    try {
      const data = await fetch(url).then((r) => r.json())
      const val = parseFloat(data?.jpy?.usd ?? '')
      if (!isNaN(val) && val > 0) return val
    } catch {}
  }
  try {
    const data = await fetch('https://open.er-api.com/v6/latest/JPY').then((r) => r.json())
    const val = parseFloat(data?.rates?.USD ?? '')
    if (!isNaN(val) && val > 0) return val
  } catch {}
  return null
}

export default async function handler(): Promise<Response> {
  const [binanceRes, bcvRes, jpyRes] = await Promise.allSettled([
    fetchBinanceP2P(),
    fetchBCV(),
    fetchJPY(),
  ])
  return new Response(
    JSON.stringify({
      binance: binanceRes.status === 'fulfilled' ? binanceRes.value : null,
      bcv: bcvRes.status === 'fulfilled' ? bcvRes.value : null,
      jpy: jpyRes.status === 'fulfilled' ? jpyRes.value : null,
    }),
    { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } },
  )
}
