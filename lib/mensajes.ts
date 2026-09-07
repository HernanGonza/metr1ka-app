import { useEffect } from 'react'
import { supabase } from './supabase'

export type MensajePendiente = {
  destinatario_id: string
  mensaje_id: string
  titulo: string
  texto: string
  creado_en: string
}

// Mensajes que todavía no fueron leídos por este encuestador, más viejo
// primero (se muestran en orden de llegada, uno atrás del otro).
export async function fetchMensajesPendientes(encuestadorId: string): Promise<MensajePendiente[]> {
  if (!encuestadorId) return []
  const { data, error } = await supabase
    .from('mensajes_destinatarios')
    .select('id, mensaje_id, mensajes(titulo, texto, creado_en)')
    .eq('encuestador_id', encuestadorId)
    .is('leido_en', null)
    .order('mensaje_id', { ascending: true })

  if (error) {
    console.error('fetchMensajesPendientes:', error)
    return []
  }

  return (data || []).map((row: any) => ({
    destinatario_id: row.id,
    mensaje_id: row.mensaje_id,
    titulo: row.mensajes?.titulo ?? '',
    texto: row.mensajes?.texto ?? '',
    creado_en: row.mensajes?.creado_en ?? '',
  }))
}

export async function marcarMensajeLeido(destinatarioId: string) {
  const { error } = await supabase.rpc('marcar_mensaje_leido', { p_destinatario_id: destinatarioId })
  if (error) console.error('marcarMensajeLeido:', error)
}

// Se dispara ante cada INSERT en mensajes_destinatarios para este
// encuestador — cubre tanto mensajes individuales como los de fan-out por
// equipo/organización, ya que el fan-out inserta una fila por destinatario.
export function useMensajesRealtime(encuestadorId: string | undefined, onNuevo: () => void) {
  useEffect(() => {
    if (!encuestadorId) return
    const channel = supabase.channel(`mensajes-${encuestadorId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'mensajes_destinatarios',
        filter: `encuestador_id=eq.${encuestadorId}`,
      }, onNuevo)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [encuestadorId])
}
