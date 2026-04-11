import { Stack } from 'expo-router'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'
import { useAuth } from '../../lib/auth'
import { useGeofencing } from '../../hooks/useGeofencing'
import { AlertaUbicacion } from '../../components/UI/AlertaUbicacion'

function AlertaFueraDeZona({ onReintentar }: { onReintentar: () => void }) {
  return (
    <View style={s.container}>
      <Text style={s.icon}>📍</Text>
      <Text style={s.title}>Fuera de zona</Text>
      <Text style={s.desc}>
        No estás dentro de ninguna zona de trabajo asignada.{'\n'}
        Dirigite al área correspondiente para usar la app.
      </Text>
      <View style={s.badge}>
        <View style={s.dot} />
        <Text style={s.badgeText}>Ubicación activa — fuera de zona</Text>
      </View>
      <TouchableOpacity style={s.btn} onPress={onReintentar}>
        <Text style={s.btnText}>Verificar de nuevo</Text>
      </TouchableOpacity>
    </View>
  )
}

export default function EncuestadorLayout() {
  const { perfil } = useAuth()
  const { permiso, bloqueado, refetchZonas } = useGeofencing(
    perfil?.id || '',
    perfil?.organizacion_id || ''
  )

  if (permiso === false) return <AlertaUbicacion />
  if (bloqueado === true) return <AlertaFueraDeZona onReintentar={refetchZonas} />

  return <Stack screenOptions={{ headerShown: false }} />
}

const s = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: '#f2f1ee' },
  icon:      { fontSize: 56, marginBottom: 16 },
  title:     { fontSize: 22, fontWeight: '800', color: '#b45309', marginBottom: 12, textAlign: 'center' },
  desc:      { fontSize: 15, color: '#555', textAlign: 'center', lineHeight: 22, marginBottom: 32 },
  badge:     { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fef3c7', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 100, marginBottom: 24 },
  dot:       { width: 8, height: 8, borderRadius: 4, backgroundColor: '#f59e0b' },
  badgeText: { fontSize: 12, color: '#b45309', fontWeight: '600' },
  btn:       { backgroundColor: '#1a472a', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 100 },
  btnText:   { color: '#fff', fontWeight: '700', fontSize: 14 },
})