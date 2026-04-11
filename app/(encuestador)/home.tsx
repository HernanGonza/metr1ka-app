import { View, Text, FlatList, StyleSheet, Alert, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { useAuth } from '../../lib/auth'
import { useEncuestasEncuestador } from '../../hooks/useEncuestas'
import { useGeofencing } from '../../hooks/useGeofencing'
import { EncuestaCard } from '../../components/UI/EncuestaCard'

export default function Home() {
  const { perfil, loading: authLoading } = useAuth()
  const router = useRouter()

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
        '🔒 Encuesta no disponible aquí',
        `Esta encuesta se realiza en "${enc.zona_nombre}". Dirigite a esa zona para poder tomarla.`,
        [{ text: 'Entendido', style: 'cancel' }]
      )
      return
    }
    router.push(`/(encuestador)/encuesta/${enc.id}?asignacion=${enc.asignacion_id}&zona=${enc.zona_id}`)
  }

  if (authLoading) return (
    <View style={s.centered}>
      <ActivityIndicator size="large" color="#1a472a" />
    </View>
  )

  return (
    <View style={s.container}>
      <Text style={s.title}>Mis encuestas</Text>
      {perfil && (
        <Text style={s.subtitulo}>Hola, {perfil.nombre_completo?.split(' ')[0]}</Text>
      )}
      {zonaActual && (
        <Text style={s.zonaLabel}>📍 En zona: {zonaActual.zona_nombre}</Text>
      )}
      <FlatList
        data={encuestas}
        keyExtractor={e => e.asignacion_id}
        contentContainerStyle={{ padding: 16 }}
        renderItem={({ item }) => (
          <EncuestaCard encuesta={item} onPress={() => handlePress(item)} />
        )}
        ListEmptyComponent={
          loading
            ? <ActivityIndicator style={{ marginTop: 40 }} color="#1a472a" />
            : <Text style={s.empty}>No tenés encuestas asignadas.</Text>
        }
      />
    </View>
  )
}

const s = StyleSheet.create({
  container:  { flex: 1, backgroundColor: '#f2f1ee' },
  centered:   { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f2f1ee' },
  title:      { fontSize: 24, fontWeight: '800', color: '#111', padding: 24, paddingTop: 56 },
  subtitulo:  { fontSize: 14, color: '#888', paddingHorizontal: 24, marginTop: -16, marginBottom: 4 },
  zonaLabel:  { fontSize: 12, color: '#1a472a', fontWeight: '600', paddingHorizontal: 24, marginBottom: 8 },
  empty:      { textAlign: 'center', color: '#888', marginTop: 40, fontSize: 15 },
})