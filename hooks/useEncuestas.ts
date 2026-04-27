// Este hook ya no se usa directamente — la lógica está en home.tsx
// Se mantiene como referencia pero sin el import roto de ZonaActiva

import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { puntoEnPoligono } from '../lib/location'

type ZonaActiva = {
  zona_id: string
  encuesta_id: string
  encuesta_nombre: string
  area_geojson: any
  geofencing_activo: boolean
  equipo_id: string
}

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

  useEffect(() => {
    if (!encuestadorId || !ubicacion) return
    setEncuestas(prev => prev.map(enc => ({
      ...enc,
      enZona: calcularEnZona(enc, ubicacion, zonaActual),
    })))
  }, [ubicacion?.lat, ubicacion?.lng, zonaActual?.zona_id])

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

  function calcularEnZona(
    enc: any,
    pos: { lat: number; lng: number } | undefined,
    zona: ZonaActiva | null | undefined
  ): boolean | null {
    if (!enc.geofencing_activo) return true
    if (!pos && !zona) return null
    if (zona) return zona.zona_id === enc.zona_id
    if (pos) return encuestaEnZona(pos.lat, pos.lng, enc.zona_geojson, enc.geofencing_activo)
    return null
  }

  async function autoAsignarYCargar() {
    setLoading(true)

    if (!autoAsignadoRef.current) {
      const { error: errAuto } = await supabase.rpc('auto_asignar_encuestador')
      if (errAuto) console.error('auto_asignar_encuestador:', errAuto.message)
      else autoAsignadoRef.current = true
    }

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

    const seen = new Map<string, any>()
    for (const enc of todas) {
      const prev = seen.get(enc.id)
      if (!prev || enc.enZona === true) seen.set(enc.id, enc)
    }
    const lista = Array.from(seen.values())

    encuestasIdsRef.current = lista.map((e: any) => e.id)
    setEncuestas(lista)
    setLoading(false)
  }

  return { encuestas, loading, refetch: autoAsignarYCargar }
}