#!/bin/bash
# Ejecutar desde ~/EncuestasEnfoque/metr1ka-app
# bash setup_metr1ka_app.sh

set -e
echo "🚀 Creando estructura METR1KA App..."

# ── Carpetas ──────────────────────────────────────
mkdir -p app/\(admin\)
mkdir -p app/\(coordinador\)
mkdir -p app/\(encuestador\)/encuesta
mkdir -p lib
mkdir -p components/EncuestaFlow
mkdir -p components/Mapa
mkdir -p components/UI
mkdir -p hooks

# ── lib/supabase.ts ───────────────────────────────
cat > lib/supabase.ts << 'EOF'
import { createClient } from '@supabase/supabase-js'
import AsyncStorage from '@react-native-async-storage/async-storage'

const SUPABASE_URL = 'https://zjphrjcpkzlmdpqhjypq.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpqcGhyamNwa3psbWRwcWhqeXBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4MzgyMTMsImV4cCI6MjA4OTQxNDIxM30.EUEIebg0zAKWYGtyvHk68FVzHE4x1Hg4kxWiVkpSO1w'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})
EOF

# ── lib/auth.ts ───────────────────────────────────
cat > lib/auth.ts << 'EOF'
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
EOF

# ── lib/location.ts ───────────────────────────────
cat > lib/location.ts << 'EOF'
import * as Location from 'expo-location'
import { supabase } from './supabase'

export async function pedirPermisoUbicacion(): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync()
  return status === 'granted'
}

export async function getUbicacionActual() {
  const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
  return { lat: loc.coords.latitude, lng: loc.coords.longitude }
}

// Ray casting — mismo algoritmo que en web
export function puntoEnPoligono(lat: number, lng: number, ring: number[][]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (((yi > lat) !== (yj > lat)) && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)) {
      inside = !inside
    }
  }
  return inside
}

export function encuestadorEnZona(lat: number, lng: number, areaGeoJSON: any): boolean {
  if (!areaGeoJSON?.features) return true
  const zonaFeat = areaGeoJSON.features.find((f: any) => f.properties?.tipo === 'zona')
  if (!zonaFeat) return true
  const coords = zonaFeat.geometry?.coordinates?.[0]
  if (!coords) return true
  // GeoJSON usa [lng, lat], nosotros usamos lat/lng
  return puntoEnPoligono(lng, lat, coords)
}

export async function actualizarUbicacion(encuestadorId: string, organizacionId: string) {
  try {
    const { lat, lng } = await getUbicacionActual()
    await supabase.from('ubicaciones_encuestadores').upsert({
      encuestador_id: encuestadorId,
      organizacion_id: organizacionId,
      lat, lng,
      actualizado_en: new Date().toISOString(),
    })
  } catch {}
}
EOF

# ── lib/realtime.ts ───────────────────────────────
cat > lib/realtime.ts << 'EOF'
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
EOF

# ── hooks/useEncuestas.ts ─────────────────────────
cat > hooks/useEncuestas.ts << 'EOF'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { encuestadorEnZona } from '../lib/location'

export function useEncuestasEncuestador(encuestadorId: string, ubicacion?: { lat: number, lng: number }) {
  const [encuestas, setEncuestas] = useState<any[]>([])
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    if (!encuestadorId) return
    load()
  }, [encuestadorId])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('asignaciones_encuesta')
      .select(`
        id,
        encuestas_equipo!inner(
          encuesta_id,
          encuestas!inner(
            id, nombre, descripcion, estado_produccion,
            area_geojson, config_muestreo,
            preguntas(id, texto, tipo, requerida, orden, es_base, clave_base, condicionales,
              opciones_pregunta(id, texto, orden))
          )
        )
      `)
      .eq('encuestador_id', encuestadorId)
      .order('creado_en', { ascending: false })

    const lista = (data || []).map((a: any) => {
      const enc = a.encuestas_equipo?.encuestas
      if (!enc) return null
      const enZona = ubicacion
        ? encuestadorEnZona(ubicacion.lat, ubicacion.lng, enc.area_geojson)
        : true
      return { ...enc, asignacion_id: a.id, enZona }
    }).filter(Boolean)

    setEncuestas(lista)
    setLoading(false)
  }

  return { encuestas, loading, refetch: load }
}
EOF

# ── hooks/useGeofencing.ts ────────────────────────
cat > hooks/useGeofencing.ts << 'EOF'
import { useState, useEffect, useRef } from 'react'
import { AppState } from 'react-native'
import { pedirPermisoUbicacion, getUbicacionActual, actualizarUbicacion } from '../lib/location'

