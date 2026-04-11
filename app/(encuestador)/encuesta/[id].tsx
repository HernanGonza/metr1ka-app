

import { useState, useEffect, useMemo, useRef } from 'react'
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  Alert, ActivityIndicator, TextInput, Animated,
} from 'react-native'
import Slider from '@react-native-community/slider'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../lib/auth'
import { useGeofencing } from '../../../hooks/useGeofencing'

function evaluarCondicionales(pregunta: any, respuesta: any) {
  const cond = pregunta?.condicionales
  if (!cond?.reglas?.length) return null
  const logica  = cond.logica || 'OR'
  const matches = cond.reglas.map((r: any) => r.respuesta && String(respuesta) === String(r.respuesta))
  const aplica  = logica === 'AND' ? matches.every(Boolean) : matches.some(Boolean)
  if (!aplica) return null
  return cond.reglas[matches.findIndex(Boolean)] || null
}

const RAZONES_SISTEMA = [
  'No hay nadie en casa','No quiere participar',
  'No cumple el perfil buscado','Barrera de idioma','Motivo de salud',
]

function ProgressBar({ current, total }: { current: number, total: number }) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0
  return (
    <View style={ps.wrap}>
      <View style={[ps.fill, { width: `${pct}%` as any }]} />
    </View>
  )
}
const ps = StyleSheet.create({
  wrap: { height: 3, backgroundColor: '#e5e7eb', width: '100%' },
  fill: { height: 3, backgroundColor: '#1a472a' },
})

