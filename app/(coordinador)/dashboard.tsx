import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, ScrollView, StyleSheet, RefreshControl,
  TouchableOpacity, ActivityIndicator,
} from 'react-native'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'

// ── Mini progress bar ─────────────────────────────────────────
function ProgBar({ value, total, color = '#1a472a' }: { value: number; total: number; color?: string }) {
  const pct = total > 0 ? Math.min((value / total) * 100, 100) : 0
  return (
    <View style={{ height: 5, backgroundColor: '#e5e7eb', borderRadius: 3, marginTop: 6 }}>
      <View style={{ height: 5, backgroundColor: color, borderRadius: 3, width: `${pct}%` as any }} />
    </View>
  )
}

// ── Card de encuestador ────────────────────────────────────────
function CardEncuestador({ enc, index }: { enc: any; index: number }) {
  const colors  = ['#1a472a', '#0369a1', '#7c3aed', '#b45309', '#be185d']
  const bgs     = ['#d8f3dc', '#e0f2fe', '#f3e8ff', '#fef3c7', '#fce7f3']
  const color   = colors[index % colors.length]
  const bg      = bgs[index % bgs.length]
  const inicial = (enc.nombre || '?')[0].toUpperCase()

  const mins = enc.ultima_actividad
    ? Math.floor((Date.now() - new Date(enc.ultima_actividad).getTime()) / 60000)
    : null
  const activo = mins !== null && mins < 5

  return (
    <View style={cd.encCard}>
      <View style={[cd.avatar, { backgroundColor: bg }]}>
        <Text style={[cd.avatarText, { color }]}>{inicial}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={cd.encNombre} numberOfLines={1}>{enc.nombre}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
          <View style={[cd.dot, { backgroundColor: activo ? '#22c55e' : '#d1d5db' }]} />
          <Text style={cd.encSub}>
            {activo ? 'Activo ahora' : mins !== null ? `Hace ${mins} min` : 'Sin actividad'}
          </Text>
        </View>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[cd.encNum, { color }]}>{enc.sesiones_hoy}</Text>
        <Text style={cd.encNumLabel}>hoy</Text>
      </View>
      <View style={{ alignItems: 'flex-end', marginLeft: 12 }}>
        <Text style={cd.encNumTotal}>{enc.sesiones_total}</Text>
        <Text style={cd.encNumLabel}>total</Text>
      </View>
    </View>
  )
}

// ── Card de zona ───────────────────────────────────────────────
function CardZona({ zona }: { zona: any }) {
  const pct = zona.total_parcelas > 0
    ? Math.round((zona.completadas / zona.total_parcelas) * 100)
    : 0
  return (
    <View style={cd.zonaCard}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <Text style={cd.zonaNombre}>{zona.zona_nombre}</Text>
          <Text style={cd.zonaEncuesta} numberOfLines={1}>{zona.encuesta_nombre}</Text>
        </View>
        <Text style={cd.zonaPct}>{pct}%</Text>
      </View>
      <ProgBar value={zona.completadas} total={zona.total_parcelas} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
        <Text style={cd.zonaSub}>{zona.completadas} / {zona.total_parcelas} parcelas</Text>
        <Text style={cd.zonaSub}>{zona.sesiones_total} respuestas</Text>
      </View>
    </View>
  )
}

