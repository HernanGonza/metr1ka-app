import { Stack } from 'expo-router'
import { useAuth } from '../../lib/auth'
import { useGeofencing } from '../../hooks/useGeofencing'
import { AlertaUbicacion } from '../../components/UI/AlertaUbicacion'

export default function EncuestadorLayout() {
  const { perfil } = useAuth()

  // Iniciar tracking GPS — sin bloqueo global de zona
  // El geofencing se evalúa por encuesta en home.tsx
  useGeofencing(
    perfil?.id || '',
    perfil?.organizacion_id || ''
  )

  return <Stack screenOptions={{ headerShown: false }} />
}