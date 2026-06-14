import { useState, useCallback } from 'react'

export interface Rates {
  binance: number | null
  bcv: number | null
  jpy: number | null
  lastUpdated: Date | null
  loading: boolean
  error: string | null
}

export function useRates() {
  const [rates, setRates] = useState<Rates>({
    binance: null,
    bcv: null,
    jpy: null,
    lastUpdated: null,
    loading: false,
    error: null,
  })

  const fetchRates = useCallback(async () => {
    setRates((prev) => ({ ...prev, loading: true, error: null }))

    try {
      const data = await fetch('/api/rates').then((r) => r.json()) as {
        binance: number | null
        bcv: number | null
        jpy: number | null
      }

      const binance = typeof data.binance === 'number' ? data.binance : null
      const bcv     = typeof data.bcv     === 'number' ? data.bcv     : null
      const jpy     = typeof data.jpy     === 'number' ? data.jpy     : null

      const errors: string[] = []
      if (binance === null) errors.push('Binance sin datos')
      if (bcv     === null) errors.push('BCV sin datos')
      if (jpy     === null) errors.push('JPY sin datos')

      setRates({
        binance,
        bcv,
        jpy,
        lastUpdated: new Date(),
        loading: false,
        error: errors.length > 0 ? errors.join(' · ') : null,
      })
    } catch {
      setRates((prev) => ({
        ...prev,
        loading: false,
        error: 'No se pudo conectar al servidor de tasas',
      }))
    }
  }, [])

  return { rates, fetchRates }
}
