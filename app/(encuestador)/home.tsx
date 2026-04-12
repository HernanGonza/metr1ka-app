import { View, Text, FlatList, StyleSheet, Alert, ActivityIndicator, TouchableOpacity, StatusBar } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '../../lib/auth'
import { useEncuestasEncuestador } from '../../hooks/useEncuestas'
import { useGeofencing } from '../../hooks/useGeofencing'
import { EncuestaCard } from '../../components/UI/EncuestaCard'

export default function Home() {
  const { perfil, loading: authLoading, signOut } = useAuth()
  const router  = useRouter()
  const insets  = useSafeAreaInsets()

  const { ubicacion, zonaActual } = useGeofencing(
    perfil?.id || '',
    perfil?.organizacion_id || ''
  )

  const { encuestas, loading } = useEncuestasEncuestador(
    authLoading ? '' : (perfil?.id || ''),
    ubicacion || undefined,
    zonaActual
  )

  function handlePress(enc: any) {
    if (enc.enZona === null) {
      Alert.alert('📍 Obteniendo ubicación', 'Esperá un momento mientras obtenemos tu posición.')
      return
    }
    if (!enc.enZona) {
      Alert.alert(
        '🔒 Encuesta no disponible',
        `Esta encuesta se realiza en "${enc.zona_nombre}". Dirigite a esa zona para poder tomarla.`,
        [{ text: 'Entendido', style: 'cancel' }]
      )
      return
    }
    router.push(`/(encuestador)/encuesta/${enc.id}?asignacion=${enc.asignacion_id}&zona=${enc.zona_id}`)
  }

  if (authLoading) return (
    <View style={s.loading}>
      <ActivityIndicator size="large" color="#4ade80" />
    </View>
  )

  const nombre = perfil?.nombre_completo?.split(' ')[0] || 'Encuestador'
  const hora   = new Date().getHours()
  const saludo = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches'

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1a472a" />

      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 20 }]}>
        <View style={s.headerTop}>
          <View>
            <Text style={s.saludo}>{saludo} 👋</Text>
            <Text style={s.nombre}>{nombre}</Text>
          </View>
          <TouchableOpacity style={s.salirBtn} onPress={signOut}>
            <Text style={s.salirText}>Salir</Text>
          </TouchableOpacity>
        </View>

        {/* Zona activa */}
        {zonaActual ? (
          <View style={s.zonaBadge}>
            <View style={s.zonaDot} />
            <Text style={s.zonaText}>En zona: {zonaActual.encuesta_nombre}</Text>
          </View>
        ) : (
          <View style={[s.zonaBadge, { backgroundColor: 'rgba(255,255,255,0.08)' }]}>
            <View style={[s.zonaDot, { backgroundColor: '#f59e0b' }]} />
            <Text style={[s.zonaText, { color: 'rgba(255,255,255,0.5)' }]}>Buscando zona...</Text>
          </View>
        )}
      </View>

      {/* Lista de encuestas */}
      <FlatList
        data={encuestas}
        keyExtractor={e => e.asignacion_id}
        contentContainerStyle={[s.list, { paddingBottom: insets.bottom + 24 }]}
        renderItem={({ item }) => (
          <EncuestaCard encuesta={item} onPress={() => handlePress(item)} />
        )}
        ListHeaderComponent={
          <Text style={s.secTitle}>Encuestas asignadas</Text>
        }
        ListEmptyComponent={
          loading ? (
            <View style={s.emptyWrap}>
              <ActivityIndicator color="#1a472a" />
              <Text style={s.emptyText}>Cargando encuestas...</Text>
            </View>
          ) : (
            <View style={s.emptyWrap}>
              <Text style={s.emptyIcon}>📋</Text>
              <Text style={s.emptyTitle}>Sin encuestas asignadas</Text>
              <Text style={s.emptyText}>Tu coordinador todavía no te asignó ninguna encuesta.</Text>
            </View>
          )
        }
      />
    </View>
  )
}

const s = StyleSheet.create({
  container:  { flex: 1, backgroundColor: '#f5f5f3' },
  loading:    { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f5f5f3' },
  header:     { backgroundColor: '#1a472a', paddingHorizontal: 24, paddingBottom: 24 },
  headerTop:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  saludo:     { fontSize: 13, color: 'rgba(255,255,255,0.6)', fontWeight: '500', marginBottom: 4 },
  nombre:     { fontSize: 26, fontWeight: '800', color: '#fff', letterSpacing: -0.5 },
  salirBtn:   { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', backgroundColor: 'rgba(255,255,255,0.08)' },
  salirText:  { fontSize: 12, color: 'rgba(255,255,255,0.7)', fontWeight: '600' },
  zonaBadge:  { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, alignSelf: 'flex-start' },
  zonaDot:    { width: 7, height: 7, borderRadius: 4, backgroundColor: '#4ade80' },
  zonaText:   { fontSize: 12, color: 'rgba(255,255,255,0.8)', fontWeight: '600' },
  list:       { padding: 20, gap: 0 },
  secTitle:   { fontSize: 13, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14 },
  emptyWrap:  { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyIcon:  { fontSize: 48, marginBottom: 4 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: '#1a1a1a', textAlign: 'center' },
  emptyText:  { fontSize: 14, color: '#6b7280', textAlign: 'center', lineHeight: 21 },
<<<<<<< Updated upstream
})
=======
})
>>>>>>> Stashed changes