// ── Dashboard ─────────────────────────────────────────────────
export default function CoordinadorDashboard() {
  const { perfil, signOut } = useAuth()
  const [data,      setData]      = useState<any>(null)
  const [loading,   setLoading]   = useState(true)
  const [refresh,   setRefresh]   = useState(false)
  const [error,     setError]     = useState('')

  const fetchData = useCallback(async () => {
    const { data: res, error: err } = await supabase.rpc('get_dashboard_coordinador')
    if (err) { setError(err.message); setLoading(false); setRefresh(false); return }
    if (res?.error) { setError(res.error); setLoading(false); setRefresh(false); return }
    setData(res)
    setError('')
    setLoading(false)
    setRefresh(false)
  }, [])

  useEffect(() => { fetchData() }, [])

  if (loading) return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f2f1ee' }}>
      <ActivityIndicator size="large" color="#1a472a" />
    </View>
  )

  if (error) return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, backgroundColor: '#f2f1ee' }}>
      <Text style={{ fontSize: 40, marginBottom: 12 }}>⚠️</Text>
      <Text style={{ fontSize: 15, color: '#666', textAlign: 'center' }}>{error}</Text>
      <TouchableOpacity style={cd.btnRecargar} onPress={() => { setLoading(true); fetchData() }}>
        <Text style={{ color: '#fff', fontWeight: '700' }}>Reintentar</Text>
      </TouchableOpacity>
    </View>
  )

  const encuestadores = data?.encuestadores || []
  const zonas         = data?.zonas || []
  const activos       = encuestadores.filter((e: any) => {
    const mins = e.ultima_actividad
      ? Math.floor((Date.now() - new Date(e.ultima_actividad).getTime()) / 60000)
      : null
    return mins !== null && mins < 5
  }).length

  return (
    <ScrollView
      style={cd.container}
      refreshControl={<RefreshControl refreshing={refresh} onRefresh={() => { setRefresh(true); fetchData() }} tintColor="#1a472a" />}
    >
      {/* Header */}
      <View style={cd.header}>
        <View>
          <Text style={cd.greeting}>Hola, {perfil?.nombre_completo?.split(' ')[0]} 👋</Text>
          <Text style={cd.sub}>{data?.equipo_nombre || 'Mi equipo'} · Coordinador</Text>
        </View>
        <TouchableOpacity onPress={signOut} style={cd.salirBtn}>
          <Text style={cd.salirText}>Salir</Text>
        </TouchableOpacity>
      </View>

      {/* KPIs */}
      <View style={cd.kpiRow}>
        <View style={[cd.kpi, { backgroundColor: '#d8f3dc' }]}>
          <Text style={[cd.kpiVal, { color: '#1a472a' }]}>{data?.sesiones_hoy ?? 0}</Text>
          <Text style={[cd.kpiLabel, { color: '#2d6a4f' }]}>Hoy</Text>
        </View>
        <View style={[cd.kpi, { backgroundColor: '#e0f2fe' }]}>
          <Text style={[cd.kpiVal, { color: '#0369a1' }]}>{data?.sesiones_semana ?? 0}</Text>
          <Text style={[cd.kpiLabel, { color: '#0369a1' }]}>Esta semana</Text>
        </View>
        <View style={[cd.kpi, { backgroundColor: activos > 0 ? '#d8f3dc' : '#f9fafb' }]}>
          <Text style={[cd.kpiVal, { color: activos > 0 ? '#1a472a' : '#94a3b8' }]}>{activos}</Text>
          <Text style={[cd.kpiLabel, { color: activos > 0 ? '#2d6a4f' : '#94a3b8' }]}>En campo</Text>
        </View>
      </View>

      {/* Zonas */}
      {zonas.length > 0 && (
        <View style={{ paddingHorizontal: 16, marginBottom: 16 }}>
          <Text style={cd.secTitle}>Progreso por zona</Text>
          <View style={{ marginTop: 10, gap: 10 }}>
            {zonas.map((z: any) => <CardZona key={z.zona_id} zona={z} />)}
          </View>
        </View>
      )}

      {/* Encuestadores */}
      <View style={{ paddingHorizontal: 16, marginBottom: 32 }}>
        <Text style={cd.secTitle}>Encuestadores ({encuestadores.length})</Text>
        <View style={{ marginTop: 10, gap: 8 }}>
          {encuestadores.length > 0
            ? encuestadores.map((enc: any, i: number) => (
                <CardEncuestador key={enc.id} enc={enc} index={i} />
              ))
            : <Text style={{ color: '#aaa', fontSize: 13, textAlign: 'center', paddingVertical: 16 }}>
                Sin encuestadores en el equipo
              </Text>
          }
        </View>
      </View>
    </ScrollView>
  )
}

const cd = StyleSheet.create({
  container:     { flex: 1, backgroundColor: '#f2f1ee' },
  header:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 24, paddingTop: 56 },
  greeting:      { fontSize: 22, fontWeight: '800', color: '#111' },
  sub:           { fontSize: 12, color: '#888', marginTop: 2 },
  salirBtn:      { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1.5, borderColor: '#e5e7eb' },
  salirText:     { fontSize: 12, color: '#888', fontWeight: '600' },
  kpiRow:        { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 20 },
  kpi:           { flex: 1, borderRadius: 12, padding: 12 },
  kpiVal:        { fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  kpiLabel:      { fontSize: 10, fontWeight: '600', marginTop: 2 },
  secTitle:      { fontSize: 15, fontWeight: '800', color: '#111' },
  zonaCard:      { backgroundColor: '#fff', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#e5e7eb' },
  zonaNombre:    { fontSize: 14, fontWeight: '700', color: '#111' },
  zonaEncuesta:  { fontSize: 11, color: '#888', marginTop: 2 },
  zonaPct:       { fontSize: 22, fontWeight: '800', color: '#1a472a' },
  zonaSub:       { fontSize: 10, color: '#aaa' },
  encCard:       { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#e5e7eb' },
  avatar:        { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  avatarText:    { fontSize: 14, fontWeight: '800' },
  dot:           { width: 7, height: 7, borderRadius: 4 },
  encNombre:     { fontSize: 13, fontWeight: '700', color: '#111', flex: 1 },
  encSub:        { fontSize: 10, color: '#888' },
  encNum:        { fontSize: 20, fontWeight: '800', letterSpacing: -0.5 },
  encNumTotal:   { fontSize: 14, fontWeight: '700', color: '#94a3b8' },
  encNumLabel:   { fontSize: 9, color: '#aaa', fontWeight: '600' },
  btnRecargar:   { marginTop: 20, backgroundColor: '#1a472a', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 100 },
})