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
    // GPS no disponible (emulador, servicios desactivados)
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

export async function actualizarUbicacion(encuestadorId: string, organizacionId: string) {
  try {
    const pos = await getUbicacionActual()
    if (!pos) return  // sin GPS, no actualizar
    await supabase.from('ubicaciones_encuestadores').upsert({
      encuestador_id:  encuestadorId,
      organizacion_id: organizacionId,
      lat:             pos.lat,
      lng:             pos.lng,
      actualizado_en:  new Date().toISOString(),
    })
  } catch {}
}