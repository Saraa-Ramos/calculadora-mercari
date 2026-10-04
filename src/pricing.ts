// ─── Constantes internas (no visibles para el cliente) ───────────────────────
export const NEOKYO_FEE_JPY   = 350   // ¥
export const FIXED_CHARGE_JPY = 40    // ¥
// PayPal: 5.4% + $0.63 fijo — gross-up: total = (base + 0.63) / (1 - 0.054)
export const PAYPAL_FEE_RATE  = 0.054
export const PAYPAL_FEE_FIXED = 0.63
// Margen operativo sobre el precio del producto, cubre el spread de la tasa
export const OPERATIONAL_MARGIN = 1.05

export interface Rates {
  jpyToUsd: number
  binanceRate: number
  bcvRate: number
}

export interface Totals {
  productUsd: number
  neokyoUsd: number
  fixedUsd: number
  paypalFeeUsd: number
  totalUsd: number
  totalBs: number
}

/**
 * Totales a partir del precio del producto ya en USD.
 * Es la misma fórmula que usa la calculadora; vive aquí para que el panel de
 * claims no tenga que duplicarla.
 */
export function calcTotals(productUsd: number, rates: Rates): Totals {
  const { jpyToUsd, binanceRate, bcvRate } = rates
  const neokyoUsd = NEOKYO_FEE_JPY * jpyToUsd
  const fixedUsd  = FIXED_CHARGE_JPY * jpyToUsd
  const baseUsd   = productUsd + neokyoUsd + fixedUsd
  const totalUsd  = (baseUsd + PAYPAL_FEE_FIXED) / (1 - PAYPAL_FEE_RATE)
  return {
    productUsd,
    neokyoUsd,
    fixedUsd,
    paypalFeeUsd: totalUsd - baseUsd,
    totalUsd,
    totalBs: (totalUsd * binanceRate) / bcvRate,
  }
}

/** Precio en USD de un item de Mercari, con el margen operativo aplicado. */
export function productUsdFromJpy(priceJPY: number, jpyToUsd: number): number {
  return priceJPY * jpyToUsd * OPERATIONAL_MARGIN
}
