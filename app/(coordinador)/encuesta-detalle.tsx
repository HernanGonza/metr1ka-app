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

const COLORES = ['#0369a1', '#7c3aed', '#b45309', '#059669', '#dc2626', '#0891b2']

function esActivo(ts?: string) {
  if (!ts) return false
  return (Date.now() - new Date(ts).getTime()) < 5 * 60 * 1000
}

function calcMins(ts?: string) {
  if (!ts) return null
  return Math.floor((Date.now() - new Date(ts).getTime()) / 60000)
}

function calcularBounds(geojson: any): { center: [number, number]; zoom: number } | null {
  try {
    const features = geojson?.features || (geojson?.type === 'Feature' ? [geojson] : [])
    let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity
    function proc(coords: any) {
      if (!Array.isArray(coords)) return
      if (typeof coords[0] === 'number') {
        if (coords[0] < minLng) minLng = coords[0]
        if (coords[0] > maxLng) maxLng = coords[0]
        if (coords[1] < minLat) minLat = coords[1]
        if (coords[1] > maxLat) maxLat = coords[1]
      } else coords.forEach(proc)
    }
    features.forEach((f: any) => proc(f?.geometry?.coordinates))
    if (!isFinite(minLng)) return null
    const maxDiff = Math.max(maxLng - minLng, maxLat - minLat)
    return {
      center: [(minLng + maxLng) / 2, (minLat + maxLat) / 2],
      zoom: maxDiff > 0.05 ? 12 : maxDiff > 0.02 ? 13 : maxDiff > 0.01 ? 14 : maxDiff > 0.005 ? 15 : 16,
    }
  } catch { return null }
}

