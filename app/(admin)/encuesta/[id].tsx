import { useState, useEffect, useRef } from 'react'
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, Modal, FlatList, RefreshControl,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../lib/auth'
import { AppHeader } from '../../../components/UI/AppHeader'

// ── Gráfico de barras ─────────────────────────────────────────
function BarChart({ data, labels, color = '#1a472a' }: { data: number[]; labels: string[]; color?: string }) {
  const max = Math.max(...data, 1)
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 90 }}>
      {data.map((val, i) => (
        <View key={i} style={{ flex: 1, alignItems: 'center', gap: 3 }}>
          <Text style={{ fontSize: 8, color: val > 0 ? color : 'transparent', fontWeight: '700' }}>
            {val > 0 ? val : ''}
          </Text>
          <View style={{
            width: '100%', borderRadius: 3,
            height: Math.max((val / max) * 65, val > 0 ? 4 : 2),
            backgroundColor: color,
            opacity: val === Math.max(...data) ? 1 : 0.4,
          }} />
          <Text style={{ fontSize: 8, color: '#999' }}>{labels[i]}</Text>
        </View>
      ))}
    </View>
  )
}

// ── Barra de distribución — COMPLETA (sin slice) ──────────────
function DistBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <View style={{ marginBottom: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
        <Text style={{ fontSize: 12, color: '#374151', flex: 1, lineHeight: 16 }}>{label}</Text>
        <Text style={{ fontSize: 12, fontWeight: '700', color, marginLeft: 8 }}>{count} ({pct}%)</Text>
      </View>
      <View style={{ height: 6, backgroundColor: '#e5e7eb', borderRadius: 3 }}>
        <View style={{ height: 6, backgroundColor: color, borderRadius: 3, width: `${pct}%` as any }} />
      </View>
    </View>
  )
}

