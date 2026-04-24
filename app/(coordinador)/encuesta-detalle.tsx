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
  UserLocation,
  type CameraRef,
} from '@maplibre/maplibre-react-native'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'

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

export default function EncuestaDetalle() {
  const { encuestaId, equipoId, nombre } = useLocalSearchParams<{
    encuestaId: string; equipoId: string; nombre: string
  }>()
  const router       = useRouter()
  const insets       = useSafeAreaInsets()
  const { perfil }   = useAuth()
  const cameraRef    = useRef<CameraRef>(null)

  const [encuestadores, setEncuestadores] = useState<Encuestador[]>([])
  const [zonaShape, setZonaShape]         = useState<any>(null)
  const [loading, setLoading]             = useState(true)

  useEffect(() => {
    if (!equipoId || !encuestaId) return
    cargar()

    // Realtime
    const channel = supabase.channel(`detalle-enc-${equipoId}`)
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

    // Encuestadores del equipo
    const { data: miembros } = await supabase
      .from('equipo_encuestadores')
      .select('encuestador_id, perfiles(id, nombre_completo)')
      .eq('equipo_id', equipoId)

    const ids = (miembros || []).map(m => m.encuestador_id)

    // Ubicaciones
    let ubics: any[] = []
    if (ids.length) {
      const { data } = await supabase
        .from('ubicaciones_encuestadores')
        .select('encuestador_id, lat, lng, actualizado_en')
        .in('encuestador_id', ids)
      ubics = data || []
    }

    const ubicsMap: Record<string, any> = {}
    ubics.forEach(u => { ubicsMap[u.encuestador_id] = u })

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

    // Zona de la encuesta
    const { data: zona } = await supabase
      .from('zonas_encuesta')
      .select('area_geojson')
      .eq('encuesta_id', encuestaId)
      .eq('equipo_id', equipoId)
      .maybeSingle()

    if (zona?.area_geojson) setZonaShape(zona.area_geojson)

    setLoading(false)
  }

  function focusEncuestador(enc: Encuestador) {
    if (enc.lat && enc.lng && cameraRef.current) {
      cameraRef.current.easeTo({ center: [enc.lng, enc.lat], zoom: 16, duration: 500 })
    }
  }

  // Centro del mapa — primer encuestador con ubicación o Posadas
  const conUbicacion = encuestadores.filter(e => e.lat && e.lng)
  const centroInicial = conUbicacion.length
    ? [conUbicacion[0].lng!, conUbicacion[0].lat!]
    : [-55.8974, -27.3671]

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
        <>
          {/* Mapa */}
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
                defaultSettings={{
                  centerCoordinate: centroInicial as [number, number],
                  zoomLevel: 13,
                }}
              />

              {/* Zona */}
              {zonaShape && (
                <GeoJSONSource id="zona" data={zonaShape}>
                  <Layer type="fill"   id="zona-fill"   paint={{ 'fill-color': 'rgba(3,105,161,0.1)', 'fill-outline-color': '#0369a1' }} />
                  <Layer type="line"   id="zona-line"   paint={{ 'line-color': '#0369a1', 'line-width': 2 }} />
                </GeoJSONSource>
              )}

              {/* Marcadores encuestadores */}
              {encuestadores.map((enc, i) => {
                if (!enc.lat || !enc.lng) return null
                const activo = esActivo(enc.actualizado_en)
                const color  = COLORES[i % COLORES.length]
                return (
                  <Marker
                    key={enc.id}
                    id={`enc-${enc.id}`}
                    lngLat={[enc.lng, enc.lat] as [number, number]}
                    onPress={() => focusEncuestador(enc)}
                  >
                    <View style={[s.marker, { backgroundColor: activo ? color : '#9ca3af' }]}>
                      <Text style={s.markerText}>{enc.nombre[0]?.toUpperCase()}</Text>
                    </View>
                  </Marker>
                )
              })}
            </MLMap>

            {/* Leyenda activos/inactivos */}
            <View style={s.leyenda}>
              <Text style={[s.leyendaText, { color: '#16a34a' }]}>● {encuestadores.filter(e => esActivo(e.actualizado_en)).length} activos</Text>
              <Text style={s.leyendaText}>  {encuestadores.filter(e => !esActivo(e.actualizado_en)).length} sin señal</Text>
            </View>
          </View>

          {/* Lista encuestadores */}
          <ScrollView style={s.lista} contentContainerStyle={{ padding: 16, gap: 10 }}>
            <Text style={s.listaTitle}>Equipo asignado</Text>
            {encuestadores.map((enc, i) => {
              const activo = esActivo(enc.actualizado_en)
              const mins   = calcMins(enc.actualizado_en)
              const color  = COLORES[i % COLORES.length]
              return (
                <TouchableOpacity
                  key={enc.id}
                  style={s.encRow}
                  onPress={() => focusEncuestador(enc)}
                  activeOpacity={0.7}
                >
                  <View style={[s.encAvatar, { backgroundColor: activo ? color : '#e5e7eb' }]}>
                    <Text style={[s.encAvatarText, { color: activo ? '#fff' : '#9ca3af' }]}>
                      {enc.nombre[0]?.toUpperCase()}
                    </Text>
                  </View>
                  <View style={s.encInfo}>
                    <Text style={s.encNombre}>{enc.nombre}</Text>
                    <Text style={[s.encEstado, { color: activo ? '#16a34a' : '#9ca3af' }]}>
                      {enc.lat
                        ? activo
                          ? '● En campo ahora'
                          : `Última señal hace ${mins} min`
                        : 'Sin ubicación registrada'
                      }
                    </Text>
                  </View>
                </TouchableOpacity>
              )
            })}
          </ScrollView>
        </>
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
  mapaWrap:     { height: 280, position: 'relative' },
  mapa:         { flex: 1 },
  leyenda:      { position: 'absolute', bottom: 8, right: 8, backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, flexDirection: 'row', gap: 8 },
  leyendaText:  { fontSize: 12, fontWeight: '600', color: '#374151' },
  lista:        { flex: 1 },
  listaTitle:   { fontSize: 13, fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  encRow:       { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#e5e7eb' },
  encAvatar:    { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  encAvatarText:{ fontSize: 14, fontWeight: '700' },
  encInfo:      { flex: 1 },
  encNombre:    { fontSize: 14, fontWeight: '600', color: '#111827' },
  encEstado:    { fontSize: 12, marginTop: 2 },
  marker:       { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' },
  markerText:   { fontSize: 12, fontWeight: '700', color: '#fff' },
})