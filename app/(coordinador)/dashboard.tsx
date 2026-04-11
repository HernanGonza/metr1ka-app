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