// ── Tarjeta de pregunta ───────────────────────────────────────
function TarjetaPregunta({ pregunta, respuestas }: { pregunta: any; respuestas: any[] }) {
  const [expandido, setExpandido] = useState(false)
  const COLORS = ['#1a472a', '#0369a1', '#7c3aed', '#b45309', '#be185d', '#0891b2', '#059669', '#dc2626']

  if (pregunta.tipo === 'escala') {
    const valores = respuestas
      .map(r => Number(r.valor_numero ?? r.valor_texto))
      .filter(v => !isNaN(v) && v > 0)
    const promedio = valores.length > 0
      ? (valores.reduce((a, b) => a + b, 0) / valores.length).toFixed(1) : '-'
    const dist = Array.from({ length: 10 }, (_, i) => valores.filter(v => v === i + 1).length)
    return (
      <View style={s.pregCard}>
        <Text style={s.pregTipo}>Escala 1–10</Text>
        <Text style={s.pregTexto}>{pregunta.texto}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12, marginTop: 10 }}>
          <View>
            <Text style={[s.pregNum, { color: '#1a472a' }]}>{promedio}</Text>
            <Text style={{ fontSize: 10, color: '#888' }}>promedio</Text>
          </View>
          <View style={{ flex: 1 }}>
            <BarChart data={dist} labels={['1','2','3','4','5','6','7','8','9','10']} />
          </View>
        </View>
        <Text style={s.pregCount}>{valores.length} respuestas</Text>
      </View>
    )
  }

  if (pregunta.tipo === 'si_no') {
    const total = respuestas.length
    const si    = respuestas.filter(r => r.valor_texto === 'Sí' || r.valor_booleano === true).length
    const no    = total - si
    return (
      <View style={s.pregCard}>
        <Text style={s.pregTipo}>Sí / No</Text>
        <Text style={s.pregTexto}>{pregunta.texto}</Text>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
          <View style={[s.siNoBox, { backgroundColor: '#d8f3dc' }]}>
            <Text style={[s.siNoNum, { color: '#1a472a' }]}>
              {total > 0 ? Math.round((si / total) * 100) : 0}%
            </Text>
            <Text style={[s.siNoLabel, { color: '#2d6a4f' }]}>Sí ({si})</Text>
          </View>
          <View style={[s.siNoBox, { backgroundColor: '#fef2f2' }]}>
            <Text style={[s.siNoNum, { color: '#dc2626' }]}>
              {total > 0 ? Math.round((no / total) * 100) : 0}%
            </Text>
            <Text style={[s.siNoLabel, { color: '#dc2626' }]}>No ({no})</Text>
          </View>
        </View>
        <Text style={s.pregCount}>{total} respuestas</Text>
      </View>
    )
  }

  if (pregunta.tipo === 'opcion_multiple') {
    const conteo: Record<string, number> = {}
    respuestas.forEach(r => {
      const v = r.valor_texto || ''
      if (v) conteo[v] = (conteo[v] || 0) + (r.cantidad || 1)
    })
    const total  = Object.values(conteo).reduce((a, b) => a + b, 0)
    const sorted = Object.entries(conteo).sort((a, b) => b[1] - a[1])
    const visibles = expandido ? sorted : sorted.slice(0, 5)
    return (
      <View style={s.pregCard}>
        <Text style={s.pregTipo}>Opción múltiple</Text>
        <Text style={s.pregTexto}>{pregunta.texto}</Text>
        <View style={{ marginTop: 12 }}>
          {visibles.map(([label, count], i) => (
            <DistBar key={label} label={label} count={count} total={total} color={COLORS[i % COLORS.length]} />
          ))}
          {sorted.length > 5 && (
            <TouchableOpacity onPress={() => setExpandido(!expandido)} style={{ marginTop: 4 }}>
              <Text style={{ fontSize: 12, color: '#1a472a', fontWeight: '700', textAlign: 'center' }}>
                {expandido ? 'Ver menos ▲' : `Ver ${sorted.length - 5} más ▼`}
              </Text>
            </TouchableOpacity>
          )}
        </View>
        <Text style={s.pregCount}>{total} respuestas</Text>
      </View>
    )
  }

  if (pregunta.tipo === 'texto_libre') {
    const textos = respuestas.filter(r => r.valor_texto?.trim())
    const visibles = expandido ? textos : textos.slice(0, 3)
    return (
      <View style={s.pregCard}>
        <Text style={s.pregTipo}>Texto libre</Text>
        <Text style={s.pregTexto}>{pregunta.texto}</Text>
        <View style={{ marginTop: 10, gap: 6 }}>
          {visibles.length > 0
            ? visibles.map((r, i) => (
                <View key={i} style={{ backgroundColor: '#f9fafb', borderRadius: 8, padding: 10, borderLeftWidth: 3, borderLeftColor: '#1a472a' }}>
                  <Text style={{ fontSize: 12, color: '#374151', lineHeight: 17 }}>{r.valor_texto}</Text>
                </View>
              ))
            : <Text style={{ fontSize: 12, color: '#aaa', textAlign: 'center' }}>Sin respuestas aún</Text>
          }
          {textos.length > 3 && (
            <TouchableOpacity onPress={() => setExpandido(!expandido)} style={{ marginTop: 4 }}>
              <Text style={{ fontSize: 12, color: '#1a472a', fontWeight: '700', textAlign: 'center' }}>
                {expandido ? 'Ver menos ▲' : `Ver ${textos.length - 3} más ▼`}
              </Text>
            </TouchableOpacity>
          )}
        </View>
        <Text style={s.pregCount}>{textos.length} respuestas</Text>
      </View>
    )
  }

  if (pregunta.tipo === 'matriz') {
    const filasDef    = (pregunta.config_matriz?.filas    || []).map((f: any) => typeof f === 'string' ? f : f.texto)
    const columnasDef = (pregunta.config_matriz?.columnas || []).map((c: any) => typeof c === 'string' ? c : c.texto)
    const conteo: Record<string, Record<string, number>> = {}
    filasDef.forEach((f: string) => { conteo[f] = {}; columnasDef.forEach((c: string) => { conteo[f][c] = 0 }) })
    respuestas.forEach(r => {
      try {
        const val = typeof r.valor_texto === 'string' ? JSON.parse(r.valor_texto) : r.valor_texto
        const cantidad = r.cantidad || 1
        if (val && typeof val === 'object') {
          Object.entries(val).forEach(([fi, col]) => {
            const filaTexto = isNaN(Number(fi)) ? fi : (filasDef[Number(fi)] || fi)
            if (filaTexto && conteo[filaTexto] && columnasDef.includes(col as string)) {
              conteo[filaTexto][col as string] = (conteo[filaTexto][col as string] || 0) + cantidad
            }
          })
        }
      } catch {}
    })
    if (!filasDef.length) return null
    return (
      <View style={s.pregCard}>
        <Text style={s.pregTipo}>Matriz</Text>
        <Text style={s.pregTexto}>{pregunta.texto}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
          <View>
            <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e5e7eb', paddingBottom: 6, marginBottom: 4 }}>
              <View style={{ width: 130 }} />
              {columnasDef.map((col: string, ci: number) => (
                <View key={ci} style={{ width: 68, alignItems: 'center' }}>
                  <Text style={{ fontSize: 9, fontWeight: '700', color: '#6b7280', textAlign: 'center' }} numberOfLines={2}>{col}</Text>
                </View>
              ))}
            </View>
            {filasDef.map((fila: string, fi: number) => {
              const totalFila = columnasDef.reduce((sum: number, c: string) => sum + (conteo[fila]?.[c] || 0), 0)
              const maxCol = columnasDef.reduce((max: string, c: string) =>
                (conteo[fila]?.[c] || 0) > (conteo[fila]?.[max] || 0) ? c : max, columnasDef[0])
              return (
                <View key={fi} style={{ flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#f3f4f6', paddingVertical: 8 }}>
                  <View style={{ width: 130 }}>
                    <Text style={{ fontSize: 12, color: '#374151', fontWeight: '600' }} numberOfLines={2}>{fila}</Text>
                    {totalFila > 0 && <Text style={{ fontSize: 9, color: '#9ca3af' }}>{totalFila} resp.</Text>}
                  </View>
                  {columnasDef.map((col: string, ci: number) => {
                    const n = conteo[fila]?.[col] || 0
                    const esMayor = col === maxCol && n > 0
                    const pct = totalFila > 0 ? Math.round(n / totalFila * 100) : 0
                    return (
                      <View key={ci} style={{ width: 68, alignItems: 'center' }}>
                        <Text style={{ fontSize: 15, fontWeight: '800', color: esMayor ? '#1a472a' : (n > 0 ? '#374151' : '#d1d5db') }}>{n}</Text>
                        {n > 0 && totalFila > 0 && (
                          <Text style={{ fontSize: 9, color: esMayor ? '#1a472a' : '#9ca3af', fontWeight: esMayor ? '700' : '400' }}>{pct}%</Text>
                        )}
                      </View>
                    )
                  })}
                </View>
              )
            })}
          </View>
        </ScrollView>
        <Text style={s.pregCount}>{respuestas.length} respuestas</Text>
      </View>
    )
  }
  return null
}

// ── Selector ──────────────────────────────────────────────────
function Selector({ label, value, opciones, onSelect, placeholder }: {
  label: string; value: string | null;
  opciones: { id: string; nombre: string }[];
  onSelect: (id: string | null) => void; placeholder: string
}) {
  const [open, setOpen] = useState(false)
  const selected = opciones.find(o => o.id === value)
  return (
    <>
      <TouchableOpacity style={fs.selector} onPress={() => setOpen(true)}>
        <Text style={{ fontSize: 10, color: '#6b7280', fontWeight: '700', marginBottom: 3, textTransform: 'uppercase' }}>{label}</Text>
        <Text style={{ fontSize: 13, fontWeight: '600', color: value ? '#111827' : '#9ca3af' }} numberOfLines={1}>
          {selected?.nombre || placeholder}
        </Text>
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="slide">
        <TouchableOpacity style={fs.overlay} onPress={() => setOpen(false)} activeOpacity={1}>
          <View style={fs.sheet}>
            <Text style={fs.sheetTitle}>{label}</Text>
            <TouchableOpacity style={fs.opcion} onPress={() => { onSelect(null); setOpen(false) }}>
              <Text style={{ fontSize: 14, color: '#888' }}>Todos</Text>
              {!value && <Text style={{ color: '#1a472a', fontWeight: '700' }}>✓</Text>}
            </TouchableOpacity>
            <FlatList
              data={opciones}
              keyExtractor={o => o.id}
              renderItem={({ item }) => (
                <TouchableOpacity style={fs.opcion} onPress={() => { onSelect(item.id); setOpen(false) }}>
                  <Text style={{ fontSize: 14, color: '#111' }} numberOfLines={1}>{item.nombre}</Text>
                  {value === item.id && <Text style={{ color: '#1a472a', fontWeight: '700' }}>✓</Text>}
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  )
}

// ── Pantalla principal ────────────────────────────────────────
export default function EncuestaDetalle() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { perfil } = useAuth()

  const [equipos,       setEquipos]       = useState<any[]>([])
  const [zonas,         setZonas]         = useState<any[]>([])
  const [encuestadores, setEncuestadores] = useState<any[]>([])
  const [equipoId,      setEquipoId]      = useState<string | null>(null)
  const [zonaId,        setZonaId]        = useState<string | null>(null)
  const [encuestadorId, setEncuestadorId] = useState<string | null>(null)

  const [preguntas,   setPreguntas]   = useState<any[]>([])
  const [resultados,  setResultados]  = useState<any>(null)
  const [loading,     setLoading]     = useState(true)
  const [loadingRes,  setLoadingRes]  = useState(false)
  const [refresh,     setRefresh]     = useState(false)

  const channelRef = useRef<any>(null)

  useEffect(() => {
    if (id && perfil?.organizacion_id) init()
  }, [id, perfil?.organizacion_id])

  useEffect(() => {
    if (id) fetchResultados()
  }, [equipoId, zonaId, encuestadorId])

  useEffect(() => {
    setZonaId(null); setEncuestadorId(null)
  }, [equipoId])

  useEffect(() => {
    if (!id) return
    const channelName = `admin-enc-${id}`
    supabase.removeChannel(supabase.channel(channelName))
    channelRef.current = supabase.channel(channelName)
    channelRef.current
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sesiones_respuesta' },
        () => fetchResultados())
      .subscribe()
    return () => { supabase.removeChannel(channelRef.current) }
  }, [id])

  async function init() {
    const [pregRes, eqRes, encuRes, zonaRes] = await Promise.all([
      supabase.from('preguntas').select('id, texto, tipo, clave_base, orden, config_matriz')
        .eq('encuesta_id', id).order('orden'),
      supabase.from('equipos').select('id, nombre')
        .eq('organizacion_id', perfil!.organizacion_id!).order('nombre'),
      supabase.from('perfiles').select('id, nombre_completo')
        .eq('organizacion_id', perfil!.organizacion_id!).eq('rol', 'encuestador').eq('activo', true)
        .order('nombre_completo'),
      supabase.from('encuesta_zonas').select('id, nombre, equipo_id')
        .eq('encuesta_id', id).order('orden'),
    ])
    setPreguntas(pregRes.data || [])
    setEquipos(eqRes.data || [])
    setEncuestadores(encuRes.data?.map((e: any) => ({ id: e.id, nombre: e.nombre_completo })) || [])
    setZonas(zonaRes.data?.map((z: any) => ({ id: z.id, nombre: z.nombre, equipo_id: z.equipo_id })) || [])
    await fetchResultados()
    setLoading(false)
    setRefresh(false)
  }

  async function fetchResultados() {
    if (!id) return
    setLoadingRes(true)
    const { data } = await supabase.rpc('get_resultados_encuesta_filtrado', {
      p_encuesta_id:    id,
      p_equipo_id:      equipoId      || null,
      p_zona_id:        zonaId        || null,
      p_encuestador_id: encuestadorId || null,
    })
    if (data) setResultados(data)
    setLoadingRes(false)
  }

  const zonasFiltradas = equipoId ? zonas.filter(z => z.equipo_id === equipoId) : zonas

  // Últimos 7 días
  const porDia  = resultados?.por_dia || []
  const hoy     = new Date()
  const ultimos7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(hoy); d.setDate(d.getDate() - (6 - i))
    const key   = d.toISOString().split('T')[0]
    const found = porDia.find((p: any) => p.dia?.startsWith(key))
    return { label: `${d.getDate()}/${d.getMonth() + 1}`, val: found?.total || 0 }
  })

  const respuestasPorPregunta: Record<string, any[]> = {}
  ;(resultados?.respuestas || []).forEach((r: any) => {
    if (!respuestasPorPregunta[r.pregunta_id]) respuestasPorPregunta[r.pregunta_id] = []
    respuestasPorPregunta[r.pregunta_id].push(r)
  })
  const preguntasVisibles = preguntas.filter(p => !p.clave_base)
  const totalCompletadas  = resultados?.total_completadas ?? 0
  const totalNoRespuesta  = resultados?.total_no_respuesta ?? 0

  if (loading) return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f2f1ee' }}>
      <ActivityIndicator size="large" color="#1a472a" />
    </View>
  )

  return (
    <View style={[s.page, { paddingTop: insets.top }]}>
      <AppHeader nombre={perfil?.nombre_completo} rol={perfil?.rol} onSignOut={undefined} color="#1a472a" />
      {/* Subheader volver */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={s.back}>← Volver</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refresh} onRefresh={() => { setRefresh(true); init() }} tintColor="#1a472a" />}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      >
        {/* Filtros */}
        <View style={s.filtrosGrid}>
          <View style={{ width: '47%' }}>
            <Selector label="Equipo" value={equipoId} opciones={equipos} onSelect={setEquipoId} placeholder="Todos los equipos" />
          </View>
          <View style={{ width: '47%' }}>
            <Selector label="Zona" value={zonaId} opciones={zonasFiltradas} onSelect={setZonaId} placeholder="Todas las zonas" />
          </View>
          <View style={{ width: '100%' }}>
            <Selector label="Encuestador" value={encuestadorId} opciones={encuestadores} onSelect={setEncuestadorId} placeholder="Todos los encuestadores" />
          </View>
        </View>

        {/* KPIs */}
        <View style={s.kpiRow}>
          <View style={[s.kpi, { backgroundColor: '#1a472a' }]}>
            <Text style={[s.kpiVal, { color: '#fff' }]}>{totalCompletadas}</Text>
            <Text style={[s.kpiLabel, { color: '#b7e4c7' }]}>Completadas</Text>
          </View>
          <View style={[s.kpi, { backgroundColor: '#d8f3dc' }]}>
            <Text style={[s.kpiVal, { color: '#1a472a' }]}>{resultados?.total_hoy ?? 0}</Text>
            <Text style={[s.kpiLabel, { color: '#2d6a4f' }]}>Hoy</Text>
          </View>
          {totalNoRespuesta > 0 && (
            <View style={[s.kpi, { backgroundColor: '#fef3c7' }]}>
              <Text style={[s.kpiVal, { color: '#b45309' }]}>{totalNoRespuesta}</Text>
              <Text style={[s.kpiLabel, { color: '#92400e' }]}>No resp.</Text>
            </View>
          )}
        </View>

        {loadingRes ? (
          <View style={[s.card, { alignItems: 'center', paddingVertical: 40 }]}>
            <ActivityIndicator color="#1a472a" />
          </View>
        ) : (
          <>
            {/* Gráfico 7 días */}
            <View style={s.card}>
              <Text style={s.cardTitle}>Respuestas — últimos 7 días</Text>
              <View style={{ marginTop: 10 }}>
                <BarChart data={ultimos7.map(d => d.val)} labels={ultimos7.map(d => d.label)} />
              </View>
            </View>

            {/* Gráficos por pregunta — TODOS */}
            {preguntasVisibles.length > 0 && totalCompletadas > 0
              ? preguntasVisibles.map(preg => (
                  <TarjetaPregunta key={preg.id} pregunta={preg} respuestas={respuestasPorPregunta[preg.id] || []} />
                ))
              : (
                <View style={s.card}>
                  <Text style={{ color: '#aaa', textAlign: 'center', fontSize: 13, paddingVertical: 16 }}>
                    Sin respuestas con los filtros seleccionados
                  </Text>
                </View>
              )
            }
          </>
        )}
      </ScrollView>
    </View>
  )
}

