import { useState, useEffect, useCallback, useRef } from 'react'
import {
  View, Text, ScrollView, StyleSheet, RefreshControl,
  TouchableOpacity, ActivityIndicator, Modal, FlatList,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '../../lib/auth'
import { AppHeader } from '../../components/UI/AppHeader'
import { LogoSvg } from '../../components/UI/LogoSvg'
import { supabase } from '../../lib/supabase'

// ── Componentes de gráficos ───────────────────────────────────
function BarChart({ data, labels, color = '#1a472a' }: { data: number[]; labels: string[]; color?: string }) {
  const max = Math.max(...data, 1)
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 80 }}>
      {data.map((val, i) => (
        <View key={i} style={{ flex: 1, alignItems: 'center', gap: 3 }}>
          <Text style={{ fontSize: 8, color: val > 0 ? color : 'transparent', fontWeight: '700' }}>
            {val > 0 ? val : ''}
          </Text>
          <View style={{
            width: '100%', borderRadius: 3,
            height: Math.max((val / max) * 60, val > 0 ? 4 : 2),
            backgroundColor: color,
            opacity: val === Math.max(...data) ? 1 : 0.4,
          }} />
          <Text style={{ fontSize: 8, color: '#999' }}>{labels[i]}</Text>
        </View>
      ))}
    </View>
  )
}

function DistBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <View style={{ marginBottom: 8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
        <Text style={{ fontSize: 11, color: '#555', flex: 1 }} numberOfLines={1}>{label}</Text>
        <Text style={{ fontSize: 11, fontWeight: '700', color, marginLeft: 8 }}>{count} ({pct}%)</Text>
      </View>
      <View style={{ height: 5, backgroundColor: '#e5e7eb', borderRadius: 3 }}>
        <View style={{ height: 5, backgroundColor: color, borderRadius: 3, width: `${pct}%` as any }} />
      </View>
    </View>
  )
}

// ── Tarjeta de pregunta ───────────────────────────────────────
function TarjetaPregunta({ pregunta, respuestas }: { pregunta: any; respuestas: any[] }) {
  const COLORS = ['#1a472a', '#0369a1', '#7c3aed', '#b45309', '#be185d', '#0891b2']

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
        <Text style={s.pregTexto} numberOfLines={2}>{pregunta.texto}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12, marginTop: 8 }}>
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
    const si    = respuestas.filter(r => r.valor_texto === 'Sí').length
    const no    = respuestas.filter(r => r.valor_texto === 'No').length
    const total = si + no
    return (
      <View style={s.pregCard}>
        <Text style={s.pregTipo}>Sí / No</Text>
        <Text style={s.pregTexto} numberOfLines={2}>{pregunta.texto}</Text>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
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
      if (v) conteo[v] = (conteo[v] || 0) + 1
    })
    const total  = respuestas.length
    const sorted = Object.entries(conteo).sort((a, b) => b[1] - a[1])
    return (
      <View style={s.pregCard}>
        <Text style={s.pregTipo}>Opción múltiple</Text>
        <Text style={s.pregTexto} numberOfLines={2}>{pregunta.texto}</Text>
        <View style={{ marginTop: 10 }}>
          {sorted.slice(0, 6).map(([label, count], i) => (
            <DistBar key={label} label={label} count={count} total={total} color={COLORS[i % COLORS.length]} />
          ))}
        </View>
        <Text style={s.pregCount}>{total} respuestas</Text>
      </View>
    )
  }

  if (pregunta.tipo === 'texto_libre') {
    const textos = respuestas.filter(r => r.valor_texto?.trim()).slice(0, 3)
    return (
      <View style={s.pregCard}>
        <Text style={s.pregTipo}>Texto libre</Text>
        <Text style={s.pregTexto} numberOfLines={2}>{pregunta.texto}</Text>
        <View style={{ marginTop: 10, gap: 6 }}>
          {textos.length > 0
            ? textos.map((r, i) => (
                <View key={i} style={{ backgroundColor: '#f9fafb', borderRadius: 6, padding: 8, borderLeftWidth: 3, borderLeftColor: '#1a472a' }}>
                  <Text style={{ fontSize: 11, color: '#444', lineHeight: 16 }} numberOfLines={3}>{r.valor_texto}</Text>
                </View>
              ))
            : <Text style={{ fontSize: 12, color: '#aaa', textAlign: 'center' }}>Sin respuestas aún</Text>
          }
        </View>
        <Text style={s.pregCount}>{respuestas.length} respuestas</Text>
      </View>
    )
  }
  return null
}

