import * as Location from 'expo-location'
import { supabase } from './supabase'

export async function pedirPermisoUbicacion(): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync()
  return status === 'granted'
}

export async function getUbicacionActual(): Promise<{ lat: number; lng: number } | null> {
  try {
    // Primero intentar lastKnown (más rápido, no bloquea)
    const last = await Location.getLastKnownPositionAsync({ maxAge: 30000 })
    if (last) {
      return { lat: last.coords.latitude, lng: last.coords.longitude }
    }
  } catch {}

  try {
    // Si no hay cache, pedir posición actual con Balanced (más rápido que High)
    const loc = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    })
    return { lat: loc.coords.latitude, lng: loc.coords.longitude }
  } catch (e) {
    console.warn('[location] getCurrent falló:', e)
    return null
  }
}

// ── GEO ─────────────────────────────────────────

export function puntoEnPoligono(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (((yi > lat) !== (yj > lat)) && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)) {
      inside = !inside
    }
  }
  return inside
}

// ── SINGLETON ───────────────────────────────────

let _trackingId: string | null = null
let _trackingInterval: ReturnType<typeof setInterval> | null = null
let _lastLocation: { lat: number; lng: number } | null = null

// Múltiples listeners — cada hook puede suscribirse sin pisarse
const _callbacks = new Set<(pos: { lat: number; lng: number }) => void>()

export function setLocationCallback(cb: (pos: { lat: number; lng: number }) => void): void {
  _callbacks.add(cb)
  // Replay inmediato si ya hay una ubicación conocida
  if (_lastLocation) {
    console.log('[location] replay última ubicación conocida')
    cb(_lastLocation)
  }
}

export function removeLocationCallback(cb: (pos: { lat: number; lng: number }) => void): void {
  _callbacks.delete(cb)
}

function _notify(pos: { lat: number; lng: number }) {
  _lastLocation = pos
  _callbacks.forEach(cb => cb(pos))
}

export async function iniciarTrackingSingleton(encuestadorId: string, organizacionId: string) {
  // Si ya está corriendo para este usuario, no hacer nada
  if (_trackingId === encuestadorId && _trackingInterval) {
    console.log('[location] Tracking ya activo para', encuestadorId)
    // Replay última ubicación para los nuevos callbacks
    if (_lastLocation) _notify(_lastLocation)
    return
  }

  // Limpiar tracking anterior si era para otro usuario
  if (_trackingInterval) {
    clearInterval(_trackingInterval)
    _trackingInterval = null
  }

  _trackingId = encuestadorId

  // Primera ubicación
  const pos = await getUbicacionActual()
  if (pos) {
    console.log('[location] Posición inicial:', pos.lat, pos.lng)
    _notify(pos)
    await _guardarUbicacion(encuestadorId, organizacionId, pos)
  } else {
    console.warn('[location] Sin GPS en arranque')
  }

  // Loop cada 10 segundos
  _trackingInterval = setInterval(async () => {
    const pos = await getUbicacionActual()
    if (!pos) {
      console.warn('[location] Tick sin GPS')
      return
    }
    console.log('[location] Tick:', pos.lat, pos.lng)
    _notify(pos)
    await _guardarUbicacion(encuestadorId, organizacionId, pos)
  }, 10000)

  console.log('[location] Tracking iniciado para', encuestadorId)
}

export function detenerTrackingSingleton() {
  if (_trackingInterval) {
    clearInterval(_trackingInterval)
    _trackingInterval = null
    _trackingId = null
    _lastLocation = null
    _callbacks.clear()
    console.log('[location] Tracking detenido')
  }
}

let _errorCount = 0
const MAX_ERRORS = 3

async function _guardarUbicacion(
  encuestadorId: string,
  organizacionId: string,
  pos: { lat: number; lng: number }
) {
  // Circuit breaker — si hay muchos errores seguidos, no seguir intentando
  if (_errorCount >= MAX_ERRORS) {
    return
  }
  try {
    const { error } = await supabase.from('ubicaciones_encuestadores').upsert(
      {
        encuestador_id:  encuestadorId,
        organizacion_id: organizacionId,
        lat:             pos.lat,
        lng:             pos.lng,
        actualizado_en:  new Date().toISOString(),
      },
      { onConflict: 'encuestador_id' }
    )
    if (error) {
      _errorCount++
      if (_errorCount >= MAX_ERRORS) {
        console.warn('[location] Demasiados errores guardando ubicación, pausando tracking de DB')
      }
    } else {
      _errorCount = 0 // reset al tener éxito
    }
  } catch (e) {
    _errorCount++
    console.error('[location] error guardando:', e)
  }
}

// Alias para compatibilidad
export async function actualizarUbicacion(encuestadorId: string, organizacionId: string) {
  const pos = await getUbicacionActual()
  if (!pos) return
  await _guardarUbicacion(encuestadorId, organizacionId, pos)
}