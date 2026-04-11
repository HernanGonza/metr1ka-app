import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { puntoEnPoligono } from '../lib/location'
import { ZonaActiva } from './useGeofencing'

// Evalúa si la ubicación está dentro de la zona geojson de una encuesta
function encuestaEnZona(
  lat: number,
  lng: number,
  zonaGeojson: any,
  geofencingActivo: boolean
): boolean {
  if (!geofencingActivo) return true
  if (!zonaGeojson?.features) return true
  const zonaFeat = zonaGeojson.features.find((f: any) => f.properties?.tipo === 'zona')
  if (!zonaFeat) return true
  const coords = zonaFeat.geometry?.coordinates?.[0]
  if (!coords) return true
  return puntoEnPoligono(lng, lat, coords)
}

export function useEncuestasEncuestador(
  encuestadorId: string,
  ubicacion?: { lat: number; lng: number },
  zonaActual?: ZonaActiva | null  // zona en la que está actualmente el encuestador
) {
  const [encuestas, setEncuestas] = useState<any[]>([])
  const [loading, setLoading]     = useState(true)
  const encuestasIdsRef           = useRef<string[]>([])

  useEffect(() => {
    if (!encuestadorId) return
    load()
  }, [encuestadorId, ubicacion?.lat, ubicacion?.lng, zonaActual?.zona_id])

  // Realtime — re-cargar si cambia alguna encuesta asignada
  useEffect(() => {
    if (!encuestasIdsRef.current.length) return
    const canal = supabase
      .channel(`encuestas-enc-${encuestadorId}-${Date.now()}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'encuestas',
      }, (payload: any) => {
        const id = payload.new?.id
        if (!encuestasIdsRef.current.includes(id)) return
        load()
      })
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [encuestasIdsRef.current.length])

  async function load() {
    setLoading(true)

    // get_encuestas_encuestador ahora devuelve zona_geojson y geofencing_activo por encuesta
    const { data, error } = await supabase.rpc('get_encuestas_encuestador')

    if (error) {
      console.error('useEncuestas error:', error.message)
      setLoading(false)
      return
    }

    const lista = (data || []).map((enc: any) => {
      // Una encuesta está disponible solo si:
      // 1. No tiene geofencing activo → siempre disponible
      // 2. Tiene geofencing → solo si el encuestador está en ESA zona específica
      let enZona: boolean
      if (!enc.geofencing_activo) {
        enZona = true
      } else if (zonaActual) {
        // Está en la zona de esta encuesta específica?
        enZona = zonaActual.zona_id === enc.zona_id
      } else if (ubicacion) {
        // Fallback: evaluar geométricamente
        enZona = encuestaEnZona(ubicacion.lat, ubicacion.lng, enc.zona_geojson, enc.geofencing_activo)
      } else {
        enZona = true // sin ubicación aún → mostrar todo
      }
      return { ...enc, enZona }
    })

    encuestasIdsRef.current = lista.map((e: any) => e.id)
    setEncuestas(lista)
    setLoading(false)
  }

  return { encuestas, loading, refetch: load }
}