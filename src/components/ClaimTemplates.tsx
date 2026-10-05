import { useState, useEffect } from 'react'
import { useRates } from '../hooks/useRates'
import { calcTotals, productUsdFromJpy } from '../pricing'
import styles from './ClaimTemplates.module.css'

// ─── Persistencia local (nada de esto viaja al repo ni al servidor) ───────────
import {
  LS_LAST_RESULT,
  LS_CLAIMS_DRAFT as LS_DRAFT,
  LS_CLAIMS_SAVED as LS_SAVED,
  purgeLegacyClaims,
} from '../storage'

purgeLegacyClaims()

// Datos de pago fijos — no cambian entre sets.
const PAYMENT_DATA = `Pago móvil:
30839317
0412-7756324
Banesco
Tasa $ BCV


Zinli:
almarzaaaron1512@gmail.com

Tasa BCV`

const RECOGIENDO_PAGOS = '*Recogiendo pagos*'

const DEFAULT_FOOTER = `> • Para hacer tu claim, indica el item y indica tu user de IG
> • El pago del item se hará en el momento en que se llene el set
> • Son tres pagos (item + envío jp - usa + envío usa - vzla)
> • Es una *GO* de mercari
> • IG *@daark_venoom*`

interface ClaimLine {
  id: string
  item: string
  user: string
}

/** Grupo de pcs con precio propio; su costo se descuenta del total del set */
interface SpecialGroup {
  id: string
  label: string
  qty: string
  priceUsd: string
}

interface Draft {
  setName: string
  units: string
  totalUsd: string
  totalBs: string
  priority: string
  lines: ClaimLine[]
  specials: SpecialGroup[]
  includePayment: boolean
  /** Generador: cuadrícula de la foto o set completo de un grupo */
  genMode: 'grid' | 'members'
  /** Cantidad de pcs de cada fila, en orden (fila A, fila B, ...) */
  rows: string[]
  /** Nombres del grupo, uno por línea */
  memberNames: string
  /**
   * Emoji de cada usuario. Se asigna una vez y no vuelve a moverse: si se
   * recalculara por orden de aparición, borrar un claim le cambiaría el emoji
   * a todos los demás.
   */
  emojiOverrides: Record<string, string>
  /** Quién ya pagó, para la fase de recogida de pagos */
  paidUsers: Record<string, boolean>
  /** Paleta temática de la que salen los emojis */
  emojiTheme: EmojiTheme
}

const ROW_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

const rowLetter = (i: number) => ROW_LETTERS[i] ?? `F${i + 1}`

/** Códigos tipo A1, B12 — se agrupan por fila en el mensaje */
const CODE_RE = /^([A-Za-z]+)(\d+)$/

/** Paletas temáticas: el emoji de cada joiner sale de la que elijas */
const EMOJI_THEMES = {
  variado:   { label: 'Variado',   emojis: ['🌸','💜','⭐','🍓','🐰','🦋','🌙','🍀','🔥','🍒','🐻','🌻','💎','🎀','🍑','🐣','☁️','🧸','🌈','🍬'] },
  flores:    { label: 'Flores',    emojis: ['🌸','🌷','🌺','🌻','🌹','💐','🌼','🪻','🏵️','🪷','🌱','🍀','🌿','🍃','🌵','🌾','🎍','🪴','🌳','🌴'] },
  frutas:    { label: 'Frutas',    emojis: ['🍓','🍒','🍑','🍇','🍎','🍊','🍋','🍉','🥝','🍍','🍌','🥭','🍐','🍏','🫐','🍅','🥥','🍈','🍆','🥑'] },
  dulces:    { label: 'Dulces',    emojis: ['🍬','🍭','🧁','🍰','🍩','🍪','🍫','🎂','🍮','🥧','🍦','🍨','🍧','🥮','🍯','🫖','☕','🧋','🥤','🍺'] },
  animales:  { label: 'Animales',  emojis: ['🐰','🐻','🐱','🐶','🐼','🦊','🐨','🐯','🐷','🐸','🐥','🦄','🐧','🐮','🐭','🐹','🦁','🐵','🐙','🦋'] },
  corazones: { label: 'Corazones', emojis: ['💜','💙','💚','💛','🧡','❤️','🤍','🖤','🤎','💗','💖','💝','💞','💕','💘','♥️','💟','❣️','💌','🩷'] },
  estrellas: { label: 'Estrellas', emojis: ['⭐','✨','🌟','💫','🌙','☁️','🌈','⚡','🔮','💎','🪐','☄️','🌠','🌞','🌛','🌜','❄️','🌊','🔥','🍀'] },
  kawaii:    { label: 'Kawaii',    emojis: ['🎀','🧸','🍡','🫧','🪄','🩰','🧁','🌈','☁️','💫','🍥','🪩','🫶','🌷','🐚','🪺','🧵','🪞','💐','🍮'] },
  musica:    { label: 'Música',    emojis: ['🎤','🎧','🎵','🎶','💿','📀','🎸','🥁','🎹','🎺','🎻','🪕','📻','🎙️','🎼','🔊','📢','🎬','🪘','🪗'] },
  mar:       { label: 'Mar',       emojis: ['🐚','🐬','🐳','🐠','🦀','🌊','🪸','🐙','⚓','🏝️','🐟','🦈','🐡','🦞','🦐','🌅','⛵','🏖️','🧜','🪼'] },
  clima:     { label: 'Clima',     emojis: ['☀️','🌤️','⛅','🌥️','☁️','🌦️','🌧️','⛈️','🌩️','❄️','⛄','🌨️','🌪️','🌈','☔','💨','🌫️','🌙','🌡️','🌬️'] },
  bebidas:   { label: 'Bebidas',   emojis: ['☕','🧋','🥤','🍹','🧃','🍵','🥛','🍺','🍷','🧉','🍸','🍾','🥂','🍶','🫗','🧊','🍼','🥃','🍻','🫖'] },
  moda:      { label: 'Moda',      emojis: ['👗','👠','👜','🕶️','💄','👒','🧣','💍','👑','🎀','👛','🥿','👢','🧢','👝','💎','🪮','🩰','👚','🧤'] },
  halloween: { label: 'Halloween', emojis: ['🎃','👻','🦇','🕸️','🕷️','🧙','💀','🍬','🌙','⚰️','🧛','🧟','🪦','🕯️','🔮','🍭','🐈‍⬛','🌕','☠️','🪄'] },
  navidad:   { label: 'Navidad',   emojis: ['🎄','🎁','⛄','❄️','🔔','🕯️','🦌','🍪','⭐','🎅','🤶','🧑‍🎄','🎿','🛷','🧦','🍬','🌟','🎊','🎉','🫖'] },
} as const

