import { useState, useEffect } from 'react'
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator, RefreshControl,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../../lib/supabase'
import { AppHeader } from '../../components/UI/AppHeader'
import { useAuth } from '../../lib/auth'

type Encuesta = {
  id: string
  nombre: string
  descripcion: string | null
  estado_produccion: string
  tipo_encuesta: string
  fecha_inicio: string | null
  fecha_fin: string | null
  equipo_id: string
  equipo_nombre: string
}

type EstadoVista = 'activa' | 'proxima' | 'finalizada' | 'otro'

function calcularEstadoVista(enc: Encuesta): EstadoVista {
  const hoy = new Date().toISOString().slice(0, 10)
  if (enc.fecha_fin && enc.fecha_fin < hoy) return 'finalizada'
  if (enc.fecha_inicio && enc.fecha_inicio > hoy) return 'proxima'
  if (enc.estado_produccion === 'publicada') return 'activa'
  return 'otro'
}

function formatFecha(fecha: string | null) {
  if (!fecha) return null
  return new Date(fecha + 'T12:00:00').toLocaleDateString('es-AR', {
    day: 'numeric', month: 'short', year: 'numeric'
  })
}

export default function EncuestasCoordinador() {
  const { perfil, signOut } = useAuth()
  const router       = useRouter()
  const insets       = useSafeAreaInsets()
  const [encuestas, setEncuestas] = useState<Encuesta[]>([])
  const [loading, setLoading]     = useState(true)
  const [refresh, setRefresh]     = useState(false)

  useEffect(() => {
    if (!perfil?.id) return
    cargar()
  }, [perfil?.id])

  async function cargar() {
    // 1. Equipos del coordinador
    const { data: equiposCoord } = await supabase
      .from('equipo_coordinadores')
      .select('equipo_id, equipos(id, nombre)')
      .eq('coordinador_id', perfil!.id)

    if (!equiposCoord?.length) { setLoading(false); setRefresh(false); return }

    const equipoIds = equiposCoord.map(ec => ec.equipo_id)
    const equipoNombres: Record<string, string> = {}
    equiposCoord.forEach(ec => {
      const eq = ec.equipos as any
      if (eq) equipoNombres[eq.id] = eq.nombre
    })

    // 2. IDs de encuestas via encuestas_equipo
    const { data: encsEquipo } = await supabase
      .from('encuestas_equipo')
      .select('equipo_id, encuesta_id')
      .in('equipo_id', equipoIds)

    // 3. IDs de encuestas via encuesta_zonas (para encuestas nuevas sin encuestas_equipo)
    const { data: zonasEquipo } = await supabase
      .from('encuesta_zonas')
      .select('equipo_id, encuesta_id')
      .in('equipo_id', equipoIds)

    // Unir ambas fuentes de IDs sin duplicados
    const encuestasMap: Record<string, string> = {} // encuesta_id -> equipo_id
    ;(encsEquipo || []).forEach(ee => { encuestasMap[ee.encuesta_id] = ee.equipo_id })
    ;(zonasEquipo || []).forEach(ez => { if (!encuestasMap[ez.encuesta_id]) encuestasMap[ez.encuesta_id] = ez.equipo_id })

    const encuestaIds = Object.keys(encuestasMap)
    if (!encuestaIds.length) { setEncuestas([]); setLoading(false); setRefresh(false); return }

    // 4. Traer datos completos de las encuestas directamente
    const { data: encs } = await supabase
      .from('encuestas')
      .select('id, nombre, descripcion, estado_produccion, tipo_encuesta, fecha_inicio, fecha_fin')
      .in('id', encuestaIds)
      .in('estado_produccion', ['publicada', 'en_proceso', 'pendiente'])

    const lista: Encuesta[] = (encs || []).map(enc => ({
      id:                enc.id,
      nombre:            enc.nombre || '—',
      descripcion:       enc.descripcion || null,
      estado_produccion: enc.estado_produccion || 'pendiente',
      tipo_encuesta:     enc.tipo_encuesta || 'domiciliaria',
      fecha_inicio:      enc.fecha_inicio || null,
      fecha_fin:         enc.fecha_fin || null,
      equipo_id:         encuestasMap[enc.id],
      equipo_nombre:     equipoNombres[encuestasMap[enc.id]] || '—',
    }))

    const orden: Record<EstadoVista, number> = { activa: 0, proxima: 1, otro: 2, finalizada: 3 }
    lista.sort((a, b) => orden[calcularEstadoVista(a)] - orden[calcularEstadoVista(b)])

    setEncuestas(lista)
    setLoading(false)
    setRefresh(false)
  }

  return (
    <View style={s.page}>
      <AppHeader
        nombre={perfil?.nombre_completo}
        rol="coordinador"
        subtitulo="Encuestas de mi equipo"
        onSignOut={signOut}
        color="#1a472a"
      />

      {loading ? (
        <View style={s.center}><ActivityIndicator color="#1a472a" size="large" /></View>
      ) : encuestas.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyIcon}>📋</Text>
          <Text style={s.emptyTitle}>Sin encuestas asignadas</Text>
          <Text style={s.emptyDesc}>Cuando el administrador asigne encuestas a tus equipos, aparecerán acá.</Text>
        </View>
      ) : (
        <FlatList
          data={encuestas}
          keyExtractor={item => `${item.id}-${item.equipo_id}`}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 20 }}
          refreshControl={
            <RefreshControl
              refreshing={refresh}
              onRefresh={() => { setRefresh(true); cargar() }}
              tintColor="#1a472a"
              colors={['#1a472a']}
            />
          }
          renderItem={({ item }) => {
            const estado = calcularEstadoVista(item)
            const apagada = estado === 'finalizada' || estado === 'proxima'

            const badgeCfg = {
              activa:     { label: 'Activa',      color: '#1a472a', bg: '#d8f3dc' },
              proxima:    { label: 'Próximamente', color: '#0369a1', bg: '#dbeafe' },
              finalizada: { label: 'Finalizada',   color: '#6b7280', bg: '#f3f4f6' },
              otro:       { label: 'Pendiente',    color: '#b45309', bg: '#fef3c7' },
            }[estado]

            return (
              <TouchableOpacity
                style={[
                  s.card,
                  estado === 'activa' && s.cardActiva,
                  apagada && s.cardApagada,
                ]}
                activeOpacity={0.75}
                onPress={() => router.push({
                  pathname: '/(coordinador)/encuesta-detalle',
                  params: {
                    encuestaId:   item.id,
                    equipoId:     item.equipo_id,
                    nombre:       item.nombre,
                    tipoEncuesta: item.tipo_encuesta,
                  },
                })}
              >
                <View style={s.cardHeader}>
                  <Text style={[s.cardNombre, apagada && s.textoApagado]} numberOfLines={2}>
                    {item.nombre}
                  </Text>
                  <View style={[s.badge, { backgroundColor: badgeCfg.bg }]}>
                    <Text style={[s.badgeText, { color: badgeCfg.color }]}>{badgeCfg.label}</Text>
                  </View>
                </View>

                <View style={s.cardMeta}>
                  <Text style={[s.cardMetaText, apagada && s.textoApagado]}>👥 {item.equipo_nombre}</Text>
                  <Text style={[s.cardMetaText, apagada && s.textoApagado]}>
                    📋 {item.tipo_encuesta.charAt(0).toUpperCase() + item.tipo_encuesta.slice(1)}
                  </Text>
                </View>

                {item.descripcion ? (
                  <Text style={[s.cardDesc, apagada && s.textoApagado]} numberOfLines={2}>
                    {item.descripcion}
                  </Text>
                ) : null}

                {/* Fechas con formato correcto */}
                <View style={s.cardFechas}>
                  {item.fecha_inicio && (
                    <Text style={s.cardFechaText}>
                      {estado === 'proxima'
                        ? `📅 Comienza el ${formatFecha(item.fecha_inicio)}`
                        : `📅 Desde ${formatFecha(item.fecha_inicio)}`}
                    </Text>
                  )}
                  {item.fecha_fin && (
                    <Text style={s.cardFechaText}>
                      {estado === 'finalizada'
                        ? `🏁 Finalizó el ${formatFecha(item.fecha_fin)}`
                        : `⏳ Hasta ${formatFecha(item.fecha_fin)}`}
                    </Text>
                  )}
                </View>

                {/* Mensaje de estado apagada */}
                {estado === 'proxima' && (
                  <View style={s.alertaBadge}>
                    <Text style={s.alertaText}>
                      🕐 Disponible desde el {formatFecha(item.fecha_inicio)}
                    </Text>
                  </View>
                )}
                {estado === 'finalizada' && (
                  <View style={[s.alertaBadge, { backgroundColor: '#f3f4f6' }]}>
                    <Text style={[s.alertaText, { color: '#6b7280' }]}>
                      ✓ Esta encuesta ya finalizó
                    </Text>
                  </View>
                )}

                <View style={s.cardFooter}>
                  <Text style={[s.cardAction, apagada && s.textoApagado]}>Ver detalle →</Text>
                </View>
              </TouchableOpacity>
            )
          }}
        />
      )}
    </View>
  )
}