export function useGeofencing(encuestadorId: string, organizacionId: string) {
  const [permiso,   setPermiso]   = useState<boolean | null>(null)
  const [ubicacion, setUbicacion] = useState<{ lat: number, lng: number } | null>(null)
  const intervalRef = useRef<any>(null)

  useEffect(() => {
    pedirPermisoUbicacion().then(ok => {
      setPermiso(ok)
      if (ok) iniciarTracking()
    })
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [])

  async function iniciarTracking() {
    // Obtener ubicación inicial
    const pos = await getUbicacionActual()
    setUbicacion(pos)
    if (encuestadorId && organizacionId) actualizarUbicacion(encuestadorId, organizacionId)

    // Actualizar cada 30 segundos
    intervalRef.current = setInterval(async () => {
      const pos = await getUbicacionActual()
      setUbicacion(pos)
      if (encuestadorId && organizacionId) actualizarUbicacion(encuestadorId, organizacionId)
    }, 30000)
  }

  return { permiso, ubicacion }
}
EOF

# ── components/UI/AlertaUbicacion.tsx ─────────────
cat > components/UI/AlertaUbicacion.tsx << 'EOF'
import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native'

export function AlertaUbicacion() {
  return (
    <View style={s.container}>
      <Text style={s.icon}>📍</Text>
      <Text style={s.title}>Ubicación requerida</Text>
      <Text style={s.desc}>
        METR1KA necesita acceso a tu ubicación para que puedas trabajar en campo.
        Sin ella no podés usar la app.
      </Text>
      <TouchableOpacity style={s.btn} onPress={() => Linking.openSettings()}>
        <Text style={s.btnText}>Abrir configuración</Text>
      </TouchableOpacity>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: '#f2f1ee' },
  icon:  { fontSize: 56, marginBottom: 16 },
  title: { fontSize: 22, fontWeight: '800', color: '#1a472a', marginBottom: 12, textAlign: 'center' },
  desc:  { fontSize: 15, color: '#555', textAlign: 'center', lineHeight: 22, marginBottom: 32 },
  btn:   { backgroundColor: '#1a472a', paddingHorizontal: 32, paddingVertical: 14, borderRadius: 12 },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
})
EOF

# ── components/UI/KPICard.tsx ─────────────────────
cat > components/UI/KPICard.tsx << 'EOF'
import { View, Text, StyleSheet } from 'react-native'

type Props = { label: string; value: string | number; color?: string; bg?: string }

export function KPICard({ label, value, color = '#1a472a', bg = '#d8f3dc' }: Props) {
  return (
    <View style={[s.card, { backgroundColor: bg }]}>
      <Text style={[s.value, { color }]}>{value}</Text>
      <Text style={[s.label, { color }]}>{label}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  card:  { flex: 1, borderRadius: 12, padding: 16, margin: 4 },
  value: { fontSize: 28, fontWeight: '800', marginBottom: 4 },
  label: { fontSize: 12, fontWeight: '600' },
})
EOF

# ── components/UI/EncuestaCard.tsx ────────────────
cat > components/UI/EncuestaCard.tsx << 'EOF'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'

type Props = { encuesta: any; onPress: () => void }

export function EncuestaCard({ encuesta, onPress }: Props) {
  const bloqueada = encuesta.enZona === false
  return (
    <TouchableOpacity style={[s.card, bloqueada && s.bloqueada]} onPress={onPress} activeOpacity={0.8}>
      <View style={s.row}>
        <Text style={s.nombre} numberOfLines={2}>{encuesta.nombre}</Text>
        {bloqueada && <Text style={s.lockBadge}>🔒 Fuera de zona</Text>}
      </View>
      {encuesta.descripcion && <Text style={s.desc} numberOfLines={2}>{encuesta.descripcion}</Text>}
    </TouchableOpacity>
  )
}

const s = StyleSheet.create({
  card:     { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: '#e5e7eb' },
  bloqueada:{ borderColor: '#fca5a5', backgroundColor: '#fff8f8' },
  row:      { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  nombre:   { fontSize: 15, fontWeight: '700', color: '#111', flex: 1 },
  desc:     { fontSize: 13, color: '#888', marginTop: 6, lineHeight: 18 },
  lockBadge:{ fontSize: 11, color: '#c0392b', backgroundColor: '#fef2f2', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 100, fontWeight: '600' },
})
EOF

# ── app/_layout.tsx ───────────────────────────────
cat > app/_layout.tsx << 'EOF'
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
EOF

# ── app/login.tsx ─────────────────────────────────
cat > app/login.tsx << 'EOF'
import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, Alert
} from 'react-native'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)

  async function handleLogin() {
    if (!email || !password) return
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) Alert.alert('Error', error.message)
    setLoading(false)
  }

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={s.inner}>
        <View style={s.logo}>
          <Text style={s.logoText}>METR1KA</Text>
        </View>
        <Text style={s.subtitle}>Plataforma de encuestas en campo</Text>

        <TextInput
          style={s.input}
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TextInput
          style={s.input}
          placeholder="Contraseña"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <TouchableOpacity style={[s.btn, loading && s.btnDisabled]} onPress={handleLogin} disabled={loading}>
          <Text style={s.btnText}>{loading ? 'Ingresando...' : 'Ingresar'}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  container:  { flex: 1, backgroundColor: '#f2f1ee' },
  inner:      { flex: 1, padding: 32, justifyContent: 'center' },
  logo:       { backgroundColor: '#1a472a', borderRadius: 16, padding: 20, alignItems: 'center', marginBottom: 12 },
  logoText:   { color: '#fff', fontSize: 28, fontWeight: '900', letterSpacing: 2 },
  subtitle:   { color: '#888', fontSize: 14, textAlign: 'center', marginBottom: 40 },
  input:      { backgroundColor: '#fff', borderRadius: 12, padding: 14, fontSize: 15, marginBottom: 12, borderWidth: 1.5, borderColor: '#e5e7eb' },
  btn:        { backgroundColor: '#1a472a', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8 },
  btnDisabled:{ opacity: 0.6 },
  btnText:    { color: '#fff', fontSize: 16, fontWeight: '700' },
})
EOF

