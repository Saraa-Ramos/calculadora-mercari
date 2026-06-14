export const config = { runtime: 'edge' }

export default async function handler(): Promise<Response> {
  const res = await fetch(
    'https://api.binance.com/api/v3/ticker/price?symbol=USDTVES',
  )
  const data = await res.json()
  return new Response(JSON.stringify(data), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
