// Número de prototipo → código y precio, sin salir de la app. La numeración la
// pone el motor del LAB, que corre aislado en `public/lab-resolver.worker.js`.
import { parsearCodigo } from './labCodigos'

const ESPERA_MS = 10000

// Devuelve { tragos: { numero: { codigo, precio, spec } | null }, sinConexion }.
// `sinConexion` es que no se pudo leer el LAB; un número que no existe es un
// null en `tragos`. No lanza: quien llama avisa y deja seguir.
export function resolverNumeros(numeros) {
  return new Promise(resolve => {
    let worker
    const terminar = (r) => { clearTimeout(reloj); if (worker) worker.terminate(); resolve(r) }
    const fallo = () => terminar({ tragos: {}, sinConexion: true })
    const reloj = setTimeout(fallo, ESPERA_MS)
    try {
      worker = new Worker(`${process.env.PUBLIC_URL || ''}/lab-resolver.worker.js`)
    } catch (e) { fallo(); return }
    worker.onerror = fallo
    worker.onmessage = ({ data }) => {
      if (data.error) { fallo(); return }
      const tragos = {}
      for (const n of numeros) {
        const t = data.tragos[n]
        const spec = t ? parsearCodigo(t.codigo) : null
        tragos[n] = spec ? { codigo: t.codigo, precio: t.precio, spec } : null
      }
      terminar({ tragos, sinConexion: false })
    }
    worker.postMessage({ numeros })
  })
}
