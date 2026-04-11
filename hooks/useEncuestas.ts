import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { encuestadorEnZona } from '../lib/location'

export function useEncuestasEncuestador(encuestadorId: string, ubicacion?: { lat: number, lng: number }) {
  const [encuestas, setEncuestas] = useState<any[]>([])
  const [loading, setLoading]     = useState(true)
  const encuestasIdsRef           = useRef<string[]>([])

  useEffect(() => {
    if (!encuestadorId) return
    load()
  }, [encuestadorId, ubicacion?.lat, ubicacion?.lng])

  // Realtime — escuchar cambios en las encuestas asignadas
  useEffect(() => {
    if (!encuestasIdsRef.current.length) return

    const canal = supabase
      .channel(`encuestas-zona-${encuestadorId}-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'encuestas',
        },
        (payload: any) => {
          const encuestaId = payload.new?.id
          if (!encuestasIdsRef.current.includes(encuestaId)) return
          console.log('Zona encuesta actualizada en tiempo real:', encuestaId)
          // Re-evaluar enZona con la nueva zona
          setEncuestas(prev => prev.map(enc => {
            if (enc.id !== encuestaId) return enc
            const nuevaZona = payload.new?.area_geojson
            const enZona = ubicacion
              ? encuestadorEnZona(ubicacion.lat, ubicacion.lng, nuevaZona)
              : true
            return { ...enc, area_geojson: nuevaZona, enZona }
          }))
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(canal) }
  }, [encuestasIdsRef.current.length, ubicacion?.lat, ubicacion?.lng])

  async function load() {
  setLoading(true)

  // ✅ Llamada directa a la RPC optimizada (bypassea RLS overhead)
  const { data, error } = await supabase.rpc('get_encuestas_encuestador')

  if (error) {
    console.error('useEncuestas error:', error.message)
    setLoading(false)
    return
  }

  // data ya viene como array de objetos con la estructura exacta
  const lista = (data || []).map(enc => {
    if (enc.estado_produccion !== 'publicada') return null
    const enZona = ubicacion
      ? encuestadorEnZona(ubicacion.lat, ubicacion.lng, enc.area_geojson)
      : true
    return { ...enc, enZona }
  }).filter(Boolean)

  encuestasIdsRef.current = lista.map((e: any) => e.id)
  setEncuestas(lista)
  setLoading(false)
}

  return { encuestas, loading, refetch: load }
}