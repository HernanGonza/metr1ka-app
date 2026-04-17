import * as Location from 'expo-location'
import { supabase } from './supabase'

export async function pedirPermisoUbicacion(): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync()
  return status === 'granted'
}

export async function getUbicacionActual(): Promise<{ lat: number; lng: number } | null> {
  try {
    const loc = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 5000,
    })
    return { lat: loc.coords.latitude, lng: loc.coords.longitude }
  } catch {
    try {
      const loc = await Location.getLastKnownPositionAsync()
      if (loc) return { lat: loc.coords.latitude, lng: loc.coords.longitude }
    } catch {}
    return null
  }
}

// Ray casting — punto en polígono GeoJSON [lng, lat]
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

export function encuestadorEnZona(lat: number, lng: number, areaGeoJSON: any): boolean {
  if (!areaGeoJSON?.features) return true
  const zonaFeat = areaGeoJSON.features.find((f: any) => f.properties?.tipo === 'zona')
  if (!zonaFeat) return true
  const coords = zonaFeat.geometry?.coordinates?.[0]
  if (!coords) return true
  return puntoEnPoligono(lng, lat, coords)
}

// ── Singleton de tracking ─────────────────────────────────────────
// Garantiza que solo hay UN intervalo corriendo sin importar cuántas
// instancias de useGeofencing existan en la pantalla.
let _trackingId: string | null = null
let _trackingInterval: any = null
let _onLocationUpdate: ((pos: { lat: number; lng: number }) => void) | null = null

export function setLocationCallback(cb: ((pos: { lat: number; lng: number }) => void) | null) {
  _onLocationUpdate = cb
}

export async function iniciarTrackingSingleton(encuestadorId: string, organizacionId: string) {
  // Si ya está corriendo para este encuestador, no hacer nada
  if (_trackingId === encuestadorId && _trackingInterval) {
    console.log('[location] Tracking ya activo para', encuestadorId)
    return
  }

  // Si hay un tracking anterior de otro usuario, detenerlo
  if (_trackingInterval) {
    clearInterval(_trackingInterval)
    _trackingInterval = null
    console.log('[location] Tracking anterior detenido')
  }

  _trackingId = encuestadorId

  // Primera actualización inmediata
  const pos = await getUbicacionActual()
  if (pos) {
    console.log('[location] Posición inicial:', pos.lat, pos.lng)
    _onLocationUpdate?.(pos)
    await actualizarUbicacion(encuestadorId, organizacionId)
  } else {
    console.warn('[location] Sin GPS en arranque')
  }

  // Intervalo cada 15 segundos
  _trackingInterval = setInterval(async () => {
    const pos = await getUbicacionActual()
    if (!pos) {
      console.warn('[location] Tick sin GPS')
      return
    }
    console.log('[location] Tick:', pos.lat, pos.lng)
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
    console.log('[location] Tracking singleton detenido')
  }
}

export async function actualizarUbicacion(encuestadorId: string, organizacionId: string) {
  try {
    const pos = await getUbicacionActual()
    if (!pos) {
      console.warn('[location] Sin GPS — no se actualiza ubicación')
      return
    }
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
      console.error('[location] Error upsert:', error.message, error.code, error.details)
    } else {
      console.log('[location] ✓ Ubicación guardada:', pos.lat, pos.lng)
    }
  } catch (e) {
    console.error('[location] Exception:', e)
  }
}