import { useState, useEffect, useRef } from 'react'
import { pedirPermisoUbicacion, getUbicacionActual, actualizarUbicacion } from '../lib/location'
import { supabase } from '../lib/supabase'
import { puntoEnPoligono } from '../lib/location'

// Zona activa: la encuesta cuya zona contiene la ubicación actual
export type ZonaActiva = {
  zona_id: string
  encuesta_id: string
  encuesta_nombre: string
  zona_geojson: any
}

export function useGeofencing(encuestadorId: string, organizacionId: string) {
  const [permiso,      setPermiso]      = useState<boolean | null>(null)
  const [ubicacion,    setUbicacion]    = useState<{ lat: number; lng: number } | null>(null)
  const [zonas,        setZonas]        = useState<ZonaActiva[]>([])   // todas las zonas del encuestador
  const [zonaActual,   setZonaActual]   = useState<ZonaActiva | null>(null) // zona en la que está ahora
  const [bloqueado,    setBloqueado]    = useState<boolean | null>(null)    // null = calculando
  const intervalRef = useRef<any>(null)

  // Cargar zonas via get_zonas_encuestador (nueva función del modelo encuesta_zonas)
  useEffect(() => {
    if (!encuestadorId) return
    fetchZonas()
  }, [encuestadorId])

  async function fetchZonas() {
    const { data, error } = await supabase.rpc('get_zonas_encuestador', {
      p_encuestador_id: encuestadorId,
    })
    if (error) {
      console.error('fetchZonas error:', error.message)
      return
    }
    setZonas(data || [])
  }

  // Tracking de ubicación
  useEffect(() => {
    pedirPermisoUbicacion().then(ok => {
      setPermiso(ok)
      if (ok) iniciarTracking()
    })
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [])

  // Re-evaluar zona cada vez que cambia ubicación o zonas
  useEffect(() => {
    if (!ubicacion) return
    evaluarZona(ubicacion)
  }, [ubicacion?.lat, ubicacion?.lng, zonas.length])

  function evaluarZona(pos: { lat: number; lng: number }) {
    if (zonas.length === 0) {
      // Sin zonas asignadas → no bloqueado (encuestador sin restricción geográfica)
      setBloqueado(false)
      setZonaActual(null)
      return
    }

    // Buscar en qué zona está
    const zona = zonas.find(z => {
      if (!z.geofencing_activo) return true  // zona sin geofencing → siempre dentro
      const features = z.zona_geojson?.features
      if (!features) return true
      const zonaFeat = features.find((f: any) => f.properties?.tipo === 'zona')
      if (!zonaFeat) return true
      const coords = zonaFeat.geometry?.coordinates?.[0]
      if (!coords) return true
      return puntoEnPoligono(pos.lng, pos.lat, coords)
    })

    if (zona) {
      setBloqueado(false)
      setZonaActual(zona)
    } else {
      setBloqueado(true)  // fuera de todas las zonas → bloqueado
      setZonaActual(null)
    }
  }

  async function iniciarTracking() {
    const pos = await getUbicacionActual()
    setUbicacion(pos)
    if (encuestadorId && organizacionId) actualizarUbicacion(encuestadorId, organizacionId)

    intervalRef.current = setInterval(async () => {
      const pos = await getUbicacionActual()
      setUbicacion(pos)
      if (encuestadorId && organizacionId) actualizarUbicacion(encuestadorId, organizacionId)
    }, 30000)
  }

  return { permiso, ubicacion, bloqueado, zonaActual, zonas, refetchZonas: fetchZonas }
}