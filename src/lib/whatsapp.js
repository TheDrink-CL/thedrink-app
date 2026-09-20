// Helpers de WhatsApp compartidos por Reactivar y Campañas.

// Normaliza un teléfono chileno a dígitos con código de país (569XXXXXXXX).
export function normalizarTelefono(t) {
  if (!t) return null
  const d = String(t).replace(/\D/g, '')
  if (d.startsWith('569') && d.length === 11) return d
  if (d.startsWith('9') && d.length === 9) return '56' + d
  if (d.startsWith('56') && d.length >= 11) return d
  return d.length >= 9 ? d : null
}

// Link que abre el chat con el texto ya escrito. Enviar sigue siendo manual.
export function linkWhatsApp(telefono, texto) {
  const tel = normalizarTelefono(telefono)
  if (!tel) return null
  return `https://wa.me/${tel}?text=${encodeURIComponent(texto || '')}`
}
