import { useEffect, useRef } from 'react'
import { AppState, AppStateStatus } from 'react-native'
import { supabase } from './supabase'

export function useRealtimeUbicaciones(orgId: string, onUpdate: (data: any) => void) {
  useEffect(() => {
    if (!orgId) return
    const channel = supabase.channel(`ubicaciones-${orgId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public',
        table: 'ubicaciones_encuestadores',
      }, ({ new: pos }) => onUpdate(pos))
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [orgId])
}

export function useRealtimeSesiones(encuestaId: string, onNueva: () => void) {
  useEffect(() => {
    if (!encuestaId) return
    const channel = supabase.channel(`sesiones-${encuestaId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public',
        table: 'sesiones_respuesta',
      }, onNueva)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [encuestaId])
}

// Sección 7 del plan (PLAN-tiempo-encuestas-y-mensajes.md): varias
// pantallas piden sus datos una sola vez al montarse y no los vuelven a
// pedir solas — la única forma de ver un cambio hecho desde el panel es
// pull-to-refresh manual o cerrar/reabrir la app. Mismo patrón que ya usa
// el panel web en EncuestaDetalle.jsx (realtime + polling de respaldo),
// más el AppState que lib/offlineQueue.ts ya usa para relanzar la
// sincronización al volver a primer plano.
//
// callbackRef evita que el efecto (y por lo tanto el listener/intervalo)
// se recree en cada render solo porque el caller no memoizó el callback
// con useCallback — siempre se ejecuta la versión más reciente.
export function useAutoRefetch(callback: () => void, intervalMs = 60_000) {
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') callbackRef.current()
    })
    const interval = setInterval(() => callbackRef.current(), intervalMs)
    return () => {
      sub.remove()
      clearInterval(interval)
    }
  }, [intervalMs])
}

// Cambios en el polígono de una zona de la encuesta (edición desde el panel
// web) — complementa a useRealtimeAsignaciones, que solo ve altas/bajas de
// asignación. Si la tabla no está en la publicación realtime no llega nada,
// y el polling de useAutoRefetch cubre igual.
export function useRealtimeZonasEncuesta(encuestaId: string, onChange: () => void) {
  useEffect(() => {
    if (!encuestaId) return
    const channel = supabase.channel(`zonas-${encuestaId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public',
        table: 'encuesta_zonas',
        filter: `encuesta_id=eq.${encuestaId}`,
      }, onChange)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [encuestaId])
}

// Encuestas/zonas asignadas al encuestador cambian vía asignaciones_encuesta
// (auto_asignar_encuestador, o el panel asignando manualmente). Filtrado por
// encuestador_id para no recibir cambios de otros encuestadores.
// `sufijo` evita reusar el canal de otra pantalla que siga montada (la home queda
// en el stack): agregar callbacks a un canal ya suscripto lanza error.
export function useRealtimeAsignaciones(encuestadorId: string, onChange: () => void, sufijo = '') {
  useEffect(() => {
    if (!encuestadorId) return
    const channel = supabase.channel(`asignaciones-${encuestadorId}${sufijo}`)
      .on('postgres_changes', {
        event: '*', schema: 'public',
        table: 'asignaciones_encuesta',
        filter: `encuestador_id=eq.${encuestadorId}`,
      }, onChange)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [encuestadorId])
}
