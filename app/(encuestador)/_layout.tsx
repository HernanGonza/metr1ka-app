import { useEffect } from 'react'
import { Stack } from 'expo-router'
import { useAuth } from '../../lib/auth'
import {
  pedirPermisoUbicacion,
  iniciarTrackingSingleton,
  detenerTrackingSingleton,
} from '../../lib/location'
import { iniciarSyncAutomatico } from '../../lib/offlineQueue'

export default function EncuestadorLayout() {
  const { perfil } = useAuth()

  useEffect(() => {
    const id  = perfil?.id
    const org = perfil?.organizacion_id
    if (!id || !org) return

    pedirPermisoUbicacion().then(ok => {
      if (!ok) return
      iniciarTrackingSingleton(id, org)
    })

    return () => { detenerTrackingSingleton() }
  }, [perfil?.id, perfil?.organizacion_id])

  // Sincronizar cola offline cuando la app vuelve al frente
  useEffect(() => {
    const unsub = iniciarSyncAutomatico()
    return unsub
  }, [])

  return <Stack screenOptions={{ headerShown: false }} />
}