import { useState, useEffect } from 'react'
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '../../lib/auth'
import { AppHeader } from '../../components/UI/AppHeader'
import { supabase } from '../../lib/supabase'

type Encuesta = {
  id: string
  nombre: string
  descripcion: string | null
  estado_produccion: string
  tipo_encuesta: string
  creado_en: string
  total_sesiones?: number
  total_hoy?: number
}

export default function Encuestas() {
  const { perfil, signOut } = useAuth()
  const router              = useRouter()
  const insets              = useSafeAreaInsets()
  const [encuestas, setEnc] = useState<Encuesta[]>([])
  const [loading, setLoading] = useState(true)
  const [refresh, setRefresh] = useState(false)

  useEffect(() => {
    if (perfil?.organizacion_id) cargar()
  }, [perfil?.organizacion_id])

  async function cargar() {
    const { data } = await supabase
      .from('encuestas')
      .select('id, nombre, descripcion, estado_produccion, tipo_encuesta, creado_en')
      .eq('organizacion_id', perfil!.organizacion_id!)
      .in('estado_produccion', ['publicada', 'completada'])
      .order('creado_en', { ascending: false })

    const conStats = await Promise.all(
      (data || []).map(async enc => {
        const { data: stats } = await supabase.rpc('get_resultados_encuesta_filtrado', {
          p_encuesta_id:    enc.id,
          p_equipo_id:      null,
          p_zona_id:        null,
          p_encuestador_id: null,
        })
        return { ...enc, total_sesiones: stats?.total_sesiones ?? 0, total_hoy: stats?.total_hoy ?? 0 }
      })
    )
    setEnc(conStats)
    setLoading(false)
    setRefresh(false)
  }

  const TIPO_COLOR: Record<string, string> = {
    callejera: '#0369a1', domiciliaria: '#7c3aed', telefonica: '#b45309',
  }
  const TIPO_LABEL: Record<string, string> = {
    callejera: '🚶 Callejera', domiciliaria: '🏠 Domiciliaria', telefonica: '📞 Telefónica',
  }

  if (loading) return (
    <View style={[s.page, { paddingTop: insets.top }]}>
      <AppHeader nombre={perfil?.nombre_completo} rol={perfil?.rol} onSignOut={signOut} color="#1a472a" />
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#1a472a" />
      </View>
    </View>
  )

  return (
    <View style={[s.page, { paddingTop: insets.top }]}>
      <AppHeader nombre={perfil?.nombre_completo} rol={perfil?.rol} onSignOut={signOut} color="#1a472a" />
      <FlatList
        data={encuestas}
        keyExtractor={e => e.id}
        refreshControl={<RefreshControl refreshing={refresh} onRefresh={() => { setRefresh(true); cargar() }} tintColor="#1a472a" />}
        contentContainerStyle={[s.lista, { paddingBottom: insets.bottom + 80 }]}
        ListHeaderComponent={<Text style={s.titulo}>Encuestas</Text>}
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={{ fontSize: 40, marginBottom: 12 }}>📋</Text>
            <Text style={s.emptyTitle}>Sin encuestas activas</Text>
            <Text style={s.emptyText}>Las encuestas publicadas aparecerán aquí</Text>
          </View>
        }
        renderItem={({ item }) => {
          const color      = TIPO_COLOR[item.tipo_encuesta] || '#1a472a'
          const completada = item.estado_produccion === 'completada'
          return (
            <TouchableOpacity
              style={s.card}
              onPress={() => router.push(`/(admin)/encuesta/${item.id}`)}
              activeOpacity={0.75}
            >
              <View style={s.badgeRow}>
                <View style={[s.badge, { backgroundColor: color + '18', borderColor: color + '44' }]}>
                  <Text style={[s.badgeText, { color }]}>{TIPO_LABEL[item.tipo_encuesta] || item.tipo_encuesta}</Text>
                </View>
                {completada && (
                  <View style={[s.badge, { backgroundColor: '#f3f4f6', borderColor: '#d1d5db' }]}>
                    <Text style={[s.badgeText, { color: '#6b7280' }]}>✓ Completada</Text>
                  </View>
                )}
              </View>
              <Text style={s.nombre}>{item.nombre}</Text>
              {item.descripcion ? <Text style={s.desc} numberOfLines={2}>{item.descripcion}</Text> : null}
              <View style={s.statsRow}>
                <View style={s.statItem}>
                  <Text style={[s.statNum, { color: '#1a472a' }]}>{item.total_sesiones}</Text>
                  <Text style={s.statLabel}>Respuestas</Text>
                </View>
                {!completada && (
                  <View style={s.statItem}>
                    <Text style={[s.statNum, { color: '#0369a1' }]}>{item.total_hoy}</Text>
                    <Text style={s.statLabel}>Hoy</Text>
                  </View>
                )}
                <View style={{ flex: 1 }} />
                <Text style={s.link}>Ver gráficos →</Text>
              </View>
            </TouchableOpacity>
          )
        }}
      />
    </View>
  )
}

const s = StyleSheet.create({
  page:       { flex: 1, backgroundColor: '#f2f1ee' },
  lista:      { padding: 16 },
  titulo:     { fontSize: 22, fontWeight: '800', color: '#111827', marginBottom: 14 },
  card:       { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#e5e7eb' },
  badgeRow:   { flexDirection: 'row', gap: 8, marginBottom: 10 },
  badge:      { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 100, borderWidth: 1 },
  badgeText:  { fontSize: 10, fontWeight: '700' },
  nombre:     { fontSize: 15, fontWeight: '800', color: '#111827', marginBottom: 4 },
  desc:       { fontSize: 12, color: '#6b7280', marginBottom: 8, lineHeight: 17 },
  statsRow:   { flexDirection: 'row', alignItems: 'center', gap: 16, paddingTop: 10, marginTop: 6, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  statItem:   { alignItems: 'center' },
  statNum:    { fontSize: 20, fontWeight: '800', letterSpacing: -0.5 },
  statLabel:  { fontSize: 9, color: '#9ca3af', fontWeight: '600', marginTop: 1 },
  link:       { fontSize: 12, fontWeight: '700', color: '#1a472a' },
  empty:      { alignItems: 'center', paddingTop: 60 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#374151', marginBottom: 6 },
  emptyText:  { fontSize: 13, color: '#9ca3af', textAlign: 'center' },
})