# ── app/desactivado.tsx ───────────────────────────
cat > app/desactivado.tsx << 'EOF'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { useAuth } from '../lib/auth'

export default function Desactivado() {
  const { perfil, signOut } = useAuth()
  return (
    <View style={s.container}>
      <Text style={s.icon}>⛔</Text>
      <Text style={s.title}>Cuenta desactivada</Text>
      <Text style={s.desc}>
        Tu cuenta ha sido desactivada.{'\n'}
        {perfil?.motivo_desactivacion ? `Motivo: ${perfil.motivo_desactivacion}` : 'Contactá a tu administrador para más información.'}
      </Text>
      <TouchableOpacity style={s.btn} onPress={signOut}>
        <Text style={s.btnText}>Cerrar sesión</Text>
      </TouchableOpacity>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: '#f2f1ee' },
  icon:  { fontSize: 56, marginBottom: 16 },
  title: { fontSize: 22, fontWeight: '800', color: '#c0392b', marginBottom: 12, textAlign: 'center' },
  desc:  { fontSize: 15, color: '#555', textAlign: 'center', lineHeight: 22, marginBottom: 32 },
  btn:   { backgroundColor: '#c0392b', paddingHorizontal: 32, paddingVertical: 14, borderRadius: 12 },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
})
EOF

# ── app/(admin)/_layout.tsx ───────────────────────
cat > "app/(admin)/_layout.tsx" << 'EOF'
import { Tabs } from 'expo-router'
import { useAuth } from '../../lib/auth'
import { useGeofencing } from '../../hooks/useGeofencing'

export default function AdminLayout() {
  const { perfil } = useAuth()
  // Admin/gestor no necesita geofencing estricto, pero sí ubicación
  useGeofencing(perfil?.id || '', perfil?.organizacion_id || '')

  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: '#1a472a',
      tabBarStyle: { backgroundColor: '#fff', borderTopColor: '#e5e7eb' },
    }}>
      <Tabs.Screen name="dashboard" options={{ title: 'Dashboard', tabBarIcon: () => null }} />
      <Tabs.Screen name="encuestas" options={{ title: 'Encuestas', tabBarIcon: () => null }} />
      <Tabs.Screen name="mapa"      options={{ title: 'Mapa',      tabBarIcon: () => null }} />
    </Tabs>
  )
}
EOF

# ── app/(admin)/dashboard.tsx ─────────────────────
cat > "app/(admin)/dashboard.tsx" << 'EOF'
import { useState, useEffect } from 'react'
import { View, Text, ScrollView, StyleSheet, RefreshControl } from 'react-native'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import { useRealtimeSesiones } from '../../lib/realtime'
import { KPICard } from '../../components/UI/KPICard'

export default function Dashboard() {
  const { perfil } = useAuth()
  const [stats, setStats]       = useState<any>(null)
  const [loading, setLoading]   = useState(true)
  const [refresh, setRefresh]   = useState(false)

  useEffect(() => { fetchStats() }, [])

  // Actualizar KPIs cuando hay nueva sesión
  useRealtimeSesiones('', fetchStats)

  async function fetchStats() {
    if (!perfil?.organizacion_id) return
    const { data } = await supabase
      .from('encuesta_stats')
      .select('*')
      .eq('organizacion_id', perfil.organizacion_id)
    setStats(data)
    setLoading(false)
    setRefresh(false)
  }

  const totalSesiones    = stats?.reduce((s: number, e: any) => s + (e.total_sesiones || 0), 0) || 0
  const totalEncuestadores = stats?.reduce((s: number, e: any) => s + (e.total_encuestadores || 0), 0) || 0

  return (
    <ScrollView
      style={s.container}
      refreshControl={<RefreshControl refreshing={refresh} onRefresh={() => { setRefresh(true); fetchStats() }} tintColor="#1a472a" />}
    >
      <View style={s.header}>
        <Text style={s.greeting}>Hola, {perfil?.nombre_completo?.split(' ')[0]}</Text>
        <Text style={s.orgLabel}>Panel {perfil?.rol === 'gestor' ? 'Gestor' : 'Admin'}</Text>
      </View>

      <View style={s.kpiRow}>
        <KPICard label="Respuestas" value={totalSesiones} />
        <KPICard label="Encuestadores" value={totalEncuestadores} color="#0369a1" bg="#e0f2fe" />
      </View>

      {(stats || []).map((enc: any) => (
        <View key={enc.encuesta_id} style={s.encCard}>
          <Text style={s.encNombre}>{enc.encuesta_nombre || 'Encuesta'}</Text>
          <View style={s.encStats}>
            <Text style={s.encStat}>{enc.total_sesiones || 0} respuestas</Text>
            <Text style={s.encStat}>{enc.total_encuestadores || 0} encuestadores</Text>
          </View>
        </View>
      ))}
    </ScrollView>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f1ee' },
  header:    { padding: 24, paddingTop: 56 },
  greeting:  { fontSize: 24, fontWeight: '800', color: '#111' },
  orgLabel:  { fontSize: 13, color: '#888', marginTop: 2 },
  kpiRow:    { flexDirection: 'row', paddingHorizontal: 16, marginBottom: 8 },
  encCard:   { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginHorizontal: 16, marginBottom: 10 },
  encNombre: { fontSize: 15, fontWeight: '700', color: '#111', marginBottom: 8 },
  encStats:  { flexDirection: 'row', gap: 16 },
  encStat:   { fontSize: 13, color: '#888' },
})
EOF

