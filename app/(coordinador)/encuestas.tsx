import { useState, useEffect } from 'react'
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../../lib/supabase'
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

const ESTADO_CFG: Record<string, { label: string; color: string; bg: string }> = {
  publicada:    { label: 'Publicada',    color: '#1a472a', bg: '#d8f3dc' },
  en_proceso:   { label: 'En proceso',   color: '#0369a1', bg: '#dbeafe' },
  para_revisar: { label: 'Para revisar', color: '#7c3aed', bg: '#ede9fe' },
  pendiente:    { label: 'Pendiente',    color: '#b45309', bg: '#fef3c7' },
}

export default function EncuestasCoordinador() {
  const { perfil }       = useAuth()
  const router           = useRouter()
  const insets           = useSafeAreaInsets()
  const [encuestas, setEncuestas] = useState<Encuesta[]>([])
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    if (!perfil?.id) return
    cargar()
  }, [perfil?.id])

  async function cargar() {
    setLoading(true)

    // Obtener equipos del coordinador
    const { data: equiposCoord } = await supabase
      .from('equipo_coordinadores')
      .select('equipo_id, equipos(id, nombre)')
      .eq('coordinador_id', perfil!.id)

    if (!equiposCoord?.length) { setLoading(false); return }

    const equipoIds = equiposCoord.map(ec => ec.equipo_id)
    const equipoNombres: Record<string, string> = {}
    equiposCoord.forEach(ec => {
      const eq = ec.equipos as any
      if (eq) equipoNombres[eq.id] = eq.nombre
    })

    // Obtener encuestas asignadas a esos equipos
    const { data: encsEquipo } = await supabase
      .from('encuestas_equipo')
      .select('equipo_id, encuesta_id, encuestas(id, nombre, descripcion, estado_produccion, tipo_encuesta, fecha_inicio, fecha_fin)')
      .in('equipo_id', equipoIds)

    const lista: Encuesta[] = (encsEquipo || []).map(ee => {
      const enc = Array.isArray(ee.encuestas) ? ee.encuestas[0] : ee.encuestas as any
      return {
        id:               enc?.id,
        nombre:           enc?.nombre || '—',
        descripcion:      enc?.descripcion || null,
        estado_produccion: enc?.estado_produccion || 'pendiente',
        tipo_encuesta:    enc?.tipo_encuesta || 'domiciliaria',
        fecha_inicio:     enc?.fecha_inicio || null,
        fecha_fin:        enc?.fecha_fin || null,
        equipo_id:        ee.equipo_id,
        equipo_nombre:    equipoNombres[ee.equipo_id] || '—',
      }
    }).filter(e => e.id)

    setEncuestas(lista)
    setLoading(false)
  }

  if (loading) {
    return (
      <View style={[s.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color="#0369a1" size="large" />
      </View>
    )
  }

  return (
    <View style={[s.page, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerEyebrow}>Coordinador</Text>
        <Text style={s.headerTitle}>Encuestas</Text>
      </View>

      {encuestas.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyIcon}>📋</Text>
          <Text style={s.emptyTitle}>Sin encuestas asignadas</Text>
          <Text style={s.emptyDesc}>Cuando el administrador asigne encuestas a tus equipos, aparecerán acá.</Text>
        </View>
      ) : (
        <FlatList
          data={encuestas}
          keyExtractor={item => `${item.id}-${item.equipo_id}`}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          renderItem={({ item }) => {
            const cfg = ESTADO_CFG[item.estado_produccion] || ESTADO_CFG.pendiente
            const publicada = item.estado_produccion === 'publicada'
            return (
              <TouchableOpacity
                style={[s.card, publicada && s.cardPublicada]}
                activeOpacity={0.7}
                onPress={() => router.push({
                  pathname: '/(coordinador)/encuesta-detalle',
                  params: {
                    encuestaId: item.id,
                    equipoId: item.equipo_id,
                    nombre: item.nombre,
                    tipoEncuesta: item.tipo_encuesta,
                  },
                })}
              >
                {/* Header de la card */}
                <View style={s.cardHeader}>
                  <Text style={s.cardNombre} numberOfLines={2}>{item.nombre}</Text>
                  <View style={[s.badge, { backgroundColor: cfg.bg }]}>
                    <Text style={[s.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
                  </View>
                </View>

                {/* Equipo */}
                <View style={s.cardMeta}>
                  <Text style={s.cardMetaText}>👥 {item.equipo_nombre}</Text>
                  {item.tipo_encuesta && (
                    <Text style={s.cardMetaText}>📋 {item.tipo_encuesta.charAt(0).toUpperCase() + item.tipo_encuesta.slice(1)}</Text>
                  )}
                </View>

                {item.descripcion ? (
                  <Text style={s.cardDesc} numberOfLines={2}>{item.descripcion}</Text>
                ) : null}

                {/* Fechas */}
                {(item.fecha_inicio || item.fecha_fin) && (
                  <View style={s.cardFechas}>
                    {item.fecha_inicio && (
                      <Text style={s.cardFechaText}>📅 Desde {new Date(item.fecha_inicio).toLocaleDateString('es-AR')}</Text>
                    )}
                    {item.fecha_fin && (
                      <Text style={s.cardFechaText}>⏳ Hasta {new Date(item.fecha_fin).toLocaleDateString('es-AR')}</Text>
                    )}
                  </View>
                )}

                <View style={s.cardFooter}>
                  <Text style={s.cardAction}>Ver detalle →</Text>
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
  page:           { flex: 1, backgroundColor: '#f8fafc' },
  center:         { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header:         { paddingHorizontal: 20, paddingVertical: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  headerEyebrow:  { fontSize: 11, fontWeight: '700', color: '#9ca3af', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2 },
  headerTitle:    { fontSize: 24, fontWeight: '800', color: '#111827' },
  empty:          { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyIcon:      { fontSize: 48, marginBottom: 12 },
  emptyTitle:     { fontSize: 18, fontWeight: '700', color: '#374151', marginBottom: 8 },
  emptyDesc:      { fontSize: 14, color: '#9ca3af', textAlign: 'center', lineHeight: 20 },
  card:           { backgroundColor: '#fff', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#e5e7eb', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  cardPublicada:  { borderColor: '#a7f3d0', borderWidth: 1.5 },
  cardHeader:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 },
  cardNombre:     { flex: 1, fontSize: 16, fontWeight: '700', color: '#111827' },
  badge:          { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 100 },
  badgeText:      { fontSize: 11, fontWeight: '700' },
  cardMeta:       { flexDirection: 'row', gap: 12, marginBottom: 6 },
  cardMetaText:   { fontSize: 12, color: '#6b7280' },
  cardDesc:       { fontSize: 13, color: '#6b7280', lineHeight: 18, marginBottom: 8 },
  cardFechas:     { flexDirection: 'row', gap: 12, marginBottom: 8 },
  cardFechaText:  { fontSize: 12, color: '#9ca3af' },
  cardFooter:     { borderTopWidth: 1, borderTopColor: '#f3f4f6', paddingTop: 10, marginTop: 4 },
  cardAction:     { fontSize: 13, fontWeight: '600', color: '#0369a1', textAlign: 'right' },
})