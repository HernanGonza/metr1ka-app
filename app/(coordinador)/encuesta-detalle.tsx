import { useState, useEffect, useRef } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  Map as MLMap,
  Camera,
  Marker,
  GeoJSONSource,
  Layer,
  type CameraRef,
} from '@maplibre/maplibre-react-native'
import { supabase } from '../../lib/supabase'

type Encuestador = {
  id: string
  nombre: string
  lat?: number
  lng?: number
  actualizado_en?: string
}

const COLORES_ENC = ['#0369a1', '#7c3aed', '#b45309', '#059669', '#dc2626', '#0891b2']

function esActivo(ts?: string) {
  if (!ts) return false
  return (Date.now() - new Date(ts).getTime()) < 5 * 60 * 1000
}

function calcMins(ts?: string) {
  if (!ts) return null
  return Math.floor((Date.now() - new Date(ts).getTime()) / 60000)
}

// Calcular el centro y zoom de un GeoJSON para enfocar el mapa
function calcularBounds(geojson: any): { center: [number, number]; zoom: number } | null {
  try {
    const features = geojson?.features || (geojson?.type === 'Feature' ? [geojson] : [])
    let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity

    function procesarCoords(coords: any) {
      if (!Array.isArray(coords)) return
      if (typeof coords[0] === 'number') {
        const [lng, lat] = coords
        if (lng < minLng) minLng = lng
        if (lng > maxLng) maxLng = lng
        if (lat < minLat) minLat = lat
        if (lat > maxLat) maxLat = lat
      } else {
        coords.forEach(procesarCoords)
      }
    }

    features.forEach((f: any) => procesarCoords(f?.geometry?.coordinates))

    if (!isFinite(minLng)) return null

    const centerLng = (minLng + maxLng) / 2
    const centerLat = (minLat + maxLat) / 2
    const diffLng   = maxLng - minLng
    const diffLat   = maxLat - minLat
    const maxDiff   = Math.max(diffLng, diffLat)

    // Calcular zoom aproximado según el tamaño del área
    let zoom = 14
    if (maxDiff > 0.05)      zoom = 12
    else if (maxDiff > 0.02) zoom = 13
    else if (maxDiff > 0.01) zoom = 14
    else if (maxDiff > 0.005) zoom = 15
    else                      zoom = 16

    return { center: [centerLng, centerLat], zoom }
  } catch { return null }
}

