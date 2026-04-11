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
