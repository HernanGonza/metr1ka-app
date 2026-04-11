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
