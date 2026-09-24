/**
 * Registro de uso, límites y bloqueos sobre Cloudflare D1.
 *
 * Criterios:
 * - Nunca se guarda la IP. Se guarda un hash con sal (env.HASH_SALT), que
 *   identifica al visitante de forma estable sin almacenar su dirección.
 * - Las conversaciones se guardan SIN identificador de visitante, así el
 *   registro de contenido y el de seguridad no se pueden cruzar.
 * - Antes de guardar, se tachan mails, teléfonos y números largos.
 * - Si no hay base enlazada (env.DB ausente), todo degrada a "sin límites y
 *   sin registro": el bot sigue respondiendo en vez de romperse.
 */

// Precios de claude-haiku-4-5, por millón de tokens.
const PRECIO_ENTRADA = 1.0;
const PRECIO_SALIDA = 5.0;

export function hayBase(env) {
  return !!(env && env.DB);
}

export async function hashVisitante(ip, env) {
  const sal = env.HASH_SALT || env.PANEL_TOKEN || "petrilac-sal-por-defecto";
  const datos = new TextEncoder().encode(`${sal}|${ip || "desconocida"}`);
  const buf = await crypto.subtle.digest("SHA-256", datos);
  return [...new Uint8Array(buf)]
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Tacha datos de contacto antes de guardar el texto. */
export function redactar(texto) {
  return (texto || "")
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[mail]")
    .replace(/(?:\+?\d[\s().-]?){8,}\d/g, "[teléfono]")
    .slice(0, 4000);
}

export function calcularCosto(tokensEntrada, tokensSalida) {
  return (
    (tokensEntrada / 1e6) * PRECIO_ENTRADA + (tokensSalida / 1e6) * PRECIO_SALIDA
  );
}

function periodos(ahora = new Date()) {
  const iso = ahora.toISOString();
  return { hora: `h:${iso.slice(0, 13)}`, dia: `d:${iso.slice(0, 10)}` };
}

/**
 * Decide si esta consulta puede pasar. Devuelve { permitido, motivo }.
 * No incrementa nada: contar se hace después, sólo si la consulta se atendió.
 */
export async function revisarLimites(env, visitante, mensajesConversacion) {
  if (!hayBase(env)) return { permitido: true };

  const lim = {
    hora: Number(env.LIMITE_HORA || 15),
    dia: Number(env.LIMITE_DIA || 40),
    conversacion: Number(env.LIMITE_CONVERSACION || 20),
    global: Number(env.LIMITE_GLOBAL_DIA || 500),
  };

  if (mensajesConversacion >= lim.conversacion) {
    return { permitido: false, motivo: "conversacion" };
  }

  const p = periodos();
  try {
    const [bloqueo, usoHora, usoDia, usoGlobal] = await env.DB.batch([
      env.DB.prepare("SELECT motivo FROM bloqueos WHERE visitante = ?").bind(visitante),
      env.DB.prepare("SELECT n FROM uso WHERE visitante = ? AND periodo = ?").bind(visitante, p.hora),
      env.DB.prepare("SELECT n FROM uso WHERE visitante = ? AND periodo = ?").bind(visitante, p.dia),
      env.DB.prepare("SELECT n FROM global WHERE periodo = ?").bind(p.dia),
    ]);

    if (bloqueo.results.length > 0) return { permitido: false, motivo: "bloqueado" };
    if ((usoHora.results[0]?.n || 0) >= lim.hora) return { permitido: false, motivo: "hora" };
    if ((usoDia.results[0]?.n || 0) >= lim.dia) return { permitido: false, motivo: "dia" };
    if ((usoGlobal.results[0]?.n || 0) >= lim.global) return { permitido: false, motivo: "global" };
  } catch (e) {
    // Si la base falla, preferimos responder antes que cortar el servicio.
    console.log("[limites] error consultando D1:", e.message);
  }
  return { permitido: true };
}

/** Suma 1 a los contadores y bloquea automáticamente al que se pasa mucho. */
export async function contarUso(env, visitante, costo) {
  if (!hayBase(env)) return;
  const p = periodos();
  const ahora = Date.now();
  const umbralAuto = Number(env.LIMITE_BLOQUEO_AUTO || 120);

  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO uso (visitante, periodo, n, actualizado) VALUES (?, ?, 1, ?)
         ON CONFLICT(visitante, periodo) DO UPDATE SET n = n + 1, actualizado = ?`
      ).bind(visitante, p.hora, ahora, ahora),
      env.DB.prepare(
        `INSERT INTO uso (visitante, periodo, n, actualizado) VALUES (?, ?, 1, ?)
         ON CONFLICT(visitante, periodo) DO UPDATE SET n = n + 1, actualizado = ?`
      ).bind(visitante, p.dia, ahora, ahora),
      env.DB.prepare(
        `INSERT INTO global (periodo, n, costo) VALUES (?, 1, ?)
         ON CONFLICT(periodo) DO UPDATE SET n = n + 1, costo = costo + ?`
      ).bind(p.dia, costo, costo),
      env.DB.prepare(
        `INSERT INTO bloqueos (visitante, motivo, ts, automatico)
         SELECT ?, 'automático: volumen inusual', ?, 1
         WHERE (SELECT n FROM uso WHERE visitante = ? AND periodo = ?) >= ?
         ON CONFLICT(visitante) DO NOTHING`
      ).bind(visitante, ahora, visitante, p.dia, umbralAuto),
    ]);
  } catch (e) {
    console.log("[uso] error escribiendo D1:", e.message);
  }
}

export async function guardarConversacion(env, datos) {
  if (!hayBase(env)) return;
  try {
    await env.DB.prepare(
      `INSERT INTO conversaciones (conv_id, ts, pregunta, respuesta, tokens_in, tokens_out, costo, fuentes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        datos.convId,
        Date.now(),
        redactar(datos.pregunta),
        redactar(datos.respuesta),
        datos.tokensEntrada || 0,
        datos.tokensSalida || 0,
        datos.costo || 0,
        (datos.fuentes || []).map((f) => f.title).join(" · ").slice(0, 500)
      )
      .run();
  } catch (e) {
    console.log("[conversaciones] error escribiendo D1:", e.message);
  }
}

