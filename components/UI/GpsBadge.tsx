import { View, Text, StyleSheet } from 'react-native'

export function GpsBadge({ activo }: { activo: boolean }) {
  return (
    <View style={[s.badge, activo ? s.ok : s.mal]}>
      <Text style={s.text}>{activo ? 'GPS activo ✓' : 'GPS sin señal ✗'}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  ok:  { backgroundColor: 'rgba(34,197,94,0.28)' },
  mal: { backgroundColor: 'rgba(239,68,68,0.55)' },
  text: { color: '#fff', fontSize: 11, fontWeight: '700' },
})
