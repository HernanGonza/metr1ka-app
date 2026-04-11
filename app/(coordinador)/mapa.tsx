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