export default function EncuestaDetalle() {
  const { encuestaId, equipoId, nombre } = useLocalSearchParams<{
    encuestaId: string; equipoId: string; nombre: string
  }>()
  const router    = useRouter()
  const insets    = useSafeAreaInsets()
  const cameraRef = useRef<CameraRef>(null)

  const [encuestadores, setEncuestadores] = useState<Encuestador[]>([])
  const [zonaGeojson,   setZonaGeojson]   = useState<any>(null)
  const [manzanasGeojson, setManzanasGeojson] = useState<any>(null)
  const [mapBounds, setMapBounds]         = useState<{ center: [number, number]; zoom: number } | null>(null)
  const [loading, setLoading]             = useState(true)
  const [stats, setStats]                 = useState({ completadas: 0, total: 0 })

  useEffect(() => {
    if (!equipoId || !encuestaId) return
    cargar()

    // Realtime — ubicaciones del equipo
    const channel = supabase.channel(`detalle-enc-${equipoId}-${encuestaId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public',
        table: 'ubicaciones_encuestadores',
      }, payload => {
        const u = payload.new as any
        setEncuestadores(prev => {
          const idx = prev.findIndex(e => e.id === u.encuestador_id)
          if (idx < 0) return prev
          const next = [...prev]
          next[idx] = { ...next[idx], lat: u.lat, lng: u.lng, actualizado_en: u.actualizado_en }
          return next
        })
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [equipoId, encuestaId])

  async function cargar() {
    setLoading(true)

    // 1. Zona de la encuesta para este equipo
    const { data: zona } = await supabase
      .from('encuesta_zonas')
      .select('id, nombre, area_geojson')
      .eq('encuesta_id', encuestaId)
      .eq('equipo_id', equipoId)
      .maybeSingle()

    if (zona?.area_geojson) {
      setZonaGeojson(zona.area_geojson)
      const bounds = calcularBounds(zona.area_geojson)
      if (bounds) setMapBounds(bounds)
    }

    // 2. Manzanas de esa zona
    if (zona?.id) {
      const { data: manzanas } = await supabase
        .from('manzanas')
        .select('id, area_geojson, estado')
        .eq('encuesta_zona_id', zona.id)

      if (manzanas?.length) {
        // Construir FeatureCollection de manzanas con estado como propiedad
        const features = manzanas
          .filter(m => m.area_geojson)
          .map(m => ({
            ...m.area_geojson,
            properties: {
              ...(m.area_geojson?.properties || {}),
              estado: m.estado,
              manzana_id: m.id,
            },
          }))
        setManzanasGeojson({ type: 'FeatureCollection', features })

        // Stats
        const completadas = manzanas.filter(m => m.estado === 'completada').length
        setStats({ completadas, total: manzanas.length })
      }
    }

    // 3. Encuestadores del equipo
    const { data: miembros } = await supabase
      .from('equipo_encuestadores')
      .select('encuestador_id, perfiles(id, nombre_completo)')
      .eq('equipo_id', equipoId)

    const ids = (miembros || []).map(m => m.encuestador_id)
    let ubicsMap: Record<string, any> = {}
    if (ids.length) {
      const { data: ubs } = await supabase
        .from('ubicaciones_encuestadores')
        .select('encuestador_id, lat, lng, actualizado_en')
        .in('encuestador_id', ids)
      ;(ubs || []).forEach(u => { ubicsMap[u.encuestador_id] = u })
    }

    const lista: Encuestador[] = (miembros || []).map(m => {
      const p = Array.isArray(m.perfiles) ? m.perfiles[0] : m.perfiles as any
      const u = ubicsMap[m.encuestador_id]
      return {
        id:             m.encuestador_id,
        nombre:         p?.nombre_completo || '—',
        lat:            u?.lat,
        lng:            u?.lng,
        actualizado_en: u?.actualizado_en,
      }
    })

    setEncuestadores(lista)
    setLoading(false)
  }

  function focusEncuestador(enc: Encuestador) {
    if (enc.lat && enc.lng && cameraRef.current) {
      cameraRef.current.easeTo({ center: [enc.lng, enc.lat], zoom: 17, duration: 500 })
    }
  }

  // Centro del mapa
  const defaultCenter: [number, number] = mapBounds?.center || [-55.8974, -27.3671]
  const defaultZoom = mapBounds?.zoom || 14

  const activos = encuestadores.filter(e => esActivo(e.actualizado_en))
  const pctCompletado = stats.total > 0 ? Math.round((stats.completadas / stats.total) * 100) : 0

  return (
    <View style={[s.page, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backText}>← Volver</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle} numberOfLines={1}>{nombre}</Text>
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator color="#0369a1" size="large" /></View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}>

          {/* Mapa con zona y manzanas */}
          <View style={s.mapaWrap}>
            <MLMap
              style={s.mapa}
              mapStyle="https://tiles.openfreemap.org/styles/liberty"
              compass={false}
              logo={false}
              attribution={false}
            >
              <Camera
                ref={cameraRef}
                initialViewState={{
                  center: defaultCenter,
                  zoom: defaultZoom,
                }}
              />

              {/* Zona — contorno azul */}
              {zonaGeojson && (
                <GeoJSONSource id="zona-src" data={zonaGeojson}>
                  <Layer
                    type="fill"
                    id="zona-fill"
                    paint={{ 'fill-color': 'rgba(3,105,161,0.08)', 'fill-outline-color': '#0369a1' }}
                  />
                  <Layer
                    type="line"
                    id="zona-line"
                    paint={{ 'line-color': '#0369a1', 'line-width': 2, 'line-dasharray': [3, 2] }}
                  />
                </GeoJSONSource>
              )}

              {/* Manzanas — coloreadas por estado */}
              {manzanasGeojson && (
                <GeoJSONSource id="manzanas-src" data={manzanasGeojson}>
                  <Layer
                    type="fill"
                    id="manzanas-fill"
                    paint={{
                      'fill-color': [
                        'match',
                        ['get', 'estado'],
                        'completada', 'rgba(22,163,74,0.25)',
                        'en_proceso', 'rgba(234,179,8,0.25)',
                        'rgba(107,114,128,0.15)',
                      ],
                      'fill-outline-color': [
                        'match',
                        ['get', 'estado'],
                        'completada', '#16a34a',
                        'en_proceso', '#ca8a04',
                        '#9ca3af',
                      ],
                    }}
                  />
                  <Layer
                    type="line"
                    id="manzanas-line"
                    paint={{
                      'line-color': [
                        'match',
                        ['get', 'estado'],
                        'completada', '#16a34a',
                        'en_proceso', '#ca8a04',
                        '#d1d5db',
                      ],
                      'line-width': 1.5,
                    }}
                  />
                </GeoJSONSource>
              )}

              {/* Encuestadores en tiempo real */}
              {encuestadores.map((enc, i) => {
                if (!enc.lat || !enc.lng) return null
                const activo = esActivo(enc.actualizado_en)
                const color  = COLORES_ENC[i % COLORES_ENC.length]
                return (
                  <Marker
                    key={enc.id}
                    id={`enc-${enc.id}`}
                    lngLat={[enc.lng, enc.lat] as [number, number]}
                    onPress={() => focusEncuestador(enc)}
                  >
                    <View style={[s.marker, {
                      backgroundColor: activo ? color : '#9ca3af',
                      borderColor: activo ? '#fff' : '#e5e7eb',
                    }]}>
                      <Text style={s.markerText}>{enc.nombre[0]?.toUpperCase()}</Text>
                    </View>
                  </Marker>
                )
              })}
            </MLMap>

            {/* Leyenda sobre el mapa */}
            <View style={s.leyenda}>
              <View style={s.leyendaItem}>
                <View style={[s.leyendaDot, { backgroundColor: '#16a34a' }]} />
                <Text style={s.leyendaText}>Completada</Text>
              </View>
              <View style={s.leyendaItem}>
                <View style={[s.leyendaDot, { backgroundColor: '#ca8a04' }]} />
                <Text style={s.leyendaText}>En proceso</Text>
              </View>
              <View style={s.leyendaItem}>
                <View style={[s.leyendaDot, { backgroundColor: '#9ca3af' }]} />
                <Text style={s.leyendaText}>Pendiente</Text>
              </View>
            </View>
          </View>

          {/* Stats de progreso */}
          <View style={s.statsRow}>
            <View style={s.statCard}>
              <Text style={s.statVal}>{stats.completadas}</Text>
              <Text style={s.statLabel}>Manzanas completadas</Text>
            </View>
            <View style={s.statCard}>
              <Text style={s.statVal}>{stats.total}</Text>
              <Text style={s.statLabel}>Total manzanas</Text>
            </View>
            <View style={[s.statCard, { backgroundColor: pctCompletado > 0 ? '#d8f3dc' : '#f9fafb' }]}>
              <Text style={[s.statVal, { color: pctCompletado > 0 ? '#1a472a' : '#9ca3af' }]}>{pctCompletado}%</Text>
              <Text style={[s.statLabel, { color: pctCompletado > 0 ? '#2d6a4f' : '#9ca3af' }]}>Progreso</Text>
            </View>
          </View>

          {/* Lista encuestadores */}
          <View style={s.seccion}>
            <Text style={s.secTitle}>
              Equipo en campo — {activos.length} activos
            </Text>
            {encuestadores.map((enc, i) => {
              const activo = esActivo(enc.actualizado_en)
              const mins   = calcMins(enc.actualizado_en)
              const color  = COLORES_ENC[i % COLORES_ENC.length]
              return (
                <TouchableOpacity
                  key={enc.id}
                  style={s.encRow}
                  onPress={() => focusEncuestador(enc)}
                  activeOpacity={0.7}
                >
                  <View style={[s.encAvatar, { backgroundColor: activo ? color + '22' : '#f3f4f6' }]}>
                    <Text style={[s.encAvatarText, { color: activo ? color : '#9ca3af' }]}>
                      {enc.nombre[0]?.toUpperCase()}
                    </Text>
                  </View>
                  <View style={s.encInfo}>
                    <Text style={s.encNombre}>{enc.nombre}</Text>
                    <Text style={[s.encEstado, { color: activo ? '#16a34a' : '#9ca3af' }]}>
                      {enc.lat
                        ? activo
                          ? '● En campo ahora'
                          : mins !== null ? `Última señal hace ${mins} min` : 'Sin señal'
                        : 'Sin ubicación registrada'
                      }
                    </Text>
                  </View>
                  {enc.lat && (
                    <Text style={s.focusBtn}>🎯</Text>
                  )}
                </TouchableOpacity>
              )
            })}
          </View>

        </ScrollView>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  page:         { flex: 1, backgroundColor: '#f8fafc' },
  center:       { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header:       { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  backBtn:      { paddingRight: 4 },
  backText:     { fontSize: 14, color: '#0369a1', fontWeight: '600' },
  headerTitle:  { flex: 1, fontSize: 17, fontWeight: '700', color: '#111827' },
  mapaWrap:     { height: 320, position: 'relative' },
  mapa:         { flex: 1 },
  leyenda:      { position: 'absolute', bottom: 8, left: 8, backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, flexDirection: 'row', gap: 10 },
  leyendaItem:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  leyendaDot:   { width: 8, height: 8, borderRadius: 4 },
  leyendaText:  { fontSize: 10, fontWeight: '600', color: '#374151' },
  statsRow:     { flexDirection: 'row', gap: 8, padding: 16, paddingBottom: 8 },
  statCard:     { flex: 1, backgroundColor: '#f0f9ff', borderRadius: 10, padding: 12, alignItems: 'center' },
  statVal:      { fontSize: 24, fontWeight: '800', color: '#0369a1' },
  statLabel:    { fontSize: 10, color: '#6b7280', fontWeight: '600', textAlign: 'center', marginTop: 2 },
  seccion:      { paddingHorizontal: 16, paddingTop: 8 },
  secTitle:     { fontSize: 13, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  encRow:       { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#e5e7eb' },
  encAvatar:    { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  encAvatarText:{ fontSize: 14, fontWeight: '700' },
  encInfo:      { flex: 1 },
  encNombre:    { fontSize: 14, fontWeight: '600', color: '#111827' },
  encEstado:    { fontSize: 12, marginTop: 2 },
  focusBtn:     { fontSize: 16 },
  marker:       { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 2, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 3, elevation: 3 },
  markerText:   { fontSize: 11, fontWeight: '700', color: '#fff' },
})