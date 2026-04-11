import { Stack } from 'expo-router'
import { View, Text, StyleSheet } from 'react-native'
import { useAuth } from '../../lib/auth'
import { useGeofencing } from '../../hooks/useGeofencing'
import { AlertaUbicacion } from '../../components/UI/AlertaUbicacion'

function AlertaFueraDeZona() {
  return (
    <View style={s.container}>
      <Text style={s.icon}>📍</Text>
      <Text style={s.title}>Fuera de zona</Text>
      <Text style={s.desc}>
        No estás dentro del área asignada a tu equipo.{'\n'}
        Dirigite a la zona de trabajo para poder usar la app.
      </Text>
      <View style={s.badge}>
        <View style={s.dot} />
        <Text style={s.badgeText}>Ubicación activa — fuera de zona</Text>
      </View>
    </View>
  )
}

export default function EncuestadorLayout() {
  const { perfil }                = useAuth()
  const { permiso, enZonaEquipo } = useGeofencing(
    perfil?.id || '',
    perfil?.organizacion_id || ''
  )

  if (permiso === false) return <AlertaUbicacion />
  if (enZonaEquipo === false) return <AlertaFueraDeZona />

  return <Stack screenOptions={{ headerShown: false }} />
}

const s = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: '#f2f1ee' },
  icon:      { fontSize: 56, marginBottom: 16 },
  title:     { fontSize: 22, fontWeight: '800', color: '#b45309', marginBottom: 12, textAlign: 'center' },
  desc:      { fontSize: 15, color: '#555', textAlign: 'center', lineHeight: 22, marginBottom: 32 },
  badge:     { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fef3c7', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 100 },
  dot:       { width: 8, height: 8, borderRadius: 4, backgroundColor: '#f59e0b' },
  badgeText: { fontSize: 12, color: '#b45309', fontWeight: '600' },
})