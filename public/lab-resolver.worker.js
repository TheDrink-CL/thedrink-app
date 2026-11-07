/* Traduce números de prototipo a código y precio con el motor del LAB.

   El motor es la única fuente de la numeración: se lee en vivo desde
   lab.ncity.live en vez de copiarla, así los números y precios son siempre los
   que ve el cliente, y no hay que republicar la app cuando cambia el LAB.

   Va en un worker a propósito: es código de otro sitio, y acá no alcanza ni el
   DOM ni el localStorage donde vive la sesión de Supabase. No lo muevas al hilo
   principal. La app además valida con `parsearCodigo` lo que sale de acá. */
'use strict';

/* La clave de PROTO es `base|esq|frutas[|energética]|añadidos…`; el pisco
   guarda su variante en el lugar de la base (ver claveGemelo en el motor). */
function specDeClave(clave) {
  const [base, esq, frutas, ...resto] = clave.split('|');
  const [fruta = null, fruta2 = null] = frutas ? frutas.split('.') : [];
  const redbull = esq === 'energetico' ? resto.shift() : null;
  const esPisco = !BASES[base];
  return {
    base: esPisco ? 'pisco' : base, pisco: esPisco ? base : 'pisco',
    esq, fruta, fruta2, redbull, addons: resto,
  };
}

self.onmessage = (e) => {
  try {
    importScripts('https://lab.ncity.live/lab-motor.js');
    const claves = {};
    for (const clave in PROTO) claves[+PROTO[clave]] = clave;
    const tragos = {};
    for (const numero of e.data.numeros) {
      const clave = claves[+numero];
      if (!clave) { tragos[numero] = null; continue; }
      const s = specDeClave(clave);
      // Si el formato de la clave cambió, mejor no resolver que dar otro trago.
      const calza = nombreTrago(s) === `PROTOTIPO #${PROTO[clave]}`;
      tragos[numero] = calza ? { codigo: codigo(s), precio: precio(s) } : null;
    }
    self.postMessage({ tragos });
  } catch (err) {
    self.postMessage({ error: String(err) });
  }
};
