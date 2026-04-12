import { View, Text, FlatList, StyleSheet, Alert, ActivityIndicator, TouchableOpacity, StatusBar } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '../../lib/auth'
import { AppHeader } from '../../components/UI/AppHeader'
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
    // Verificar fecha de desbloqueo
    const hoy = new Date().toISOString().slice(0, 10)
    if (enc.fecha_inicio && enc.fecha_inicio > hoy) {
      const fecha = new Date(enc.fecha_inicio + 'T12:00:00')
        .toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })
      Alert.alert('📅 Todavía no disponible', `Esta encuesta se habilita el ${fecha}.`,
        [{ text: 'Entendido', style: 'cancel' }])
      return
    }
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
      <AppHeader
        nombre={perfil?.nombre_completo}
        rol="encuestador"
        subtitulo={zonaActual ? `En zona: ${zonaActual.encuesta_nombre}` : 'Buscando zona...'}
        onSignOut={signOut}
        color="#1a472a"
      />

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
})