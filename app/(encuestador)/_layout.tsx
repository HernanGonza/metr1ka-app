import { useEffect } from 'react'
import { Stack } from 'expo-router'
import { useAuth } from '../../lib/auth'
import {
  pedirPermisoUbicacion,
  iniciarTrackingSingleton,
  detenerTrackingSingleton,
} from '../../lib/location'

// El layout solo inicia el singleton de tracking
// home.tsx es el único que llama useGeofencing y evalúa zonas por encuesta
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

  return <Stack screenOptions={{ headerShown: false }} />
}