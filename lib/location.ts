import * as Location from 'expo-location'
import { supabase } from './supabase'

export async function pedirPermisoUbicacion(): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync()
  return status === 'granted'
}

export async function getUbicacionActual() {
  const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
  return { lat: loc.coords.latitude, lng: loc.coords.longitude }
}

// Ray casting — mismo algoritmo que en web
export function puntoEnPoligono(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]   // xi = lng, yi = lat (formato GeoJSON)
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
  // GeoJSON usa [lng, lat], nosotros usamos lat/lng
  return puntoEnPoligono(lng, lat, coords)
}

export async function actualizarUbicacion(encuestadorId: string, organizacionId: string) {
  try {
    const { lat, lng } = await getUbicacionActual()
    await supabase.from('ubicaciones_encuestadores').upsert({
      encuestador_id: encuestadorId,
      organizacion_id: organizacionId,
      lat, lng,
      actualizado_en: new Date().toISOString(),
    })
  } catch {}
}
