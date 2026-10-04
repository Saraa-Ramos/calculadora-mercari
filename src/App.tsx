import { useState, useEffect } from 'react'
import MercariCalculator from './components/MercariCalculator'
import ClaimTemplates from './components/ClaimTemplates'

// Apartado privado: solo se llega escribiendo #claims en la URL.
// No hay ningún enlace hacia él desde la calculadora.
const CLAIMS_HASH = '#claims'

export default function App() {
  const [hash, setHash] = useState(() => window.location.hash)

  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  return hash === CLAIMS_HASH ? <ClaimTemplates /> : <MercariCalculator />
}
