import { View, Text, FlatList, StyleSheet, Alert, ActivityIndicator, TouchableOpacity } from 'react-native'
import { useRouter } from 'expo-router'
import { useAuth } from '../../lib/auth'
import { useEncuestasEncuestador } from '../../hooks/useEncuestas'
import { useGeofencing } from '../../hooks/useGeofencing'
import { EncuestaCard } from '../../components/UI/EncuestaCard'

export default function Home() {
  const { perfil, loading: authLoading, signOut } = useAuth()
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
      {/* Header con logout */}
      <View style={s.header}>
        <View>
          <Text style={s.title}>Mis encuestas</Text>
          {perfil && (
            <Text style={s.subtitulo}>Hola, {perfil.nombre_completo?.split(' ')[0]}</Text>
          )}
        </View>
        <TouchableOpacity style={s.salirBtn} onPress={signOut}>
          <Text style={s.salirText}>Salir</Text>
        </TouchableOpacity>
      </View>

      {zonaActual && (
        <Text style={s.zonaLabel}>📍 En zona: {zonaActual.encuesta_nombre}</Text>
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
  header:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingHorizontal: 24, paddingTop: 56, paddingBottom: 8 },
  title:      { fontSize: 24, fontWeight: '800', color: '#111' },
  subtitulo:  { fontSize: 13, color: '#888', marginTop: 2 },
  salirBtn:   { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1.5, borderColor: '#e5e7eb', backgroundColor: '#fff' },
  salirText:  { fontSize: 12, color: '#888', fontWeight: '600' },
  zonaLabel:  { fontSize: 12, color: '#1a472a', fontWeight: '600', paddingHorizontal: 24, marginBottom: 4 },
  empty:      { textAlign: 'center', color: '#888', marginTop: 40, fontSize: 15 },
})