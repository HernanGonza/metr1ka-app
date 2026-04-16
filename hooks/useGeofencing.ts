import { useState, useEffect, useRef } from 'react'
import { pedirPermisoUbicacion, getUbicacionActual, actualizarUbicacion } from '../lib/location'
import { supabase } from '../lib/supabase'
import { puntoEnPoligono } from '../lib/location'

export type ZonaActiva = {
  zona_id: string
  encuesta_id: string
  encuesta_nombre: string
  area_geojson: any        // el campo real que devuelve get_zonas_encuestador
  geofencing_activo: boolean
  equipo_id: string
}

export function useGeofencing(encuestadorId: string, organizacionId: string) {
  const [permiso,    setPermiso]    = useState<boolean | null>(null)
  const [ubicacion,  setUbicacion]  = useState<{ lat: number; lng: number } | null>(null)
  const [zonas,      setZonas]      = useState<ZonaActiva[]>([])
  const [zonaActual, setZonaActual] = useState<ZonaActiva | null>(null)
  const [bloqueado,  setBloqueado]  = useState<boolean | null>(null)  // null = todavia calculando
  const intervalRef  = useRef<any>(null)
  const zonasRef     = useRef<ZonaActiva[]>([])  // ref para acceder en el closure del interval

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

  // Tracking
  useEffect(() => {
    pedirPermisoUbicacion().then(ok => {
      setPermiso(ok)
      if (ok) iniciarTracking()
    })
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [])

  // Re-evaluar cuando cambia ubicacion o zonas
  useEffect(() => {
    if (!ubicacion) return
    evaluarZona(ubicacion, zonas)
  }, [ubicacion?.lat, ubicacion?.lng, zonas])

  function evaluarZona(pos: { lat: number; lng: number }, zonasActuales: ZonaActiva[]) {
    // Si todavia no cargaron las zonas, no bloqueamos ni liberamos
    if (zonasActuales.length === 0) {
      // Zonas aún no cargadas — mantener estado null (calculando)
      // para no bloquear ni desbloquear hasta tener datos reales.
      // setBloqueado(null) es el estado inicial, no hacer nada aquí.
      setZonaActual(null)
      return
    }

    const zona = zonasActuales.find(z => {
      // Si la zona no tiene geofencing activo, siempre esta dentro
      if (!z.geofencing_activo) return true

      // area_geojson es un FeatureCollection con features tipo 'zona', 'manzana'
      const features = z.area_geojson?.features
      if (!features) return true

      const zonaFeat = features.find((f: any) => f.properties?.tipo === 'zona')
      if (!zonaFeat) return true

      const coords = zonaFeat.geometry?.coordinates?.[0]
      if (!coords || coords.length < 3) return true

      const dentro = puntoEnPoligono(pos.lng, pos.lat, coords)
      console.log('[geofencing]', z.encuesta_nombre, '-> dentro:', dentro, 'pos:', pos.lat, pos.lng)
      return dentro
    })

    if (zona) {
      setBloqueado(false)
      setZonaActual(zona)
    } else {
      console.log('[geofencing] BLOQUEADO - fuera de todas las zonas')
      setBloqueado(true)
      setZonaActual(null)
    }
  }

  async function iniciarTracking() {
    const pos = await getUbicacionActual()
    if (pos) setUbicacion(pos)
    if (encuestadorId && organizacionId) actualizarUbicacion(encuestadorId, organizacionId)

    intervalRef.current = setInterval(async () => {
      const pos = await getUbicacionActual()
      if (!pos) return  // GPS no disponible, ignorar este tick
      setUbicacion(pos)
      if (encuestadorId && organizacionId) actualizarUbicacion(encuestadorId, organizacionId)
      evaluarZona(pos, zonasRef.current)
    }, 30000)
  }

  return { permiso, ubicacion, bloqueado, zonaActual, zonas, refetchZonas: fetchZonas }
}