# ── app/(admin)/encuestas.tsx ─────────────────────
cat > "app/(admin)/encuestas.tsx" << 'EOF'
import { useState, useEffect } from 'react'
import { View, Text, FlatList, StyleSheet, TouchableOpacity } from 'react-native'
import { useRouter } from 'expo-router'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'

export default function Encuestas() {
  const { perfil }           = useAuth()
  const router               = useRouter()
  const [encuestas, setEnc]  = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!perfil?.organizacion_id) return
    supabase.from('encuestas')
      .select('id, nombre, descripcion, estado_produccion, creado_en')
      .eq('organizacion_id', perfil.organizacion_id)
      .eq('estado_produccion', 'publicada')
      .order('creado_en', { ascending: false })
      .then(({ data }) => { setEnc(data || []); setLoading(false) })
  }, [perfil])

  return (
    <View style={s.container}>
      <Text style={s.title}>Encuestas</Text>
      <FlatList
        data={encuestas}
        keyExtractor={e => e.id}
        contentContainerStyle={{ padding: 16 }}
        renderItem={({ item }) => (
          <TouchableOpacity style={s.card} onPress={() => router.push(`/(admin)/encuesta/${item.id}`)}>
            <Text style={s.nombre}>{item.nombre}</Text>
            {item.descripcion && <Text style={s.desc} numberOfLines={2}>{item.descripcion}</Text>}
          </TouchableOpacity>
        )}
      />
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f1ee' },
  title:     { fontSize: 24, fontWeight: '800', color: '#111', padding: 24, paddingTop: 56 },
  card:      { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: '#e5e7eb' },
  nombre:    { fontSize: 15, fontWeight: '700', color: '#111' },
  desc:      { fontSize: 13, color: '#888', marginTop: 4 },
})
EOF

# ── app/(encuestador)/_layout.tsx ─────────────────
cat > "app/(encuestador)/_layout.tsx" << 'EOF'
import { useEffect } from 'react'
import { Tabs } from 'expo-router'
import { useAuth } from '../../lib/auth'
import { useGeofencing } from '../../hooks/useGeofencing'
import { AlertaUbicacion } from '../../components/UI/AlertaUbicacion'

export default function EncuestadorLayout() {
  const { perfil }         = useAuth()
  const { permiso }        = useGeofencing(perfil?.id || '', perfil?.organizacion_id || '')

  if (permiso === false) return <AlertaUbicacion />

  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: '#1a472a',
      tabBarStyle: { backgroundColor: '#fff', borderTopColor: '#e5e7eb' },
    }}>
      <Tabs.Screen name="home" options={{ title: 'Encuestas', tabBarIcon: () => null }} />
      <Tabs.Screen name="mapa" options={{ title: 'Mapa',      tabBarIcon: () => null }} />
    </Tabs>
  )
}
EOF

# ── app/(encuestador)/home.tsx ────────────────────
cat > "app/(encuestador)/home.tsx" << 'EOF'
import { useState, useEffect } from 'react'
import { View, Text, FlatList, StyleSheet, Alert } from 'react-native'
import { useRouter } from 'expo-router'
import { useAuth } from '../../lib/auth'
import { useEncuestasEncuestador } from '../../hooks/useEncuestas'
import { useGeofencing } from '../../hooks/useGeofencing'
import { EncuestaCard } from '../../components/UI/EncuestaCard'
import { encuestadorEnZona } from '../../lib/location'

export default function Home() {
  const { perfil }          = useAuth()
  const router              = useRouter()
  const { ubicacion }       = useGeofencing(perfil?.id || '', perfil?.organizacion_id || '')
  const { encuestas, loading } = useEncuestasEncuestador(perfil?.id || '', ubicacion || undefined)

  function handlePress(enc: any) {
    if (!enc.enZona) {
      Alert.alert(
        '🔒 Fuera de zona',
        'No estás en la zona asignada para esta encuesta. ¿Querés continuar igual?',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Continuar', onPress: () => router.push(`/(encuestador)/encuesta/${enc.id}?asignacion=${enc.asignacion_id}`) },
        ]
      )
      return
    }
    router.push(`/(encuestador)/encuesta/${enc.id}?asignacion=${enc.asignacion_id}`)
  }

  return (
    <View style={s.container}>
      <Text style={s.title}>Mis encuestas</Text>
      {ubicacion && (
        <Text style={s.ubicLabel}>📍 Ubicación activa</Text>
      )}
      <FlatList
        data={encuestas}
        keyExtractor={e => e.id}
        contentContainerStyle={{ padding: 16 }}
        renderItem={({ item }) => <EncuestaCard encuesta={item} onPress={() => handlePress(item)} />}
        ListEmptyComponent={
          !loading ? <Text style={s.empty}>No tenés encuestas asignadas.</Text> : null
        }
      />
    </View>
  )
}