type EmojiTheme = keyof typeof EMOJI_THEMES

const paletteOf = (theme: EmojiTheme): readonly string[] =>
  (EMOJI_THEMES[theme] ?? EMOJI_THEMES.variado).emojis

const rid = () => Math.random().toString(36).slice(2)

const newLine = (): ClaimLine => ({ id: rid(), item: '', user: '' })

const newSpecial = (): SpecialGroup => ({ id: rid(), label: '', qty: '', priceUsd: '' })

const EMPTY_DRAFT: Draft = {
  setName: '',
  units: '',
  totalUsd: '',
  totalBs: '',
  priority: '',
  lines: [newLine()],
  specials: [],
  includePayment: false,   // se activa al entrar en fase de cobro
  genMode: 'grid',
  rows: [''],
  memberNames: '',
  emojiOverrides: {},
  paidUsers: {},
  emojiTheme: 'variado',
}

interface MercariItem {
  priceJPY: number
  title: string | null
  imageUrl: string | null
}

/** Un set guardado en este dispositivo */
interface SavedSet {
  id: string
  name: string
  savedAt: string
  draft: Draft
}

function loadArray<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key)
    const parsed = raw ? JSON.parse(raw) : null
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback
  } catch {
    return fallback
  }
}

function money(value: number): string {
  return value.toLocaleString('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/** Sección que se pliega para no comerse la pantalla */
function Collapsible({
  icon, title, badge, open, onToggle, children,
}: {
  icon: string
  title: string
  badge?: string | number
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <section className={styles.section}>
      <button
        type="button"
        className={styles.collapseHeader}
        onClick={onToggle}
        aria-expanded={open}
      >
        <span className={styles.sectionIcon}>{icon}</span>
        <span className={styles.collapseTitle}>{title}</span>
        {badge !== undefined && badge !== '' && (
          <span className={styles.savedCount}>{badge}</span>
        )}
        <span className={open ? styles.chevronOpen : styles.chevron}>▾</span>
      </button>
      {open && <div className={styles.collapseBody}>{children}</div>}
    </section>
  )
}

export default function ClaimTemplates() {
  const [draft, setDraft]     = useState<Draft>(() => load(LS_DRAFT, EMPTY_DRAFT))
  const [copied, setCopied]   = useState(false)
  const [interestCopied, setInterestCopied] = useState(false)
  const [imported, setImported] = useState<string | null>(null)
  const [saved, setSaved]     = useState<SavedSet[]>(() => loadArray(LS_SAVED))
  const [savedMsg, setSavedMsg] = useState<string | null>(null)
  const [savedOpen, setSavedOpen]     = useState(false)
  const [claimsOpen, setClaimsOpen]   = useState(true)
  const [specialsOpen, setSpecialsOpen] = useState(false)
  const [priorityOpen, setPriorityOpen] = useState(false)

  const [mercariUrl, setMercariUrl]         = useState('')
  const [mercariLoading, setMercariLoading] = useState(false)
  const [mercariItem, setMercariItem]       = useState<MercariItem | null>(null)
  const [mercariError, setMercariError]     = useState<string | null>(null)
  const { rates, fetchRates } = useRates()

  useEffect(() => { try { localStorage.setItem(LS_SAVED, JSON.stringify(saved)) } catch {} }, [saved])

  useEffect(() => { try { localStorage.setItem(LS_DRAFT, JSON.stringify(draft)) } catch {} }, [draft])

  // ─── Precios por unidad ────────────────────────────────────────────────────
  // Las pcs con precio especial cubren su parte; lo que sobra del total se
  // reparte entre las units restantes, de modo que la suma cuadre con el set.
  const units    = parseFloat(draft.units)
  const totalUsd = parseFloat(draft.totalUsd)
  const totalBs  = parseFloat(draft.totalBs)

  // Factor $ → BCV, tomado de los propios totales (equivale a Binance ÷ BCV)
  const bsRatio = totalUsd > 0 && totalBs > 0 ? totalBs / totalUsd : null
  const toBs = (usd: number) => (bsRatio !== null ? usd * bsRatio : null)

  const parsedSpecials = draft.specials.map((s) => ({
    ...s,
    qtyNum: parseFloat(s.qty),
    priceNum: parseFloat(s.priceUsd),
  }))

  // Precio 0 es válido: esas pcs salen gratis y el total se reparte entre el resto
  const activeSpecials = parsedSpecials.filter((s) => s.qtyNum > 0 && s.priceNum >= 0)
  const specialUnits = activeSpecials.reduce((sum, s) => sum + s.qtyNum, 0)
  const specialUsd   = activeSpecials.reduce((sum, s) => sum + s.qtyNum * s.priceNum, 0)

  const restUnits = units > 0 ? units - specialUnits : NaN
  const restUsd   = totalUsd > 0 ? totalUsd - specialUsd : NaN

  // Avisos de configuración imposible
  let specialsError: string | null = null
  if (units > 0 && specialUnits > units) {
    specialsError = `Las pcs especiales suman ${specialUnits} units, más que las ${units} del set.`
  } else if (units > 0 && specialUnits === units) {
    specialsError = 'Todas las units tienen precio especial: no queda ninguna al precio normal.'
  } else if (totalUsd > 0 && specialUsd > totalUsd) {
    specialsError = `Las especiales suman ${money(specialUsd)} $, más que el total de ${money(totalUsd)} $.`
  }

  const canSplit  = restUnits > 0 && restUsd > 0 && !specialsError
  const zinli     = canSplit ? restUsd / restUnits : null
  const pagoMovil = zinli !== null ? toBs(zinli) : null
  const valid     = units > 0

  // ─── Traer el precio desde un link de Mercari ──────────────────────────────
  async function searchMercari() {
    const url = mercariUrl.trim()
    if (!url) return
    if (!url.includes('mercari.com')) {
      setMercariError('Pega un link válido de jp.mercari.com')
      return
    }
    const jpy     = rates.jpy
    const binance = rates.binance
    const bcv     = rates.bcv
    if (!jpy || !binance || !bcv) {
      setMercariError('Las tasas aún no cargan. Espera un momento o pulsa "Sync tasas".')
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
      setMercariItem({ priceJPY: data.priceJPY, title: data.title, imageUrl: data.imageUrl ?? null })

      const productUsd = productUsdFromJpy(data.priceJPY, jpy)
      const totals = calcTotals(productUsd, { jpyToUsd: jpy, binanceRate: binance, bcvRate: bcv })
      setDraft((p) => ({
        ...p,
        totalUsd: totals.totalUsd.toFixed(2),
        totalBs: totals.totalBs.toFixed(2),
        setName: p.setName.trim() ? p.setName : (data.title ?? ''),
      }))
      setImported(null)
    } catch {
      setMercariError('Error de conexión. Intenta de nuevo.')
    } finally {
      setMercariLoading(false)
    }
  }

  // ─── Sets guardados en este dispositivo ────────────────────────────────────
  function saveSet() {
    const name = (draft.setName.trim() || 'Set sin nombre').slice(0, 60)
    const entry: SavedSet = { id: rid(), name, savedAt: new Date().toISOString(), draft }
    setSaved((prev) => {
      // Si ya hay uno con el mismo nombre, se reemplaza
      const rest = prev.filter((s) => s.name !== name)
      return [entry, ...rest].slice(0, 50)
    })
    setSavedOpen(true)   // que se vea dónde quedó
    setSavedMsg(`Guardado "${name}"`)
    setTimeout(() => setSavedMsg(null), 2200)
  }

  function loadSet(s: SavedSet) {
    if (!window.confirm(`Cargar "${s.name}"? Se reemplaza lo que tienes en pantalla.`)) return
    setDraft({ ...EMPTY_DRAFT, ...s.draft })
    setMercariItem(null)
    setImported(null)
  }

  function clearAllSaved() {
    if (!window.confirm(`Borrar los ${saved.length} sets guardados? No se pueden recuperar.`)) return
    setSaved([])
  }

  function deleteSet(s: SavedSet) {
    if (!window.confirm(`Borrar "${s.name}" definitivamente?`)) return
    setSaved((prev) => prev.filter((x) => x.id !== s.id))
  }

  function importFromCalculator() {
    try {
      const raw = localStorage.getItem(LS_LAST_RESULT)
      if (!raw) { setImported('No hay ningún cálculo guardado todavía.'); return }
      const r = JSON.parse(raw) as { totalUsd: number; totalBs: number; at: string }
      setDraft((p) => ({ ...p, totalUsd: r.totalUsd.toFixed(2), totalBs: r.totalBs.toFixed(2) }))
      setImported(`Importado del cálculo del ${new Date(r.at).toLocaleString('es-VE')}`)
    } catch {
      setImported('No se pudo leer el último cálculo.')
    }
  }

  // ─── Emoji por usuario ─────────────────────────────────────────────────────
  // Cada @usuario distinto recibe un emoji, en orden de aparición. Las pcs que
  // ya reclamó se muestran con ese emoji en lugar de su código.
  // Asigna emoji a los usuarios nuevos y descarta los que ya no tienen claim.
  // Los que ya tenían uno lo conservan, pase lo que pase con el resto.
  useEffect(() => {
    setDraft((p) => {
      const users = [...new Set(p.lines.map((l) => l.user.trim()).filter(Boolean))]
      const kept: Record<string, string> = {}
      for (const u of users) if (p.emojiOverrides[u]) kept[u] = p.emojiOverrides[u]

      const palette = paletteOf(p.emojiTheme)
      const used = new Set(Object.values(kept))
      for (const u of users) {
        if (kept[u]) continue
        const free = palette.find((e) => !used.has(e)) ?? palette[used.size % palette.length]
        kept[u] = free
        used.add(free)
      }

      // Sin cambios: devolvemos el mismo objeto para no re-renderizar en bucle
      const same =
        Object.keys(kept).length === Object.keys(p.emojiOverrides).length &&
        users.every((u) => kept[u] === p.emojiOverrides[u])
      return same ? p : { ...p, emojiOverrides: kept }
    })
  }, [draft.lines])

  const legend = (() => {
    const seen = new Map<string, string>()
    for (const l of draft.lines) {
      const user = l.user.trim()
      if (!user || seen.has(user)) continue
      seen.set(user, draft.emojiOverrides[user] || paletteOf(draft.emojiTheme)[0])
    }
    return [...seen].map(([user, emoji]) => ({
      user,
      emoji,
      paid: draft.paidUsers[user] === true,
    }))
  })()

  const paidCount = legend.filter((e) => e.paid).length

  /** Cambiar de temática reparte emojis nuevos a todos, en el orden actual */
  function changeTheme(theme: EmojiTheme) {
    setDraft((p) => {
      const users = [...new Set(p.lines.map((l) => l.user.trim()).filter(Boolean))]
      const palette = paletteOf(theme)
      const next: Record<string, string> = {}
      users.forEach((u, i) => { next[u] = palette[i % palette.length] })
      return { ...p, emojiTheme: theme, emojiOverrides: next }
    })
  }

  const togglePaid = (user: string) =>
    setDraft((p) => ({
      ...p,
      paidUsers: { ...p.paidUsers, [user]: !p.paidUsers[user] },
    }))

  const emojiFor = (user: string) =>
    legend.find((e) => e.user === user)?.emoji ?? '•'

  const setEmoji = (user: string, emoji: string) =>
    setDraft((p) => ({ ...p, emojiOverrides: { ...p.emojiOverrides, [user]: emoji } }))

  // ─── Construcción del texto ────────────────────────────────────────────────
  /** Precio normal + grupos con precio especial */
  function priceLines(): string[] {
    const parts: string[] = []
    if (pagoMovil !== null) parts.push(`Pago movil: ${money(pagoMovil)} $ c/u`)
    if (zinli !== null)     parts.push(`Zinli: ${money(zinli)}$ c/u`)

    for (const s of activeSpecials) {
      parts.push('')
      // Precio 0: la pc es gratis, solo se cobran los envíos
      if (s.priceNum === 0) {
        parts.push(`${s.label.trim() || 'Precio especial'}: solo paga envíos`)
        continue
      }
      const bs = toBs(s.priceNum)
      parts.push(`${s.label.trim() || 'Precio especial'} (${s.qtyNum} ${s.qtyNum === 1 ? 'pc' : 'pcs'})`)
      if (bs !== null) parts.push(`Pago movil: ${money(bs)} $ c/u`)
      parts.push(`Zinli: ${money(s.priceNum)}$ c/u`)
    }
    return parts
  }

  function buildMessage(): string {
    const parts: string[] = []

    parts.push(`♡‧₊˚ Set ${draft.setName || '...'} ♡‧₊˚`)
    parts.push('')
    parts.push(...priceLines())

    if (draft.priority.trim()) {
      parts.push('')
      parts.push(draft.priority.trim())
    }

    // Las pcs con código (A1, B2…) van agrupadas por fila en una sola línea;
    // las tomadas muestran el emoji de quien las reclamó. El resto de líneas
    // (ej. "units todas") se listan una por línea como siempre.
    const claims = draft.lines.filter((l) => l.item.trim() || l.user.trim())
    const coded  = claims.filter((l) => CODE_RE.test(l.item.trim()))
    const plain  = claims.filter((l) => !CODE_RE.test(l.item.trim()))

    if (coded.length > 0) {
      parts.push('')
      const order: string[] = []
      const byRow = new Map<string, string[]>()
      for (const l of coded) {
        const row = l.item.trim().match(CODE_RE)![1].toUpperCase()
        if (!byRow.has(row)) { byRow.set(row, []); order.push(row) }
        const user = l.user.trim()
        byRow.get(row)!.push(user ? emojiFor(user) : l.item.trim())
      }
      for (const row of order) parts.push(byRow.get(row)!.join(' '))
    }

    if (plain.length > 0) {
      parts.push('')
      for (const l of plain) {
        const item = l.item.trim()
        const user = l.user.trim()
        if (item && user) parts.push(`${item}: ${user}`)
        else if (item)    parts.push(`${item}:`)
        else              parts.push(user)
      }
    }

    // Leyenda: qué emoji es cada quien
    if (legend.length > 0) {
      parts.push('')
      for (const { user, emoji, paid } of legend) parts.push(`${emoji}${user}${paid ? ' ✅' : ''}`)
    }

    if (draft.includePayment) {
      parts.push('')
      parts.push(RECOGIENDO_PAGOS)
      parts.push('')
      parts.push(PAYMENT_DATA)
    }

    // Las condiciones van siempre, no hay nada que configurar
    parts.push('')
    parts.push(DEFAULT_FOOTER)

    return parts.join('\n')
  }

  const message = buildMessage()

  const interestMessage = ['♡‧₊˚ Interes check ♡‧₊˚', '', ...priceLines()].join('\n')

  async function copy() {
    try {
      await navigator.clipboard.writeText(message)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  async function copyInterest() {
    try {
      await navigator.clipboard.writeText(interestMessage)
      setInterestCopied(true)
      setTimeout(() => setInterestCopied(false), 1800)
    } catch {
      setInterestCopied(false)
    }
  }

  // ─── Manejo de líneas ──────────────────────────────────────────────────────
  const setLine = (id: string, patch: Partial<ClaimLine>) =>
    setDraft((p) => ({ ...p, lines: p.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)) }))

  const addLine = () => setDraft((p) => ({ ...p, lines: [...p.lines, newLine()] }))

  // ─── Generador de claims ───────────────────────────────────────────────────
  const rowCounts = draft.rows.map((r) => parseInt(r, 10))
  const gridTotal = rowCounts.reduce((sum, n) => sum + (n > 0 ? n : 0), 0)

  const memberList = draft.memberNames
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)

  const generated: ClaimLine[] =
    draft.genMode === 'grid'
      ? rowCounts.flatMap((n, i) =>
          n > 0
            ? Array.from({ length: n }, (_, j) => ({
                id: rid(),
                item: `${rowLetter(i)}${j + 1}`,
                user: '',
              }))
            : [],
        )
      : memberList.map((name) => ({ id: rid(), item: name, user: '' }))

  const assignedCount = draft.lines.filter((l) => l.user.trim()).length

  function generateClaims() {
    if (generated.length === 0) return
    if (
      assignedCount > 0 &&
      !window.confirm(
        `Ya hay ${assignedCount} claim(s) con usuario asignado. Se reemplazarán por ${generated.length} líneas nuevas. ¿Continuar?`,
      )
    ) {
      return
    }
    setDraft((p) => ({ ...p, lines: generated }))
  }

  const setRow = (i: number, value: string) =>
    setDraft((p) => ({ ...p, rows: p.rows.map((r, k) => (k === i ? value : r)) }))

  const addRow = () => setDraft((p) => ({ ...p, rows: [...p.rows, ''] }))

  const removeRow = (i: number) =>
    setDraft((p) => {
      const rows = p.rows.filter((_, k) => k !== i)
      return { ...p, rows: rows.length > 0 ? rows : [''] }
    })

  // ─── Grupos con precio especial ────────────────────────────────────────────
  const setSpecial = (id: string, patch: Partial<SpecialGroup>) =>
    setDraft((p) => ({ ...p, specials: p.specials.map((s) => (s.id === id ? { ...s, ...patch } : s)) }))

  const addSpecial = () => setDraft((p) => ({ ...p, specials: [...p.specials, newSpecial()] }))

  const removeSpecial = (id: string) =>
    setDraft((p) => ({ ...p, specials: p.specials.filter((s) => s.id !== id) }))

  const removeLine = (id: string) =>
    setDraft((p) => {
      const lines = p.lines.filter((l) => l.id !== id)
      return { ...p, lines: lines.length > 0 ? lines : [newLine()] }
    })

  function resetDraft() {
    if (!window.confirm('¿Vaciar la plantilla? Se borra todo lo que tienes en pantalla.')) return
    setDraft({ ...EMPTY_DRAFT, lines: [newLine()] })
    setImported(null)
  }

  return (
    <div className={styles.wrapper}>
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <div>
            <h1 className={styles.title}>Plantillas de claims</h1>
            <p className={styles.subtitle}>Panel privado · no enlazado desde la calculadora</p>
          </div>
          <a className={styles.backLink} href="#">← Calculadora</a>
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.topActions}>
          <button type="button" className={styles.btnDangerGhost} onClick={resetDraft}>
            Vaciar plantilla
          </button>
        </div>

        {/* ── Sets guardados ── */}
        {saved.length > 0 && (
          <section className={styles.section}>
            <button
              type="button"
              className={styles.collapseHeader}
              onClick={() => setSavedOpen((o) => !o)}
              aria-expanded={savedOpen}
            >
              <span className={styles.sectionIcon}>💾</span>
              <span className={styles.collapseTitle}>Mis sets guardados</span>
              <span className={styles.savedCount}>{saved.length}</span>
              <span className={savedOpen ? styles.chevronOpen : styles.chevron}>▾</span>
            </button>

            {savedOpen && (
              <div className={styles.collapseBody}>
                <div className={styles.legendHead}>
                  <p className={styles.hint}>Guardados solo en este dispositivo.</p>
                  <button
                    type="button"
                    className={styles.btnDangerGhost}
                    onClick={clearAllSaved}
                  >
                    Borrar todos
                  </button>
                </div>
                <div className={styles.savedList}>
                  {saved.map((s) => (
                    <div className={styles.savedItem} key={s.id}>
                      <button
                        type="button"
                        className={styles.savedLoad}
                        onClick={() => loadSet(s)}
                      >
                        <span className={styles.savedName}>{s.name}</span>
                        <span className={styles.savedDate}>
                          {new Date(s.savedAt).toLocaleDateString('es-VE')}
                        </span>
                      </button>
                      <button
                        type="button"
                        className={styles.btnRemove}
                        onClick={() => deleteSet(s)}
                        aria-label={`Borrar ${s.name}`}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* ── Set, link y precios (todo en una) ── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <span className={styles.sectionIcon}>♡</span>
            Set y precios
          </h2>
          <p className={styles.hint}>
            Pega el link y trae el precio con las tasas de hoy, o llena los totales a mano.
          </p>
          <div className={styles.searchRow}>
            <input
              type="text"
              className={styles.input}
              placeholder="https://jp.mercari.com/item/m..."
              value={mercariUrl}
              onChange={(e) => { setMercariUrl(e.target.value); setMercariError(null) }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void searchMercari() } }}
            />
            <button
              type="button"
              className={styles.btnGenerate}
              onClick={() => void searchMercari()}
              disabled={mercariLoading || !mercariUrl.trim()}
            >
              {mercariLoading ? '···' : 'Buscar'}
            </button>
          </div>

          <div className={styles.ratesRow}>
            <span className={styles.hint}>
              {rates.jpy && rates.binance && rates.bcv
                ? `Tasas: JPY ${rates.jpy.toFixed(6)} · Binance ${Math.round(rates.binance)} · BCV ${Math.round(rates.bcv)}`
                : 'Tasas sin cargar'}
            </span>
            <button
              type="button"
              className={styles.btnGhost}
              onClick={fetchRates}
              disabled={rates.loading}
            >
              {rates.loading ? 'Sincronizando…' : 'Sync tasas'}
            </button>
          </div>

          {mercariError && <p className={styles.warn}>⚠ {mercariError}</p>}
          {mercariItem && (
            <div className={styles.foundItem}>
              {mercariItem.imageUrl && (
                <img
                  className={styles.foundThumb}
                  src={mercariItem.imageUrl}
                  alt={mercariItem.title ?? 'Producto'}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  onError={(e) => { e.currentTarget.style.display = 'none' }}
                />
              )}
              <div className={styles.foundText}>
                {mercariItem.title && <span className={styles.foundTitle}>{mercariItem.title}</span>}
                <span className={styles.foundPrice}>
                  ¥{mercariItem.priceJPY.toLocaleString('ja-JP')}
                </span>
              </div>
            </div>
          )}

          <label className={styles.label} htmlFor="setName">Nombre del set</label>
          <input
            id="setName"
            className={styles.input}
            placeholder="Enha Yoi"
            value={draft.setName}
            onChange={(e) => setDraft((p) => ({ ...p, setName: e.target.value }))}
          />

          <div className={styles.row3}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="units">Units del set</label>
              <input
                id="units" className={styles.input} type="number" min="1" step="1"
                placeholder="7"
                value={draft.units}
                onChange={(e) => setDraft((p) => ({ ...p, units: e.target.value }))}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="totalUsd">Total en $</label>
              <input
                id="totalUsd" className={styles.input} type="number" min="0" step="any"
                placeholder="0.00"
                value={draft.totalUsd}
                onChange={(e) => setDraft((p) => ({ ...p, totalUsd: e.target.value }))}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="totalBs">Total BCV</label>
              <input
                id="totalBs" className={styles.input} type="number" min="0" step="any"
                placeholder="0.00"
                value={draft.totalBs}
                onChange={(e) => setDraft((p) => ({ ...p, totalBs: e.target.value }))}
              />
            </div>
          </div>

          <button type="button" className={styles.btnGhost} onClick={importFromCalculator}>
            ↓ Traer el último cálculo de la calculadora
          </button>
          {imported && <p className={styles.note}>{imported}</p>}

          <div className={styles.pricePreview}>
            <div className={styles.pricePill}>
              <span className={styles.pricePillLabel}>Pago móvil c/u</span>
              <span className={styles.pricePillValue}>
                {pagoMovil !== null ? `${money(pagoMovil)} $` : '—'}
              </span>
            </div>
            <div className={styles.pricePill}>
              <span className={styles.pricePillLabel}>Zinli c/u</span>
              <span className={styles.pricePillValue}>
                {zinli !== null ? `${money(zinli)} $` : '—'}
              </span>
            </div>
          </div>
          {!valid && (
            <p className={styles.hint}>Indica cuántas units tiene el set para calcular el precio por unidad.</p>
          )}
          {valid && specialUnits > 0 && !specialsError && (
            <p className={styles.hint}>
              {specialUnits} {specialUnits === 1 ? 'unit' : 'units'} con precio especial ·{' '}
              {restUnits} al precio normal
            </p>
          )}
          {specialsError && <p className={styles.warn}>⚠ {specialsError}</p>}
        </section>

        {/* ── Pcs con precio especial ── */}
        <Collapsible
          icon="✦"
          title="Pcs con precio especial"
          badge={activeSpecials.length > 0 ? activeSpecials.length : undefined}
          open={specialsOpen}
          onToggle={() => setSpecialsOpen((o) => !o)}
        >
          <p className={styles.hint}>
            Para las pcs que no valen lo mismo que el resto. Lo que cubren se descuenta del total,
            así que las demás units bajan de precio y la suma sigue dando el total del set.
          </p>

          {draft.specials.length > 0 && (
            <div className={styles.lines}>
              {parsedSpecials.map((s) => {
                const bs = s.priceNum >= 0 ? toBs(s.priceNum) : null
                return (
                  <div className={styles.specialCard} key={s.id}>
                    <div className={styles.specialTop}>
                      <input
                        className={styles.input}
                        placeholder="Nombre (ej. Jungwon tsv y desire)"
                        value={s.label}
                        onChange={(e) => setSpecial(s.id, { label: e.target.value })}
                      />
                      <button
                        type="button"
                        className={styles.btnRemove}
                        onClick={() => removeSpecial(s.id)}
                        aria-label={`Quitar el grupo ${s.label || 'sin nombre'}`}
                      >
                        ×
                      </button>
                    </div>
                    <div className={styles.specialGrid}>
                      <div className={styles.field}>
                        <label className={styles.label}>Cantidad de pcs</label>
                        <input
                          className={styles.input} type="number" min="1" step="1"
                          placeholder="2"
                          value={s.qty}
                          onChange={(e) => setSpecial(s.id, { qty: e.target.value })}
                        />
                      </div>
                      <div className={styles.field}>
                        <label className={styles.label}>Precio en $ c/u</label>
                        <input
                          className={styles.input} type="number" min="0" step="any"
                          placeholder="3.00"
                          value={s.priceUsd}
                          onChange={(e) => setSpecial(s.id, { priceUsd: e.target.value })}
                        />
                      </div>
                      <div className={styles.field}>
                        <label className={styles.label}>Pago móvil c/u</label>
                        <div className={styles.derived}>
                          {bs !== null ? `${money(bs)} $` : '—'}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <button type="button" className={styles.btnGhost} onClick={addSpecial}>
            + Añadir grupo con otro precio
          </button>
          {bsRatio === null && draft.specials.length > 0 && (
            <p className={styles.hint}>
              Llena el Total en $ y el Total BCV arriba para poder convertir estos precios a pago móvil.
            </p>
          )}
        </Collapsible>

        {/* ── Prioridad ── */}
        <Collapsible
          icon="★"
          title="Nota de prioridad"
          badge={draft.priority.trim() ? "puesta" : undefined}
          open={priorityOpen}
          onToggle={() => setPriorityOpen((o) => !o)}
        >
          <input
            className={styles.input}
            placeholder="*PRIORIDAD A QUIEN SE LLEVE A ALGUN MIEMBRO CON SUNOO O NIKI*"
            value={draft.priority}
            onChange={(e) => setDraft((p) => ({ ...p, priority: e.target.value }))}
          />
        </Collapsible>

        {/* ── Claims ── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <span className={styles.sectionIcon}>✓</span>
            Claims
          </h2>
          {/* Generador */}
          <div className={styles.genBox}>
            <div className={styles.tabs}>
              <button
                type="button"
                className={draft.genMode === 'grid' ? styles.tabActive : styles.tab}
                onClick={() => setDraft((p) => ({ ...p, genMode: 'grid' }))}
              >
                Por cuadrícula
              </button>
              <button
                type="button"
                className={draft.genMode === 'members' ? styles.tabActive : styles.tab}
                onClick={() => setDraft((p) => ({ ...p, genMode: 'members' }))}
              >
                Set completo de grupo
              </button>
            </div>

            {draft.genMode === 'grid' ? (
              <>
                <p className={styles.hint}>
                  Cuántas pcs tiene cada fila de la foto. Se numeran A1, A2… por fila.
                </p>
                <div className={styles.rowsList}>
                  {draft.rows.map((r, i) => (
                    <div className={styles.rowItem} key={i}>
                      <span className={styles.rowTag}>Fila {rowLetter(i)}</span>
                      <input
                        className={styles.input}
                        type="number" min="1" step="1"
                        placeholder="4"
                        value={r}
                        onChange={(e) => setRow(i, e.target.value)}
                      />
                      <button
                        type="button"
                        className={styles.btnRemove}
                        onClick={() => removeRow(i)}
                        aria-label={`Quitar la fila ${rowLetter(i)}`}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                <button type="button" className={styles.btnGhost} onClick={addRow}>
                  + Añadir fila
                </button>
                {gridTotal > 0 && (
                  <p className={styles.hint}>
                    Total: <strong>{gridTotal} pcs</strong>
                    {units > 0 && gridTotal !== units && (
                      <span className={styles.mismatch}>
                        {' '}· ojo: arriba pusiste {units} units del set
                      </span>
                    )}
                  </p>
                )}
              </>
            ) : (
              <>
                <p className={styles.hint}>Un nombre por línea, en el orden que quieras que salgan.</p>
                <textarea
                  className={styles.textarea}
                  rows={7}
                  placeholder={'Jay\nJungwon\nHeeseung\nSunoo\nSunghoon\nJake\nNiki'}
                  value={draft.memberNames}
                  onChange={(e) => setDraft((p) => ({ ...p, memberNames: e.target.value }))}
                />
                {memberList.length > 0 && (
                  <p className={styles.hint}>
                    Total: <strong>{memberList.length} miembros</strong>
                    {units > 0 && memberList.length !== units && (
                      <span className={styles.mismatch}>
                        {' '}· ojo: arriba pusiste {units} units del set
                      </span>
                    )}
                  </p>
                )}
              </>
            )}

            <button
              type="button"
              className={styles.btnGenerate}
              onClick={generateClaims}
              disabled={generated.length === 0}
            >
              Generar {generated.length > 0 ? `${generated.length} ` : ''}claims
            </button>
          </div>

          <button
            type="button"
            className={styles.collapseHeader}
            onClick={() => setClaimsOpen((o) => !o)}
            aria-expanded={claimsOpen}
          >
            <span className={styles.collapseTitle}>Lista de claims</span>
            <span className={styles.savedCount}>
              {assignedCount}/{draft.lines.filter((l) => l.item.trim()).length}
            </span>
            <span className={claimsOpen ? styles.chevronOpen : styles.chevron}>▾</span>
          </button>

          {claimsOpen && (
          <>
          <p className={styles.hint}>
            Item a la izquierda, usuario de IG a la derecha. Deja el usuario vacío si el item sigue libre.
          </p>

          <div className={styles.lines}>
            {draft.lines.map((l) => (
              <div className={styles.lineRow} key={l.id}>
                <input
                  className={styles.input}
                  placeholder="Jungwon"
                  value={l.item}
                  onChange={(e) => setLine(l.id, { item: e.target.value })}
                />
                <input
                  className={styles.input}
                  placeholder="@usuario"
                  value={l.user}
                  onChange={(e) => setLine(l.id, { user: e.target.value })}
                />
                <button
                  type="button"
                  className={styles.btnRemove}
                  onClick={() => removeLine(l.id)}
                  aria-label={`Quitar la línea ${l.item || 'vacía'}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          <button type="button" className={styles.btnGhost} onClick={addLine}>
            + Añadir línea
          </button>

          {legend.length > 0 && (
            <div className={styles.legendBox}>
              <div className={styles.legendHead}>
                <p className={styles.hint}>
                  Emoji de cada quien. Las pcs reclamadas salen con su emoji en vez del código.
                  {draft.includePayment && ' Marca ✅ a quien ya pagó.'}
                </p>
                {draft.includePayment && (
                  <span className={styles.savedCount}>{paidCount}/{legend.length} pagaron</span>
                )}
              </div>

              <div className={styles.themeRow}>
                <span className={styles.themeLabel}>Temática:</span>
                <div className={styles.themeChips}>
                  {(Object.keys(EMOJI_THEMES) as EmojiTheme[]).map((key) => (
                    <button
                      type="button"
                      key={key}
                      className={draft.emojiTheme === key ? styles.themeChipOn : styles.themeChip}
                      onClick={() => changeTheme(key)}
                      aria-pressed={draft.emojiTheme === key}
                    >
                      <span className={styles.themePeek}>
                        {EMOJI_THEMES[key].emojis.slice(0, 3).join('')}
                      </span>
                      {EMOJI_THEMES[key].label}
                    </button>
                  ))}
                </div>
              </div>
              <div className={styles.legendList}>
                {legend.map(({ user, emoji, paid }) => (
                  <div className={styles.legendItem} key={user}>
                    <input
                      className={styles.emojiInput}
                      value={emoji}
                      maxLength={4}
                      onChange={(e) => setEmoji(user, e.target.value)}
                      aria-label={`Emoji de ${user}`}
                    />
                    <span className={styles.legendUser}>{user}</span>
                    {draft.includePayment && (
                      <button
                        type="button"
                        className={paid ? styles.paidOn : styles.paidOff}
                        onClick={() => togglePaid(user)}
                        aria-pressed={paid}
                        title={paid ? `${user} ya pagó` : `Marcar que ${user} pagó`}
                      >
                        {paid ? '✅ Pagó' : 'Sin pagar'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          </>
          )}
        </section>

        {/* ── Datos de pago: solo el interruptor, el bloque es fijo ── */}
        <section className={styles.section}>
          <label className={styles.switchRow}>
            <span className={styles.sectionIcon}>$</span>
            <span className={styles.switchText}>
              <span className={styles.collapseTitle}>Recogiendo pagos</span>
              <span className={styles.hint}>Añade los datos de pago al final del mensaje</span>
            </span>
            <input
              type="checkbox"
              className={styles.switchBox}
              checked={draft.includePayment}
              onChange={(e) => setDraft((p) => ({ ...p, includePayment: e.target.checked }))}
            />
          </label>
        </section>

        {/* ── Interes check: solo los precios ── */}
        <section className={styles.previewSection}>
          <h2 className={styles.sectionTitle}>
            <span className={styles.sectionIcon}>?</span>
            Interes check
          </h2>
          <pre className={styles.preview}>{interestMessage}</pre>
          <button type="button" className={styles.btnPrimary} onClick={copyInterest}>
            {interestCopied ? '✓ Copiado' : 'Copiar interes check'}
          </button>
        </section>

        {/* ── Preview ── */}
        <section className={styles.previewSection}>
          <h2 className={styles.sectionTitle}>
            <span className={styles.sectionIcon}>👁</span>
            Vista previa
          </h2>
          <pre className={styles.preview}>{message}</pre>

          <div className={styles.actions}>
            <button type="button" className={styles.btnPrimary} onClick={copy}>
              {copied ? '✓ Copiado' : 'Copiar texto'}
            </button>
            <button type="button" className={styles.btnSave} onClick={saveSet}>
              💾 Guardar set
            </button>
          </div>
          {savedMsg && <p className={styles.note}>{savedMsg}</p>}
        </section>
      </main>
    </div>
  )
}