// ── Selector con modal ────────────────────────────────────────
function Selector({ label, value, opciones, onSelect, placeholder }: {
  label: string; value: string | null; opciones: { id: string; nombre: string }[];
  onSelect: (id: string | null) => void; placeholder: string;
}) {
  const [open, setOpen] = useState(false)
  const selected = opciones.find(o => o.id === value)
  return (
    <>
      <TouchableOpacity style={fs.selector} onPress={() => setOpen(true)}>
        <Text style={{ fontSize: 10, color: '#888', fontWeight: '600', marginBottom: 2 }}>{label}</Text>
        <Text style={{ fontSize: 12, fontWeight: '700', color: value ? '#111' : '#aaa' }} numberOfLines={1}>
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

// ── Dashboard Admin/Gestor ────────────────────────────────────
export default function AdminDashboard() {
  const { perfil, signOut } = useAuth()
  const insets = useSafeAreaInsets()

  // Catálogos
  const [encuestas,     setEncuestas]     = useState<any[]>([])
  const [equipos,       setEquipos]       = useState<any[]>([])
  const [zonas,         setZonas]         = useState<any[]>([])
  const [encuestadores, setEncuestadores] = useState<any[]>([])

  // Filtros seleccionados
  const [encuestaId,     setEncuestaId]     = useState<string | null>(null)
  const [equipoId,       setEquipoId]       = useState<string | null>(null)
  const [zonaId,         setZonaId]         = useState<string | null>(null)
  const [encuestadorId,  setEncuestadorId]  = useState<string | null>(null)

  // Datos
  const [resultados,  setResultados]  = useState<any>(null)
  const [preguntas,   setPreguntas]   = useState<any[]>([])
  const [loading,     setLoading]     = useState(true)
  const [loadingRes,  setLoadingRes]  = useState(false)
  const [refresh,     setRefresh]     = useState(false)

  const realtimeRef = useRef<any>(null)

  useEffect(() => {
    if (perfil?.organizacion_id) fetchCatalogos()
  }, [perfil?.organizacion_id])

  // Recargar resultados cuando cambian filtros
  useEffect(() => {
    if (encuestaId) fetchResultados()
  }, [encuestaId, equipoId, zonaId, encuestadorId])

  // Filtrar zonas cuando cambia equipo
  useEffect(() => {
    setZonaId(null)
    setEncuestadorId(null)
  }, [equipoId])

  // Realtime — recarga al llegar nueva sesión
  useEffect(() => {
    if (!encuestaId) return
    const ch = supabase.channel(`admin-dashboard-${encuestaId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'sesiones_respuesta',
      }, () => fetchResultados())
      .subscribe()
    realtimeRef.current = ch
    return () => { supabase.removeChannel(ch) }
  }, [encuestaId])

  async function fetchCatalogos() {
    const orgId = perfil!.organizacion_id!

    const [encRes, eqRes, encuRes] = await Promise.all([
      supabase.from('encuestas').select('id, nombre')
        .eq('organizacion_id', orgId).eq('estado_produccion', 'publicada')
        .order('creado_en', { ascending: false }),
      supabase.from('equipos').select('id, nombre')
        .eq('organizacion_id', orgId).order('nombre'),
      supabase.from('perfiles').select('id, nombre_completo')
        .eq('organizacion_id', orgId).eq('rol', 'encuestador').eq('activo', true)
        .order('nombre_completo'),
    ])

    const encs = encRes.data || []
    setEncuestas(encs)
    setEquipos(eqRes.data || [])
    setEncuestadores(encuRes.data?.map((e: any) => ({ id: e.id, nombre: e.nombre_completo })) || [])

    if (encs.length > 0) {
      setEncuestaId(encs[0].id)
      await Promise.all([fetchPreguntas(encs[0].id), fetchZonas(encs[0].id)])
    }
    setLoading(false)
    setRefresh(false)
  }

  async function fetchZonas(eId: string) {
    const { data } = await supabase
      .from('encuesta_zonas')
      .select('id, nombre, equipo_id')
      .eq('encuesta_id', eId)
      .order('orden')
    setZonas(data?.map((z: any) => ({ id: z.id, nombre: z.nombre, equipo_id: z.equipo_id })) || [])
  }

  async function fetchPreguntas(eId: string) {
    const { data } = await supabase.from('preguntas')
      .select('id, texto, tipo, clave_base, orden')
      .eq('encuesta_id', eId).order('orden')
    setPreguntas(data || [])
  }

  async function fetchResultados() {
    if (!encuestaId) return
    setLoadingRes(true)
    const { data, error } = await supabase.rpc('get_resultados_encuesta_filtrado', {
      p_encuesta_id:    encuestaId,
      p_equipo_id:      equipoId  || null,
      p_zona_id:        zonaId    || null,
      p_encuestador_id: encuestadorId || null,
    })
    if (!error) setResultados(data)
    setLoadingRes(false)
  }

  async function handleEncuestaChange(id: string) {
    setEncuestaId(id)
    setEquipoId(null); setZonaId(null); setEncuestadorId(null)
    setResultados(null)
    await Promise.all([fetchPreguntas(id), fetchZonas(id)])
  }

  // Zonas filtradas por equipo seleccionado
  const zonasFiltradas = equipoId
    ? zonas.filter((z: any) => z.equipo_id === equipoId)
    : zonas

  // Encuestadores filtrados por equipo
  const encuestadoresFiltrados = equipoId
    ? encuestadores.filter((e: any) => e.equipo_id === equipoId)
    : encuestadores

  // Respuestas agrupadas por pregunta
  const respuestasPorPregunta: Record<string, any[]> = {}
  ;(resultados?.respuestas || []).forEach((r: any) => {
    if (!respuestasPorPregunta[r.pregunta_id]) respuestasPorPregunta[r.pregunta_id] = []
    respuestasPorPregunta[r.pregunta_id].push(r)
  })

  // Gráfico por día (últimos 14 días)
  const porDia = resultados?.por_dia || []
  const hoy    = new Date()
  const ultimos7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(hoy); d.setDate(d.getDate() - (6 - i))
    const key = d.toISOString().split('T')[0]
    const found = porDia.find((p: any) => p.dia?.startsWith(key))
    return { label: `${d.getDate()}/${d.getMonth() + 1}`, val: found?.total || 0 }
  })

  const preguntasVisibles = preguntas.filter(p => !p.clave_base)
  const totalSesiones = resultados?.total_sesiones ?? 0

  if (loading) return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f2f1ee' }}>
      <ActivityIndicator size="large" color="#1a472a" />
    </View>
  )

  return (
    <ScrollView
      style={s.container}
      refreshControl={<RefreshControl refreshing={refresh} onRefresh={() => { setRefresh(true); fetchCatalogos() }} tintColor="#1a472a" />}
    >
      <AppHeader
        nombre={perfil?.nombre_completo}
        rol={perfil?.rol}
        onSignOut={signOut}
        color="#1a472a"
      />

      {/* Selector de encuesta */}
      {encuestas.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingHorizontal: 16, marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {encuestas.map(enc => (
              <TouchableOpacity
                key={enc.id}
                onPress={() => handleEncuestaChange(enc.id)}
                style={[s.chip, encuestaId === enc.id && s.chipActive]}
              >
                <Text style={[s.chipText, encuestaId === enc.id && s.chipTextActive]} numberOfLines={1}>
                  {enc.nombre}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      )}

      {/* Filtros */}
      <View style={s.filtrosRow}>
        <Selector
          label="Equipo"
          value={equipoId}
          opciones={equipos}
          onSelect={setEquipoId}
          placeholder="Todos"
        />
        <Selector
          label="Zona"
          value={zonaId}
          opciones={zonasFiltradas}
          onSelect={setZonaId}
          placeholder="Todas"
        />
        <Selector
          label="Encuestador"
          value={encuestadorId}
          opciones={encuestadoresFiltrados}
          onSelect={setEncuestadorId}
          placeholder="Todos"
        />
      </View>

      {/* KPIs */}
      <View style={s.kpiRow}>
        <View style={[s.kpi, { backgroundColor: '#1a472a' }]}>
          <Text style={[s.kpiVal, { color: '#fff' }]}>{totalSesiones}</Text>
          <Text style={[s.kpiLabel, { color: '#b7e4c7' }]}>Total respuestas</Text>
        </View>
        <View style={[s.kpi, { backgroundColor: '#d8f3dc' }]}>
          <Text style={[s.kpiVal, { color: '#1a472a' }]}>{resultados?.total_hoy ?? 0}</Text>
          <Text style={[s.kpiLabel, { color: '#2d6a4f' }]}>Hoy</Text>
        </View>
      </View>

      {/* Gráfico últimos 7 días */}
      {loadingRes ? (
        <View style={[s.card, { alignItems: 'center', paddingVertical: 32 }]}>
          <ActivityIndicator color="#1a472a" />
        </View>
      ) : (
        <>
          <View style={s.card}>
            <Text style={s.cardTitle}>Respuestas — últimos 7 días</Text>
            <View style={{ marginTop: 10 }}>
              <BarChart
                data={ultimos7.map(d => d.val)}
                labels={ultimos7.map(d => d.label)}
              />
            </View>
          </View>

          {/* Resultados por pregunta */}
          {preguntasVisibles.length > 0 && totalSesiones > 0 ? (
            preguntasVisibles.map(preg => (
              <TarjetaPregunta
                key={preg.id}
                pregunta={preg}
                respuestas={respuestasPorPregunta[preg.id] || []}
              />
            ))
          ) : (
            <View style={s.card}>
              <Text style={{ color: '#aaa', textAlign: 'center', fontSize: 13, paddingVertical: 8 }}>
                {encuestaId ? 'Sin respuestas con los filtros seleccionados' : 'Seleccioná una encuesta'}
              </Text>
            </View>
          )}
        </>
      )}

      <View style={{ height: insets.bottom + 32 }} />
    </ScrollView>
  )
}

const s = StyleSheet.create({
  container:        { flex: 1, backgroundColor: '#f2f1ee' },
  header:     { backgroundColor: '#1a472a', padding: 20, paddingBottom: 20 },
  headerTop:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  greeting:   { fontSize: 18, fontWeight: '800', color: '#fff', letterSpacing: -0.3, marginBottom: 4 },
  headerLive: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot:    { width: 7, height: 7, borderRadius: 4, backgroundColor: '#4ade80' },
  orgLabel:   { fontSize: 12, color: 'rgba(255,255,255,0.6)', fontWeight: '500' },
  salirBtn:   { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', backgroundColor: 'rgba(255,255,255,0.1)' },
  salirText:  { fontSize: 12, color: 'rgba(255,255,255,0.8)', fontWeight: '600' },
  chip:             { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 100, borderWidth: 1.5, borderColor: '#e5e7eb', backgroundColor: '#fff', maxWidth: 180 },
  chipActive:       { borderColor: '#1a472a', backgroundColor: '#d8f3dc' },
  chipText:         { fontSize: 12, fontWeight: '600', color: '#888' },
  chipTextActive:   { color: '#1a472a' },
  filtrosRow:       { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 12 },
  kpiRow:           { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 12 },
  kpi:              { flex: 1, borderRadius: 14, padding: 14 },
  kpiVal:           { fontSize: 30, fontWeight: '800', letterSpacing: -1 },
  kpiLabel:         { fontSize: 11, fontWeight: '600', marginTop: 2 },
  card:             { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginHorizontal: 16, marginBottom: 10, borderWidth: 1, borderColor: '#e5e7eb' },
  cardTitle:        { fontSize: 13, fontWeight: '700', color: '#111' },
  pregCard:         { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginHorizontal: 16, marginBottom: 10, borderWidth: 1, borderColor: '#e5e7eb' },
  pregTipo:         { fontSize: 10, fontWeight: '700', color: '#1a472a', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  pregTexto:        { fontSize: 13, fontWeight: '700', color: '#111', lineHeight: 18 },
  pregNum:          { fontSize: 32, fontWeight: '800', letterSpacing: -1 },
  pregCount:        { fontSize: 10, color: '#aaa', marginTop: 8, textAlign: 'right' },
  siNoBox:          { flex: 1, borderRadius: 10, padding: 12, alignItems: 'center' },
  siNoNum:          { fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  siNoLabel:        { fontSize: 11, fontWeight: '600', marginTop: 2 },
})

const fs = StyleSheet.create({
  selector:   { flex: 1, backgroundColor: '#fff', borderRadius: 10, padding: 10, borderWidth: 1.5, borderColor: '#e5e7eb' },
  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,.4)', justifyContent: 'flex-end' },
  sheet:      { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '60%' },
  sheetTitle: { fontSize: 15, fontWeight: '800', color: '#111', marginBottom: 12 },
  opcion:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
})