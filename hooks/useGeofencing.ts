import { useState, useEffect, useRef } from 'react'
import {
  pedirPermisoUbicacion,
  iniciarTrackingSingleton,
  setLocationCallback,
  removeLocationCallback,
  detenerTrackingSingleton,
  puntoEnPoligono,
} from '../lib/location'
import { supabase } from '../lib/supabase'

export type ZonaInfo = {
  zona_id:            string
  encuesta_id:        string
  encuesta_nombre:    string
  area_geojson:       any
  geofencing_activo:  boolean
  equipo_id:          string
}

// Contador global de instancias activas del hook
let _instanceCount = 0

export function useGeofencing(encuestadorId: string, organizacionId: string) {
  const [ubicacion, setUbicacion] = useState<{ lat: number; lng: number } | null>(null)
  const [zonas,     setZonas]     = useState<ZonaInfo[]>([])
  const zonasRef = useRef<ZonaInfo[]>([])

  // Cargar zonas
  useEffect(() => {
    if (!encuestadorId) return
    fetchZonas()
  }, [encuestadorId])

  async function fetchZonas() {
    const { data, error } = await supabase.rpc('get_zonas_encuestador', {
      p_encuestador_id: encuestadorId,
    })
    if (error) {
      console.error('[geofencing] fetchZonas error:', error.message)
      return
    }
    const lista: ZonaInfo[] = data || []
    zonasRef.current = lista
    setZonas(lista)
    console.log('[geofencing] Zonas cargadas:', lista.length)
  }

  // Tracking GPS
  useEffect(() => {
    if (!encuestadorId || !organizacionId) return

    _instanceCount++
    let active = true

    // Handler de ubicación para este componente
    const handleLocation = (pos: { lat: number; lng: number }) => {
      if (!active) return
      setUbicacion(pos)
    }

    // Registrar callback ANTES de iniciar (para recibir el replay si ya hay ubicación)
    setLocationCallback(handleLocation)

    pedirPermisoUbicacion().then(ok => {
      if (!active || !ok) return
      iniciarTrackingSingleton(encuestadorId, organizacionId)
    })

    return () => {
      active = false
      removeLocationCallback(handleLocation)
      _instanceCount--
      if (_instanceCount <= 0) {
        _instanceCount = 0
        detenerTrackingSingleton()
      }
    }
  }, [encuestadorId, organizacionId])

  // Evalúa si el usuario está dentro de la zona de una encuesta específica
  // Retorna: true = en zona, false = fuera, null = sin GPS todavía
  function encuestaEnZona(encuestaId: string): boolean | null {
    if (!ubicacion) return null

    const zonaEnc = zonasRef.current.find(z => z.encuesta_id === encuestaId)
    if (!zonaEnc) return null             // Sin zona asignada
    if (!zonaEnc.geofencing_activo) return true  // Geofencing desactivado → siempre disponible

    const features = zonaEnc.area_geojson?.features
    if (!features?.length) return true
    const zonaFeat = features.find((f: any) => f.properties?.tipo === 'zona')
    if (!zonaFeat) return true
    const coords = zonaFeat.geometry?.coordinates?.[0]
    if (!coords || coords.length < 3) return true

    const dentro = puntoEnPoligono(ubicacion.lng, ubicacion.lat, coords)
    console.log('[geofencing]', zonaEnc.encuesta_nombre, '→ dentro:', dentro)
    return dentro
  }

  // Centro de la zona para mostrar dirección al encuestador
  function centroZonaEncuesta(encuestaId: string): { lat: number; lng: number } | null {
    const zonaEnc = zonasRef.current.find(z => z.encuesta_id === encuestaId)
    if (!zonaEnc?.area_geojson?.features) return null
    const zonaFeat = zonaEnc.area_geojson.features.find(
      (f: any) => f.properties?.tipo === 'zona'
    )
    if (!zonaFeat) return null
    const coords = zonaFeat.geometry?.coordinates?.[0]
    if (!coords?.length) return null
    const lats = coords.map((c: number[]) => c[1])
    const lngs = coords.map((c: number[]) => c[0])
    return {
      lat: lats.reduce((a: number, b: number) => a + b, 0) / lats.length,
      lng: lngs.reduce((a: number, b: number) => a + b, 0) / lngs.length,
    }
  }

  return {
    ubicacion,
    zonas,
    encuestaEnZona,
    centroZonaEncuesta,
    refetchZonas: fetchZonas,
  }
}