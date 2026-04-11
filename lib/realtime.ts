import { useEffect, useRef } from 'react'
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