const s = StyleSheet.create({
  page:     { flex: 1, backgroundColor: '#f2f1ee' },
  header:   { backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  back:     { fontSize: 14, fontWeight: '600', color: '#1a472a' },
  filtrosGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, padding: 16, paddingBottom: 0, justifyContent: 'space-between' },
  kpiRow:   { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginVertical: 12 },
  kpi:      { flex: 1, borderRadius: 14, padding: 14 },
  kpiVal:   { fontSize: 30, fontWeight: '800', letterSpacing: -1 },
  kpiLabel: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  card:     { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginHorizontal: 16, marginBottom: 10, borderWidth: 1, borderColor: '#e5e7eb' },
  cardTitle:{ fontSize: 13, fontWeight: '700', color: '#111' },
  pregCard: { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginHorizontal: 16, marginBottom: 10, borderWidth: 1, borderColor: '#e5e7eb' },
  pregTipo: { fontSize: 10, fontWeight: '700', color: '#1a472a', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  pregTexto:{ fontSize: 13, fontWeight: '700', color: '#111', lineHeight: 18, marginBottom: 2 },
  pregNum:  { fontSize: 32, fontWeight: '800', letterSpacing: -1 },
  pregCount:{ fontSize: 10, color: '#aaa', marginTop: 10, textAlign: 'right' },
  siNoBox:  { flex: 1, borderRadius: 10, padding: 12, alignItems: 'center' },
  siNoNum:  { fontSize: 26, fontWeight: '800' },
  siNoLabel:{ fontSize: 11, fontWeight: '600', marginTop: 2 },
})

const fs = StyleSheet.create({
  selector:   { backgroundColor: '#fff', borderRadius: 12, padding: 12, borderWidth: 1.5, borderColor: '#e5e7eb', minHeight: 58 },
  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,.4)', justifyContent: 'flex-end' },
  sheet:      { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '60%' },
  sheetTitle: { fontSize: 15, fontWeight: '800', color: '#111', marginBottom: 12 },
  opcion:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
})