const s = StyleSheet.create({
  container:  { flex: 1, backgroundColor: '#f2f1ee' },
  title:      { fontSize: 24, fontWeight: '800', color: '#111', padding: 24, paddingTop: 56 },
  ubicLabel:  { fontSize: 12, color: '#1a472a', fontWeight: '600', paddingHorizontal: 24, marginTop: -16, marginBottom: 8 },
  empty:      { textAlign: 'center', color: '#888', marginTop: 40, fontSize: 15 },
})
EOF

# ── app/(encuestador)/encuesta/[id].tsx ───────────
cat > "app/(encuestador)/encuesta/[id].tsx" << 'EOF'
import { useState, useEffect, useMemo } from 'react'
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert, ActivityIndicator } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../lib/auth'
import { useGeofencing } from '../../../hooks/useGeofencing'

// Evalúa condicionales — misma lógica que web
function evaluarCondicionales(pregunta: any, respuesta: any) {
  const cond = pregunta?.condicionales
  if (!cond?.reglas?.length) return null
  const logica = cond.logica || 'OR'
  const matches = cond.reglas.map((r: any) => r.respuesta && String(respuesta) === String(r.respuesta))
  const aplica  = logica === 'AND' ? matches.every(Boolean) : matches.some(Boolean)
  if (!aplica) return null
  return cond.reglas[matches.findIndex(Boolean)] || null
}

const RAZONES_SISTEMA = ['No hay nadie en casa','No quiere participar','No cumple el perfil buscado','Barrera de idioma','Motivo de salud']

