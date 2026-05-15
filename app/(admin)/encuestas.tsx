import { useState, useEffect } from 'react'
import { View, Text, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '../../lib/auth'
import { AppHeader } from '../../components/UI/AppHeader'
import { supabase } from '../../lib/supabase'

export default function Encuestas() {
  const { perfil, signOut } = useAuth()
  const router    = useRouter()
  const insets    = useSafeAreaInsets()
  const [publicadas,   setPublicadas]   = useState<any[]>([])
  const [completadas,  setCompletadas]  = useState<any[]>([])
  const [loading,      setLoading]      = useState(true)
  const [refresh,      setRefresh]      = useState(false)

  useEffect(() => { if (perfil?.organizacion_id) cargar() }, [perfil?.organizacion_id])

  async function cargar() {
    const { data } = await supabase
      .from('encuestas')
      .select('id, nombre, descripcion, estado_produccion, tipo_encuesta')
      .eq('organizacion_id', perfil!.organizacion_id!)
      .in('estado_produccion', ['publicada', 'completada'])
      .order('creado_en', { ascending: false })

    const conStats = await Promise.all(
      (data || []).map(async enc => {
        const { data: s } = await supabase.rpc('get_resultados_encuesta_filtrado', {
          p_encuesta_id: enc.id, p_equipo_id: null, p_zona_id: null, p_encuestador_id: null,
        })
        return {
          ...enc,
          completadas:   s?.total_completadas  ?? 0,
          no_respuesta:  s?.total_no_respuesta ?? 0,
          total:         s?.total_sesiones     ?? 0,
        }
      })
    )
    setPublicadas(conStats.filter(e => e.estado_produccion === 'publicada'))
    setCompletadas(conStats.filter(e => e.estado_produccion === 'completada'))
    setLoading(false)
    setRefresh(false)
  }

  const TIPO_COLOR: Record<string, string> = { callejera: '#0369a1', domiciliaria: '#7c3aed', telefonica: '#b45309' }
  const TIPO_LABEL: Record<string, string> = { callejera: '🚶 Callejera', domiciliaria: '🏠 Domiciliaria', telefonica: '📞 Telefónica' }

  function Card({ item }: { item: any }) {
    const color = TIPO_COLOR[item.tipo_encuesta] || '#1a472a'
    return (
      <TouchableOpacity style={s.card} onPress={() => router.push(`/(admin)/encuesta/${item.id}`)} activeOpacity={0.75}>
        <View style={[s.badge, { backgroundColor: color + '18', borderColor: color + '44' }]}>
          <Text style={[s.badgeText, { color }]}>{TIPO_LABEL[item.tipo_encuesta] || item.tipo_encuesta}</Text>
        </View>
        <Text style={s.nombre}>{item.nombre}</Text>
        {item.descripcion ? <Text style={s.desc} numberOfLines={2}>{item.descripcion}</Text> : null}
        <View style={s.statsRow}>
          <View style={s.stat}>
            <Text style={[s.statN, { color: '#1a472a' }]}>{item.completadas}</Text>
            <Text style={s.statL}>Completadas</Text>
          </View>
          <View style={s.stat}>
            <Text style={[s.statN, { color: '#b45309' }]}>{item.no_respuesta}</Text>
            <Text style={s.statL}>No resp.</Text>
          </View>
          <View style={s.stat}>
            <Text style={[s.statN, { color: '#374151' }]}>{item.total}</Text>
            <Text style={s.statL}>Total</Text>
          </View>
          <Text style={s.link}>Ver →</Text>
        </View>
      </TouchableOpacity>
    )
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
        data={[...publicadas, ...(completadas.length > 0 ? [{ _separator: true }] : []), ...completadas]}
        keyExtractor={(e: any) => e._separator ? '_sep' : e.id}
        refreshControl={<RefreshControl refreshing={refresh} onRefresh={() => { setRefresh(true); cargar() }} tintColor="#1a472a" />}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 80 }}
        ListHeaderComponent={<Text style={s.titulo}>Encuestas activas</Text>}
        renderItem={({ item }: { item: any }) => {
          if (item._separator) return (
            <View style={s.separator}>
              <View style={s.sepLine} />
              <Text style={s.sepText}>Completadas</Text>
              <View style={s.sepLine} />
            </View>
          )
          return <Card item={item} />
        }}
      />
    </View>
  )
}

const s = StyleSheet.create({
  page:      { flex: 1, backgroundColor: '#f2f1ee' },
  titulo:    { fontSize: 22, fontWeight: '800', color: '#111827', marginBottom: 14 },
  card:      { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#e5e7eb' },
  badge:     { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 100, borderWidth: 1, marginBottom: 10 },
  badgeText: { fontSize: 10, fontWeight: '700' },
  nombre:    { fontSize: 15, fontWeight: '800', color: '#111827', marginBottom: 4 },
  desc:      { fontSize: 12, color: '#6b7280', marginBottom: 8 },
  statsRow:  { flexDirection: 'row', alignItems: 'center', gap: 16, paddingTop: 10, marginTop: 6, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  stat:      { alignItems: 'center' },
  statN:     { fontSize: 20, fontWeight: '800', letterSpacing: -0.5 },
  statL:     { fontSize: 9, color: '#9ca3af', fontWeight: '600' },
  link:      { marginLeft: 'auto' as any, fontSize: 12, fontWeight: '700', color: '#1a472a' },
  separator: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 16 },
  sepLine:   { flex: 1, height: 1, backgroundColor: '#e5e7eb' },
  sepText:   { fontSize: 12, fontWeight: '700', color: '#9ca3af' },
})