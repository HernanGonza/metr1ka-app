import { useState, useEffect, useRef } from 'react'
import {
  pedirPermisoUbicacion,
  iniciarTrackingSingleton,
  setLocationCallback,
  detenerTrackingSingleton,
} from '../lib/location'
import { supabase } from '../lib/supabase'
import { puntoEnPoligono } from '../lib/location'

export type ZonaActiva = {
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
  const [permiso,    setPermiso]    = useState<boolean | null>(null)
  const [ubicacion,  setUbicacion]  = useState<{ lat: number; lng: number } | null>(null)
  const [zonas,      setZonas]      = useState<ZonaActiva[]>([])
  const [zonaActual, setZonaActual] = useState<ZonaActiva | null>(null)
  const [bloqueado,  setBloqueado]  = useState<boolean | null>(null)
  const zonasRef = useRef<ZonaActiva[]>([])

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
  }

  // Tracking singleton — solo cuando hay ID válido
  useEffect(() => {
    if (!encuestadorId || !organizacionId) return

    _instanceCount++
    console.log('[geofencing] Instancia activa, total:', _instanceCount)

    let mounted = true

    pedirPermisoUbicacion().then(async (ok) => {
      if (!mounted) return
      setPermiso(ok)
      if (!ok) {
        console.warn('[geofencing] Permiso de ubicación denegado')
        return
      }

      // Registrar callback para recibir actualizaciones de posición
      setLocationCallback((pos) => {
        if (!mounted) return
        setUbicacion(pos)
        evaluarZona(pos, zonasRef.current)
      })

      // Iniciar el singleton — si ya corre para este encuestador, no hace nada
      await iniciarTrackingSingleton(encuestadorId, organizacionId)
    })

    return () => {
      mounted = false
      _instanceCount--
      console.log('[geofencing] Instancia destruida, restantes:', _instanceCount)
      // Detener tracking solo cuando no queda ninguna instancia
      if (_instanceCount <= 0) {
        _instanceCount = 0
        setLocationCallback(null)
        detenerTrackingSingleton()
      }
    }
  }, [encuestadorId, organizacionId])

  // Re-evaluar zona cuando cambian las zonas
  useEffect(() => {
    if (!ubicacion) return
    evaluarZona(ubicacion, zonas)
  }, [zonas])

  function evaluarZona(pos: { lat: number; lng: number }, zonasActuales: ZonaActiva[]) {
    if (zonasActuales.length === 0) {
      setZonaActual(null)
      return
    }

    const zona = zonasActuales.find(z => {
      if (!z.geofencing_activo) return true
      const features = z.area_geojson?.features
      if (!features) return true
      const zonaFeat = features.find((f: any) => f.properties?.tipo === 'zona')
      if (!zonaFeat) return true
      const coords = zonaFeat.geometry?.coordinates?.[0]
      if (!coords || coords.length < 3) return true
      const dentro = puntoEnPoligono(pos.lng, pos.lat, coords)
      console.log('[geofencing]', z.encuesta_nombre, '-> dentro:', dentro)
      return dentro
    })

    if (zona) {
      setBloqueado(false)
      setZonaActual(zona)
    } else {
      console.log('[geofencing] BLOQUEADO — fuera de todas las zonas')
      setBloqueado(true)
      setZonaActual(null)
    }
  }

  return { permiso, ubicacion, bloqueado, zonaActual, zonas, refetchZonas: fetchZonas }
}