const s = StyleSheet.create({
  page:          { flex: 1, backgroundColor: '#f2f1ee' },
  center:        { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty:         { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyIcon:     { fontSize: 48, marginBottom: 12 },
  emptyTitle:    { fontSize: 18, fontWeight: '700', color: '#374151', marginBottom: 8 },
  emptyDesc:     { fontSize: 14, color: '#9ca3af', textAlign: 'center', lineHeight: 20 },
  card:          { backgroundColor: '#fff', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#e5e7eb', elevation: 1 },
  cardActiva:    { borderColor: '#a7f3d0', borderWidth: 1.5 },
  cardApagada:   { opacity: 0.7, borderColor: '#f3f4f6' },
  cardHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 },
  cardNombre:    { flex: 1, fontSize: 16, fontWeight: '700', color: '#111827' },
  textoApagado:  { color: '#9ca3af' },
  badge:         { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 100, flexShrink: 0 },
  badgeText:     { fontSize: 11, fontWeight: '700' },
  cardMeta:      { flexDirection: 'row', gap: 12, marginBottom: 6 },
  cardMetaText:  { fontSize: 12, color: '#6b7280' },
  cardDesc:      { fontSize: 13, color: '#6b7280', lineHeight: 18, marginBottom: 8 },
  cardFechas:    { flexDirection: 'column', gap: 3, marginBottom: 8 },
  cardFechaText: { fontSize: 12, color: '#9ca3af' },
  alertaBadge:   { backgroundColor: '#dbeafe', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 8 },
  alertaText:    { fontSize: 12, fontWeight: '600', color: '#0369a1' },
  cardFooter:    { borderTopWidth: 1, borderTopColor: '#f3f4f6', paddingTop: 10, marginTop: 4 },
  cardAction:    { fontSize: 13, fontWeight: '600', color: '#1a472a', textAlign: 'right' },
})