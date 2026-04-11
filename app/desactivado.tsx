import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { useAuth } from '../lib/auth'

export default function Desactivado() {
  const { perfil, signOut } = useAuth()
  return (
    <View style={s.container}>
      <Text style={s.icon}>⛔</Text>
      <Text style={s.title}>Cuenta desactivada</Text>
      <Text style={s.desc}>
        Tu cuenta ha sido desactivada.{'\n'}
        {perfil?.motivo_desactivacion ? `Motivo: ${perfil.motivo_desactivacion}` : 'Contactá a tu administrador para más información.'}
      </Text>
      <TouchableOpacity style={s.btn} onPress={signOut}>
        <Text style={s.btnText}>Cerrar sesión</Text>
      </TouchableOpacity>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: '#f2f1ee' },
  icon:  { fontSize: 56, marginBottom: 16 },
  title: { fontSize: 22, fontWeight: '800', color: '#c0392b', marginBottom: 12, textAlign: 'center' },
  desc:  { fontSize: 15, color: '#555', textAlign: 'center', lineHeight: 22, marginBottom: 32 },
  btn:   { backgroundColor: '#c0392b', paddingHorizontal: 32, paddingVertical: 14, borderRadius: 12 },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
})
