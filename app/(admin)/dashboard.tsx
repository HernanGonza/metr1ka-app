import { useState, useEffect, useCallback } from 'react'
import { View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity, ActivityIndicator } from 'react-native'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import { useRealtimeSesiones } from '../../lib/realtime'

// ── Mini bar chart ──
function BarChart({ data, labels, color = '#1a472a' }: { data: number[], labels: string[], color?: string }) {
  const max = Math.max(...data, 1)
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 80 }}>
      {data.map((val, i) => (
        <View key={i} style={{ flex: 1, alignItems: 'center', gap: 3 }}>
          <View style={{
            width: '100%', borderRadius: 3,
            height: Math.max((val / max) * 64, val > 0 ? 4 : 2),
            backgroundColor: val === Math.max(...data) ? color : color,
            opacity: val === Math.max(...data) ? 1 : 0.45,
          }} />
          <Text style={{ fontSize: 8, color: '#999', fontWeight: '600' }}>{labels[i]}</Text>
        </View>
      ))}
    </View>
  )
}

// ── Barra de distribución ──
function DistBar({ label, count, total, color }: { label: string, count: number, total: number, color: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <View style={{ marginBottom: 8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
        <Text style={{ fontSize: 11, color: '#555', flex: 1 }} numberOfLines={1}>{label}</Text>
        <Text style={{ fontSize: 11, fontWeight: '700', color, marginLeft: 8 }}>{pct}%</Text>
      </View>
      <View style={{ height: 5, backgroundColor: '#e5e7eb', borderRadius: 3 }}>
        <View style={{ height: 5, backgroundColor: color, borderRadius: 3, width: `${pct}%` }} />
      </View>
    </View>
  )
}

// ── Mapa encuestadores ──
function MapaEncuestadores({ encuestadores }: { encuestadores: any[] }) {
  const colors = ['#1a472a', '#0369a1', '#b45309', '#7c3aed', '#c0392b']
  const positions = [
    { left: 40,  top: 65 },
    { left: 100, top: 35 },
    { left: 160, top: 72 },
    { left: 210, top: 28 },
    { left: 255, top: 62 },
  ]
  return (
    <View style={{ height: 130, borderRadius: 10, overflow: 'hidden', backgroundColor: '#deefd8', position: 'relative' }}>
      {/* Líneas — sin porcentajes */}
      <View style={{ position: 'absolute', left: 100, top: 0, bottom: 0, width: 1, backgroundColor: '#a8d5a2' }} />
      <View style={{ position: 'absolute', left: 200, top: 0, bottom: 0, width: 1, backgroundColor: '#a8d5a2' }} />
      <View style={{ position: 'absolute', top: 65, left: 0, right: 0, height: 1, backgroundColor: '#a8d5a2' }} />
      {/* Zona — sin borderStyle dashed */}
      <View style={{ position: 'absolute', left: 24, top: 16, width: 140, height: 85, borderRadius: 8, backgroundColor: 'rgba(26,71,42,0.1)', borderWidth: 1.5, borderColor: '#1a472a' }} />
      {/* Markers */}
      {encuestadores.slice(0, 5).map((enc, i) => {
        const initials = enc.nombre_completo?.split(' ').map((w: string) => w[0]).join('').slice(0, 2) || '??'
        return (
          <View key={enc.id} style={{ position: 'absolute', left: positions[i].left, top: positions[i].top, alignItems: 'center' }}>
            <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: colors[i % colors.length], borderWidth: 2, borderColor: '#fff', justifyContent: 'center', alignItems: 'center' }}>
              <Text style={{ color: '#fff', fontSize: 7, fontWeight: '800' }}>{initials}</Text>
            </View>
            <View style={{ backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 4, paddingHorizontal: 3, paddingVertical: 1, marginTop: 2 }}>
              <Text style={{ fontSize: 7, fontWeight: '700', color: '#222' }}>{enc.nombre_completo?.split(' ')[0]}</Text>
            </View>
          </View>
        )
      })}
      <Text style={{ position: 'absolute', bottom: 5, right: 8, fontSize: 8, color: '#5a9e5a', fontWeight: '600' }}>
        Posadas, Misiones
      </Text>
    </View>
  )
}