/** Borra lo viejo: contenido a los 90 días, seguridad a los 30. */
export async function limpiarViejo(env) {
  if (!hayBase(env)) return;
  const dias = (n) => Date.now() - n * 24 * 60 * 60 * 1000;
  await env.DB.batch([
    env.DB.prepare("DELETE FROM conversaciones WHERE ts < ?").bind(dias(90)),
    env.DB.prepare("DELETE FROM uso WHERE actualizado < ?").bind(dias(30)),
    env.DB.prepare("DELETE FROM bloqueos WHERE automatico = 1 AND ts < ?").bind(dias(30)),
  ]);
}

export const MENSAJES_LIMITE = {
  conversacion:
    "Llevamos una charla larga y quiero asegurarme de que resuelvas bien tu consulta. " +
    "Para seguir, comunicate con la línea técnica de Petrilac: 0800.77PETRI (73874).",
  hora:
    "Alcanzaste el límite de consultas por hora. Podés seguir más tarde, o comunicarte " +
    "con la línea técnica de Petrilac: 0800.77PETRI (73874).",
  dia:
    "Alcanzaste el límite de consultas por hoy. Comunicate con la línea técnica de " +
    "Petrilac: 0800.77PETRI (73874).",
  global:
    "El asistente está con mucha demanda en este momento. Comunicate con la línea técnica " +
    "de Petrilac: 0800.77PETRI (73874).",
  bloqueado:
    "No podemos atender esta consulta por este medio. Comunicate con la línea técnica de " +
    "Petrilac: 0800.77PETRI (73874).",
};
