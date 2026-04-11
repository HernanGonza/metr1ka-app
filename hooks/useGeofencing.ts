import { useState, useEffect, useRef } from 'react'
import { pedirPermisoUbicacion, getUbicacionActual, actualizarUbicacion, encuestadorEnZona } from '../lib/location'
import { supabase } from '../lib/supabase'

export function useGeofencing(encuestadorId: string, organizacionId: string) {
  const [permiso,      setPermiso]      = useState<boolean | null>(null)
  const [ubicacion,    setUbicacion]    = useState<{ lat: number, lng: number } | null>(null)
  const [enZonaEquipo, setEnZonaEquipo] = useState<boolean | null>(null)
  const [zonaEquipo,   setZonaEquipo]   = useState<any>(null)
  const intervalRef = useRef<any>(null)

  // ── Cargar zona del equipo + suscripción realtime ──
  useEffect(() => {
  if (!encuestadorId) return

  fetchZonaEquipo()

  let canal: any = null

  async function suscribirRealtime() {
    const { data } = await supabase
      .from('equipo_encuestadores')
      .select('equipo_id')
      .eq('encuestador_id', encuestadorId)
      .limit(1)
      .single()

    if (!data?.equipo_id) return
    const equipoId = data.equipo_id

    // Usar nombre único con timestamp para evitar duplicados
    const channelName = `equipo-zona-${equipoId}-${Date.now()}`

    canal = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'equipos',
          filter: `id=eq.${equipoId}`,
        },
        (payload: any) => {
          console.log('Zona equipo actualizada en tiempo real')
          const nuevaZona = payload.new?.area_geojson
          setZonaEquipo(nuevaZona || null)
        }
      )
      .subscribe()
  }

  suscribirRealtime()

  return () => {
    if (canal) supabase.removeChannel(canal)
  }
}, [encuestadorId])

  async function fetchZonaEquipo() {
    const { data } = await supabase
      .from('equipo_encuestadores')
      .select('equipos!inner(area_geojson)')
      .eq('encuestador_id', encuestadorId)
      .limit(1)
      .single()
    const zona = (data as any)?.equipos?.area_geojson
    setZonaEquipo(zona || null)
  }

  // ── Tracking de ubicación ──
  useEffect(() => {
    pedirPermisoUbicacion().then(ok => {
      setPermiso(ok)
      if (ok) iniciarTracking()
    })
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [])

  // ── Re-evaluar zona cada vez que cambia ubicación o zona ──
  useEffect(() => {
    if (!ubicacion) return
    if (!zonaEquipo) {
      setEnZonaEquipo(true)
      return
    }
    const enZona = encuestadorEnZona(ubicacion.lat, ubicacion.lng, zonaEquipo)
    setEnZonaEquipo(enZona)
  }, [ubicacion, zonaEquipo])

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

  return { permiso, ubicacion, enZonaEquipo }
}