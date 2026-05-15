import { useState, useEffect } from 'react'
import { View, Text, FlatList, StyleSheet, TouchableOpacity, StatusBar, Alert, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '../../lib/auth'
import { AppHeader } from '../../components/UI/AppHeader'
import { useGeofencing } from '../../hooks/useGeofencing'
import { supabase } from '../../lib/supabase'

type EstadoEncuesta = 'disponible' | 'fuera_zona' | 'sin_gps' | 'sin_fecha' | 'cargando'

type ZonaAsignada = {
  asignacion_id: string
  zona_id: string
  zona_nombre: string
  zona_geojson: any
}

type Encuesta = {
  id: string
  asignacion_id: string
  zona_id: string
  nombre: string
  descripcion: string | null
  tipo_encuesta: string
  estado_produccion: string
  fecha_inicio: string | null
  fecha_fin: string | null
  geofencing_activo: boolean
  zona_nombre: string | null
  todas_las_zonas: ZonaAsignada[] | null
}

function calcularEstado(
  enc: Encuesta,
  encuestaEnZona: (id: string) => boolean | null,
  ubicacion: { lat: number; lng: number } | null,
): EstadoEncuesta {
  // Solo verificar fecha — geofencing desactivado temporalmente
  const hoy = new Date().toISOString().slice(0, 10)
  if (enc.fecha_inicio && enc.fecha_inicio > hoy) return 'sin_fecha'
  return 'disponible'
}

function EstadoBadge({ estado, fechaInicio }: { estado: EstadoEncuesta; fechaInicio?: string | null }) {
  const cfgs = {
    disponible:  { emoji: '✅', text: 'Disponible',         color: '#1a472a', bg: '#d8f3dc' },
    fuera_zona:  { emoji: '📍', text: 'Fuera de zona',      color: '#b45309', bg: '#fef3c7' },
    sin_gps:     { emoji: '⏳', text: 'Obteniendo GPS...',  color: '#6b7280', bg: '#f3f4f6' },
    sin_fecha:   { emoji: '📅', text: '',                   color: '#0369a1', bg: '#dbeafe' },
    cargando:    { emoji: '⏳', text: 'Cargando...',        color: '#6b7280', bg: '#f3f4f6' },
  }
  const cfg = cfgs[estado]
  let text = cfg.text
  if (estado === 'sin_fecha' && fechaInicio) {
    const fecha = new Date(fechaInicio + 'T12:00:00')
      .toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
    text = `Disponible desde el ${fecha}`
  }
  return (
    <View style={[badge.wrap, { backgroundColor: cfg.bg }]}>
      <Text style={badge.emoji}>{cfg.emoji}</Text>
      <Text style={[badge.text, { color: cfg.color }]}>{text}</Text>
    </View>
  )
}

const badge = StyleSheet.create({
  wrap:  { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 100, alignSelf: 'flex-start', marginTop: 8 },
  emoji: { fontSize: 12 },
  text:  { fontSize: 11, fontWeight: '700' },
})

function EncuestaItem({
  enc,
  estado,
  onPress,
}: {
  enc: Encuesta
  estado: EstadoEncuesta
  onPress: () => void
}) {
  const disponible = estado === 'disponible'
  return (
    <TouchableOpacity
      style={[card.wrap, !disponible && card.apagada]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={card.header}>
        <Text style={[card.nombre, !disponible && card.nombreApagado]} numberOfLines={2}>
          {enc.nombre}
        </Text>
        <View style={[card.tipoBadge, !disponible && { opacity: 0.5 }]}>
          <Text style={card.tipoText}>{enc.tipo_encuesta}</Text>
        </View>
      </View>
      {enc.descripcion ? (
        <Text style={[card.desc, !disponible && { opacity: 0.5 }]} numberOfLines={2}>
          {enc.descripcion}
        </Text>
      ) : null}
      {enc.todas_las_zonas && enc.todas_las_zonas.length > 0 ? (
        <View style={card.zonaBadge}>
          <Text style={card.zonaText}>
            📍 {enc.todas_las_zonas.length === 1
              ? enc.todas_las_zonas[0].zona_nombre
              : `${enc.todas_las_zonas.length} zonas asignadas`}
          </Text>
        </View>
      ) : null}
      <EstadoBadge estado={estado} fechaInicio={enc.fecha_inicio} />
      {disponible && (
        <View style={card.footer}>
          <Text style={card.footerText}>Tocar para comenzar →</Text>
        </View>
      )}
    </TouchableOpacity>
  )
}

const card = StyleSheet.create({
  wrap:         { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1.5, borderColor: '#e5e7eb', elevation: 1 },
  apagada:      { opacity: 0.75, borderColor: '#f3f4f6' },
  header:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 4 },
  nombre:       { flex: 1, fontSize: 16, fontWeight: '800', color: '#111827' },
  nombreApagado:{ color: '#6b7280' },
  tipoBadge:    { backgroundColor: '#f3f4f6', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 100 },
  tipoText:     { fontSize: 10, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase' },
  desc:         { fontSize: 13, color: '#6b7280', lineHeight: 18 },
  zonaBadge:    { flexDirection: 'row', alignItems: 'center', marginTop: 6, alignSelf: 'flex-start', backgroundColor: '#f0fdf4', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 100, borderWidth: 1, borderColor: '#bbf7d0' },
  zonaText:     { fontSize: 11, fontWeight: '700', color: '#166534' },
  footerText:   { fontSize: 13, fontWeight: '700', color: '#1a472a' },
})

export default function Home() {
  const { perfil, loading: authLoading, signOut } = useAuth()
  const router  = useRouter()
  const insets  = useSafeAreaInsets()

  const { ubicacion, encuestaEnZona, centroZonaEncuesta, refetchZonas } = useGeofencing(
    perfil?.id || '',
    perfil?.organizacion_id || ''
  )

  const [encuestas, setEncuestas] = useState<Encuesta[]>([])
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    if (!perfil?.id || authLoading) return
    cargarEncuestas()
  }, [perfil?.id, authLoading])

  async function cargarEncuestas() {
    setLoading(true)

    // Auto-asignar primero
    await supabase.rpc('auto_asignar_encuestador')

    // Cargar encuestas
    const { data, error } = await supabase.rpc('get_encuestas_encuestador')
    if (error) {
      console.error('get_encuestas_encuestador:', error.message)
      setLoading(false)
      return
    }

    // ✅ Deduplicar por asignacion_id (no por encuesta_id)
    // Esto permite que un encuestador vea múltiples asignaciones de la misma encuesta
    // si tiene diferentes zonas asignadas
    const seen = new Map<string, Encuesta>()
    for (const enc of (data || [])) {
      const key = enc.asignacion_id // ← Clave única por asignación
      if (!seen.has(key)) seen.set(key, enc)
    }
    setEncuestas(Array.from(seen.values()))
    setLoading(false)
  }

  function handlePress(enc: Encuesta) {
    const estado = calcularEstado(enc, encuestaEnZona, ubicacion)

    if (estado === 'sin_fecha') {
      const fecha = new Date(enc.fecha_inicio! + 'T12:00:00')
        .toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })
      Alert.alert('📅 Todavía no disponible', `Esta encuesta se habilita el ${fecha}.`)
      return
    }

    if (estado === 'sin_gps') {
      Alert.alert('📍 Obteniendo ubicación', 'Esperá un momento mientras obtenemos tu posición GPS.')
      return
    }

    if (estado === 'fuera_zona') {
      const centro = centroZonaEncuesta(enc.id)
      const zonaTexto = enc.zona_nombre ? `la zona "${enc.zona_nombre}"` : 'la zona asignada'
      Alert.alert(
        '🔒 Fuera de zona',
        `Esta encuesta se realiza en ${zonaTexto}. Dirigite a esa área para poder tomarla.`,
        [
          { text: 'Entendido', style: 'cancel' },
          ...(centro ? [{
            text: '📍 Ver en mapa',
            onPress: () => {
              // Por ahora solo informamos las coordenadas
              Alert.alert('Dirección aproximada',
                `La zona está en:\nLat: ${centro.lat.toFixed(4)}\nLng: ${centro.lng.toFixed(4)}`)
            }
          }] : []),
        ]
      )
      return
    }

    // disponible
    router.push(`/(encuestador)/encuesta/${enc.id}?asignacion=${enc.asignacion_id}&zona=${enc.zona_id}&zonas=${encodeURIComponent(JSON.stringify(enc.todas_las_zonas || []))}`)
  }

  if (authLoading) return (
    <View style={s.loading}><ActivityIndicator size="large" color="#1a472a" /></View>
  )

  // Ordenar: disponibles primero, luego por estado
  const orden: Record<EstadoEncuesta, number> = { disponible: 0, sin_gps: 1, fuera_zona: 2, sin_fecha: 3, cargando: 4 }
  const encuestasOrdenadas = [...encuestas].sort((a, b) => {
    const ea = calcularEstado(a, encuestaEnZona, ubicacion)
    const eb = calcularEstado(b, encuestaEnZona, ubicacion)
    return orden[ea] - orden[eb]
  })

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor="#1a472a" />
      <AppHeader
        nombre={perfil?.nombre_completo}
        rol="encuestador"
        subtitulo={ubicacion ? '📍 GPS activo' : '⏳ Obteniendo GPS...'}
        onSignOut={signOut}
        color="#1a472a"
      />

      <FlatList
        data={encuestasOrdenadas}
        // ✅ Usar asignacion_id como key para evitar conflictos con asignaciones múltiples
        keyExtractor={e => e.asignacion_id}
        contentContainerStyle={[s.list, { paddingBottom: insets.bottom + 24 }]}
        onRefresh={async () => { await cargarEncuestas(); await refetchZonas() }}
        refreshing={loading}
        renderItem={({ item }) => (
          <EncuestaItem
            enc={item}
            estado={calcularEstado(item, encuestaEnZona, ubicacion)}
            onPress={() => handlePress(item)}
          />
        )}
        ListHeaderComponent={
          <Text style={s.secTitle}>Encuestas asignadas</Text>
        }
        ListEmptyComponent={
          loading ? (
            <View style={s.emptyWrap}>
              <ActivityIndicator color="#1a472a" />
              <Text style={s.emptyText}>Cargando...</Text>
            </View>
          ) : (
            <View style={s.emptyWrap}>
              <Text style={s.emptyIcon}>📋</Text>
              <Text style={s.emptyTitle}>Sin encuestas asignadas</Text>
              <Text style={s.emptyText}>Tu coordinador todavía no te asignó ninguna encuesta.</Text>
            </View>
          )
        }
      />
    </View>
  )
}

const s = StyleSheet.create({
  container:  { flex: 1, backgroundColor: '#f5f5f3' },
  loading:    { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f5f5f3' },
  list:       { padding: 20, gap: 0 },
  secTitle:   { fontSize: 13, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14 },
  emptyWrap:  { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyIcon:  { fontSize: 48, marginBottom: 4 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: '#1a1a1a', textAlign: 'center' },
  emptyText:  { fontSize: 14, color: '#6b7280', textAlign: 'center', lineHeight: 21 },
})