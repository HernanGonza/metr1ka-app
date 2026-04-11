import { useEffect } from 'react'
import { Stack, useRouter, useSegments } from 'expo-router'
import { useAuth } from '../lib/auth'
import { View, ActivityIndicator } from 'react-native'

export default function RootLayout() {
  const { perfil, loading } = useAuth()
  const router   = useRouter()
  const segments = useSegments()

  useEffect(() => {
    if (loading) return

    if (!perfil) {
      router.replace('/login')
      return
    }

    if (!perfil.activo) {
      router.replace('/desactivado')
      return
    }

    const inAuth = segments[0] === 'login' || segments[0] === 'completar-perfil'
    if (inAuth) {
      switch (perfil.rol) {
        case 'admin':
        case 'gestor':
          router.replace('/(admin)/dashboard'); break
        case 'coordinador':
          router.replace('/(coordinador)/dashboard'); break
        case 'encuestador':
          router.replace('/(encuestador)/home'); break
        default:
          router.replace('/login')
      }
    }
  }, [perfil, loading])

  if (loading) return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f2f1ee' }}>
      <ActivityIndicator size="large" color="#1a472a" />
    </View>
  )

  return <Stack screenOptions={{ headerShown: false }} />
}
