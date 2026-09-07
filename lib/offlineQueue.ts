import AsyncStorage from '@react-native-async-storage/async-storage'
import { AppState } from 'react-native'
import NetInfo from '@react-native-community/netinfo'
import { supabase } from './supabase'

const QUEUE_KEY = 'metr1ka_offline_queue'

export interface ItemCola {
  id: string
  creadoEn: number
  asignacion_id: string | null
  latitud: number | null
  longitud: number | null
  respuestas: any[]
  razon_no_respuesta: string | null
  participa_pregunta_id: string | null
  parcela_id: string | null
  iniciada_en: string | null
  // Clave estable generada por el llamador (ver generarIdempotencyKey) —
  // se manda como p_idempotency_key a guardar_encuesta_completa. Si esta
  // encuesta ya se había intentado guardar directo y falló solo el paso de
  // registrar_visita (Bug B), el reintento acá usa la MISMA key, así el
  // servidor detecta que ya existe y no inserta una fila duplicada.
  idempotency_key: string
  intentos: number
}

export async function leerCola(): Promise<ItemCola[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

async function guardarCola(cola: ItemCola[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(cola))
}

// uuid v4 simple — no hace falta que sea criptográficamente fuerte, solo
// necesitamos que sea estable entre el intento directo y el reintento por
// la cola, y prácticamente única (Math.random alcanza).
export function generarIdempotencyKey(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16)
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

// Bug A (PLAN-tiempo-encuestas-y-mensajes.md, sección 5): leerCola()/
// guardarCola() hacen un read-modify-write sobre AsyncStorage sin lock.
// sincronizarCola recorre la cola uno por uno esperando cada request — con
// señal intermitente puede tardar decenas de segundos. Si encolarRespuesta
// se cuela en el medio (lee la cola vieja, la sincronización termina y
// pisa el archivo con una versión que no incluye lo nuevo), esa encuesta
// se pierde en silencio. Se serializan todas las operaciones que hacen
// read-modify-write de la cola encadenándolas a esta promesa.
let colaLock: Promise<void> = Promise.resolve()

function conLockCola<T>(tarea: () => Promise<T>): Promise<T> {
  const resultado = colaLock.then(tarea, tarea)
  colaLock = resultado.then(() => undefined, () => undefined)
  return resultado
}

export async function encolarRespuesta(item: Omit<ItemCola, 'id' | 'creadoEn' | 'intentos'>): Promise<string> {
  return conLockCola(async () => {
    const cola = await leerCola()
    const id = `local_${Date.now()}_${Math.random().toString(36).slice(2)}`
    cola.push({ ...item, id, creadoEn: Date.now(), intentos: 0 })
    await guardarCola(cola)
    console.log(`[offlineQueue] Encuestada guardada offline. Cola: ${cola.length} item(s)`)
    return id
  })
}

async function sincronizarItem(item: ItemCola): Promise<boolean> {
  try {
    const { data: sesionId, error } = await supabase.rpc('guardar_encuesta_completa', {
      p_asignacion_id: item.asignacion_id,
      p_latitud: item.latitud,
      p_longitud: item.longitud,
      p_respuestas: item.respuestas,
      p_razon_no_respuesta: item.razon_no_respuesta,
      p_participa_pregunta_id: item.participa_pregunta_id,
      p_iniciada_en: item.iniciada_en,
      p_idempotency_key: item.idempotency_key,
    })
    if (error || !sesionId) return false

    if (item.parcela_id) {
      // Best-effort a propósito: la respuesta ya se guardó, no tiene sentido
      // re-encolar/reintentar guardar_encuesta_completa de nuevo solo porque
      // falló el registro de la visita a la parcela. Se loguea para poder
      // detectar si esto pasa seguido, pero no cuenta como fallo del item.
      const { error: errVisita } = await supabase.rpc('registrar_visita', {
        p_parcela_id: item.parcela_id,
        p_resultado: item.razon_no_respuesta ? 'no_responde' : 'completada',
        p_latitud: item.latitud,
        p_longitud: item.longitud,
        p_sesion_id: sesionId,
      })
      if (errVisita) console.warn('[offlineQueue] registrar_visita falló (best-effort):', errVisita)
    }
    return true
  } catch {
    return false
  }
}

let sincronizando = false

export async function sincronizarCola(): Promise<{ enviados: number; pendientes: number }> {
  if (sincronizando) return { enviados: 0, pendientes: 0 }
  sincronizando = true

  try {
    // Todo el ciclo lectura → envíos → escritura queda bajo el mismo lock:
    // si encolarRespuesta() se llama mientras esto corre, espera a que
    // termine en vez de arriesgarse a que su lectura quede vieja y el
    // guardarCola() final la pise (ver comentario de colaLock arriba).
    return await conLockCola(async () => {
      const cola = await leerCola()
      if (!cola.length) return { enviados: 0, pendientes: 0 }

      console.log(`[offlineQueue] Sincronizando ${cola.length} encuesta(s)...`)
      const restantes: ItemCola[] = []
      let enviados = 0

      for (const item of cola) {
        const ok = await sincronizarItem(item)
        if (ok) {
          enviados++
          console.log(`[offlineQueue] ✅ Enviada: ${item.id}`)
        } else {
          restantes.push({ ...item, intentos: item.intentos + 1 })
          console.log(`[offlineQueue] ❌ Falló: ${item.id} (intento ${item.intentos + 1})`)
        }
      }

      await guardarCola(restantes)
      console.log(`[offlineQueue] Sync completo: ${enviados} enviadas, ${restantes.length} pendientes`)
      return { enviados, pendientes: restantes.length }
    })
  } finally {
    sincronizando = false
  }
}

export async function cantidadPendiente(asignacionId?: string): Promise<number> {
  const cola = await leerCola()
  if (!asignacionId) return cola.length
  return cola.filter((item) => item.asignacion_id === asignacionId).length
}

// Desglose de la cola pendiente de una asignación, para sumarlo al estado
// de cuota (get_estado_encuesta_callejera) mientras no hay conexión — mismo
// criterio que sincronizarItem() usa para clasificar el resultado en
// registrar_visita: con razón de no-respuesta cuenta como "no_respuesta",
// sin ella cuenta como "completada".
export async function contarPendientesPorTipo(asignacionId: string): Promise<{ completadas: number; noRespuesta: number }> {
  const cola = await leerCola()
  let completadas = 0
  let noRespuesta = 0
  for (const item of cola) {
    if (item.asignacion_id !== asignacionId) continue
    if (item.razon_no_respuesta) noRespuesta++
    else completadas++
  }
  return { completadas, noRespuesta }
}

// Escucha cambios de conectividad Y AppState para sincronizar en ambos casos
export function iniciarSyncAutomatico(): () => void {
  // 1. Cuando vuelve la conexión a internet
  const unsubNet = NetInfo.addEventListener(async (state) => {
    if (state.isConnected && state.isInternetReachable) {
      const cola = await leerCola()
      if (cola.length > 0) {
        console.log(`[offlineQueue] 📶 Conexión recuperada, sincronizando ${cola.length} encuesta(s)...`)
        sincronizarCola()
      }
    }
  })

  // 2. Cuando la app vuelve al frente (por si acaso)
  const subApp = AppState.addEventListener('change', async (state) => {
    if (state === 'active') {
      const cola = await leerCola()
      if (cola.length > 0) {
        const net = await NetInfo.fetch()
        if (net.isConnected && net.isInternetReachable) {
          console.log(`[offlineQueue] 📱 App activa con conexión, sincronizando ${cola.length} encuesta(s)...`)
          sincronizarCola()
        }
      }
    }
  })

  return () => {
    unsubNet()
    subApp.remove()
  }
}
