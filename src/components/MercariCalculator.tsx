import { useState, useEffect } from 'react'
import { useRates } from '../hooks/useRates'
import styles from './MercariCalculator.module.css'

// ─── Constantes internas (no visibles para el cliente) ────────────────────────
const NEOKYO_FEE_JPY   = 350   // ¥
const FIXED_CHARGE_JPY = 40    // ¥
const TOTAL_JPY_FEES   = NEOKYO_FEE_JPY + FIXED_CHARGE_JPY  // ¥390
// PayPal: 5.4% + $0.30 fijo — gross-up: total = (base + 0.30) / (1 - 0.054)
const PAYPAL_FEE_RATE  = 0.054
const PAYPAL_FEE_FIXED = 0.30

interface FormState {
  productPrice: string     // JPY
  productPriceUsd: string  // USD (espejo de productPrice)
  jpyToUsd: string
  binanceRate: string
  bcvRate: string
}

interface Results {
  totalUsd: number
  totalBs: number
  productUsd: number
  neokyo350Usd: number
  fixed40Usd: number
  paypalFeeUsd: number
}

const INITIAL_FORM: FormState = {
  productPrice: '',
  productPriceUsd: '',
  jpyToUsd: '',
  binanceRate: '',
  bcvRate: '',
}

function fmt(value: number): string {
  return value.toLocaleString('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function fmtBs(value: number): string {
  return value.toLocaleString('es-VE', {
    minimumFractionDigits: 2,
  })
}

interface MercariItem {
  priceJPY: number
  title: string | null
}

type WaType = 'individual'

interface WaPayment {
  name: string
  icon: string
  amount: number
  currency: string
}

export default function MercariCalculator() {
  const [form, setForm] = useState<FormState>(INITIAL_FORM)
  const [results, setResults] = useState<Results | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mercariUrl, setMercariUrl] = useState('')
  const [mercariLoading, setMercariLoading] = useState(false)
  const [mercariItem, setMercariItem] = useState<MercariItem | null>(null)
  const [mercariError, setMercariError] = useState<string | null>(null)
  const [showWaOptions, setShowWaOptions] = useState(false)
  const [waCompleto, setWaCompleto] = useState(false)
  const { rates, fetchRates } = useRates()

  function openWhatsApp(text: string) {
    window.open(`whatsapp://send?text=${text}`, '_blank')
  }

  useEffect(() => {
    if (rates.binance !== null)
      setForm((prev) => ({ ...prev, binanceRate: String(Math.round(rates.binance!)) }))
  }, [rates.binance])

  useEffect(() => {
    if (rates.bcv !== null)
      setForm((prev) => ({ ...prev, bcvRate: String(Math.round(rates.bcv!)) }))
  }, [rates.bcv])

  useEffect(() => {
    if (rates.jpy !== null) {
      const rate = rates.jpy!
      setForm((prev) => {
        const updated = { ...prev, jpyToUsd: rate.toFixed(6) }
        const jpyNum = parseFloat(prev.productPrice)
        if (!isNaN(jpyNum) && jpyNum > 0)
          updated.productPriceUsd = (jpyNum * rate).toFixed(2)
        return updated
      })
    }
  }, [rates.jpy])

  async function handleMercariSearch() {
    const url = mercariUrl.trim()
    if (!url) return
    if (!url.includes('mercari.com')) {
      setMercariError('Pega un link válido de jp.mercari.com')
      return
    }
    setMercariLoading(true)
    setMercariError(null)
    setMercariItem(null)
    try {
      const params = new URLSearchParams({ url })
      const data = await fetch(`/api/mercari?${params}`).then((r) => r.json())
      if (!data.priceJPY) {
        setMercariError('No se pudo extraer el precio. Ingrésalo manualmente.')
        return
      }
      setMercariItem({ priceJPY: data.priceJPY, title: data.title })
      setForm((prev) => {
        const rate = parseFloat(prev.jpyToUsd)
        return {
          ...prev,
          productPrice: String(data.priceJPY),
          productPriceUsd: rate > 0 ? (data.priceJPY * rate).toFixed(2) : '',
        }
      })
      setResults(null)
    } catch {
      setMercariError('Error de conexión. Intenta de nuevo.')
    } finally {
      setMercariLoading(false)
    }
  }

  function handleMercariKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      void handleMercariSearch()
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
    setError(null)
  }

  function handlePriceJpyChange(e: React.ChangeEvent<HTMLInputElement>) {
    const jpy = e.target.value
    const jpyNum = parseFloat(jpy)
    const rate = parseFloat(form.jpyToUsd)
    const usd = !isNaN(jpyNum) && jpyNum > 0 && rate > 0 ? (jpyNum * rate).toFixed(2) : ''
    setForm((prev) => ({ ...prev, productPrice: jpy, productPriceUsd: usd }))
    setError(null)
  }

  function handlePriceUsdChange(e: React.ChangeEvent<HTMLInputElement>) {
    const usd = e.target.value
    const usdNum = parseFloat(usd)
    const rate = parseFloat(form.jpyToUsd)
    const jpy = !isNaN(usdNum) && usdNum > 0 && rate > 0 ? String(Math.round(usdNum / rate)) : ''
    setForm((prev) => ({ ...prev, productPriceUsd: usd, productPrice: jpy }))
    setError(null)
  }

  function handleCalculate(e: React.FormEvent) {
    e.preventDefault()

    const jpyToUsd    = parseFloat(form.jpyToUsd)
    const binanceRate = parseFloat(form.binanceRate)
    const bcvRate     = parseFloat(form.bcvRate)

    // Acepta ¥ o $ — si solo hay USD y hay tasa, deriva JPY
    let productPrice = parseFloat(form.productPrice)
    const productPriceUsd = parseFloat(form.productPriceUsd)
    if ((isNaN(productPrice) || productPrice <= 0) && productPriceUsd > 0 && jpyToUsd > 0) {
      productPrice = Math.round(productPriceUsd / jpyToUsd)
    }

    if (isNaN(productPrice) || productPrice <= 0) {
      setError('Ingresa el precio del producto en ¥ o $.')
      return
    }
    if (isNaN(jpyToUsd) || jpyToUsd <= 0) {
      setError('La tasa JPY→USD es requerida. Usa "Sync tasas".')
      return
    }
    if (isNaN(binanceRate) || binanceRate <= 0) {
      setError('La tasa Binance es requerida. Usa "Sync tasas".')
      return
    }
    if (isNaN(bcvRate) || bcvRate <= 0) {
      setError('La tasa BCV es requerida. Usa "Sync tasas".')
      return
    }

    const productUsd   = productPrice * jpyToUsd
    const neokyo350Usd = NEOKYO_FEE_JPY * jpyToUsd
    const fixed40Usd   = FIXED_CHARGE_JPY * jpyToUsd
    const baseUsd      = (productPrice + TOTAL_JPY_FEES) * jpyToUsd
    // Gross-up PayPal 5.4% + $0.30: total = (base + 0.30) / (1 - 0.054)
    const totalUsd     = (baseUsd + PAYPAL_FEE_FIXED) / (1 - PAYPAL_FEE_RATE)
    const paypalFeeUsd = totalUsd - baseUsd
    const totalBs      = (totalUsd * binanceRate) / bcvRate

    setResults({ totalUsd, totalBs, productUsd, neokyo350Usd, fixed40Usd, paypalFeeUsd })
    setShowWaOptions(false)
    setWaCompleto(false)
    setError(null)
  }

  function handleReset() {
    setForm((prev) => ({ ...prev, productPrice: '', productPriceUsd: '' }))
    setResults(null)
    setError(null)
    setMercariItem(null)
    setMercariError(null)
    setMercariUrl('')
    setShowWaOptions(false)
  }

  function handleSendWhatsApp(_type: WaType) {
    if (!results) return
    const lines: string[] = [
      '🛒 Cotización Mercari Japón',
      ...(mercariUrl ? [`🔗 ${mercariUrl}`] : []),
      '',
      `💵 *Total: $${fmt(results.totalUsd)} USD*`,
    ]
    const text = encodeURIComponent(lines.join('\n'))
    openWhatsApp(text)
    setShowWaOptions(false)
  }

  function handleSendCompleto(payment: WaPayment) {
    if (!results) return
    const precio = payment.currency === '$'
      ? `$${fmtBs(payment.amount)}`
      : `${payment.currency} ${fmt(payment.amount)}`
    const lines: string[] = [
      '🛒 Cotización Mercari Japón',
      ...(mercariUrl ? [`🔗 ${mercariUrl}`] : []),
      '',
      `${payment.icon} *${payment.name}: ${precio}*`,
    ]
    const text = encodeURIComponent(lines.join('\n'))
    openWhatsApp(text)
    setShowWaOptions(false)
    setWaCompleto(false)
  }

  const timeString = rates.lastUpdated?.toLocaleTimeString('es-VE', {
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div className={styles.wrapper}>
      {/* ── Header ── */}
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <div className={styles.headerLeft}>
            <div>
              <h1 className={styles.title}>Cotizaciones</h1>
              <p className={styles.subtitle}>Cotizador de importaciones desde Japón</p>
            </div>
          </div>
          <button
            className={styles.syncBtn}
            onClick={fetchRates}
            disabled={rates.loading}
          >
            <svg
              className={rates.loading ? styles.spinning : styles.syncIcon}
              viewBox="0 0 24 24" width="15" height="15" fill="none"
              stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
            >
              <path d="M21 2v6h-6"/>
              <path d="M3 12a9 9 0 0 1 15-6.7L21 8"/>
              <path d="M3 22v-6h6"/>
              <path d="M21 12a9 9 0 0 1-15 6.7L3 16"/>
            </svg>
            {rates.loading ? 'Sincronizando...' : 'Sync tasas'}
          </button>
        </div>

        <div className={styles.ratePills}>
          <RatePill dot="#f0b90b" label="Binance"
            value={rates.binance ? `${fmt(rates.binance)} Bs/USDT` : '—'} />
          <RatePill dot="#e63946" label="BCV"
            value={rates.bcv ? `${fmt(rates.bcv)} Bs/USD` : '—'} />
          <RatePill dot="#6366f1" label="JPY→USD"
            value={rates.jpy ? rates.jpy.toFixed(6) : '—'} />
          {timeString && <RatePill label="Actualizado" value={timeString} />}
          {rates.error && (
            <div className={`${styles.pill} ${styles.pillError}`}>⚠ {rates.error}</div>
          )}
        </div>
      </header>

      <main className={styles.main}>
        <form className={styles.form} onSubmit={handleCalculate}>
          {/* ── Link Mercari ── */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>
              <span className={styles.sectionIcon}>🔗</span>
              Link del producto (opcional)
            </h2>
            <div className={styles.mercariSearch}>
              <input
                type="text"
                className={styles.urlInput}
                placeholder="https://jp.mercari.com/item/m..."
                value={mercariUrl}
                onChange={(e) => { setMercariUrl(e.target.value); setMercariError(null) }}
                onKeyDown={handleMercariKeyDown}
              />
              <button
                type="button"
                className={styles.btnSearch}
                onClick={() => void handleMercariSearch()}
                disabled={mercariLoading || !mercariUrl.trim()}
              >
                {mercariLoading ? (
                  <span className={styles.spinning}>⟳</span>
                ) : 'Buscar'}
              </button>
            </div>
            {mercariError && <p className={styles.mercariError}>⚠ {mercariError}</p>}
            {mercariItem && (
              <div className={styles.mercariResult}>
                <span className={styles.mercariResultDot}>✓</span>
                <div className={styles.mercariResultText}>
                  {mercariItem.title && <span className={styles.mercariTitle}>{mercariItem.title}</span>}
                  <span className={styles.mercariPrice}>
                    ¥{mercariItem.priceJPY.toLocaleString('ja-JP')}
                  </span>
                </div>
              </div>
            )}
          </section>

          {/* ── Precio ── */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>
              <span className={styles.sectionIcon}>¥</span>
              Precio del producto
            </h2>
            <div className={styles.priceRow}>
              <InputField
                label="En yenes (JPY)"
                name="productPrice"
                value={form.productPrice}
                onChange={handlePriceJpyChange}
                prefix="¥"
                placeholder="0"
              />
              <span className={styles.priceEquals}>=</span>
              <InputField
                label="En dólares (USD)"
                name="productPriceUsd"
                value={form.productPriceUsd}
                onChange={handlePriceUsdChange}
                prefix="$"
                placeholder="0.00"
              />
            </div>
          </section>

          {/* ── Tasas ── */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>
              <span className={styles.sectionIcon}>≈</span>
              Tasas de cambio
            </h2>
            <div className={styles.grid}>
              <InputField
                label="Tasa JPY → USD"
                name="jpyToUsd"
                value={form.jpyToUsd}
                onChange={handleChange}
                placeholder="Sync tasas →"
                hint="Para convertir los fees en ¥"
                highlight={rates.jpy !== null}
              />
              <InputField
                label="Tasa Binance (USDT/VES)"
                name="binanceRate"
                value={form.binanceRate}
                onChange={handleChange}
                placeholder="Sync tasas →"
                hint="Para el total en bolívares"
                highlight={rates.binance !== null}
              />
              <InputField
                label="Tasa BCV (Bs/USD)"
                name="bcvRate"
                value={form.bcvRate}
                onChange={handleChange}
                placeholder="Sync tasas →"
                hint="Tasa oficial BCV"
                highlight={rates.bcv !== null}
              />
            </div>
          </section>

          {error && <div className={styles.errorBanner}>⚠ {error}</div>}

          <div className={styles.actions}>
            <button type="submit" className={styles.btnPrimary}>
              Calcular <span className={styles.btnIcon}>→</span>
            </button>
            <button type="button" className={styles.btnSecondary} onClick={handleReset}>
              Restablecer
            </button>
          </div>
        </form>

        {/* ── Resultados ── */}
        {results && (
          <div className={styles.results}>
            <h2 className={styles.resultsTitle}>Resumen de cotización</h2>

            {/* Desglose */}
            <div className={styles.breakdownCard}>
              <BreakdownRow
                label="Precio del producto"
                jpy={parseFloat(form.productPrice)}
                usd={results.productUsd}
              />
              <BreakdownRow
                label="Fee Neokyo"
                jpy={NEOKYO_FEE_JPY}
                usd={results.neokyo350Usd}
              />
              <BreakdownRow
                label="Cargo fijo"
                jpy={FIXED_CHARGE_JPY}
                usd={results.fixed40Usd}
              />
              <BreakdownRow
                label="Comisión PayPal"
                usd={results.paypalFeeUsd}
              />
              <div className={styles.breakdownTotal}>
                <span className={styles.breakdownTotalLabel}>Total</span>
                <span className={styles.breakdownTotalValue}>$ {fmt(results.totalUsd)}</span>
              </div>
            </div>

            {/* Total Final en $ */}
            <div className={styles.totalCard}>
              <span className={styles.totalLabel}>Total Final en $</span>
              <span className={styles.totalYen}>$ {fmt(results.totalUsd)}</span>
            </div>

            {/* BCV */}
            <div className={styles.bsCard}>
              <div className={styles.bsCardHeader}>
                <span className={styles.bsIcon}>$</span>
                <div>
                  <p className={styles.bsLabel}>BCV</p>
                  <p className={styles.bsValue}>
                    <span className={styles.bsUsd}>$ {fmt(results.totalUsd)}</span>
                    <span className={styles.bsEq}>=</span>
                    $ {fmtBs(results.totalBs)}
                  </p>
                </div>
              </div>
              <div className={styles.bsFormula}>
                <span className={styles.bsFormulaLabel}>Fórmula aplicada:</span>
                <code className={styles.bsFormulaCode}>
                  ($ {fmt(results.totalUsd)} × {parseFloat(form.binanceRate).toFixed(2)} Binance)
                  {' '}÷ {parseFloat(form.bcvRate).toFixed(2)} BCV = $ {fmtBs(results.totalBs)}
                </code>
              </div>
            </div>

            {/* Métodos de pago */}
            <h3 className={styles.subTitle}>Precio por método de pago</h3>
            <div className={styles.paymentGrid}>
              <PaymentCard name="Zinli"       icon="💳" amount={results.totalUsd} currency="USD"  color="#6366f1" note="Transferencia internacional" />
              <PaymentCard name="PayPal"      icon="🅿" amount={results.totalUsd} currency="USD"  color="#009cde" note="Pago digital" />
              <PaymentCard name="Binance Pay" icon="₿" amount={results.totalUsd} currency="USDT" color="#f0b90b" note="Equivalente en USDT" />
            </div>

            {/* WhatsApp */}
            <div className={styles.waSection}>
              {!showWaOptions ? (
                <button className={styles.btnWhatsApp} onClick={() => setShowWaOptions(true)}>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.125.558 4.122 1.529 5.855L.057 23.09a.75.75 0 0 0 .906.973l5.456-1.43A11.944 11.944 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.75a9.718 9.718 0 0 1-4.953-1.352l-.355-.211-3.68.965.982-3.585-.232-.37A9.718 9.718 0 0 1 2.25 12C2.25 6.615 6.615 2.25 12 2.25S21.75 6.615 21.75 12 17.385 21.75 12 21.75z"/></svg>
                  Cotizar por WhatsApp
                </button>
              ) : !waCompleto ? (
                <div className={styles.waOptions}>
                  <p className={styles.waQuestion}>¿Cómo deseas enviar la cotización?</p>
                  <div className={styles.waButtons}>
                    <button className={styles.waOptionBtn} onClick={() => handleSendWhatsApp('individual')}>
                      Individual
                    </button>
                    <button className={styles.waOptionBtn} onClick={() => setWaCompleto(true)}>
                      Completo
                    </button>
                  </div>
                  <button className={styles.waCancelBtn} onClick={() => setShowWaOptions(false)}>Cancelar</button>
                </div>
              ) : (
                <div className={styles.waOptions}>
                  <p className={styles.waQuestion}>¿Método de pago?</p>
                  <div className={styles.waButtons}>
                    <button className={styles.waOptionBtn} onClick={() => handleSendCompleto({ name: 'Zinli',       icon: '💳', amount: results!.totalUsd, currency: 'USD'  })}>💳 Zinli</button>
                    <button className={styles.waOptionBtn} onClick={() => handleSendCompleto({ name: 'PayPal',      icon: '🅿', amount: results!.totalUsd, currency: 'USD'  })}>🅿 PayPal</button>
                    <button className={styles.waOptionBtn} onClick={() => handleSendCompleto({ name: 'Binance Pay', icon: '₿', amount: results!.totalUsd, currency: 'USDT' })}>₿ Binance</button>
                    <button className={styles.waOptionBtn} onClick={() => handleSendCompleto({ name: 'BCV',  icon: '💵', amount: results!.totalBs,  currency: '$'    })}>💵 BCV</button>
                  </div>
                  <button className={styles.waCancelBtn} onClick={() => setWaCompleto(false)}>← Volver</button>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function BreakdownRow({ label, jpy, usd }: { label: string; jpy?: number; usd: number }) {
  return (
    <div className={styles.bdRow}>
      <span className={styles.bdLabel}>{label}</span>
      <span className={styles.bdAmounts}>
        {jpy !== undefined && (
          <span className={styles.bdJpy}>¥{jpy.toLocaleString('ja-JP')}</span>
        )}
        <span className={styles.bdUsd}>$ {fmt(usd)}</span>
      </span>
    </div>
  )
}

function RatePill({ dot, label, value }: { dot?: string; label: string; value: string }) {
  return (
    <div className={styles.pill}>
      {dot && <span className={styles.pillDot} style={{ background: dot }} />}
      <span className={styles.pillLabel}>{label}</span>
      <span className={styles.pillValue}>{value}</span>
    </div>
  )
}

interface InputFieldProps {
  label: string
  name: string
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  prefix?: string
  placeholder?: string
  hint?: string
  required?: boolean
  highlight?: boolean
}

function InputField({ label, name, value, onChange, prefix, placeholder, hint, required, highlight }: InputFieldProps) {
  return (
    <div className={styles.fieldGroup}>
      <label className={styles.label} htmlFor={name}>
        {label}
        {required && <span className={styles.required}>*</span>}
      </label>
      <div className={`${styles.inputWrapper} ${highlight ? styles.inputHighlight : ''}`}>
        {prefix && <span className={styles.inputPrefix}>{prefix}</span>}
        <input
          id={name}
          name={name}
          type="number"
          step="any"
          min="0"
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className={`${styles.input} ${prefix ? styles.inputWithPrefix : ''}`}
          required={required}
        />
      </div>
      {hint && <span className={styles.hint}>{hint}</span>}
    </div>
  )
}

interface PaymentCardProps {
  name: string; icon: string; amount: number; currency: string; color: string; note: string
}

function PaymentCard({ name, icon, amount, currency, color, note }: PaymentCardProps) {
  return (
    <div className={styles.paymentCard} style={{ '--card-accent': color } as React.CSSProperties}>
      <div className={styles.paymentCardHeader}>
        <span className={styles.paymentIcon} style={{ background: `${color}22`, color }}>{icon}</span>
        <span className={styles.paymentName}>{name}</span>
      </div>
      <div className={styles.paymentAmount}>
        <span className={styles.paymentCurrency}>{currency}</span>
        <span className={styles.paymentValue}>{fmt(amount)}</span>
      </div>
      <span className={styles.paymentNote}>{note}</span>
    </div>
  )
}
