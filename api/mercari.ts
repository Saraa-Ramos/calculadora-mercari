export const config = { runtime: 'edge' }

function parseMercariPrice(html: string): { priceJPY: number | null; title: string | null } {
  const toInt = (s: string) => { const v = parseInt(s.replace(/[,\s¥]/g, ''), 10); return isNaN(v) || v <= 0 ? null : v }

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

  // 3. __NEXT_DATA__ — rutas conocidas de Mercari Japan
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

export default async function handler(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url)
  const mercariUrl = searchParams.get('url') ?? ''

  if (!mercariUrl.includes('mercari.com')) {
    return new Response(JSON.stringify({ error: 'URL de Mercari inválida' }), { status: 400 })
  }

  try {
    const html = await fetch(mercariUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ja,en;q=0.9',
      },
    }).then((r) => r.text())

    const result = parseMercariPrice(html)
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch {
    return new Response(
      JSON.stringify({ priceJPY: null, title: null, error: 'No se pudo obtener el precio' }),
      { status: 500 },
    )
  }
}