export default function EncuestaScreen() {
  const { id, asignacion } = useLocalSearchParams<{ id: string; asignacion: string }>()
  const { perfil }         = useAuth()
  const router             = useRouter()
  const { ubicacion }      = useGeofencing(perfil?.id || '', perfil?.organizacion_id || '')

  const [encuesta,   setEncuesta]   = useState<any>(null)
  const [preguntas,  setPreguntas]  = useState<any[]>([])
  const [razonesNR,  setRazonesNR]  = useState<string[]>(RAZONES_SISTEMA)
  const [loading,    setLoading]    = useState(true)
  const [saving,     setSaving]     = useState(false)
  const [pantalla,   setPantalla]   = useState<'inicio'|'participa'|'encuesta'|'no_responde'|'fin'>('inicio')
  const [paso,       setPaso]       = useState(0)
  const [respuestas, setRespuestas] = useState<Record<string, any>>({})
  const [razonNR,    setRazonNR]    = useState('')
  const [noResponde, setNoResponde] = useState(false)
  const [ocultas,    setOcultas]    = useState(new Set<string>())

  useEffect(() => { load() }, [id])

  async function load() {
    const { data } = await supabase.rpc('get_encuesta_full', {
      p_encuesta_id: id,
      p_org_id: perfil?.organizacion_id,
    })
    if (data && !data.error) {
      setEncuesta(data.encuesta)
      setPreguntas(data.preguntas || [])
      // Cargar razones seleccionadas
      const ids = data.encuesta?.config_muestreo?.razones_seleccionadas || []
      if (ids.length >= 2) {
        const { data: rData } = await supabase
          .from('razones_no_respuesta')
          .select('id, label').in('id', ids).eq('activa', true)
        if (rData) {
          const map: Record<string,string> = Object.fromEntries(rData.map((r:any) => [r.id, r.label]))
          setRazonesNR(ids.map((i:string) => map[i]).filter(Boolean))
        }
      }
    }
    setLoading(false)
  }

  const preguntasEncuesta = useMemo(() => preguntas.filter(p => p.clave_base !== 'participa'), [preguntas])
  const preguntaParticipa = useMemo(() => preguntas.find(p => p.clave_base === 'participa'), [preguntas])
  const preguntaActual    = preguntasEncuesta[paso]

  function handleSiguiente() {
    const resp    = respuestas[preguntaActual?.id]
    const result  = evaluarCondicionales(preguntaActual, resp)
    if (result?.accion === 'finalizar') { guardarYFinalizar(); return }
    if (result?.accion === 'saltar' && result.destino_id) {
      const idx = preguntasEncuesta.findIndex(p => p.id === result.destino_id)
      if (idx >= 0) { setPaso(idx); return }
    }
    if (result?.accion === 'ocultar' && result.destino_id) {
      setOcultas(prev => new Set([...prev, result.destino_id]))
    }
    let sig = paso + 1
    while (sig < preguntasEncuesta.length && ocultas.has(preguntasEncuesta[sig]?.id)) sig++
    if (sig < preguntasEncuesta.length) setPaso(sig)
    else guardarYFinalizar()
  }

  async function guardarYFinalizar(razon?: string) {
    setSaving(true)
    try {
      const { data: sesion, error } = await supabase.from('sesiones_respuesta').insert({
        asignacion_id: asignacion,
        lat: ubicacion?.lat,
        lng: ubicacion?.lng,
      }).select().single()
      if (error || !sesion) throw error

      // Guardar respuestas
      const filas = Object.entries(respuestas).map(([pregunta_id, valor]) => ({
        sesion_id: sesion.id,
        pregunta_id,
        ...(typeof valor === 'boolean' ? { valor_booleano: valor }
          : typeof valor === 'number'  ? { valor_numero: valor }
          : { valor_texto: String(valor) })
      }))
      if (filas.length) await supabase.from('respuestas').insert(filas)

      // Guardar razón de no respuesta si aplica
      if (razon) {
        await supabase.from('respuestas').insert({
          sesion_id: sesion.id,
          pregunta_id: preguntaParticipa?.id,
          valor_texto: razon,
        })
      }

      await supabase.from('sesiones_respuesta')
        .update({ completada_en: new Date().toISOString() })
        .eq('id', sesion.id)

      setNoResponde(!!razon)
      setPantalla('fin')
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'No se pudo guardar la respuesta')
    }
    setSaving(false)
  }

  if (loading) return (
    <View style={s.centered}><ActivityIndicator size="large" color="#1a472a" /></View>
  )

  // ── Pantalla inicio ──
  if (pantalla === 'inicio') return (
    <View style={s.container}>
      <View style={s.inicioInner}>
        <Text style={s.encNombre}>{encuesta?.nombre}</Text>
        {encuesta?.descripcion && <Text style={s.encDesc}>{encuesta.descripcion}</Text>}
        <Text style={s.countText}>{preguntasEncuesta.length} preguntas</Text>
        <TouchableOpacity style={s.btnPrimary} onPress={() => preguntaParticipa ? setPantalla('participa') : setPantalla('encuesta')}>
          <Text style={s.btnPrimaryText}>Comenzar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.btnSecondary} onPress={() => router.back()}>
          <Text style={s.btnSecondaryText}>Cancelar</Text>
        </TouchableOpacity>
      </View>
    </View>
  )

  // ── Pantalla participa ──
  if (pantalla === 'participa') return (
    <View style={s.container}>
      <Text style={s.pregLabel}>📌 Pregunta base</Text>
      <Text style={s.pregTexto}>{preguntaParticipa?.texto}</Text>
      {['Sí','No'].map(op => (
        <TouchableOpacity key={op} style={s.opcionBtn} onPress={() => {
          setRespuestas(r => ({ ...r, [preguntaParticipa!.id]: op }))
          if (op === 'No') setPantalla('no_responde')
          else { setPaso(0); setPantalla('encuesta') }
        }}>
          <Text style={s.opcionText}>{op}</Text>
        </TouchableOpacity>
      ))}
    </View>
  )

  // ── Pantalla no responde ──
  if (pantalla === 'no_responde') return (
    <ScrollView style={s.container} contentContainerStyle={{ padding: 24 }}>
      <Text style={s.pregTexto}>Razón de no respuesta</Text>
      {razonesNR.map(r => (
        <TouchableOpacity key={r} style={[s.opcionBtn, razonNR === r && s.opcionSeleccionada]} onPress={() => setRazonNR(r)}>
          <Text style={[s.opcionText, razonNR === r && s.opcionTextoSel]}>{r}</Text>
        </TouchableOpacity>
      ))}
      <View style={s.navRow}>
        <TouchableOpacity style={s.btnSecondary} onPress={() => setPantalla('participa')}>
          <Text style={s.btnSecondaryText}>Volver</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.btnPrimary, { flex: 2 }, !razonNR && s.btnDisabled]}
          disabled={!razonNR || saving}
          onPress={() => guardarYFinalizar(razonNR)}>
          <Text style={s.btnPrimaryText}>{saving ? 'Guardando...' : 'Registrar y salir'}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  )

  // ── Pregunta ──
  if (pantalla === 'encuesta' && preguntaActual) {
    const opciones = [...(preguntaActual.opciones_pregunta || [])].sort((a:any,b:any) => a.orden - b.orden)
    const respActual = respuestas[preguntaActual.id]
    const puedeAvanzar = !preguntaActual.requerida || (respActual !== null && respActual !== undefined && respActual !== '')

    return (
      <ScrollView style={s.container} contentContainerStyle={{ padding: 24 }}>
        <Text style={s.pregLabel}>{preguntaActual.es_base ? '📌 Pregunta base' : `Pregunta ${paso+1} de ${preguntasEncuesta.length}`}</Text>
        <Text style={s.pregTexto}>{preguntaActual.texto}</Text>

        {preguntaActual.tipo === 'si_no' && ['Sí','No'].map(op => (
          <TouchableOpacity key={op}
            style={[s.opcionBtn, respActual === op && s.opcionSeleccionada]}
            onPress={() => setRespuestas(r => ({ ...r, [preguntaActual.id]: op }))}>
            <Text style={[s.opcionText, respActual === op && s.opcionTextoSel]}>{op}</Text>
          </TouchableOpacity>
        ))}

        {preguntaActual.tipo === 'opcion_multiple' && opciones.map((op: any) => (
          <TouchableOpacity key={op.id}
            style={[s.opcionBtn, respActual === op.texto && s.opcionSeleccionada]}
            onPress={() => setRespuestas(r => ({ ...r, [preguntaActual.id]: op.texto }))}>
            <Text style={[s.opcionText, respActual === op.texto && s.opcionTextoSel]}>{op.texto}</Text>
          </TouchableOpacity>
        ))}

        {preguntaActual.tipo === 'escala' && (
          <View style={s.escalaGrid}>
            {Array.from({length:10},(_,i)=>i+1).map(n => (
              <TouchableOpacity key={n}
                style={[s.escalaBtn, respActual === n && s.escalaBtnSel]}
                onPress={() => setRespuestas(r => ({ ...r, [preguntaActual.id]: n }))}>
                <Text style={[s.escalaText, respActual === n && s.escalaTextSel]}>{n}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={s.navRow}>
          {paso > 0 && (
            <TouchableOpacity style={s.btnSecondary} onPress={() => setPaso(p => Math.max(p-1,0))}>
              <Text style={s.btnSecondaryText}>← Anterior</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[s.btnPrimary, { flex: 2 }, !puedeAvanzar && s.btnDisabled]}
            disabled={!puedeAvanzar || saving}
            onPress={handleSiguiente}>
            <Text style={s.btnPrimaryText}>
              {saving ? 'Guardando...' : paso === preguntasEncuesta.length-1 ? '✓ Finalizar' : 'Siguiente →'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    )
  }

  // ── Pantalla fin ──
  return (
    <View style={s.centered}>
      <Text style={{ fontSize: 56, marginBottom: 16 }}>{noResponde ? '📝' : '✅'}</Text>
      <Text style={s.finTitle}>{noResponde ? 'Registrado' : '¡Gracias!'}</Text>
      <Text style={s.finDesc}>{noResponde ? 'Razón de no respuesta registrada.' : 'Encuesta completada exitosamente.'}</Text>
      <TouchableOpacity style={s.btnPrimary} onPress={() => router.back()}>
        <Text style={s.btnPrimaryText}>Volver a encuestas</Text>
      </TouchableOpacity>
    </View>
  )
}

const s = StyleSheet.create({
  container:       { flex: 1, backgroundColor: '#f2f1ee' },
  centered:        { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f2f1ee', padding: 32 },
  inicioInner:     { flex: 1, padding: 32, justifyContent: 'center' },
  encNombre:       { fontSize: 22, fontWeight: '800', color: '#111', marginBottom: 10 },
  encDesc:         { fontSize: 15, color: '#666', marginBottom: 24, lineHeight: 22 },
  countText:       { fontSize: 13, color: '#888', marginBottom: 32 },
  pregLabel:       { fontSize: 11, fontWeight: '700', color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  pregTexto:       { fontSize: 18, fontWeight: '700', color: '#111', marginBottom: 24, lineHeight: 26 },
  opcionBtn:       { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 8, borderWidth: 2, borderColor: '#e5e7eb' },
  opcionSeleccionada: { borderColor: '#1a472a', backgroundColor: '#d8f3dc' },
  opcionText:      { fontSize: 15, color: '#333' },
  opcionTextoSel:  { color: '#1a472a', fontWeight: '700' },
  navRow:          { flexDirection: 'row', gap: 10, marginTop: 24 },
  btnPrimary:      { flex: 1, backgroundColor: '#1a472a', borderRadius: 12, padding: 16, alignItems: 'center' },
  btnDisabled:     { opacity: 0.5 },
  btnPrimaryText:  { color: '#fff', fontSize: 15, fontWeight: '700' },
  btnSecondary:    { flex: 1, borderRadius: 12, padding: 16, alignItems: 'center', borderWidth: 1.5, borderColor: '#e5e7eb', backgroundColor: '#fff' },
  btnSecondaryText:{ color: '#666', fontSize: 15 },
  escalaGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  escalaBtn:       { width: 56, height: 56, borderRadius: 10, borderWidth: 2, borderColor: '#e5e7eb', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  escalaBtnSel:    { borderColor: '#1a472a', backgroundColor: '#1a472a' },
  escalaText:      { fontSize: 16, fontWeight: '700', color: '#333' },
  escalaTextSel:   { color: '#fff' },
  finTitle:        { fontSize: 22, fontWeight: '800', color: '#111', marginBottom: 10 },
  finDesc:         { fontSize: 15, color: '#666', marginBottom: 32, textAlign: 'center' },
})
EOF

# ── app/(encuestador)/mapa.tsx ────────────────────
cat > "app/(encuestador)/mapa.tsx" << 'EOF'
import { View, Text, StyleSheet } from 'react-native'

// Placeholder — se implementa con react-native-maps
export default function MapaEncuestador() {
  return (
    <View style={s.container}>
      <Text style={s.text}>🗺️ Mapa de manzanas</Text>
      <Text style={s.sub}>Próximamente — ruta sistémica de manzanas</Text>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f2f1ee' },
  text:      { fontSize: 22, fontWeight: '800', color: '#1a472a' },
  sub:       { fontSize: 14, color: '#888', marginTop: 8 },
})
EOF

# ── app/(coordinador)/_layout.tsx ────────────────
cat > "app/(coordinador)/_layout.tsx" << 'EOF'
import { Tabs } from 'expo-router'
import { useAuth } from '../../lib/auth'
import { useGeofencing } from '../../hooks/useGeofencing'
import { AlertaUbicacion } from '../../components/UI/AlertaUbicacion'

export default function CoordinadorLayout() {
  const { perfil }  = useAuth()
  const { permiso } = useGeofencing(perfil?.id || '', perfil?.organizacion_id || '')

  if (permiso === false) return <AlertaUbicacion />

  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: '#1a472a',
      tabBarStyle: { backgroundColor: '#fff', borderTopColor: '#e5e7eb' },
    }}>
      <Tabs.Screen name="dashboard"     options={{ title: 'Equipo', tabBarIcon: () => null }} />
      <Tabs.Screen name="encuestadores" options={{ title: 'Encuestadores', tabBarIcon: () => null }} />
      <Tabs.Screen name="mapa"          options={{ title: 'Mapa en vivo', tabBarIcon: () => null }} />
    </Tabs>
  )
}
EOF

# ── app/(coordinador)/dashboard.tsx ──────────────
cat > "app/(coordinador)/dashboard.tsx" << 'EOF'
import { View, Text, StyleSheet } from 'react-native'
import { useAuth } from '../../lib/auth'

export default function CoordinadorDashboard() {
  const { perfil } = useAuth()
  return (
    <View style={s.container}>
      <Text style={s.title}>Hola, {perfil?.nombre_completo?.split(' ')[0]}</Text>
      <Text style={s.sub}>Panel Coordinador</Text>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f1ee', padding: 24, paddingTop: 56 },
  title:     { fontSize: 24, fontWeight: '800', color: '#111' },
  sub:       { fontSize: 14, color: '#888', marginTop: 4 },
})
EOF

# ── app/(coordinador)/encuestadores.tsx ──────────
cat > "app/(coordinador)/encuestadores.tsx" << 'EOF'
import { useState, useEffect } from 'react'
import { View, Text, FlatList, StyleSheet } from 'react-native'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import { useRealtimeUbicaciones } from '../../lib/realtime'

export default function Encuestadores() {
  const { perfil }                = useAuth()
  const [encuestadores, setEnc]   = useState<any[]>([])
  const [ubicaciones, setUbic]    = useState<Record<string,any>>({})

  useEffect(() => {
    if (!perfil?.organizacion_id) return
    supabase.from('perfiles')
      .select('id, nombre_completo, activo, equipo_encuestadores(equipos(nombre))')
      .eq('organizacion_id', perfil.organizacion_id)
      .eq('rol', 'encuestador')
      .eq('activo', true)
      .then(({ data }) => setEnc(data || []))
  }, [perfil])

  useRealtimeUbicaciones(perfil?.organizacion_id || '', (pos) => {
    setUbic(prev => ({ ...prev, [pos.encuestador_id]: pos }))
  })

  return (
    <View style={s.container}>
      <Text style={s.title}>Encuestadores</Text>
      <FlatList
        data={encuestadores}
        keyExtractor={e => e.id}
        contentContainerStyle={{ padding: 16 }}
        renderItem={({ item }) => {
          const ubic = ubicaciones[item.id]
          const activo = ubic && (Date.now() - new Date(ubic.actualizado_en).getTime()) < 5 * 60 * 1000
          return (
            <View style={s.card}>
              <View style={[s.dot, { backgroundColor: activo ? '#22c55e' : '#d1d5db' }]} />
              <View style={{ flex: 1 }}>
                <Text style={s.nombre}>{item.nombre_completo}</Text>
                <Text style={s.sub}>{activo ? 'Activo en campo' : 'Sin señal reciente'}</Text>
              </View>
            </View>
          )
        }}
      />
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f1ee' },
  title:     { fontSize: 24, fontWeight: '800', color: '#111', padding: 24, paddingTop: 56 },
  card:      { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 12 },
  dot:       { width: 10, height: 10, borderRadius: 5 },
  nombre:    { fontSize: 14, fontWeight: '700', color: '#111' },
  sub:       { fontSize: 12, color: '#888', marginTop: 2 },
})
EOF

# ── app/(coordinador)/mapa.tsx ────────────────────
cat > "app/(coordinador)/mapa.tsx" << 'EOF'
import { View, Text, StyleSheet } from 'react-native'

export default function MapaCoordinador() {
  return (
    <View style={s.container}>
      <Text style={s.text}>🗺️ Mapa en vivo</Text>
      <Text style={s.sub}>Posiciones del equipo en tiempo real</Text>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f2f1ee' },
  text:      { fontSize: 22, fontWeight: '800', color: '#1a472a' },
  sub:       { fontSize: 14, color: '#888', marginTop: 8 },
})
EOF

echo ""
echo "✅ Estructura creada exitosamente!"
echo ""
echo "Archivos creados:"
find app lib components hooks -name "*.ts" -o -name "*.tsx" | sort
