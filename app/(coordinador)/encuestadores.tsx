import { useState, useEffect, useRef } from 'react'
import { View, Text, FlatList, StyleSheet, TouchableOpacity, ScrollView } from 'react-native'
import MapView, { Marker, Polygon, Circle } from 'react-native-maps'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import { useRealtimeUbicaciones } from '../../lib/realtime'
import { AppHeader } from '../../components/UI/AppHeader'

const COLORES = ['#0369a1', '#7c3aed', '#b45309', '#be185d', '#047857', '#0891b2']
const COLORES_BG = ['#e0f2fe', '#f3e8ff', '#fef3c7', '#fce7f3', '#dcfce7', '#e0f7fa']

function calcMinutos(ts: string | null) {
  if (!ts) return null
  return Math.floor((Date.now() - new Date(ts).getTime()) / 60000)
}

// Convierte el GeoJSON de una zona a coordenadas para el Polygon
function geojsonACoords(geojson: any): { latitude: number; longitude: number }[] {
  try {
    const coords = geojson?.coordinates?.[0] || []
    return coords.map((c: number[]) => ({ latitude: c[1], longitude: c[0] }))
  } catch { return [] }
}

// Calcula el centro de un array de coordenadas
function centroZona(coords: { latitude: number; longitude: number }[]) {
  if (!coords.length) return null
  const lat = coords.reduce((s, c) => s + c.latitude, 0) / coords.length
  const lng = coords.reduce((s, c) => s + c.longitude, 0) / coords.length
  return { latitude: lat, longitude: lng }
}

