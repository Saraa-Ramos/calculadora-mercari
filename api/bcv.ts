export const config = { runtime: 'edge' }

function parseBCVHtml(html: string): number | null {
  const match = html.match(/id="dolar"[\s\S]*?<strong>([\d,.]+)<\/strong>/)
  if (!match) return null
  const raw = match[1].replace(/\./g, '').replace(',', '.')
  const val = parseFloat(raw)
  return isNaN(val) ? null : val
}

export default async function handler(): Promise<Response> {
  const html = await fetch('https://www.bcv.org.ve/', {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  }).then((r) => r.text())

  const rate = parseBCVHtml(html)

  return new Response(JSON.stringify({ rate }), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