export default function EncuestaDetalle() {
  const { encuestaId, equipoId, nombre, tipoEncuesta } = useLocalSearchParams<{
    encuestaId: string; equipoId: string; nombre: string; tipoEncuesta: string
  }>()
  const router    = useRouter()
  const insets    = useSafeAreaInsets()
  const cameraRef = useRef<CameraRef>(null)

  const esDomiciliaria = tipoEncuesta === 'domiciliaria'

  const [encuestadores,   setEncuestadores]   = useState<Encuestador[]>([])
  const [zonaGeojson,     setZonaGeojson]     = useState<any>(null)
  const [manzanasGeojson, setManzanasGeojson] = useState<any>(null)
  const [parcelasGeojson, setParcelasGeojson] = useState<any>(null)
  const [mapBounds,       setMapBounds]       = useState<{ center: [number, number]; zoom: number } | null>(null)
  const [loading,         setLoading]         = useState(true)
  const [stats,           setStats]           = useState({ manzanas: 0, manzanasOk: 0, parcelas: 0, parcelasOk: 0 })

  useEffect(() => {
    if (!equipoId || !encuestaId) return
    cargar()

    const channel = supabase.channel(`coord-enc-${equipoId}-${encuestaId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ubicaciones_encuestadores' }, payload => {
        const u = payload.new as any
        setEncuestadores(prev => {
          const idx = prev.findIndex(e => e.id === u.encuestador_id)
          if (idx < 0) return prev
          const next = [...prev]; next[idx] = { ...next[idx], lat: u.lat, lng: u.lng, actualizado_en: u.actualizado_en }
          return next
        })
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [equipoId, encuestaId])

  async function cargar() {
    setLoading(true)
    await Promise.all([cargarZonaYEncuestadores(), esDomiciliaria ? cargarManzanasYParcelas() : Promise.resolve()])
    setLoading(false)
  }

  async function cargarZonaYEncuestadores() {
    // Zona
    const { data: zona } = await supabase
      .from('encuesta_zonas').select('id, area_geojson')
      .eq('encuesta_id', encuestaId).eq('equipo_id', equipoId).maybeSingle()

    if (zona?.area_geojson) {
      setZonaGeojson(zona.area_geojson)
      const bounds = calcularBounds(zona.area_geojson)
      if (bounds) setMapBounds(bounds)
    }

    // Encuestadores
    const { data: miembros } = await supabase
      .from('equipo_encuestadores').select('encuestador_id, perfiles(id, nombre_completo)')
      .eq('equipo_id', equipoId)

    const ids = (miembros || []).map(m => m.encuestador_id)
    let ubics: Record<string, any> = {}
    if (ids.length) {
      const { data: ubs } = await supabase
        .from('ubicaciones_encuestadores').select('encuestador_id, lat, lng, actualizado_en')
        .in('encuestador_id', ids)
      ;(ubs || []).forEach(u => { ubics[u.encuestador_id] = u })
    }

    setEncuestadores((miembros || []).map(m => {
      const p = Array.isArray(m.perfiles) ? m.perfiles[0] : m.perfiles as any
      const u = ubics[m.encuestador_id]
      return { id: m.encuestador_id, nombre: p?.nombre_completo || '—', lat: u?.lat, lng: u?.lng, actualizado_en: u?.actualizado_en }
    }))
  }

  async function cargarManzanasYParcelas() {
    const { data: zona } = await supabase
      .from('encuesta_zonas').select('id')
      .eq('encuesta_id', encuestaId).eq('equipo_id', equipoId).maybeSingle()
    if (!zona?.id) return

    const { data: manzanas } = await supabase
      .from('manzanas').select('id, area_geojson, estado, orden')
      .eq('encuesta_zona_id', zona.id).order('orden')

    if (!manzanas?.length) return

    // GeoJSON de manzanas
    const mFeatures = manzanas.filter(m => m.area_geojson).map(m => ({
      ...(m.area_geojson?.type === 'Feature' ? m.area_geojson : { type: 'Feature', geometry: m.area_geojson, properties: {} }),
      properties: { ...(m.area_geojson?.properties || {}), estado: m.estado, manzana_id: m.id },
    }))
    setManzanasGeojson({ type: 'FeatureCollection', features: mFeatures })
    setStats(prev => ({ ...prev, manzanas: manzanas.length, manzanasOk: manzanas.filter(m => m.estado === 'completada').length }))

    // Parcelas
    const mIds = manzanas.map(m => m.id)
    const { data: parcelas } = await supabase
      .from('parcelas').select('id, manzana_id, area_geojson, estado, direccion')
      .in('manzana_id', mIds)

    if (!parcelas?.length) return

    const pFeatures = parcelas.filter(p => p.area_geojson).map(p => ({
      ...(p.area_geojson?.type === 'Feature' ? p.area_geojson : { type: 'Feature', geometry: p.area_geojson, properties: {} }),
      properties: { ...(p.area_geojson?.properties || {}), estado: p.estado, parcela_id: p.id, direccion: p.direccion },
    }))
    setParcelasGeojson({ type: 'FeatureCollection', features: pFeatures })
    setStats(prev => ({ ...prev, parcelas: parcelas.length, parcelasOk: parcelas.filter(p => p.estado === 'completada').length }))
  }

  function focusEnc(enc: Encuestador) {
    if (enc.lat && enc.lng && cameraRef.current) {
      cameraRef.current.easeTo({ center: [enc.lng, enc.lat], zoom: 17, duration: 500 })
    }
  }

  const defaultCenter: [number, number] = mapBounds?.center || [-55.8974, -27.3671]
  const activos = encuestadores.filter(e => esActivo(e.actualizado_en))
  const pctM = stats.manzanas > 0 ? Math.round(stats.manzanasOk / stats.manzanas * 100) : 0
  const pctP = stats.parcelas > 0 ? Math.round(stats.parcelasOk / stats.parcelas * 100) : 0

  return (
    <View style={[s.page, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}><Text style={s.back}>← Volver</Text></TouchableOpacity>
        <Text style={s.headerTitle} numberOfLines={1}>{nombre}</Text>
        <View style={s.tipoBadge}>
          <Text style={s.tipoText}>{tipoEncuesta || 'domiciliaria'}</Text>
        </View>
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator color="#0369a1" size="large" /></View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}>

          {/* Mapa */}
          <View style={s.mapaWrap}>
            <MLMap style={s.mapa} mapStyle="https://tiles.openfreemap.org/styles/liberty"
              compass={false} logo={false} attribution={false}>
              <Camera ref={cameraRef}
                initialViewState={{ center: defaultCenter, zoom: mapBounds?.zoom || 14 }} />

              {/* Zona */}
              {zonaGeojson && (
                <GeoJSONSource id="zona" data={zonaGeojson}>
                  <Layer type="fill" id="zona-fill"
                    paint={{ 'fill-color': 'rgba(3,105,161,0.06)', 'fill-outline-color': '#0369a1' }} />
                  <Layer type="line" id="zona-line"
                    paint={{ 'line-color': '#0369a1', 'line-width': 2, 'line-dasharray': [4, 2] }} />
                </GeoJSONSource>
              )}

              {/* Manzanas — solo domiciliaria */}
              {esDomiciliaria && manzanasGeojson && (
                <GeoJSONSource id="manzanas" data={manzanasGeojson}>
                  <Layer type="fill" id="manzanas-fill" paint={{
                    'fill-color': ['match', ['get', 'estado'],
                      'completada', 'rgba(22,163,74,0.2)',
                      'en_proceso', 'rgba(234,179,8,0.2)',
                      'rgba(107,114,128,0.08)'],
                  }} />
                  <Layer type="line" id="manzanas-line" paint={{
                    'line-color': ['match', ['get', 'estado'],
                      'completada', '#16a34a', 'en_proceso', '#ca8a04', '#d1d5db'],
                    'line-width': 1.5,
                  }} />
                </GeoJSONSource>
              )}

              {/* Parcelas — solo domiciliaria */}
              {esDomiciliaria && parcelasGeojson && (
                <GeoJSONSource id="parcelas" data={parcelasGeojson}>
                  <Layer type="fill" id="parcelas-fill" paint={{
                    'fill-color': ['match', ['get', 'estado'],
                      'completada', 'rgba(22,163,74,0.4)',
                      'no_hay_nadie', 'rgba(107,114,128,0.2)',
                      'no_es_vivienda', 'rgba(239,68,68,0.2)',
                      'rgba(255,255,255,0)'],
                  }} />
                  <Layer type="line" id="parcelas-line" paint={{
                    'line-color': ['match', ['get', 'estado'],
                      'completada', '#16a34a',
                      'no_hay_nadie', '#9ca3af',
                      'no_es_vivienda', '#ef4444',
                      '#e5e7eb'],
                    'line-width': 0.8,
                  }} />
                </GeoJSONSource>
              )}

              {/* Encuestadores en tiempo real */}
              {encuestadores.map((enc, i) => {
                if (!enc.lat || !enc.lng) return null
                const activo = esActivo(enc.actualizado_en)
                return (
                  <Marker key={enc.id} id={`enc-${enc.id}`}
                    lngLat={[enc.lng, enc.lat] as [number, number]}
                    onPress={() => focusEnc(enc)}>
                    <View style={[s.marker, { backgroundColor: activo ? COLORES[i % COLORES.length] : '#9ca3af' }]}>
                      <Text style={s.markerText}>{enc.nombre[0]?.toUpperCase()}</Text>
                    </View>
                  </Marker>
                )
              })}
            </MLMap>

            {/* Leyenda */}
            <View style={s.leyenda}>
              <Text style={[s.leyendaItem, { color: '#16a34a' }]}>● Completada</Text>
              {esDomiciliaria && <Text style={[s.leyendaItem, { color: '#ca8a04' }]}>● En proceso</Text>}
              {esDomiciliaria && <Text style={[s.leyendaItem, { color: '#ef4444' }]}>● No vivienda</Text>}
              <Text style={[s.leyendaItem, { color: '#9ca3af' }]}>● Pendiente</Text>
            </View>
          </View>

          {/* Stats */}
          <View style={s.statsRow}>
            {esDomiciliaria && (
              <>
                <View style={s.statCard}>
                  <Text style={s.statVal}>{stats.manzanasOk}/{stats.manzanas}</Text>
                  <Text style={s.statLabel}>Manzanas {pctM}%</Text>
                </View>
                <View style={s.statCard}>
                  <Text style={s.statVal}>{stats.parcelasOk}/{stats.parcelas}</Text>
                  <Text style={s.statLabel}>Parcelas {pctP}%</Text>
                </View>
              </>
            )}
            <View style={[s.statCard, { backgroundColor: activos.length > 0 ? '#d8f3dc' : '#f3f4f6' }]}>
              <Text style={[s.statVal, { color: activos.length > 0 ? '#1a472a' : '#9ca3af' }]}>
                {activos.length}/{encuestadores.length}
              </Text>
              <Text style={[s.statLabel, { color: activos.length > 0 ? '#2d6a4f' : '#9ca3af' }]}>En campo</Text>
            </View>
          </View>

          {/* Lista encuestadores */}
          <View style={{ paddingHorizontal: 16 }}>
            <Text style={s.secTitle}>Equipo</Text>
            {encuestadores.map((enc, i) => {
              const activo = esActivo(enc.actualizado_en)
              const mins   = calcMins(enc.actualizado_en)
              const color  = COLORES[i % COLORES.length]
              return (
                <TouchableOpacity key={enc.id} style={s.encRow}
                  onPress={() => focusEnc(enc)} activeOpacity={0.7}>
                  <View style={[s.encAvatar, { backgroundColor: activo ? color + '22' : '#f3f4f6' }]}>
                    <Text style={[s.encAvatarText, { color: activo ? color : '#9ca3af' }]}>
                      {enc.nombre[0]?.toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.encNombre}>{enc.nombre}</Text>
                    <Text style={[s.encEstado, { color: activo ? '#16a34a' : '#9ca3af' }]}>
                      {enc.lat ? (activo ? '● En campo ahora' : mins !== null ? `Última señal hace ${mins} min` : 'Sin señal') : 'Sin ubicación'}
                    </Text>
                  </View>
                  {enc.lat && <Text style={{ fontSize: 16 }}>🎯</Text>}
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
  header:       { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  back:         { fontSize: 14, color: '#0369a1', fontWeight: '600' },
  headerTitle:  { flex: 1, fontSize: 16, fontWeight: '700', color: '#111827' },
  tipoBadge:    { backgroundColor: '#f3f4f6', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 100 },
  tipoText:     { fontSize: 10, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase' },
  mapaWrap:     { height: 340, position: 'relative' },
  mapa:         { flex: 1 },
  leyenda:      { position: 'absolute', bottom: 8, left: 8, backgroundColor: 'rgba(255,255,255,0.93)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  leyendaItem:  { fontSize: 10, fontWeight: '700' },
  statsRow:     { flexDirection: 'row', gap: 8, padding: 16, paddingBottom: 8 },
  statCard:     { flex: 1, backgroundColor: '#f0f9ff', borderRadius: 10, padding: 12, alignItems: 'center' },
  statVal:      { fontSize: 20, fontWeight: '800', color: '#0369a1' },
  statLabel:    { fontSize: 10, color: '#6b7280', fontWeight: '600', textAlign: 'center', marginTop: 2 },
  secTitle:     { fontSize: 13, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  encRow:       { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#e5e7eb' },
  encAvatar:    { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  encAvatarText:{ fontSize: 14, fontWeight: '700' },
  encNombre:    { fontSize: 14, fontWeight: '600', color: '#111827' },
  encEstado:    { fontSize: 12, marginTop: 2 },
  marker:       { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff', elevation: 3 },
  markerText:   { fontSize: 11, fontWeight: '700', color: '#fff' },
})