import * as Location from 'expo-location'
import { supabase } from './supabase'

export async function pedirPermisoUbicacion(): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync()
  return status === 'granted'
}

export async function getUbicacionActual(): Promise<{ lat: number; lng: number } | null> {
  try {
    const loc = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    })

    return { lat: loc.coords.latitude, lng: loc.coords.longitude }

  } catch (e) {
    console.warn('[location] getCurrent falló, intento lastKnown')

    try {
      const loc = await Location.getLastKnownPositionAsync()
      if (loc) {
        return { lat: loc.coords.latitude, lng: loc.coords.longitude }
      }
    } catch {}

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
let _trackingInterval: any = null
let _onLocationUpdate: ((pos: { lat: number; lng: number }) => void) | null = null

// 🔴 NUEVO
let _lastLocation: { lat: number; lng: number } | null = null

export function setLocationCallback(cb: ((pos: { lat: number; lng: number }) => void) | null) {
  _onLocationUpdate = cb

  // 🔴 CLAVE: reenviar última ubicación si existe
  if (cb && _lastLocation) {
    console.log('[location] replay última ubicación')
    cb(_lastLocation)
  }
}

export async function iniciarTrackingSingleton(encuestadorId: string, organizacionId: string) {
  if (_trackingId === encuestadorId && _trackingInterval) {
    console.log('[location] Tracking ya activo para', encuestadorId)
    return
  }

  if (_trackingInterval) {
    clearInterval(_trackingInterval)
    _trackingInterval = null
  }

  _trackingId = encuestadorId

  // 🔴 PRIMERA UBICACIÓN
  const pos = await getUbicacionActual()
  if (pos) {
    console.log('[location] Posición inicial:', pos.lat, pos.lng)

    _lastLocation = pos
    _onLocationUpdate?.(pos)

    await actualizarUbicacion(encuestadorId, organizacionId)
  } else {
    console.warn('[location] Sin GPS en arranque')
  }

  // 🔴 LOOP
  _trackingInterval = setInterval(async () => {
    const pos = await getUbicacionActual()

    if (!pos) {
      console.warn('[location] Tick sin GPS')
      return
    }

    console.log('[location] Tick:', pos.lat, pos.lng)

    _lastLocation = pos
    _onLocationUpdate?.(pos)

    await actualizarUbicacion(encuestadorId, organizacionId)
  }, 15000)

  console.log('[location] Tracking iniciado para', encuestadorId)
}

export function detenerTrackingSingleton() {
  if (_trackingInterval) {
    clearInterval(_trackingInterval)
    _trackingInterval = null
    _trackingId = null
    _onLocationUpdate = null
    _lastLocation = null
    console.log('[location] Tracking detenido')
  }
}

export async function actualizarUbicacion(encuestadorId: string, organizacionId: string) {
  try {
    const pos = await getUbicacionActual()
    if (!pos) return

    await supabase.from('ubicaciones_encuestadores').upsert(
      {
        encuestador_id: encuestadorId,
        organizacion_id: organizacionId,
        lat: pos.lat,
        lng: pos.lng,
        actualizado_en: new Date().toISOString(),
      },
      { onConflict: 'encuestador_id' }
    )
  } catch (e) {
    console.error('[location] error:', e)
  }
}