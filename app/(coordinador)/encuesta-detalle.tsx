import { useState, useEffect, useRef, useMemo } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { MapLibreDisponible, MLMap, Camera, Marker, GeoJSONSource, Layer, MapaPlaceholder } from '../../components/MapaSeguro'
import { MapaLeaflet } from '../../components/MapaLeaflet'
import type { CameraRef } from '@maplibre/maplibre-react-native'
import { supabase } from '../../lib/supabase'

type Persona = {
  id: string
  nombre: string
  lat?: number
  lng?: number
  actualizado_en?: string
  esCoordinador?: boolean
}

type StatsEnc = {
  completadas: number
  no_respuesta: number
  total: number
  cuota: number
}

type Zona = {
  id: string
  nombre: string
  geojson: any
}

const COLORES      = ['#0369a1', '#7c3aed', '#b45309', '#059669', '#dc2626', '#0891b2']
const COLORES_ZONA = ['#1a472a', '#7c3aed', '#b45309', '#1e40af', '#9f1239', '#065f46']

function esActivo(ts?: string) {
  if (!ts) return false
  return (Date.now() - new Date(ts).getTime()) < 5 * 60 * 1000
}
function calcMins(ts?: string) {
  if (!ts) return null
  return Math.floor((Date.now() - new Date(ts).getTime()) / 60000)
}
function calcularBounds(features: any[]): { center: [number, number]; zoom: number } | null {
  try {
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

  const [personas,        setPersonas]        = useState<Persona[]>([])
  const [zonas,           setZonas]           = useState<Zona[]>([])
  const [statsEncs,       setStatsEncs]       = useState<Record<string, StatsEnc>>({})
  const [manzanasGeojson, setManzanasGeojson] = useState<any>(null)
  const [parcelasGeojson, setParcelasGeojson] = useState<any>(null)
  const [mapBounds,       setMapBounds]       = useState<{ center: [number, number]; zoom: number } | null>(null)
  const [loading,         setLoading]         = useState(true)
  const [stats,           setStats]           = useState({ manzanas: 0, manzanasOk: 0, parcelas: 0, parcelasOk: 0 })

  // GeoJSON combinado de todas las zonas para MapaLeaflet
  const zonasGeojsonCombinado = useMemo(() => {
    const features: any[] = []
    zonas.forEach(z => {
      if (z.geojson?.features) features.push(...z.geojson.features)
    })
    return features.length > 0 ? { type: 'FeatureCollection', features } : null
  }, [zonas])

  useEffect(() => {
    if (!equipoId || !encuestaId) return
    cargar()

    const channelName = `coord-enc-${equipoId}-${encuestaId}`
    // Remover canal existente si ya estaba suscrito
    supabase.removeChannel(supabase.channel(channelName))

    const channel = supabase.channel(channelName)
    channel
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ubicaciones_encuestadores' }, payload => {
        const u = payload.new as any
        setPersonas(prev => {
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
    await Promise.all([
      cargarZonasYPersonas(),
      esDomiciliaria ? cargarManzanasYParcelas() : Promise.resolve(),
    ])
    setLoading(false)
  }

  async function cargarZonasYPersonas() {
    // Todas las zonas del equipo en esta encuesta
    const { data: zonasData } = await supabase
      .from('encuesta_zonas')
      .select('id, nombre, area_geojson')
      .eq('encuesta_id', encuestaId)
      .eq('equipo_id', equipoId)
      .order('orden')

    const zonasLista: Zona[] = (zonasData || []).map(z => ({
      id: z.id, nombre: z.nombre, geojson: z.area_geojson,
    }))
    setZonas(zonasLista)

    const allFeatures: any[] = []
    zonasLista.forEach(z => { if (z.geojson?.features) allFeatures.push(...z.geojson.features) })
    if (allFeatures.length > 0) {
      const bounds = calcularBounds(allFeatures)
      if (bounds) setMapBounds(bounds)
    }

    // Encuestadores
    const { data: miembros } = await supabase
      .from('equipo_encuestadores')
      .select('encuestador_id, perfiles(id, nombre_completo)')
      .eq('equipo_id', equipoId)
    const ids = (miembros || []).map(m => m.encuestador_id)
    let ubics: Record<string, any> = {}
    if (ids.length) {
      const { data: ubs } = await supabase
        .from('ubicaciones_encuestadores').select('encuestador_id, lat, lng, actualizado_en')
        .in('encuestador_id', ids)
      ;(ubs || []).forEach(u => { ubics[u.encuestador_id] = u })
    }
    const encuestadores: Persona[] = (miembros || []).map(m => {
      const p = Array.isArray(m.perfiles) ? m.perfiles[0] : m.perfiles as any
      const u = ubics[m.encuestador_id]
      return { id: m.encuestador_id, nombre: p?.nombre_completo || '—', lat: u?.lat, lng: u?.lng, actualizado_en: u?.actualizado_en, esCoordinador: false }
    })

    // Coordinadores del equipo
    const { data: coords } = await supabase
      .from('equipo_coordinadores')
      .select('coordinador_id, perfiles(id, nombre_completo)')
      .eq('equipo_id', equipoId)
    const coordIds = (coords || []).map(c => c.coordinador_id)
    let coordUbics: Record<string, any> = {}
    if (coordIds.length) {
      const { data: ubs } = await supabase
        .from('ubicaciones_encuestadores').select('encuestador_id, lat, lng, actualizado_en')
        .in('encuestador_id', coordIds)
      ;(ubs || []).forEach(u => { coordUbics[u.encuestador_id] = u })
    }
    const coordinadores: Persona[] = (coords || []).map(c => {
      const p = Array.isArray(c.perfiles) ? c.perfiles[0] : c.perfiles as any
      const u = coordUbics[c.coordinador_id]
      return { id: c.coordinador_id, nombre: p?.nombre_completo || '—', lat: u?.lat, lng: u?.lng, actualizado_en: u?.actualizado_en, esCoordinador: true }
    })

    setPersonas([...encuestadores, ...coordinadores])

    // Cargar stats de cada encuestador
    const { data: statsData } = await supabase.rpc('get_stats_encuestadores_por_encuesta', {
      p_encuesta_id: encuestaId,
      p_equipo_id:   equipoId || null,
    })
    if (statsData) {
      const mapa: Record<string, StatsEnc> = {}
      statsData.forEach((s: any) => { mapa[s.encuestador_id] = s })
      setStatsEncs(mapa)
    }
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
    const mFeatures = manzanas.filter(m => m.area_geojson).map(m => ({
      ...(m.area_geojson?.type === 'Feature' ? m.area_geojson : { type: 'Feature', geometry: m.area_geojson, properties: {} }),
      properties: { ...(m.area_geojson?.properties || {}), estado: m.estado, manzana_id: m.id },
    }))
    setManzanasGeojson({ type: 'FeatureCollection', features: mFeatures })
    setStats(prev => ({ ...prev, manzanas: manzanas.length, manzanasOk: manzanas.filter(m => m.estado === 'completada').length }))
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

  function focusPersona(p: Persona) {
    if (p.lat && p.lng && cameraRef.current) {
      cameraRef.current.easeTo({ center: [p.lng, p.lat], zoom: 17, duration: 500 })
    }
  }

  const scrollRef = useRef<ScrollView>(null)

  const defaultCenter: [number, number] = mapBounds?.center || [-55.8974, -27.3671]
  const encuestadores = personas.filter(p => !p.esCoordinador)
  const coordinadores = personas.filter(p => p.esCoordinador)
  const activos = personas.filter(e => esActivo(e.actualizado_en))
  const pctM = stats.manzanas > 0 ? Math.round(stats.manzanasOk / stats.manzanas * 100) : 0
  const pctP = stats.parcelas > 0 ? Math.round(stats.parcelasOk / stats.parcelas * 100) : 0

  return (
    <View style={[s.page, { paddingTop: insets.top }]}>
      {/* Header con botón modo encuestador */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={s.back}>← Volver</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle} numberOfLines={1}>{nombre}</Text>
        <TouchableOpacity style={s.modoBtn} onPress={() => router.push('/(encuestador)/home')}>
          <Text style={s.modoBtnText}>👤 Encuestador</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator color="#0369a1" size="large" /></View>
      ) : (
        <View style={{ flex: 1 }}>
          {/* Mapa FUERA del ScrollView — así no hay conflicto de gestos */}
          <View style={s.mapaWrap}>
            {!MapLibreDisponible ? (
              <MapaLeaflet
                zonaGeojson={zonasGeojsonCombinado}
                style={{ flex: 1 }}
                colorZona="#0369a1"
                markers={personas
                  .filter(p => p.lat && p.lng)
                  .map((p, i) => ({
                    id: p.id,
                    lat: p.lat!,
                    lng: p.lng!,
                    label: p.nombre[0]?.toUpperCase() || '?',
                    color: p.esCoordinador ? '#f59e0b' : COLORES[i % COLORES.length],
                  }))}
              />
            ) : (
              <MLMap style={s.mapa} mapStyle="https://tiles.openfreemap.org/styles/liberty"
                compass={false} logo={false} attribution={false}>
                <Camera ref={cameraRef} initialViewState={{ center: defaultCenter, zoom: mapBounds?.zoom || 14 }} />

                {/* Polígonos de todas las zonas con colores distintos */}
                {zonas.map((zona, zi) => {
                  if (!zona.geojson?.features) return null
                  const zonaFeat = zona.geojson.features.find((f: any) => f.properties?.tipo === 'zona')
                  if (!zonaFeat) return null
                  const color = COLORES_ZONA[zi % COLORES_ZONA.length]
                  return (
                    <GeoJSONSource key={`zona-${zi}`} id={`zona-${zi}`}
                      data={{ type: 'FeatureCollection', features: [zonaFeat] } as any}>
                      <Layer type="fill" id={`zona-fill-${zi}`}
                        paint={{ 'fill-color': color, 'fill-opacity': 0.08 }} />
                      <Layer type="line" id={`zona-line-${zi}`}
                        paint={{ 'line-color': color, 'line-width': 2.5, 'line-dasharray': [4, 2] }} />
                    </GeoJSONSource>
                  )
                })}

                {/* Manzanas seleccionadas — callejera */}
                {!esDomiciliaria && zonas.map((zona, zi) => {
                  if (!zona.geojson?.features) return null
                  const manzanas = zona.geojson.features.filter(
                    (f: any) => f.properties?.tipo === 'manzana' && f.properties?.seleccionada === true
                  )
                  if (!manzanas.length) return null
                  const color = COLORES_ZONA[zi % COLORES_ZONA.length]
                  return (
                    <GeoJSONSource key={`manz-${zi}`} id={`manz-${zi}`}
                      data={{ type: 'FeatureCollection', features: manzanas } as any}>
                      <Layer type="fill" id={`manz-fill-${zi}`}
                        paint={{ 'fill-color': color, 'fill-opacity': 0.35 }} />
                      <Layer type="line" id={`manz-line-${zi}`}
                        paint={{ 'line-color': color, 'line-width': 1.5 }} />
                    </GeoJSONSource>
                  )
                })}

                {/* Manzanas y parcelas — domiciliaria */}
                {esDomiciliaria && manzanasGeojson && (
                  <GeoJSONSource id="manzanas" data={manzanasGeojson}>
                    <Layer type="fill" id="manzanas-fill" paint={{
                      'fill-color': ['match', ['get', 'estado'],
                        'completada', 'rgba(22,163,74,0.2)', 'en_proceso', 'rgba(234,179,8,0.2)',
                        'rgba(107,114,128,0.08)'],
                    }} />
                    <Layer type="line" id="manzanas-line" paint={{
                      'line-color': ['match', ['get', 'estado'],
                        'completada', '#16a34a', 'en_proceso', '#ca8a04', '#d1d5db'],
                      'line-width': 1.5,
                    }} />
                  </GeoJSONSource>
                )}
                {esDomiciliaria && parcelasGeojson && (
                  <GeoJSONSource id="parcelas" data={parcelasGeojson}>
                    <Layer type="fill" id="parcelas-fill" paint={{
                      'fill-color': ['match', ['get', 'estado'],
                        'completada', 'rgba(22,163,74,0.4)', 'no_hay_nadie', 'rgba(107,114,128,0.2)',
                        'no_es_vivienda', 'rgba(239,68,68,0.2)', 'rgba(255,255,255,0)'],
                    }} />
                    <Layer type="line" id="parcelas-line" paint={{
                      'line-color': ['match', ['get', 'estado'],
                        'completada', '#16a34a', 'no_hay_nadie', '#9ca3af',
                        'no_es_vivienda', '#ef4444', '#e5e7eb'],
                      'line-width': 0.8,
                    }} />
                  </GeoJSONSource>
                )}

                {/* Encuestadores — círculo de color */}
                {encuestadores.map((enc, i) => {
                  if (!enc.lat || !enc.lng) return null
                  const activo = esActivo(enc.actualizado_en)
                  return (
                    <Marker key={enc.id} id={`enc-${enc.id}`}
                      lngLat={[enc.lng, enc.lat] as [number, number]}
                      onPress={() => focusPersona(enc)}>
                      <View style={[s.marker, { backgroundColor: activo ? COLORES[i % COLORES.length] : '#9ca3af' }]}>
                        <Text style={s.markerText}>{enc.nombre[0]?.toUpperCase()}</Text>
                      </View>
                    </Marker>
                  )
                })}

                {/* Coordinadores — estrella amarilla */}
                {coordinadores.map((coord) => {
                  if (!coord.lat || !coord.lng) return null
                  const activo = esActivo(coord.actualizado_en)
                  return (
                    <Marker key={coord.id} id={`coord-${coord.id}`}
                      lngLat={[coord.lng, coord.lat] as [number, number]}
                      onPress={() => focusPersona(coord)}>
                      <View style={[s.markerCoord, { backgroundColor: activo ? '#f59e0b' : '#9ca3af' }]}>
                        <Text style={s.markerText}>★</Text>
                      </View>
                    </Marker>
                  )
                })}
              </MLMap>
            )}

            {/* Leyenda */}
            <View style={s.leyenda}>
              {zonas.map((z, zi) => (
                <Text key={z.id} style={[s.leyendaItem, { color: COLORES_ZONA[zi % COLORES_ZONA.length] }]}>
                  ● {z.nombre}
                </Text>
              ))}
              <Text style={[s.leyendaItem, { color: '#f59e0b' }]}>★ Coord</Text>
            </View>
          </View>{/* fin mapaWrap */}

          {/* Todo el resto en ScrollView independiente */}
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}>
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
                {activos.length}/{personas.length}
              </Text>
              <Text style={[s.statLabel, { color: activos.length > 0 ? '#2d6a4f' : '#9ca3af' }]}>En campo</Text>
            </View>
            <View style={[s.statCard, { backgroundColor: '#fef3c7' }]}>
              <Text style={[s.statVal, { color: '#b45309' }]}>{zonas.length}</Text>
              <Text style={[s.statLabel, { color: '#b45309' }]}>Zonas</Text>
            </View>
          </View>

          {/* Lista encuestadores */}
          <View style={{ paddingHorizontal: 16 }}>
            <Text style={s.secTitle}>Equipo ({encuestadores.length})</Text>
            {encuestadores.map((enc, i) => {
              const activo = esActivo(enc.actualizado_en)
              const mins   = calcMins(enc.actualizado_en)
              const color  = COLORES[i % COLORES.length]
              const st     = statsEncs[enc.id]
              return (
                <TouchableOpacity key={enc.id} style={s.encRow}
                  onPress={() => focusPersona(enc)} activeOpacity={0.7}>
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
                    {st && (
                      <View style={s.encStats}>
                        <View style={s.encStat}>
                          <Text style={[s.encStatN, { color: '#1a472a' }]}>{st.completadas}</Text>
                          <Text style={s.encStatL}>✓</Text>
                        </View>
                        <Text style={s.encStatSep}>/</Text>
                        <View style={s.encStat}>
                          <Text style={[s.encStatN, { color: '#b45309' }]}>{st.no_respuesta}</Text>
                          <Text style={s.encStatL}>✗</Text>
                        </View>
                        <Text style={s.encStatSep}>/</Text>
                        <View style={s.encStat}>
                          <Text style={[s.encStatN, { color: '#374151' }]}>{st.total}</Text>
                          <Text style={s.encStatL}>tot</Text>
                        </View>
                        <Text style={[s.encStatSep, { marginLeft: 6 }]}>cuota:</Text>
                        <Text style={[s.encStatN, { color: st.completadas >= st.cuota ? '#16a34a' : '#374151' }]}>
                          {st.completadas}/{st.cuota}
                        </Text>
                      </View>
                    )}
                  </View>
                  {enc.lat && <Text style={{ fontSize: 16 }}>🎯</Text>}
                </TouchableOpacity>
              )
            })}

            {coordinadores.length > 0 && (
              <>
                <Text style={[s.secTitle, { marginTop: 16 }]}>Coordinadores ({coordinadores.length})</Text>
                {coordinadores.map((coord) => {
                  const activo = esActivo(coord.actualizado_en)
                  const mins   = calcMins(coord.actualizado_en)
                  return (
                    <TouchableOpacity key={coord.id} style={[s.encRow, { borderColor: '#fcd34d' }]}
                      onPress={() => focusPersona(coord)} activeOpacity={0.7}>
                      <View style={[s.encAvatar, { backgroundColor: activo ? '#fef3c7' : '#f3f4f6' }]}>
                        <Text style={[s.encAvatarText, { color: activo ? '#b45309' : '#9ca3af' }]}>★</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.encNombre}>{coord.nombre}</Text>
                        <Text style={[s.encEstado, { color: activo ? '#b45309' : '#9ca3af' }]}>
                          {coord.lat ? (activo ? '● En campo ahora' : mins !== null ? `Última señal hace ${mins} min` : 'Sin señal') : 'Sin ubicación'}
                        </Text>
                      </View>
                      {coord.lat && <Text style={{ fontSize: 16 }}>🎯</Text>}
                    </TouchableOpacity>
                  )
                })}
              </>
            )}
          </View>
          </ScrollView>
        </View>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  page:          { flex: 1, backgroundColor: '#f8fafc' },
  center:        { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header:        { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  back:          { fontSize: 14, color: '#0369a1', fontWeight: '600' },
  headerTitle:   { flex: 1, fontSize: 15, fontWeight: '700', color: '#111827' },
  modoBtn:       { backgroundColor: '#f0fdf4', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 100, borderWidth: 1, borderColor: '#bbf7d0' },
  modoBtnText:   { fontSize: 11, fontWeight: '700', color: '#166534' },
  mapaWrap:      { height: 380, position: 'relative' },
  mapa:          { flex: 1 },
  leyenda:       { position: 'absolute', bottom: 8, left: 8, backgroundColor: 'rgba(255,255,255,0.93)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, flexDirection: 'row', gap: 8, flexWrap: 'wrap', maxWidth: '90%' },
  leyendaItem:   { fontSize: 10, fontWeight: '700' },
  statsRow:      { flexDirection: 'row', gap: 8, padding: 16, paddingBottom: 8 },
  statCard:      { flex: 1, backgroundColor: '#f0f9ff', borderRadius: 10, padding: 10, alignItems: 'center' },
  statVal:       { fontSize: 18, fontWeight: '800', color: '#0369a1' },
  statLabel:     { fontSize: 9, color: '#6b7280', fontWeight: '600', textAlign: 'center', marginTop: 2 },
  secTitle:      { fontSize: 13, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  encRow:        { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#e5e7eb' },
  encAvatar:     { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  encAvatarText: { fontSize: 14, fontWeight: '700' },
  encNombre:     { fontSize: 14, fontWeight: '600', color: '#111827' },
  encEstado:     { fontSize: 12, marginTop: 2 },
  encStats:      { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5 },
  encStat:       { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  encStatN:      { fontSize: 13, fontWeight: '800' },
  encStatL:      { fontSize: 10, color: '#9ca3af' },
  encStatSep:    { fontSize: 11, color: '#d1d5db' },
  marker:        { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff', elevation: 3 },
  markerCoord:   { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 2.5, borderColor: '#fff', elevation: 4 },
  markerText:    { fontSize: 11, fontWeight: '700', color: '#fff' },
})