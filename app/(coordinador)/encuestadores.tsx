import { useState, useEffect, useRef } from 'react'
import { View, Text, FlatList, StyleSheet, ActivityIndicator, RefreshControl, TouchableOpacity } from 'react-native'
import type { CameraRef } from '@maplibre/maplibre-react-native'
import { MapLibreDisponible, MLMap, Camera, Marker, MapaPlaceholder } from '../../components/MapaSeguro'
import { supabase } from '../../lib/supabase'
import { AppHeader } from '../../components/UI/AppHeader'
import { useAuth } from '../../lib/auth'

type Encuestador = {
  id: string
  nombre_completo: string
  activo: boolean
  lat?: number
  lng?: number
  actualizado_en?: string
}

function esActivo(ts?: string) {
  if (!ts) return false
  return (Date.now() - new Date(ts).getTime()) < 5 * 60 * 1000
}

function calcMins(ts?: string) {
  if (!ts) return null
  return Math.floor((Date.now() - new Date(ts).getTime()) / 60000)
}

export default function MiEquipo() {
  const { perfil, signOut }    = useAuth()
  const [encuestadores, setEncuestadores] = useState<Encuestador[]>([])
  const [loading, setLoading]  = useState(true)
  const [refresh, setRefresh]  = useState(false)
  const [equipoNombre, setEquipoNombre] = useState('')
  const [equipoId,     setEquipoId]     = useState<string | null>(null)
  const [encFiltrado,  setEncFiltrado]  = useState<string | null>(null)
  const cameraRef = useRef<CameraRef>(null)
  const COLORES = ['#0369a1', '#7c3aed', '#b45309', '#059669', '#dc2626', '#0891b2']

  useEffect(() => {
    if (!perfil?.id) return
    cargar()
  }, [perfil?.id])

  // Canal realtime separado — solo se crea una vez
  useEffect(() => {
    if (!perfil?.id) return
    let equipoId: string | null = null

    supabase
      .from('equipo_coordinadores')
      .select('equipo_id')
      .eq('coordinador_id', perfil.id)
      .limit(1)
      .single()
      .then(({ data }) => {
        if (!data?.equipo_id) return
        equipoId = data.equipo_id
        const channelName = `equipo-${equipoId}`
        supabase.removeChannel(supabase.channel(channelName))
        const canal = supabase.channel(channelName)
        canal
          .on('postgres_changes', {
            event: '*', schema: 'public', table: 'ubicaciones_encuestadores',
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
        return () => { supabase.removeChannel(canal) }
      })
  }, [perfil?.id])

  async function cargar() {
    setLoading(true)

    // Obtener el equipo del coordinador
    const { data: equiposCoord } = await supabase
      .from('equipo_coordinadores')
      .select('equipo_id, equipos(id, nombre)')
      .eq('coordinador_id', perfil!.id)

    if (!equiposCoord?.length) { setLoading(false); setRefresh(false); return }

    // Usar el primer equipo (si tiene más de uno, tomar el primero por ahora)
    const eq = equiposCoord[0].equipos as any
    setEquipoNombre(eq?.nombre || '')
    const equipoId = equiposCoord[0].equipo_id
    setEquipoId(equipoId)

    // Miembros del equipo
    const { data: miembros } = await supabase
      .from('equipo_encuestadores')
      .select('encuestador_id, perfiles(id, nombre_completo, activo)')
      .eq('equipo_id', equipoId)

    const ids = (miembros || []).map(m => m.encuestador_id)

    // Ubicaciones
    let ubics: Record<string, any> = {}
    if (ids.length) {
      const { data: ubs } = await supabase
        .from('ubicaciones_encuestadores')
        .select('encuestador_id, lat, lng, actualizado_en')
        .in('encuestador_id', ids)
      ;(ubs || []).forEach(u => { ubics[u.encuestador_id] = u })
    }

    const lista: Encuestador[] = (miembros || []).map(m => {
      const p = Array.isArray(m.perfiles) ? m.perfiles[0] : m.perfiles as any
      const u = ubics[m.encuestador_id]
      return {
        id:               m.encuestador_id,
        nombre_completo:  p?.nombre_completo || '—',
        activo:           p?.activo !== false,
        lat:              u?.lat,
        lng:              u?.lng,
        actualizado_en:   u?.actualizado_en,
      }
    })

    // Ordenar: activos en campo primero, luego activos sin GPS, luego inactivos
    lista.sort((a, b) => {
      const aActivo = esActivo(a.actualizado_en)
      const bActivo = esActivo(b.actualizado_en)
      if (aActivo && !bActivo) return -1
      if (!aActivo && bActivo) return 1
      return 0
    })

    setEncuestadores(lista)
    setLoading(false)
    setRefresh(false)
  }

  function focusMapa(enc: Encuestador) {
    if (enc.lat && enc.lng && cameraRef.current) {
      cameraRef.current.easeTo({ center: [enc.lng, enc.lat], zoom: 17, duration: 500 })
    }
    setEncFiltrado(prev => prev === enc.id ? null : enc.id)
  }

  const activos   = encuestadores.filter(e => esActivo(e.actualizado_en))
  const inactivos = encuestadores.filter(e => !esActivo(e.actualizado_en))

  return (
    <View style={s.page}>
      <AppHeader
        nombre={perfil?.nombre_completo}
        rol="coordinador"
        subtitulo={equipoNombre ? `Mi equipo · ${equipoNombre}` : 'Mi equipo'}
        onSignOut={signOut}
        color="#1a472a"
      />

      {loading ? (
        <View style={s.center}><ActivityIndicator color="#1a472a" size="large" /></View>
      ) : (
        <View style={{ flex: 1 }}>
          {/* Mapa en tiempo real */}
          <View style={{ height: 240, position: 'relative' }}>
            {!MapLibreDisponible ? (
              <MapaPlaceholder mensaje="Mapa disponible en app compilada" />
            ) : (
              <MLMap style={{ flex: 1 }} mapStyle="https://tiles.openfreemap.org/styles/liberty"
                compass={false} logo={false} attribution={false}>
                <Camera ref={cameraRef} initialViewState={{ center: [-55.8974, -27.3671], zoom: 13 }} />
                {encuestadores.map((enc, i) => {
                  if (!enc.lat || !enc.lng) return null
                  const activo = esActivo(enc.actualizado_en)
                  const filtrado = encFiltrado === enc.id
                  return (
                    <Marker key={enc.id} id={`enc-${enc.id}`}
                      lngLat={[enc.lng, enc.lat] as [number, number]}
                      onPress={() => focusMapa(enc)}>
                      <View style={{
                        width: filtrado ? 36 : 28, height: filtrado ? 36 : 28,
                        borderRadius: filtrado ? 18 : 14,
                        backgroundColor: activo ? COLORES[i % COLORES.length] : '#9ca3af',
                        alignItems: 'center', justifyContent: 'center',
                        borderWidth: filtrado ? 3 : 2, borderColor: '#fff',
                        opacity: encFiltrado && !filtrado ? 0.3 : 1,
                        elevation: filtrado ? 6 : 3,
                      }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>
                          {enc.nombre_completo[0]?.toUpperCase()}
                        </Text>
                      </View>
                    </Marker>
                  )
                })}
              </MLMap>
            )}
            {encFiltrado && (() => {
              const enc = encuestadores.find(e => e.id === encFiltrado)
              if (!enc) return null
              return (
                <TouchableOpacity
                  style={{ position: 'absolute', bottom: 8, left: 12, right: 12, backgroundColor: '#1a472a', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                  onPress={() => setEncFiltrado(null)}>
                  <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>👤 {enc.nombre_completo}</Text>
                  <Text style={{ color: '#a7f3d0', fontSize: 12 }}>✕ Ver todos</Text>
                </TouchableOpacity>
              )
            })()}
          </View>

          <FlatList
          data={encuestadores}
          keyExtractor={e => e.id}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 32 }}
          refreshControl={
            <RefreshControl
              refreshing={refresh}
              onRefresh={() => { setRefresh(true); cargar() }}
              tintColor="#1a472a"
              colors={['#1a472a']}
            />
          }
          ListHeaderComponent={
            <View style={s.statsRow}>
              <View style={[s.statCard, { backgroundColor: '#d8f3dc' }]}>
                <Text style={[s.statVal, { color: '#1a472a' }]}>{activos.length}</Text>
                <Text style={[s.statLabel, { color: '#2d6a4f' }]}>En campo ahora</Text>
              </View>
              <View style={[s.statCard, { backgroundColor: '#f3f4f6' }]}>
                <Text style={[s.statVal, { color: '#6b7280' }]}>{inactivos.length}</Text>
                <Text style={[s.statLabel, { color: '#9ca3af' }]}>Sin señal</Text>
              </View>
              <View style={[s.statCard, { backgroundColor: '#dbeafe' }]}>
                <Text style={[s.statVal, { color: '#1a472a' }]}>{encuestadores.length}</Text>
                <Text style={[s.statLabel, { color: '#2d6a4f' }]}>Total</Text>
              </View>
            </View>
          }
          renderItem={({ item }) => {
            const activo = esActivo(item.actualizado_en)
            const mins   = calcMins(item.actualizado_en)
            const ini    = item.nombre_completo.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
            return (
              <View style={[s.card, activo && s.cardActivo]}>
                <View style={[s.avatar, { backgroundColor: activo ? '#d8f3dc' : '#f3f4f6' }]}>
                  <Text style={[s.avatarText, { color: activo ? '#1a472a' : '#9ca3af' }]}>{ini}</Text>
                </View>
                <View style={s.info}>
                  <Text style={s.nombre}>{item.nombre_completo}</Text>
                  <Text style={[s.estado, { color: activo ? '#16a34a' : '#9ca3af' }]}>
                    {item.lat
                      ? activo
                        ? '● En campo ahora'
                        : mins !== null
                          ? `Última señal hace ${mins} min`
                          : 'Sin señal reciente'
                      : 'Sin ubicación registrada'
                    }
                  </Text>
                </View>
                {activo && (
                  <View style={s.activoBadge}>
                    <View style={s.activoDot} />
                  </View>
                )}
              </View>
            )
          }}
          ListEmptyComponent={
            <View style={s.empty}>
              <Text style={{ fontSize: 40, marginBottom: 12 }}>👥</Text>
              <Text style={s.emptyTitle}>Sin encuestadores</Text>
              <Text style={s.emptyDesc}>No hay encuestadores asignados a tu equipo todavía.</Text>
            </View>
          }
        />
        </View>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  page:        { flex: 1, backgroundColor: '#f2f1ee', paddingTop: 0 },
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center' },
  statsRow:    { flexDirection: 'row', gap: 8, marginBottom: 16 },
  statCard:    { flex: 1, borderRadius: 10, padding: 12, alignItems: 'center' },
  statVal:     { fontSize: 24, fontWeight: '800' },
  statLabel:   { fontSize: 10, fontWeight: '600', textAlign: 'center', marginTop: 2 },
  card:        { backgroundColor: '#fff', borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: '#e5e7eb' },
  cardActivo:  { borderColor: '#a7f3d0' },
  avatar:      { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  avatarText:  { fontSize: 15, fontWeight: '700' },
  info:        { flex: 1 },
  nombre:      { fontSize: 15, fontWeight: '700', color: '#111827' },
  estado:      { fontSize: 12, marginTop: 2 },
  activoBadge: { alignItems: 'center', justifyContent: 'center' },
  activoDot:   { width: 10, height: 10, borderRadius: 5, backgroundColor: '#16a34a', shadowColor: '#16a34a', shadowOpacity: 0.4, shadowRadius: 4, elevation: 2 },
  empty:       { alignItems: 'center', paddingTop: 60 },
  emptyTitle:  { fontSize: 18, fontWeight: '700', color: '#374151', marginBottom: 8 },
  emptyDesc:   { fontSize: 14, color: '#9ca3af', textAlign: 'center' },
})