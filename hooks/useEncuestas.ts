import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { puntoEnPoligono } from '../lib/location'
import { ZonaActiva } from './useGeofencing'

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
  zonaActual?: ZonaActiva | null
) {
  const [encuestas, setEncuestas] = useState<any[]>([])
  const [loading, setLoading]     = useState(true)
  const encuestasIdsRef           = useRef<string[]>([])
  const autoAsignadoRef           = useRef(false)

  useEffect(() => {
    if (!encuestadorId) return
    autoAsignarYCargar()
  }, [encuestadorId])

  // Re-evaluar zonas cuando cambia ubicación
  useEffect(() => {
    if (!encuestadorId || !ubicacion) return
    setEncuestas(prev => prev.map(enc => ({
      ...enc,
      enZona: calcularEnZona(enc, ubicacion, zonaActual),
    })))
  }, [ubicacion?.lat, ubicacion?.lng, zonaActual?.zona_id])

  // Realtime
  useEffect(() => {
    if (!encuestasIdsRef.current.length) return
    const canal = supabase
      .channel(`encuestas-enc-${encuestadorId}-${Date.now()}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'encuestas',
      }, () => autoAsignarYCargar())
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [encuestasIdsRef.current.length])

  function calcularEnZona(enc: any, pos: { lat: number; lng: number } | undefined, zona: ZonaActiva | null | undefined): boolean {
    if (!enc.geofencing_activo) return true
    if (zona) return zona.zona_id === enc.zona_id
    if (pos) return encuestaEnZona(pos.lat, pos.lng, enc.zona_geojson, enc.geofencing_activo)
    return true
  }

  async function autoAsignarYCargar() {
    setLoading(true)

    // 1. Crear asignaciones automáticamente si el encuestador pertenece a un equipo
    //    que tiene zonas asignadas. Idempotente — no duplica si ya existen.
    if (!autoAsignadoRef.current) {
      const { error: errAuto } = await supabase.rpc('auto_asignar_encuestador')
      if (errAuto) console.error('auto_asignar_encuestador:', errAuto.message)
      else autoAsignadoRef.current = true
    }

    // 2. Cargar encuestas (ya tienen asignacion_id propio del encuestador)
    const { data, error } = await supabase.rpc('get_encuestas_encuestador')
    if (error) {
      console.error('get_encuestas_encuestador:', error.message)
      setLoading(false)
      return
    }

    const todas = (data || []).map((enc: any) => ({
      ...enc,
      enZona: calcularEnZona(enc, ubicacion, zonaActual),
    }))

    // Deduplicar por encuesta.id: si una misma encuesta tiene varias zonas,
    // mostrar solo la que está activa (enZona=true), o la primera si ninguna lo está
    const seen = new Map<string, any>()
    for (const enc of todas) {
      const prev = seen.get(enc.id)
      if (!prev || enc.enZona === true) {
        seen.set(enc.id, enc)
      }
    }
    const lista = Array.from(seen.values())

    encuestasIdsRef.current = lista.map((e: any) => e.id)
    setEncuestas(lista)
    setLoading(false)
  }

  return { encuestas, loading, refetch: autoAsignarYCargar }
}