function CardEncuestador({
  enc, index, ubicacion, onPress, seleccionado
}: {
  enc: any; index: number; ubicacion: any; onPress: () => void; seleccionado: boolean
}) {
  const mins   = calcMinutos(ubicacion?.actualizado_en || null)
  const activo = mins !== null && mins < 5
  const color  = COLORES[index % COLORES.length]
  const bg     = COLORES_BG[index % COLORES_BG.length]
  const inicial = (enc.nombre_completo || '?')[0].toUpperCase()

  return (
    <TouchableOpacity
      style={[cd.card, seleccionado && { borderColor: color, borderWidth: 2 }]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={[cd.avatar, { backgroundColor: bg }]}>
        <Text style={[cd.avatarText, { color }]}>{inicial}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={cd.nombre} numberOfLines={1}>{enc.nombre_completo}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
          <View style={[cd.dot, { backgroundColor: activo ? '#22c55e' : '#d1d5db' }]} />
          <Text style={cd.estado}>
            {activo
              ? (mins! < 1 ? 'Activo ahora' : `Activo hace ${mins} min`)
              : mins !== null
                ? `Última señal hace ${mins} min`
                : 'Sin señal reciente'}
          </Text>
        </View>
      </View>
      {activo && ubicacion && (
        <View style={cd.gpsBadge}>
          <Text style={cd.gpsText}>📍</Text>
        </View>
      )}
    </TouchableOpacity>
  )
}

export default function MiEquipo() {
  const { perfil, signOut } = useAuth()
  const insets = useSafeAreaInsets()

  const [encuestadores,    setEncuestadores]    = useState<any[]>([])
  const [ubicaciones,      setUbicaciones]      = useState<Record<string, any>>({})
  const [zonas,            setZonas]            = useState<any[]>([])
  const [encuestas,        setEncuestas]        = useState<any[]>([])
  const [encuestaSelec,    setEncuestaSelec]    = useState<string | null>(null)
  const [encuestadorFocus, setEncuestadorFocus] = useState<string | null>(null)
  const [equipoId,         setEquipoId]         = useState<string | null>(null)
  const mapRef = useRef<MapView>(null)

  // Cargar equipo, encuestadores y zonas
  useEffect(() => {
    if (!perfil?.id) return
    async function cargar() {
      // Obtener equipo del coordinador
      const { data: eqData } = await supabase
        .from('equipo_coordinadores')
        .select('equipo_id')
        .eq('coordinador_id', perfil!.id)
        .single()

      if (!eqData?.equipo_id) return
      setEquipoId(eqData.equipo_id)

      // Encuestadores del equipo
      const { data: encs } = await supabase
        .from('equipo_encuestadores')
        .select('encuestador_id, perfiles(id, nombre_completo)')
        .eq('equipo_id', eqData.equipo_id)

      setEncuestadores((encs || []).map((r: any) => r.perfiles).filter(Boolean))

      // Encuestas asignadas al equipo
      const { data: zonasData } = await supabase
        .from('encuesta_zonas')
        .select('id, nombre, area_geojson, encuesta_id, geofencing_activo, encuestas(id, nombre)')
        .eq('equipo_id', eqData.equipo_id)

      setZonas(zonasData || [])

      // Encuestas únicas
      const encuestasMap = new Map<string, any>()
      for (const z of (zonasData || [])) {
        if (z.encuestas && !encuestasMap.has(z.encuesta_id)) {
          encuestasMap.set(z.encuesta_id, { id: z.encuesta_id, nombre: z.encuestas.nombre })
        }
      }
      const encList = Array.from(encuestasMap.values())
      setEncuestas(encList)
      if (encList.length === 1) setEncuestaSelec(encList[0].id)
    }
    cargar()
  }, [perfil?.id])

  // Realtime ubicaciones
  useRealtimeUbicaciones(perfil?.organizacion_id || '', (pos: any) => {
    setUbicaciones(prev => ({ ...prev, [pos.encuestador_id]: pos }))
  })

  // Cargar últimas ubicaciones al montar
  useEffect(() => {
    if (!perfil?.organizacion_id) return
    supabase
      .from('ubicaciones_encuestadores')
      .select('*')
      .eq('organizacion_id', perfil.organizacion_id)
      .then(({ data }) => {
        if (!data) return
        const map: Record<string, any> = {}
        data.forEach(u => { map[u.encuestador_id] = u })
        setUbicaciones(map)
      })
  }, [perfil?.organizacion_id])

  // Zonas de la encuesta seleccionada
  const zonasFiltradas = encuestaSelec
    ? zonas.filter(z => z.encuesta_id === encuestaSelec)
    : zonas

  // Región del mapa — centro de todas las zonas o Argentina por defecto
  const regionInicial = (() => {
    const todasCoords = zonasFiltradas.flatMap(z => geojsonACoords(z.area_geojson))
    if (!todasCoords.length) return { latitude: -27.4, longitude: -55.9, latitudeDelta: 0.08, longitudeDelta: 0.08 }
    const lats = todasCoords.map(c => c.latitude)
    const lngs = todasCoords.map(c => c.longitude)
    const lat = (Math.min(...lats) + Math.max(...lats)) / 2
    const lng = (Math.min(...lngs) + Math.max(...lngs)) / 2
    const dLat = (Math.max(...lats) - Math.min(...lats)) * 1.5 || 0.05
    const dLng = (Math.max(...lngs) - Math.min(...lngs)) * 1.5 || 0.05
    return { latitude: lat, longitude: lng, latitudeDelta: dLat, longitudeDelta: dLng }
  })()

  function focusEncuestador(encId: string) {
    setEncuestadorFocus(encId === encuestadorFocus ? null : encId)
    const ubic = ubicaciones[encId]
    if (ubic && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: ubic.latitud,
        longitude: ubic.longitud,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      }, 600)
    }
  }

  const encuestadoresActivos = encuestadores.filter(e => {
    const mins = calcMinutos(ubicaciones[e.id]?.actualizado_en || null)
    return mins !== null && mins < 5
  }).length

  return (
    <View style={{ flex: 1, backgroundColor: '#f5f5f3' }}>
      <AppHeader
        nombre={perfil?.nombre_completo}
        rol="coordinador"
        subtitulo={`${encuestadoresActivos} activo${encuestadoresActivos !== 1 ? 's' : ''} · ${encuestadores.length} en el equipo`}
        onSignOut={signOut}
        color="#0369a1"
      />

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>

        {/* Selector de encuesta si hay más de una */}
        {encuestas.length > 1 && (
          <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
            <Text style={st.secLabel}>Encuesta</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {encuestas.map(enc => (
                  <TouchableOpacity
                    key={enc.id}
                    onPress={() => setEncuestaSelec(enc.id)}
                    style={[st.chip, encuestaSelec === enc.id && st.chipActive]}
                  >
                    <Text style={[st.chipText, encuestaSelec === enc.id && st.chipTextActive]}>
                      {enc.nombre}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        )}

        {/* Mapa en tiempo real con zonas */}
        <View style={st.mapaCard}>
          <View style={st.mapaHeader}>
            <View style={st.liveBadge}>
              <View style={st.liveDot} />
              <Text style={st.liveText}>En vivo</Text>
            </View>
            <Text style={st.mapaTitle}>
              {zonasFiltradas.length > 0
                ? `${zonasFiltradas.length} zona${zonasFiltradas.length !== 1 ? 's' : ''} activa${zonasFiltradas.length !== 1 ? 's' : ''}`
                : 'Sin zona asignada'}
            </Text>
          </View>

          <MapView
            ref={mapRef}
            style={st.mapa}
            initialRegion={regionInicial}
            showsUserLocation={false}
            showsCompass={false}
            toolbarEnabled={false}
          >
            {/* Zonas del equipo */}
            {zonasFiltradas.map((zona, zi) => {
              const coords = geojsonACoords(zona.area_geojson)
              const centro = centroZona(coords)
              const color = COLORES[zi % COLORES.length]
              if (!coords.length) return null
              return (
                <View key={zona.id}>
                  <Polygon
                    coordinates={coords}
                    fillColor={`${color}25`}
                    strokeColor={color}
                    strokeWidth={2.5}
                  />
                  {centro && (
                    <Marker coordinate={centro} anchor={{ x: 0.5, y: 0.5 }}>
                      <View style={[st.zonaLabel, { backgroundColor: color }]}>
                        <Text style={st.zonaLabelText}>{zona.nombre}</Text>
                      </View>
                    </Marker>
                  )}
                </View>
              )
            })}

            {/* Marcadores de encuestadores con ubicación */}
            {encuestadores.map((enc, i) => {
              const ubic = ubicaciones[enc.id]
              if (!ubic?.latitud) return null
              const mins   = calcMinutos(ubic.actualizado_en)
              const activo = mins !== null && mins < 5
              const color  = COLORES[i % COLORES.length]
              const isFocus = encuestadorFocus === enc.id
              return (
                <Marker
                  key={enc.id}
                  coordinate={{ latitude: ubic.latitud, longitude: ubic.longitud }}
                  onPress={() => focusEncuestador(enc.id)}
                >
                  <View style={[st.markerWrap, isFocus && st.markerFocus]}>
                    <View style={[st.markerCircle, { backgroundColor: activo ? color : '#9ca3af' }]}>
                      <Text style={st.markerText}>{(enc.nombre_completo || '?')[0].toUpperCase()}</Text>
                    </View>
                    {activo && <View style={[st.markerDot, { backgroundColor: '#22c55e' }]} />}
                  </View>
                </Marker>
              )
            })}
          </MapView>

          {/* Leyenda de zonas */}
          {zonasFiltradas.length > 0 && (
            <View style={st.leyenda}>
              {zonasFiltradas.map((zona, zi) => (
                <View key={zona.id} style={st.leyendaItem}>
                  <View style={[st.leyendaDot, { backgroundColor: COLORES[zi % COLORES.length] }]} />
                  <Text style={st.leyendaText}>{zona.nombre}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Lista de encuestadores */}
        <View style={{ paddingHorizontal: 16, paddingTop: 4 }}>
          <Text style={st.secLabel}>Encuestadores · {encuestadores.length}</Text>
          {encuestadores.length === 0 ? (
            <View style={st.empty}>
              <Text style={st.emptyText}>Sin encuestadores en el equipo</Text>
            </View>
          ) : (
            encuestadores.map((enc, i) => (
              <CardEncuestador
                key={enc.id}
                enc={enc}
                index={i}
                ubicacion={ubicaciones[enc.id]}
                seleccionado={encuestadorFocus === enc.id}
                onPress={() => focusEncuestador(enc.id)}
              />
            ))
          )}
        </View>

      </ScrollView>
    </View>
  )
}

// Estilos
const st = StyleSheet.create({
  secLabel:       { fontSize: 11, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 },
  chip:           { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 100, backgroundColor: '#f5f5f3', borderWidth: 1.5, borderColor: '#e5e7eb' },
  chipActive:     { backgroundColor: '#eff6ff', borderColor: '#0369a1' },
  chipText:       { fontSize: 12, fontWeight: '600', color: '#6b7280' },
  chipTextActive: { color: '#0369a1' },
  mapaCard:       { margin: 16, borderRadius: 16, overflow: 'hidden', backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb' },
  mapaHeader:     { padding: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  liveBadge:      { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#f0fdf4', borderRadius: 100, paddingHorizontal: 10, paddingVertical: 4 },
  liveDot:        { width: 6, height: 6, borderRadius: 3, backgroundColor: '#22c55e' },
  liveText:       { fontSize: 11, fontWeight: '700', color: '#16a34a' },
  mapaTitle:      { fontSize: 12, fontWeight: '600', color: '#374151' },
  mapa:           { height: 280 },
  leyenda:        { flexDirection: 'row', flexWrap: 'wrap', gap: 10, padding: 12, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  leyendaItem:    { flexDirection: 'row', alignItems: 'center', gap: 5 },
  leyendaDot:     { width: 10, height: 10, borderRadius: 5 },
  leyendaText:    { fontSize: 11, color: '#6b7280', fontWeight: '500' },
  zonaLabel:      { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  zonaLabelText:  { fontSize: 10, color: '#fff', fontWeight: '700' },
  markerWrap:     { alignItems: 'center' },
  markerFocus:    { transform: [{ scale: 1.3 }] },
  markerCircle:   { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 4 },
  markerText:     { color: '#fff', fontSize: 13, fontWeight: '800' },
  markerDot:      { width: 8, height: 8, borderRadius: 4, marginTop: 2, borderWidth: 1.5, borderColor: '#fff' },
  empty:          { padding: 32, alignItems: 'center' },
  emptyText:      { fontSize: 14, color: '#9ca3af' },
})

const cd = StyleSheet.create({
  card:       { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: '#e5e7eb' },
  avatar:     { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarText: { fontSize: 16, fontWeight: '800' },
  nombre:     { fontSize: 14, fontWeight: '700', color: '#111' },
  estado:     { fontSize: 11, color: '#6b7280' },
  dot:        { width: 7, height: 7, borderRadius: 4 },
  gpsBadge:   { width: 28, height: 28, borderRadius: 14, backgroundColor: '#f0fdf4', alignItems: 'center', justifyContent: 'center' },
  gpsText:    { fontSize: 14 },
})