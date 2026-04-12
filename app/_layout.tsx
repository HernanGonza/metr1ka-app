import { useEffect, useState, useRef } from 'react'
import { Stack, useRouter, useSegments } from 'expo-router'
import { useAuth } from '../lib/auth'
import { View, Text, StyleSheet, Animated } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { LogoSvg } from '../components/UI/LogoSvg'

function SplashScreen({ onFinish }: { onFinish: () => void }) {
  const opacity  = useRef(new Animated.Value(0)).current
  const scale    = useRef(new Animated.Value(0.9)).current
  const progress = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, tension: 70, friction: 9, useNativeDriver: true }),
      ]),
      Animated.timing(progress, { toValue: 1, duration: 1800, useNativeDriver: false }),
      Animated.delay(600),
    ]).start(() => {
      Animated.timing(opacity, { toValue: 0, duration: 400, useNativeDriver: true }).start(onFinish)
    })
  }, [])

  return (
    <View style={ss.container}>
      <Animated.View style={[ss.content, { opacity, transform: [{ scale }] }]}>
        <LogoSvg width={220} color="#ffffff" accentColor="#52B788" />
        <Text style={ss.tagline}>Encuestas de campo en tiempo real</Text>
        <View style={ss.progressTrack}>
          <Animated.View style={[
            ss.progressFill,
            { width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }
          ]} />
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
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0f0f0f' }} />
    </SafeAreaProvider>
  )

  return (
    <SafeAreaProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </SafeAreaProvider>
  )
}

const ss = StyleSheet.create({
  container:     { flex: 1, backgroundColor: '#0f0f0f', alignItems: 'center', justifyContent: 'center' },
  content:       { alignItems: 'center', gap: 18, width: '100%', paddingHorizontal: 48 },
  tagline:       { fontSize: 13, color: 'rgba(255,255,255,0.4)', fontWeight: '500', textAlign: 'center' },
  progressTrack: { height: 3, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 2, width: '100%', overflow: 'hidden' },
  progressFill:  { height: 3, backgroundColor: '#52B788', borderRadius: 2 },
  footer:        { position: 'absolute', bottom: 40, fontSize: 11, color: 'rgba(255,255,255,0.2)', fontWeight: '500' },
})