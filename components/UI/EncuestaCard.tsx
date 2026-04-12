import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'

type Props = { encuesta: any; onPress: () => void }

function formatFecha(dateStr: string | null | undefined) {
  if (!dateStr) return null
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'long' })
}

export function EncuestaCard({ encuesta, onPress }: Props) {
  const bloqueadaZona  = encuesta.enZona === false
  const fechaInicio    = encuesta.fecha_inicio
  const fechaFin       = encuesta.fecha_fin
  const hoy            = new Date().toISOString().slice(0, 10)
  const noDisponibleAun = fechaInicio && fechaInicio > hoy
  const proximaAVencer  = fechaFin && !noDisponibleAun &&
    (new Date(fechaFin).getTime() - Date.now()) < 3 * 24 * 60 * 60 * 1000

  const bloqueada = bloqueadaZona || noDisponibleAun

  return (
    <TouchableOpacity
      style={[s.card, bloqueada && s.bloqueada, !bloqueada && s.activa]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={s.header}>
        <View style={[s.dot, { backgroundColor: bloqueada ? '#d1d5db' : '#22c55e' }]} />
        <Text style={[s.nombre, bloqueada && s.nombreBloq]} numberOfLines={2}>
          {encuesta.nombre}
        </Text>
      </View>

      {encuesta.descripcion ? (
        <Text style={s.desc} numberOfLines={2}>{encuesta.descripcion}</Text>
      ) : null}

      <View style={s.badges}>
        {bloqueadaZona && (
          <View style={s.badge}>
            <Text style={s.badgeText}>🔒 Fuera de zona</Text>
          </View>
        )}
        {noDisponibleAun && (
          <View style={[s.badge, s.badgeFecha]}>
            <Text style={[s.badgeText, s.badgeFechaText]}>
              📅 Disponible el {formatFecha(fechaInicio)}
            </Text>
          </View>
        )}
        {proximaAVencer && (
          <View style={[s.badge, s.badgeAlerta]}>
            <Text style={[s.badgeText, s.badgeAlertaText]}>
              ⚠️ Cierra el {formatFecha(fechaFin)}
            </Text>
          </View>
        )}
        {!bloqueada && !noDisponibleAun && (
          <View style={[s.badge, s.badgeActiva]}>
            <Text style={[s.badgeText, s.badgeActivaText]}>Disponible</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  )
}

const s = StyleSheet.create({
  card:            { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 10, borderWidth: 1.5, borderColor: '#e5e7eb' },
  activa:          { borderColor: '#bbf7d0', shadowColor: '#1a472a', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  bloqueada:       { borderColor: '#e5e7eb', backgroundColor: '#fafafa', opacity: 0.8 },
  header:          { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 6 },
  dot:             { width: 8, height: 8, borderRadius: 4, marginTop: 5, flexShrink: 0 },
  nombre:          { fontSize: 15, fontWeight: '800', color: '#111', flex: 1, lineHeight: 21, letterSpacing: -0.2 },
  nombreBloq:      { color: '#6b7280' },
  desc:            { fontSize: 13, color: '#9ca3af', lineHeight: 18, marginBottom: 8 },
  badges:          { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  badge:           { backgroundColor: '#f3f4f6', borderRadius: 100, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText:       { fontSize: 11, fontWeight: '600', color: '#6b7280' },
  badgeActiva:     { backgroundColor: '#dcfce7' },
  badgeActivaText: { color: '#16a34a' },
  badgeFecha:      { backgroundColor: '#eff6ff' },
  badgeFechaText:  { color: '#1d4ed8' },
  badgeAlerta:     { backgroundColor: '#fffbeb' },
  badgeAlertaText: { color: '#d97706' },
})