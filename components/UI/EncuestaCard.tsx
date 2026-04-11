import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'

type Props = { encuesta: any; onPress: () => void }

export function EncuestaCard({ encuesta, onPress }: Props) {
  const bloqueada = encuesta.enZona === false
  return (
    <TouchableOpacity style={[s.card, bloqueada && s.bloqueada]} onPress={onPress} activeOpacity={0.8}>
      <View style={s.row}>
        <Text style={s.nombre} numberOfLines={2}>{encuesta.nombre}</Text>
        {bloqueada && <Text style={s.lockBadge}>🔒 Fuera de zona</Text>}
      </View>
      {encuesta.descripcion && <Text style={s.desc} numberOfLines={2}>{encuesta.descripcion}</Text>}
    </TouchableOpacity>
  )
}

const s = StyleSheet.create({
  card:     { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: '#e5e7eb' },
  bloqueada:{ borderColor: '#fca5a5', backgroundColor: '#fff8f8' },
  row:      { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  nombre:   { fontSize: 15, fontWeight: '700', color: '#111', flex: 1 },
  desc:     { fontSize: 13, color: '#888', marginTop: 6, lineHeight: 18 },
  lockBadge:{ fontSize: 11, color: '#c0392b', backgroundColor: '#fef2f2', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 100, fontWeight: '600' },
})
