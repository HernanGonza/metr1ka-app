import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { LogoSvg } from './LogoSvg'

interface AppHeaderProps {
  nombre?: string | null
  rol?: string | null
  subtitulo?: string | null
  onSignOut: () => void
  color?: string  // color de fondo del header
}

const ROL_LABELS: Record<string, string> = {
  admin:        'Panel Admin',
  gestor:       'Panel Gestor',
  coordinador:  'Panel Coordinador',
  encuestador:  'Encuestador',
}

export function AppHeader({ nombre, rol, subtitulo, onSignOut, color = '#1a472a' }: AppHeaderProps) {
  const insets = useSafeAreaInsets()
  const hora = new Date().getHours()
  const saludo = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches'
  const nombreCorto = nombre?.split(' ')[0] || 'Usuario'
  const rolLabel = ROL_LABELS[rol || ''] || 'Panel'

  return (
    <View style={[s.header, { backgroundColor: color, paddingTop: insets.top + 14 }]}>
      <View style={s.row}>
        <LogoSvg width={90} color="#ffffff" accentColor="#52B788" />
        <TouchableOpacity onPress={onSignOut} style={s.salirBtn}>
          <Text style={s.salirText}>Salir</Text>
        </TouchableOpacity>
      </View>
      <Text style={s.saludo}>{saludo}, {nombreCorto} 👋</Text>
      <View style={s.badgeRow}>
        <View style={s.badge}>
          <View style={s.liveDot} />
          <Text style={s.badgeText}>{rolLabel}</Text>
        </View>
        {subtitulo && <Text style={s.subtitulo}>{subtitulo}</Text>}
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  header:    { paddingHorizontal: 20, paddingBottom: 18 },
  row:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  saludo:    { fontSize: 22, fontWeight: '800', color: '#fff', letterSpacing: -0.5, marginBottom: 8 },
  badgeRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  badge:     { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 100, paddingHorizontal: 10, paddingVertical: 5 },
  liveDot:   { width: 6, height: 6, borderRadius: 3, backgroundColor: '#4ade80' },
  badgeText: { fontSize: 11, color: 'rgba(255,255,255,0.85)', fontWeight: '700' },
  subtitulo: { fontSize: 11, color: 'rgba(255,255,255,0.55)', fontWeight: '500' },
  salirBtn:  { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', backgroundColor: 'rgba(255,255,255,0.08)' },
  salirText: { fontSize: 12, color: 'rgba(255,255,255,0.75)', fontWeight: '600' },
})