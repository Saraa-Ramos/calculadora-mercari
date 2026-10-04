// Claves de localStorage compartidas entre la calculadora y el panel de claims.
// Todo lo que se guarda aquí vive solo en el navegador del usuario.
//
// El sufijo :v2 invalida los borradores guardados con el esquema anterior.
export const LS_LAST_RESULT = 'dv:lastResult'
export const LS_CLAIMS_DRAFT = 'dv:claims:v2:draft'
/** Sets guardados, solo en este dispositivo */
export const LS_CLAIMS_SAVED = 'dv:claims:v2:saved'

/** Limpia restos del esquema viejo para que no reaparezcan datos antiguos. */
export function purgeLegacyClaims(): void {
  try {
    // El pie dejó de ser editable, su clave ya no se usa
    for (const k of ['dv:claims:draft', 'dv:claims:payment', 'dv:claims:footer', 'dv:claims:v2:footer']) {
      localStorage.removeItem(k)
    }
  } catch {}
}
