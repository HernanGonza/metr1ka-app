import { useState, useEffect, useRef } from 'react'
import {
  pedirPermisoUbicacion,
  iniciarTrackingSingleton,
  setLocationCallback,
  detenerTrackingSingleton,
} from '../lib/location'
import { supabase } from '../lib/supabase'
import { puntoEnPoligono } from '../lib/location'

export type ZonaInfo = {
  zona_id: string
  encuesta_id: string
  encuesta_nombre: string
  area_geojson: any
  geofencing_activo: boolean
  equipo_id: string
}

// Contador global de instancias activas del hook
let _instanceCount = 0

export function useGeofencing(encuestadorId: string, organizacionId: string) {
  const [permiso,   setPermiso]   = useState<boolean | null>(null)
  const [ubicacion, setUbicacion] = useState<{ lat: number; lng: number } | null>(null)
  const [zonas,     setZonas]     = useState<ZonaInfo[]>([])
  const zonasRef = useRef<ZonaInfo[]>([])

  // Cargar zonas cuando hay un ID válido
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
    const lista = data || []
    zonasRef.current = lista
    setZonas(lista)
    console.log('[geofencing] Zonas cargadas:', lista.length)
  }

  // Tracking singleton
  useEffect(() => {
    if (!encuestadorId || !organizacionId) return

    _instanceCount++
    let mounted = true

    pedirPermisoUbicacion().then(async (ok) => {
      if (!mounted) return
      setPermiso(ok)
      if (!ok) return

      setLocationCallback((pos) => {
        if (!mounted) return
        setUbicacion(pos)
      })

      await iniciarTrackingSingleton(encuestadorId, organizacionId)
    })

    return () => {
      mounted = false
      _instanceCount--
      if (_instanceCount <= 0) {
        _instanceCount = 0
        setLocationCallback(null)
        detenerTrackingSingleton()
      }
    }
  }, [encuestadorId, organizacionId])

  // Evaluar si una encuesta específica está disponible según la ubicación actual
  function encuestaEnZona(encuestaId: string): boolean | null {
    if (!ubicacion) return null  // GPS todavía no disponible

    const zonaEnc = zonas.find(z => z.encuesta_id === encuestaId)
    if (!zonaEnc) return null  // Sin zona asignada para esta encuesta
    if (!zonaEnc.geofencing_activo) return true  // Geofencing desactivado

    const features = zonaEnc.area_geojson?.features
    if (!features) return true
    const zonaFeat = features.find((f: any) => f.properties?.tipo === 'zona')
    if (!zonaFeat) return true
    const coords = zonaFeat.geometry?.coordinates?.[0]
    if (!coords || coords.length < 3) return true

    const dentro = puntoEnPoligono(ubicacion.lng, ubicacion.lat, coords)
    console.log('[geofencing]', zonaEnc.encuesta_nombre, '-> dentro:', dentro)
    return dentro
  }

  // Centro de la zona de una encuesta (para navegación)
  function centroZonaEncuesta(encuestaId: string): { lat: number; lng: number } | null {
    const zonaEnc = zonas.find(z => z.encuesta_id === encuestaId)
    if (!zonaEnc?.area_geojson?.features) return null
    const zonaFeat = zonaEnc.area_geojson.features.find((f: any) => f.properties?.tipo === 'zona')
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

  return { permiso, ubicacion, zonas, encuestaEnZona, centroZonaEncuesta, refetchZonas: fetchZonas }
}