function PreguntaCard({ pregunta, respuesta, onChange, onSiguiente, onAnterior, paso, total, saving }: any) {
  const slideAnim = useRef(new Animated.Value(40)).current
  const opacAnim  = useRef(new Animated.Value(0)).current

  useEffect(() => {
    slideAnim.setValue(40)
    opacAnim.setValue(0)
    Animated.parallel([
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 10 }),
      Animated.timing(opacAnim,  { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start()
  }, [pregunta.id])

  const opciones     = [...(pregunta.opciones_pregunta || [])].sort((a: any, b: any) => a.orden - b.orden)
  const esEdad       = pregunta.clave_base === 'edad'
  const puedeAvanzar = !pregunta.requerida || (respuesta !== null && respuesta !== undefined && respuesta !== '')

  return (
    <Animated.View style={[s.cardWrap, { opacity: opacAnim, transform: [{ translateY: slideAnim }] }]}>
      <Text style={s.pregLabel}>
        {pregunta.es_base ? '📌 Datos del encuestado' : `Pregunta ${paso + 1} de ${total}`}
      </Text>
      <Text style={s.pregTexto}>{pregunta.texto}</Text>

      {/* Sí / No */}
      {pregunta.tipo === 'si_no' && (
        <View style={{ gap: 10, marginTop: 8 }}>
          {['Sí', 'No'].map(op => (
            <TouchableOpacity key={op} style={[s.opcionBtn, respuesta === op && s.opcionSel]} onPress={() => onChange(op === 'Sí' ? 'Sí' : 'No')}>
              <View style={[s.opcionCheck, respuesta === op && s.opcionCheckSel]}>
                {respuesta === op && <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>✓</Text>}
              </View>
              <Text style={[s.opcionText, respuesta === op && s.opcionTextSel]}>{op}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Opción múltiple */}
      {pregunta.tipo === 'opcion_multiple' && (
        <View style={{ gap: 10, marginTop: 8 }}>
          {opciones.map((op: any) => (
            <TouchableOpacity key={op.id} style={[s.opcionBtn, respuesta === op.id && s.opcionSel]} onPress={() => onChange(op.id)}>
              <View style={[s.opcionCheck, respuesta === op.id && s.opcionCheckSel]}>
                {respuesta === op.id && <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>✓</Text>}
              </View>
              <Text style={[s.opcionText, respuesta === op.id && s.opcionTextSel]}>{op.texto}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Escala 1-10 (no edad) */}
      {pregunta.tipo === 'escala' && !esEdad && (
        <View style={{ marginTop: 12 }}>
          <View style={s.escalaGrid}>
            {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
              <TouchableOpacity key={n} style={[s.escalaBtn, respuesta === n && s.escalaBtnSel]} onPress={() => onChange(n)}>
                <Text style={[s.escalaText, respuesta === n && s.escalaTextSel]}>{n}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
            <Text style={{ fontSize: 10, color: '#aaa' }}>Nada</Text>
            <Text style={{ fontSize: 10, color: '#aaa' }}>Mucho</Text>
          </View>
        </View>
      )}

      {/* Edad — slider */}
      {pregunta.tipo === 'escala' && esEdad && (
        <View style={{ marginTop: 16 }}>
          <Text style={{ fontSize: 56, fontWeight: '800', color: '#1a472a', textAlign: 'center', letterSpacing: -2, marginBottom: 4 }}>
            {respuesta ?? '--'}
          </Text>
          <Text style={{ fontSize: 12, color: '#aaa', textAlign: 'center', marginBottom: 20 }}>años</Text>
          <Slider
            style={{ width: '100%', height: 40 }}
            minimumValue={18}
            maximumValue={99}
            step={1}
            value={respuesta || 18}
            onValueChange={(v: number) => onChange(Math.round(v))}
            minimumTrackTintColor="#1a472a"
            maximumTrackTintColor="#e5e7eb"
            thumbTintColor="#1a472a"
          />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
            <Text style={{ fontSize: 11, color: '#aaa' }}>18</Text>
            <Text style={{ fontSize: 11, color: '#aaa' }}>99</Text>
          </View>
        </View>
      )}

      {/* Texto libre */}
      {pregunta.tipo === 'texto_libre' && (
        <TextInput
          style={s.textarea}
          multiline
          numberOfLines={5}
          placeholder="Escribí tu respuesta..."
          placeholderTextColor="#bbb"
          value={respuesta || ''}
          onChangeText={onChange}
          textAlignVertical="top"
        />
      )}

      {/* Navegación */}
      <View style={s.navRow}>
        {paso > 0 && (
          <TouchableOpacity style={s.btnSecondary} onPress={onAnterior}>
            <Text style={s.btnSecondaryText}>← Anterior</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[s.btnPrimary, { flex: 2 }, !puedeAvanzar && s.btnDisabled]}
          disabled={!puedeAvanzar || saving}
          onPress={onSiguiente}
        >
          <Text style={s.btnPrimaryText}>{saving ? 'Guardando...' : 'Siguiente →'}</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  )
}

export default function EncuestaScreen() {
  const { id, asignacion } = useLocalSearchParams<{ id: string; asignacion: string }>()
  const { perfil }         = useAuth()
  const router             = useRouter()
  const { ubicacion }      = useGeofencing(perfil?.id || '', perfil?.organizacion_id || '')

  const [encuesta,   setEncuesta]   = useState<any>(null)
  const [preguntas,  setPreguntas]  = useState<any[]>([])
  const [razonesNR,  setRazonesNR]  = useState<string[]>(RAZONES_SISTEMA)
  const [loading,    setLoading]    = useState(true)
  const [saving,     setSaving]     = useState(false)
  const [pantalla,   setPantalla]   = useState<'inicio'|'participa'|'encuesta'|'no_responde'|'fin'>('inicio')
  const [paso,       setPaso]       = useState(0)
  const [respuestas, setRespuestas] = useState<Record<string, any>>({})
  const [razonNR,    setRazonNR]    = useState('')
  const [noResponde, setNoResponde] = useState(false)
  const [ocultas,    setOcultas]    = useState(new Set<string>())

  useEffect(() => {
    if (id && perfil?.organizacion_id) load()
  }, [id, perfil?.organizacion_id])

  async function load() {
    const { data } = await supabase.rpc('get_encuesta_full', {
      p_encuesta_id: id,
      p_org_id: perfil?.organizacion_id,
    })
    if (data && !data.error) {
      setEncuesta(data.encuesta)
      setPreguntas(data.preguntas || [])
      const ids = data.encuesta?.config_muestreo?.razones_seleccionadas || []
      if (ids.length >= 2) {
        const { data: rData } = await supabase
          .from('razones_no_respuesta')
          .select('id, label').in('id', ids).eq('activa', true)
        if (rData) {
          const map: Record<string, string> = Object.fromEntries(rData.map((r: any) => [r.id, r.label]))
          setRazonesNR(ids.map((i: string) => map[i]).filter(Boolean))
        }
      }
    }
    setLoading(false)
  }

  const todasLasPreguntas = useMemo(() =>
    preguntas.filter(p => p.clave_base !== 'participa').sort((a: any, b: any) => a.orden - b.orden),
    [preguntas]
  )
  const preguntaParticipa = useMemo(() => preguntas.find(p => p.clave_base === 'participa'), [preguntas])
  const preguntasVisibles = useMemo(() =>
    todasLasPreguntas.filter(p => !ocultas.has(p.id)),
    [todasLasPreguntas, ocultas]
  )

  const preguntaActual = preguntasVisibles[paso]
  const totalVisible   = preguntasVisibles.length

  function handleSiguiente() {
    const resp   = respuestas[preguntaActual?.id]
    const result = evaluarCondicionales(preguntaActual, resp)
    if (result?.accion === 'finalizar') { guardarYFinalizar(); return }
    if (result?.accion === 'saltar' && result.destino_id) {
      const idx = preguntasVisibles.findIndex((p: any) => p.id === result.destino_id)
      if (idx >= 0) { setPaso(idx); return }
    }
    if (result?.accion === 'ocultar' && result.destino_id) {
      setOcultas(prev => new Set([...prev, result.destino_id]))
    }
    if (paso < totalVisible - 1) setPaso(p => p + 1)
    else guardarYFinalizar()
  }

  function handleAnterior() {
    if (paso > 0) setPaso(p => p - 1)
  }

  async function guardarYFinalizar(razon?: string) {
  setSaving(true)
  try {
    const filas = Object.entries(respuestas).map(([pregunta_id, valor]) => ({
      pregunta_id,
      opcion_id: typeof valor === 'string' && valor.startsWith('op_') 
                 ? valor.replace('op_', '') 
                 : null,
      valor_texto: (typeof valor === 'string' && !valor.startsWith('op_')) 
                   ? String(valor) 
                   : null,
      valor_numero: typeof valor === 'number' ? valor : null,
      valor_booleano: typeof valor === 'boolean' ? valor : null,
    }));

    // Agregar razón de no respuesta
    if (razon && preguntaParticipa) {
      filas.push({
        pregunta_id: preguntaParticipa.id,
        opcion_id: null,
        valor_texto: razon,
        valor_numero: null,
        valor_booleano: null,
      });
    }

    console.log('🔥 Payload final enviado:', JSON.stringify(filas, null, 2));

    const { data: sesionId, error } = await supabase.rpc('guardar_encuesta_completa', {
      p_asignacion_id: asignacion,
      p_latitud: ubicacion?.lat ?? null,
      p_longitud: ubicacion?.lng ?? null,
      p_respuestas: filas,
      p_razon_no_respuesta: razon || null,
      p_participa_pregunta_id: preguntaParticipa?.id || null,
    })

    if (error || !sesionId) throw error

    setNoResponde(!!razon)
    setPantalla('fin')
  } catch (err: any) {
    console.error('❌ Error crítico:', err)
    Alert.alert('Error', err?.message || 'No se pudo guardar la encuesta')
  } finally {
    setSaving(false)
  }
}

  if (loading) return (
    <View style={s.centered}><ActivityIndicator size="large" color="#1a472a" /></View>
  )

  // ── INICIO ──
  if (pantalla === 'inicio') return (
    <View style={s.container}>
      <View style={s.inicioInner}>
        <Text style={s.encLabel}>Encuesta</Text>
        <Text style={s.encNombre}>{encuesta?.nombre}</Text>
        {encuesta?.descripcion && <Text style={s.encDesc}>{encuesta.descripcion}</Text>}
        <View style={s.countBadge}>
          <Text style={s.countText}>{totalVisible} preguntas</Text>
        </View>
        <View style={s.inicioBtns}>
          <TouchableOpacity
            style={s.btnComenzar}
            onPress={() => preguntaParticipa ? setPantalla('participa') : setPantalla('encuesta')}
          >
            <Text style={s.btnComenzarText}>Comenzar</Text>
            <Text style={s.btnComenzarArrow}>→</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.btnCancelar} onPress={() => router.back()}>
            <Text style={s.btnCancelarText}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  )

  // ── PARTICIPA ──
  if (pantalla === 'participa') return (
    <View style={s.container}>
      <ProgressBar current={0} total={totalVisible} />
      <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 40 }}>
        <Text style={s.pregLabel}>📌 Pregunta base</Text>
        <Text style={s.pregTexto}>{preguntaParticipa?.texto}</Text>
        <View style={{ gap: 10, marginTop: 8 }}>
          {['Sí', 'No'].map(op => (
            <TouchableOpacity
              key={op}
              style={s.opcionBtn}
              onPress={() => {
                setRespuestas(r => ({ ...r, [preguntaParticipa!.id]: op }))
                if (op === 'No') setPantalla('no_responde')
                else { setPaso(0); setPantalla('encuesta') }
              }}
            >
              <View style={s.opcionCheck} />
              <Text style={s.opcionText}>{op}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  )

  // ── NO RESPONDE ──
  if (pantalla === 'no_responde') return (
    <View style={s.container}>
      <ProgressBar current={0} total={1} />
      <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 40 }}>
        <Text style={s.pregLabel}>📋 Registrar no-respuesta</Text>
        <Text style={s.pregTexto}>¿Cuál es la razón de no participación?</Text>
        <View style={{ gap: 10, marginTop: 8 }}>
          {razonesNR.map(r => (
            <TouchableOpacity key={r} style={[s.opcionBtn, razonNR === r && s.opcionSel]} onPress={() => setRazonNR(r)}>
              <View style={[s.opcionCheck, razonNR === r && s.opcionCheckSel]}>
                {razonNR === r && <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>✓</Text>}
              </View>
              <Text style={[s.opcionText, razonNR === r && s.opcionTextSel]}>{r}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={s.navRow}>
          <TouchableOpacity style={s.btnSecondary} onPress={() => setPantalla('participa')}>
            <Text style={s.btnSecondaryText}>← Volver</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.btnPrimary, { flex: 2 }, !razonNR && s.btnDisabled]}
            disabled={!razonNR || saving}
            onPress={() => guardarYFinalizar(razonNR)}
          >
            <Text style={s.btnPrimaryText}>{saving ? 'Guardando...' : 'Registrar y salir'}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  )

  // ── ENCUESTA (typeform) ──
  if (pantalla === 'encuesta' && preguntaActual) return (
    <View style={s.container}>
      <ProgressBar current={paso} total={totalVisible} />
      <ScrollView
        contentContainerStyle={{ padding: 24, paddingTop: 32, paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled"
      >
        <PreguntaCard
          pregunta={preguntaActual}
          respuesta={respuestas[preguntaActual.id]}
          onChange={(v: any) => setRespuestas(r => ({ ...r, [preguntaActual.id]: v }))}
          onSiguiente={handleSiguiente}
          onAnterior={handleAnterior}
          paso={paso}
          total={totalVisible}
          saving={saving}
        />
      </ScrollView>
    </View>
  )

  // ── FIN ──
  return (
    <View style={s.centered}>
      <Text style={{ fontSize: 64, marginBottom: 16 }}>{noResponde ? '📝' : '✅'}</Text>
      <Text style={s.finTitle}>{noResponde ? 'Registrado' : '¡Gracias!'}</Text>
      <Text style={s.finDesc}>
        {noResponde
          ? 'La razón de no-respuesta fue registrada correctamente.'
          : 'La encuesta fue completada y enviada al panel central.'}
      </Text>
      <TouchableOpacity style={s.btnComenzar} onPress={() => router.back()}>
        <Text style={s.btnComenzarText}>← Volver a encuestas</Text>
      </TouchableOpacity>
    </View>
  )
}

const s = StyleSheet.create({
  container:        { flex: 1, backgroundColor: '#f2f1ee' },
  centered:         { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f2f1ee', padding: 32 },
  inicioInner:      { flex: 1, padding: 32, justifyContent: 'center' },
  encLabel:         { fontSize: 11, fontWeight: '700', color: '#1a472a', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  encNombre:        { fontSize: 26, fontWeight: '800', color: '#111', marginBottom: 12, lineHeight: 32 },
  encDesc:          { fontSize: 15, color: '#666', marginBottom: 24, lineHeight: 22 },
  countBadge:       { backgroundColor: '#d8f3dc', borderRadius: 100, paddingHorizontal: 14, paddingVertical: 6, alignSelf: 'flex-start', marginBottom: 32 },
  countText:        { fontSize: 12, fontWeight: '700', color: '#1a472a' },
  inicioBtns:       { gap: 10 },
  btnComenzar:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#1a472a', borderRadius: 14, paddingVertical: 18, paddingHorizontal: 22 },
  btnComenzarText:  { color: '#fff', fontSize: 16, fontWeight: '800' },
  btnComenzarArrow: { color: '#d8f3dc', fontSize: 22, fontWeight: '800' },
  btnCancelar:      { alignItems: 'center', paddingVertical: 12 },
  btnCancelarText:  { color: '#aaa', fontSize: 14, fontWeight: '600' },
  cardWrap:         { flex: 1 },
  pregLabel:        { fontSize: 11, fontWeight: '700', color: '#1a472a', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 },
  pregTexto:        { fontSize: 22, fontWeight: '800', color: '#111', marginBottom: 28, lineHeight: 30 },
  opcionBtn:        { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 14, padding: 16, borderWidth: 2, borderColor: '#e5e7eb' },
  opcionSel:        { borderColor: '#1a472a', backgroundColor: '#d8f3dc' },
  opcionCheck:      { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#d1d5db', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  opcionCheckSel:   { borderColor: '#1a472a', backgroundColor: '#1a472a' },
  opcionText:       { fontSize: 15, color: '#333', flex: 1 },
  opcionTextSel:    { color: '#1a472a', fontWeight: '700' },
  escalaGrid:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  escalaBtn:        { width: 52, height: 52, borderRadius: 10, borderWidth: 2, borderColor: '#e5e7eb', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  escalaBtnSel:     { borderColor: '#1a472a', backgroundColor: '#1a472a' },
  escalaText:       { fontSize: 16, fontWeight: '700', color: '#444' },
  escalaTextSel:    { color: '#fff' },
  textarea:         { backgroundColor: '#fff', borderRadius: 14, borderWidth: 2, borderColor: '#e5e7eb', padding: 16, fontSize: 15, color: '#333', minHeight: 120, marginTop: 8 },
  navRow:           { flexDirection: 'row', gap: 10, marginTop: 32 },
  btnPrimary:       { flex: 1, backgroundColor: '#1a472a', borderRadius: 14, padding: 18, alignItems: 'center' },
  btnDisabled:      { opacity: 0.4 },
  btnPrimaryText:   { color: '#fff', fontSize: 16, fontWeight: '800' },
  btnSecondary:     { flex: 1, borderRadius: 14, padding: 18, alignItems: 'center', borderWidth: 2, borderColor: '#e5e7eb', backgroundColor: '#fff' },
  btnSecondaryText: { color: '#666', fontSize: 15, fontWeight: '600' },
  finTitle:         { fontSize: 26, fontWeight: '800', color: '#111', marginBottom: 12, textAlign: 'center' },
  finDesc:          { fontSize: 15, color: '#666', marginBottom: 40, textAlign: 'center', lineHeight: 22 },
})