// ── Tarjeta de pregunta ──
function TarjetaPregunta({ pregunta, respuestas }: { pregunta: any, respuestas: any[] }) {
  const COLORS = ['#1a472a','#2d6a4f','#52b788','#0369a1','#7c3aed','#b45309','#c0392b']

  if (pregunta.tipo === 'escala') {
    const valores = respuestas.map(r => parseInt(r.valor_texto || r.valor_numero || '0')).filter(v => v > 0)
    const promedio = valores.length > 0 ? (valores.reduce((a, b) => a + b, 0) / valores.length).toFixed(1) : '-'
    const dist = Array.from({ length: 10 }, (_, i) => valores.filter(v => v === i + 1).length)
    return (
      <View style={s.pregCard}>
        <Text style={s.pregTipo}>Escala 1-10</Text>
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
    const si = respuestas.filter(r => r.valor_texto === 'Sí').length
    const no = respuestas.filter(r => r.valor_texto === 'No').length
    const total = si + no
    return (
      <View style={s.pregCard}>
        <Text style={s.pregTipo}>Sí / No</Text>
        <Text style={s.pregTexto} numberOfLines={2}>{pregunta.texto}</Text>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
          <View style={[s.siNoBox, { backgroundColor: '#d8f3dc' }]}>
            <Text style={[s.siNoNum, { color: '#1a472a' }]}>{total > 0 ? Math.round((si/total)*100) : 0}%</Text>
            <Text style={[s.siNoLabel, { color: '#2d6a4f' }]}>Sí ({si})</Text>
          </View>
          <View style={[s.siNoBox, { backgroundColor: '#fef2f2' }]}>
            <Text style={[s.siNoNum, { color: '#c0392b' }]}>{total > 0 ? Math.round((no/total)*100) : 0}%</Text>
            <Text style={[s.siNoLabel, { color: '#c0392b' }]}>No ({no})</Text>
          </View>
        </View>
        <Text style={s.pregCount}>{total} respuestas</Text>
      </View>
    )
  }

  if (pregunta.tipo === 'opcion_multiple') {
    const opciones: Record<string, number> = {}
    respuestas.forEach(r => {
      const v = r.valor_texto || ''
      if (v) opciones[v] = (opciones[v] || 0) + 1
    })
    const total = respuestas.length
    const sorted = Object.entries(opciones).sort((a, b) => b[1] - a[1])
    return (
      <View style={s.pregCard}>
        <Text style={s.pregTipo}>Opción múltiple</Text>
        <Text style={s.pregTexto} numberOfLines={2}>{pregunta.texto}</Text>
        <View style={{ marginTop: 10 }}>
          {sorted.slice(0, 5).map(([label, count], i) => (
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
          {textos.length > 0 ? textos.map((r, i) => (
            <View key={i} style={{ backgroundColor: '#f9fafb', borderRadius: 6, padding: 8, borderLeftWidth: 3, borderLeftColor: '#1a472a' }}>
              <Text style={{ fontSize: 11, color: '#444', lineHeight: 16 }} numberOfLines={3}>{r.valor_texto}</Text>
            </View>
          )) : (
            <Text style={{ fontSize: 12, color: '#aaa', textAlign: 'center' }}>Sin respuestas aún</Text>
          )}
        </View>
        <Text style={s.pregCount}>{respuestas.length} respuestas</Text>
      </View>
    )
  }

  return null
}

export default function Dashboard() {
  const { perfil, signOut } = useAuth()
  const [encuestas,     setEncuestas]     = useState<any[]>([])
  const [encuestadores, setEncuestadores] = useState<any[]>([])
  const [sesionesHoy,   setSesionesHoy]   = useState(0)
  const [sesionesHora,  setSesionesHora]  = useState<number[]>(Array(8).fill(0))
  const [tabActiva,     setTabActiva]     = useState<string | null>(null)
  const [preguntas,     setPreguntas]     = useState<any[]>([])
  const [respuestas,    setRespuestas]    = useState<Record<string, any[]>>({})
  const [loading,       setLoading]       = useState(true)
  const [refresh,       setRefresh]       = useState(false)

  useEffect(() => {
    console.log('perfil:', perfil?.id, perfil?.organizacion_id)
    if (perfil?.organizacion_id) fetchAll()
  }, [perfil?.organizacion_id])
  useRealtimeSesiones('', () => fetchSesiones())

 async function fetchAll() {
  setLoading(true)
  await fetchEncuestas()  // primero — fetchSesiones necesita los IDs
  await Promise.all([fetchEncuestadores(), fetchSesiones()])
  setLoading(false)
  setRefresh(false)
}

  async function fetchEncuestas() {
    const { data } = await supabase
      .from('encuestas')
      .select('id, nombre')
      .eq('organizacion_id', perfil!.organizacion_id!)
      .eq('estado_produccion', 'publicada')
      .order('creado_en', { ascending: false })
    setEncuestas(data || [])
    if (data?.length) {
      setTabActiva(data[0].id)
      await fetchResultados(data[0].id)
    }
  }

  async function fetchEncuestadores() {
    const { data } = await supabase
      .from('perfiles')
      .select('id, nombre_completo')
      .eq('organizacion_id', perfil!.organizacion_id!)
      .eq('rol', 'encuestador')
      .eq('activo', true)
    setEncuestadores(data || [])
  }

  async function fetchSesiones() {
  if (!perfil?.organizacion_id) return
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0)

  // Primero obtener IDs de encuestas de la org
  const encIds = encuestas.map(e => e.id)
  if (!encIds.length) return

  // Query directa sin joins profundos
  const { data } = await supabase
    .from('sesiones_respuesta')
    .select('completada_en, asignaciones_encuesta!inner(encuestas_equipo!inner(encuesta_id))')
    .gte('completada_en', hoy.toISOString())
    .not('completada_en', 'is', null)
    .in('asignaciones_encuesta.encuestas_equipo.encuesta_id', encIds)

  const sesiones = data || []
  setSesionesHoy(sesiones.length)

  const ahora = new Date()
  const horas = Array.from({ length: 8 }, (_, i) => (ahora.getHours() - 7 + i + 24) % 24)
  setSesionesHora(horas.map(h =>
    sesiones.filter((s: any) => new Date(s.completada_en).getHours() === h).length
  ))
}

  async function fetchResultados(encuestaId: string) {
    // 1. Preguntas de la encuesta (excluir base)
    const { data: preg } = await supabase
      .from('preguntas')
      .select('id, texto, tipo, clave_base, orden')
      .eq('encuesta_id', encuestaId)
      .order('orden')
    setPreguntas(preg || [])

    if (!preg?.length) return

    // 2. Respuestas de todas las sesiones de esta encuesta
    const { data: resp } = await supabase
      .from('respuestas')
      .select('pregunta_id, valor_texto, valor_numero, valor_booleano')
      .in('pregunta_id', preg.map(p => p.id))

    // Agrupar por pregunta_id
    const agrupadas: Record<string, any[]> = {}
    ;(resp || []).forEach((r: any) => {
      if (!agrupadas[r.pregunta_id]) agrupadas[r.pregunta_id] = []
      agrupadas[r.pregunta_id].push(r)
    })
    setRespuestas(agrupadas)
  }

  async function handleTabChange(encuestaId: string) {
    setTabActiva(encuestaId)
    setPreguntas([])
    setRespuestas({})
    await fetchResultados(encuestaId)
  }

  const horaLabels = Array.from({ length: 8 }, (_, i) => {
    const h = new Date()
    h.setHours(new Date().getHours() - 7 + i)
    return `${h.getHours()}h`
  })

  const preguntasVisibles = preguntas.filter(p => !p.clave_base)
  const totalRespuestas = Object.values(respuestas).reduce((sum, arr) => Math.max(sum, arr.length), 0)

  if (loading) return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f2f1ee' }}>
      <ActivityIndicator size="large" color="#1a472a" />
    </View>
  )

  return (
    <ScrollView
      style={s.container}
      refreshControl={<RefreshControl refreshing={refresh} onRefresh={() => { setRefresh(true); fetchAll() }} tintColor="#1a472a" />}
    >
      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.greeting}>Hola, {perfil?.nombre_completo?.split(' ')[0]} 👋</Text>
          <Text style={s.orgLabel}>Panel {perfil?.rol === 'gestor' ? 'Gestor' : 'Admin'} · En vivo</Text>
        </View>
        <TouchableOpacity onPress={signOut} style={s.signOutBtn}>
          <Text style={s.signOutText}>Salir</Text>
        </TouchableOpacity>
      </View>

      {/* KPIs */}
      <View style={s.kpiRow}>
        <View style={[s.kpi, { backgroundColor: '#d8f3dc' }]}>
          <Text style={[s.kpiVal, { color: '#1a472a' }]}>{sesionesHoy}</Text>
          <Text style={[s.kpiLabel, { color: '#2d6a4f' }]}>Respuestas hoy</Text>
        </View>
        <View style={[s.kpi, { backgroundColor: '#e0f2fe' }]}>
          <Text style={[s.kpiVal, { color: '#0369a1' }]}>{encuestadores.length}</Text>
          <Text style={[s.kpiLabel, { color: '#0369a1' }]}>Encuestadores</Text>
        </View>
        <View style={[s.kpi, { backgroundColor: '#fef3c7' }]}>
          <Text style={[s.kpiVal, { color: '#b45309' }]}>{encuestas.length}</Text>
          <Text style={[s.kpiLabel, { color: '#b45309' }]}>Encuestas activas</Text>
        </View>
      </View>

      {/* Gráfico por hora */}
      <View style={s.card}>
        <Text style={s.cardTitle}>Respuestas por hora</Text>
        <View style={{ marginTop: 8 }}>
          <BarChart data={sesionesHora} labels={horaLabels} />
        </View>
      </View>

      {/* Selector de encuesta */}
      {encuestas.length > 0 && (
        <>
          <View style={{ paddingHorizontal: 16, marginBottom: 8 }}>
            <Text style={s.sectionTitle}>Resultados por encuesta</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {encuestas.map(enc => (
                  <TouchableOpacity key={enc.id}
                    onPress={() => handleTabChange(enc.id)}
                    style={[s.tabChip, tabActiva === enc.id && s.tabChipActive]}>
                    <Text style={[s.tabChipText, tabActiva === enc.id && s.tabChipTextActive]}
                      numberOfLines={1}>
                      {enc.nombre}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>

          {/* Total de respuestas de la encuesta seleccionada */}
          {tabActiva && (
            <View style={[s.card, { backgroundColor: '#1a472a', marginBottom: 8 }]}>
              <Text style={{ color: '#d8f3dc', fontSize: 11, fontWeight: '600' }}>
                {encuestas.find(e => e.id === tabActiva)?.nombre}
              </Text>
              <Text style={{ color: '#fff', fontSize: 32, fontWeight: '800', letterSpacing: -1, marginTop: 4 }}>
                {totalRespuestas}
              </Text>
              <Text style={{ color: '#b7e4c7', fontSize: 11, marginTop: 2 }}>respuestas totales</Text>
            </View>
          )}

          {/* Tarjetas por pregunta */}
          {preguntasVisibles.map(preg => (
            <TarjetaPregunta
              key={preg.id}
              pregunta={preg}
              respuestas={respuestas[preg.id] || []}
            />
          ))}

          {preguntasVisibles.length === 0 && tabActiva && (
            <View style={s.card}>
              <Text style={{ color: '#aaa', textAlign: 'center', fontSize: 13 }}>Sin respuestas aún para esta encuesta</Text>
            </View>
          )}
        </>
      )}

      {/* Mapa + encuestadores */}
      <View style={s.card}>
        <Text style={s.cardTitle}>Encuestadores en campo</Text>
        <View style={{ marginTop: 8 }}>
          <MapaEncuestadores encuestadores={encuestadores} />
        </View>
        <View style={{ marginTop: 12, gap: 8 }}>
          {encuestadores.slice(0, 5).map((enc, i) => {
            const bgs    = ['#d8f3dc','#e0f2fe','#fef3c7','#f3e8ff','#fce7f3']
            const tcs    = ['#1a472a','#0369a1','#b45309','#7c3aed','#be185d']
            const initials = enc.nombre_completo?.split(' ').map((w: string) => w[0]).join('').slice(0, 2) || '??'
            return (
              <View key={enc.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={[s.avatar, { backgroundColor: bgs[i % bgs.length] }]}>
                  <Text style={[s.avatarText, { color: tcs[i % tcs.length] }]}>{initials}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.encNombre}>{enc.nombre_completo}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <View style={[s.dot, { backgroundColor: '#22c55e' }]} />
                    <Text style={s.encZona}>Activo</Text>
                  </View>
                </View>
              </View>
            )
          })}
          {encuestadores.length === 0 && (
            <Text style={{ fontSize: 12, color: '#aaa', textAlign: 'center', paddingVertical: 8 }}>
              Sin encuestadores activos
            </Text>
          )}
        </View>
      </View>

      <View style={{ height: 32 }} />
    </ScrollView>
  )
}

const s = StyleSheet.create({
  container:         { flex: 1, backgroundColor: '#f2f1ee' },
  header:            { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 24, paddingTop: 56 },
  greeting:          { fontSize: 22, fontWeight: '800', color: '#111' },
  orgLabel:          { fontSize: 12, color: '#888', marginTop: 2 },
  signOutBtn:        { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1.5, borderColor: '#e5e7eb' },
  signOutText:       { fontSize: 12, color: '#888', fontWeight: '600' },
  kpiRow:            { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 12 },
  kpi:               { flex: 1, borderRadius: 12, padding: 12 },
  kpiVal:            { fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  kpiLabel:          { fontSize: 10, fontWeight: '600', marginTop: 2 },
  card:              { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginHorizontal: 16, marginBottom: 12, borderWidth: 1, borderColor: '#e5e7eb' },
  cardTitle:         { fontSize: 13, fontWeight: '700', color: '#111' },
  sectionTitle:      { fontSize: 15, fontWeight: '800', color: '#111', fontFamily: 'System' },
  tabChip:           { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 100, borderWidth: 1.5, borderColor: '#e5e7eb', backgroundColor: '#fff', maxWidth: 160 },
  tabChipActive:     { borderColor: '#1a472a', backgroundColor: '#d8f3dc' },
  tabChipText:       { fontSize: 12, fontWeight: '600', color: '#888' },
  tabChipTextActive: { color: '#1a472a' },
  pregCard:          { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginHorizontal: 16, marginBottom: 10, borderWidth: 1, borderColor: '#e5e7eb' },
  pregTipo:          { fontSize: 10, fontWeight: '700', color: '#1a472a', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  pregTexto:         { fontSize: 13, fontWeight: '700', color: '#111', lineHeight: 18 },
  pregNum:           { fontSize: 32, fontWeight: '800', letterSpacing: -1 },
  pregCount:         { fontSize: 10, color: '#aaa', marginTop: 8, textAlign: 'right' },
  siNoBox:           { flex: 1, borderRadius: 10, padding: 12, alignItems: 'center' },
  siNoNum:           { fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  siNoLabel:         { fontSize: 11, fontWeight: '600', marginTop: 2 },
  avatar:            { width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center' },
  avatarText:        { fontSize: 12, fontWeight: '800' },
  encNombre:         { fontSize: 13, fontWeight: '700', color: '#111' },
  encZona:           { fontSize: 11, color: '#888' },
  dot:               { width: 6, height: 6, borderRadius: 3 },
})