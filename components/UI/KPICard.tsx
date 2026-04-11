import { View, Text, StyleSheet } from 'react-native'

type Props = { label: string; value: string | number; color?: string; bg?: string }

export function KPICard({ label, value, color = '#1a472a', bg = '#d8f3dc' }: Props) {
  return (
    <View style={[s.card, { backgroundColor: bg }]}>
      <Text style={[s.value, { color }]}>{value}</Text>
      <Text style={[s.label, { color }]}>{label}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  card:  { flex: 1, borderRadius: 12, padding: 16, margin: 4 },
  value: { fontSize: 28, fontWeight: '800', marginBottom: 4 },
  label: { fontSize: 12, fontWeight: '600' },
})
