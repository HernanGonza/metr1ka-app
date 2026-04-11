import { useState, useEffect } from 'react'
import { supabase } from './supabase'

export type Perfil = {
  id: string
  rol: 'superadmin' | 'editor' | 'admin' | 'gestor' | 'coordinador' | 'encuestador'
  nombre_completo: string
  organizacion_id: string | null
  activo: boolean
  motivo_desactivacion?: string | null
}

export function useAuth() {
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) fetchPerfil(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) fetchPerfil(session.user.id)
      else { setPerfil(null); setLoading(false) }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchPerfil(userId: string) {
    const { data } = await supabase
      .from('perfiles')
      .select('*')
      .eq('id', userId)
      .single()
    setPerfil(data)
    setLoading(false)
  }

  async function signOut() {
    await supabase.auth.signOut()
    setPerfil(null)
  }

  return { perfil, loading, signOut }
}
