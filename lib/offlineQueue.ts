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

export async function encolarRespuesta(item: Omit<ItemCola, 'id' | 'creadoEn' | 'intentos'>): Promise<string> {
  const cola = await leerCola()
  const id = `local_${Date.now()}_${Math.random().toString(36).slice(2)}`
  cola.push({ ...item, id, creadoEn: Date.now(), intentos: 0 })
  await guardarCola(cola)
  console.log(`[offlineQueue] Encuestada guardada offline. Cola: ${cola.length} item(s)`)
  return id
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
    })
    if (error || !sesionId) return false

    if (item.parcela_id) {
      await supabase.rpc('registrar_visita', {
        p_parcela_id: item.parcela_id,
        p_resultado: item.razon_no_respuesta ? 'no_responde' : 'completada',
        p_latitud: item.latitud,
        p_longitud: item.longitud,
        p_sesion_id: sesionId,
      })
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
  } finally {
    sincronizando = false
  }
}

export async function cantidadPendiente(): Promise<number> {
  const cola = await leerCola()
  return cola.length
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