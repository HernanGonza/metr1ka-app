import { useEffect, useState } from 'react'
import { Stack, useRouter, useSegments } from 'expo-router'
import { useAuth } from '../lib/auth'
import { View, Text, StyleSheet, Animated, Image } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'

// Splash screen animado
function SplashScreen({ onFinish }: { onFinish: () => void }) {
  const opacity  = new Animated.Value(0)
  const scale    = new Animated.Value(0.85)
  const progress = new Animated.Value(0)

  useEffect(() => {
    Animated.sequence([
      // Fade + scale in
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, tension: 80, friction: 8, useNativeDriver: true }),
      ]),
      // Mostrar barra de progreso
      Animated.timing(progress, { toValue: 1, duration: 900, useNativeDriver: false }),
      // Pausa
      Animated.delay(200),
    ]).start(() => {
      // Fade out
      Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }).start(onFinish)
    })
  }, [])

  return (
    <View style={ss.container}>
      <Animated.View style={[ss.content, { opacity, transform: [{ scale }] }]}>
        {/* Logo usando SVG inlined como View */}
        <View style={ss.logoWrap}>
          <Text style={ss.logoText}>METR</Text>
          <View style={ss.logoAccent}><Text style={ss.logoAccentText}>1</Text></View>
          <Text style={ss.logoText}>KA</Text>
        </View>
        <Text style={ss.tagline}>Encuestas de campo en tiempo real</Text>
        <View style={ss.progressTrack}>
          <Animated.View style={[ss.progressFill, { width: progress.interpolate({ inputRange: [0,1], outputRange: ['0%','100%'] }) }]} />
        </View>
      </Animated.View>
      <Text style={ss.footer}>Powered by Paralelo Software Studio</Text>
    </View>
  )
}

export default function RootLayout() {
  const { perfil, loading } = useAuth()
  const router   = useRouter()
  const segments = useSegments()
  const [splashDone, setSplashDone] = useState(false)

  useEffect(() => {
    if (loading || !splashDone) return

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
  }, [perfil, loading, splashDone])

  if (!splashDone) {
    return (
      <SafeAreaProvider>
        <SplashScreen onFinish={() => setSplashDone(true)} />
      </SafeAreaProvider>
    )
  }

  if (loading) return (
    <SafeAreaProvider>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0f0f0f' }}>
        <Text style={{ color: '#fff', fontSize: 13, opacity: 0.5, marginTop: 16 }}>Cargando...</Text>
      </View>
    </SafeAreaProvider>
  )

  return (
    <SafeAreaProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </SafeAreaProvider>
  )
}

const ss = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#0f0f0f', alignItems: 'center', justifyContent: 'center' },
  content:        { alignItems: 'center', gap: 16, width: '100%', paddingHorizontal: 48 },
  logoWrap:       { flexDirection: 'row', alignItems: 'center', gap: 0 },
  logoText:       { fontSize: 48, fontWeight: '900', color: '#fff', letterSpacing: -2 },
  logoAccent:     { backgroundColor: '#4ade80', borderRadius: 8, paddingHorizontal: 4, paddingVertical: 2, marginHorizontal: 2 },
  logoAccentText: { fontSize: 48, fontWeight: '900', color: '#0f0f0f', letterSpacing: -2 },
  tagline:        { fontSize: 13, color: 'rgba(255,255,255,0.4)', fontWeight: '500', textAlign: 'center' },
  progressTrack:  { height: 3, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 2, width: '100%', marginTop: 8, overflow: 'hidden' },
  progressFill:   { height: 3, backgroundColor: '#4ade80', borderRadius: 2 },
  footer:         { position: 'absolute', bottom: 40, fontSize: 11, color: 'rgba(255,255,255,0.2)', fontWeight: '500' },
})