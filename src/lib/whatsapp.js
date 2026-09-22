// Helpers de WhatsApp compartidos por Reactivar y Campañas.

// Normaliza un teléfono chileno a dígitos con código de país (569XXXXXXXX).
export function normalizarTelefono(t) {
  if (!t) return null
  const d = String(t).replace(/\D/g, '')
  if (d.startsWith('569') && d.length === 11) return d
  if (d.startsWith('9') && d.length === 9) return '56' + d
  // «09 4862 3909»: el 0 de antes de la portabilidad; wa.me no lo entiende
  if (d.startsWith('09') && d.length === 10) return '56' + d.slice(1)
  // «+56 09 ...» o «5609...»: mismo 0 sobrante después del código de país
  if (d.startsWith('5609') && d.length === 12) return '56' + d.slice(3)
  if (d.startsWith('56') && d.length >= 11) return d
  return d.length >= 9 ? d : null
}

// Link que abre el chat con el texto ya escrito. Enviar sigue siendo manual.
export function linkWhatsApp(telefono, texto) {
  const tel = normalizarTelefono(telefono)
  if (!tel) return null
  return `https://wa.me/${tel}?text=${encodeURIComponent(texto || '')}`
}
