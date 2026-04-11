import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  Alert, ActivityIndicator, TextInput, Animated, Dimensions,
} from 'react-native'
import MapView, { Marker, Circle } from 'react-native-maps'
import Slider from '@react-native-community/slider'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../lib/auth'
import { useGeofencing } from '../../../hooks/useGeofencing'

// ── Utilidades ───────────────────────────────────────────────────
const { width: SW } = Dimensions.get('window')
const RADIO_LLEGADA = 99999  // TEST: radio extendido para probar desde casa

function distanciaMetros(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function evaluarCondicionales(pregunta: any, respuesta: any) {
  const cond = pregunta?.condicionales
  if (!cond?.reglas?.length) return null
  const logica  = cond.logica || 'OR'
  const matches = cond.reglas.map((r: any) => r.respuesta && String(respuesta) === String(r.respuesta))
  const aplica  = logica === 'AND' ? matches.every(Boolean) : matches.some(Boolean)
  if (!aplica) return null
  return cond.reglas[matches.findIndex(Boolean)] || null
}

// ── Barra de progreso ─────────────────────────────────────────────
function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = total > 0 ? (current / total) * 100 : 0
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

// ── Mapa de navegación ────────────────────────────────────────────
function MapaNavegacion({
  parcela,
  ubicacion,
  enParcela,
  stats,
  onNoHayNadie,
  onNoParcela,
}: {
  parcela: any
  ubicacion: { lat: number; lng: number } | null
  enParcela: boolean
  stats: { total_parcelas: number; completadas: number }
  onNoHayNadie: () => void
  onNoParcela: () => void
}) {
  const destLat = parcela?.punto_centroide?.lat
  const destLng = parcela?.punto_centroide?.lng
  const progreso = stats.total_parcelas > 0
    ? Math.round((stats.completadas / stats.total_parcelas) * 100)
    : 0

  return (
    <View style={{ flex: 1, backgroundColor: '#f2f1ee' }}>
      {/* Header */}
      <View style={mn.header}>
        <Text style={mn.headerLabel}>Dirigite a esta dirección</Text>
        <Text style={mn.headerDir}>{parcela?.direccion || 'Parcela sin dirección'}</Text>
        <View style={mn.statsRow}>
          <Text style={mn.statsText}>{stats.completadas} / {stats.total_parcelas} encuestas</Text>
          <View style={mn.progBar}>
            <View style={[mn.progFill, { width: `${progreso}%` as any }]} />
          </View>
          <Text style={mn.statsText}>{progreso}%</Text>
        </View>
      </View>

      {/* Mapa (no se puede cerrar, ocupa toda la pantalla) */}
      <View style={{ flex: 1, position: 'relative' }}>
        {destLat && destLng ? (
          <MapView
            style={{ flex: 1 }}
            initialRegion={{
              latitude:      ubicacion?.lat  ?? destLat,
              longitude:     ubicacion?.lng  ?? destLng,
              latitudeDelta:  0.005,
              longitudeDelta: 0.005,
            }}
            region={ubicacion ? {
              latitude:      ubicacion.lat,
              longitude:     ubicacion.lng,
              latitudeDelta:  0.003,
              longitudeDelta: 0.003,
            } : undefined}
            showsUserLocation
            showsMyLocationButton
          >
            {/* Destino */}
            <Marker
              coordinate={{ latitude: destLat, longitude: destLng }}
              title="Tu próxima parada"
              description={parcela?.direccion}
              pinColor="#1a472a"
            />
            {/* Radio de llegada */}
            <Circle
              center={{ latitude: destLat, longitude: destLng }}
              radius={RADIO_LLEGADA}
              fillColor="rgba(26,71,42,0.15)"
              strokeColor="rgba(26,71,42,0.5)"
              strokeWidth={2}
            />
          </MapView>
        ) : (
          <View style={mn.sinMapa}>
            <Text style={{ fontSize: 40 }}>📍</Text>
            <Text style={{ color: '#666', marginTop: 8 }}>Calculando posición...</Text>
          </View>
        )}

        {/* Badge de llegada */}
        {enParcela && (
          <View style={mn.llegadaBadge}>
            <Text style={mn.llegadaText}>✅ Estás frente a la parcela</Text>
            <Text style={mn.llegadaSub}>Tocá la puerta y presioná "Comenzar"</Text>
          </View>
        )}

        {/* Distancia */}
        {!enParcela && ubicacion && destLat && destLng && (
          <View style={mn.distBadge}>
            <Text style={mn.distText}>
              {Math.round(distanciaMetros(ubicacion.lat, ubicacion.lng, destLat, destLng))} m
            </Text>
          </View>
        )}
      </View>

      {/* Botones de contingencia */}
      <View style={mn.footer}>
        <TouchableOpacity style={mn.btnContingencia} onPress={onNoHayNadie}>
          <Text style={mn.btnContText}>🚪 No hay nadie</Text>
        </TouchableOpacity>
        <TouchableOpacity style={mn.btnContingencia} onPress={onNoParcela}>
          <Text style={mn.btnContText}>🏚️ No es una vivienda</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const mn = StyleSheet.create({
  header:       { backgroundColor: '#1a472a', padding: 20, paddingTop: 52 },
  headerLabel:  { fontSize: 11, fontWeight: '700', color: '#a7f3d0', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  headerDir:    { fontSize: 20, fontWeight: '800', color: '#fff', marginBottom: 12 },
  statsRow:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statsText:    { fontSize: 12, color: '#a7f3d0', fontWeight: '600' },
  progBar:      { flex: 1, height: 4, backgroundColor: 'rgba(255,255,255,.2)', borderRadius: 2 },
  progFill:     { height: 4, backgroundColor: '#a7f3d0', borderRadius: 2 },
  sinMapa:      { flex: 1, alignItems: 'center', justifyContent: 'center' },
  llegadaBadge: { position: 'absolute', bottom: 100, left: 16, right: 16, backgroundColor: '#fff', borderRadius: 16, padding: 16, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: .15, shadowRadius: 12, elevation: 8 },
  llegadaText:  { fontSize: 16, fontWeight: '800', color: '#1a472a', marginBottom: 4 },
  llegadaSub:   { fontSize: 13, color: '#666' },
  distBadge:    { position: 'absolute', top: 16, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,.65)', borderRadius: 100, paddingHorizontal: 16, paddingVertical: 8 },
  distText:     { color: '#fff', fontWeight: '700', fontSize: 14 },
  footer:       { flexDirection: 'row', gap: 10, padding: 16, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e5e7eb' },
  btnContingencia: { flex: 1, backgroundColor: '#f9fafb', borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1.5, borderColor: '#e5e7eb' },
  btnContText:  { fontSize: 13, fontWeight: '600', color: '#374151' },
})

// ── PreguntaCard ──────────────────────────────────────────────────
function PreguntaCard({ pregunta, respuesta, onChange, onSiguiente, onAnterior, paso, total, saving }: any) {
  const slideAnim = useRef(new Animated.Value(40)).current
  const opacAnim  = useRef(new Animated.Value(0)).current

  useEffect(() => {
    slideAnim.setValue(40); opacAnim.setValue(0)
    Animated.parallel([
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 10 }),
      Animated.timing(opacAnim,  { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start()
  }, [pregunta.id])

  const opciones     = [...(pregunta.opciones_pregunta || [])].sort((a: any, b: any) => a.orden - b.orden)
  const esEdad       = pregunta.clave_base === 'edad'
  // Para opcion_multiple el valor es un objeto {opcionId, texto}
  const tieneRespuesta = respuesta !== null && respuesta !== undefined && respuesta !== ''
  const puedeAvanzar = !pregunta.requerida || tieneRespuesta

  return (
    <Animated.View style={[s.cardWrap, { opacity: opacAnim, transform: [{ translateY: slideAnim }] }]}>
      <Text style={s.pregLabel}>
        {pregunta.es_base ? '📌 Datos del encuestado' : `Pregunta ${paso + 1} de ${total}`}
      </Text>
      <Text style={s.pregTexto}>{pregunta.texto}</Text>

      {pregunta.tipo === 'si_no' && (
        <View style={{ gap: 10, marginTop: 8 }}>
          {['Sí', 'No'].map(op => (
            <TouchableOpacity key={op} style={[s.opcionBtn, respuesta === op && s.opcionSel]} onPress={() => onChange(op)}>
              <View style={[s.opcionCheck, respuesta === op && s.opcionCheckSel]}>
                {respuesta === op && <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>✓</Text>}
              </View>
              <Text style={[s.opcionText, respuesta === op && s.opcionTextSel]}>{op}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {pregunta.tipo === 'opcion_multiple' && (
        <View style={{ gap: 10, marginTop: 8 }}>
          {opciones.map((op: any) => {
            const selId = respuesta?.opcionId ?? respuesta
            return (
              <TouchableOpacity key={op.id} style={[s.opcionBtn, selId === op.id && s.opcionSel]}
                onPress={() => onChange({ opcionId: op.id, texto: op.texto })}>
                <View style={[s.opcionCheck, selId === op.id && s.opcionCheckSel]}>
                  {selId === op.id && <Text style={{ color: '#fff', fontSize: 11, fontWeight: '800' }}>✓</Text>}
                </View>
                <Text style={[s.opcionText, selId === op.id && s.opcionTextSel]}>{op.texto}</Text>
              </TouchableOpacity>
            )
          })}
        </View>
      )}

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

      {pregunta.tipo === 'escala' && esEdad && (
        <View style={{ marginTop: 16 }}>
          <Text style={{ fontSize: 56, fontWeight: '800', color: '#1a472a', textAlign: 'center', letterSpacing: -2, marginBottom: 4 }}>
            {respuesta ?? '--'}
          </Text>
          <Text style={{ fontSize: 12, color: '#aaa', textAlign: 'center', marginBottom: 20 }}>años</Text>
          <Slider style={{ width: '100%', height: 40 }} minimumValue={18} maximumValue={99} step={1}
            value={respuesta || 18} onValueChange={(v: number) => onChange(Math.round(v))}
            minimumTrackTintColor="#1a472a" maximumTrackTintColor="#e5e7eb" thumbTintColor="#1a472a" />
        </View>
      )}

      {pregunta.tipo === 'texto_libre' && (
        <TextInput style={s.textarea} multiline numberOfLines={5}
          placeholder="Escribí tu respuesta..." placeholderTextColor="#bbb"
          value={respuesta || ''} onChangeText={onChange} textAlignVertical="top" />
      )}

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

// ── Pantalla principal ────────────────────────────────────────────
type Pantalla = 'mapa' | 'inicio' | 'participa' | 'encuesta' | 'no_responde' | 'fin'

export default function EncuestaScreen() {
  const { id, asignacion, zona } = useLocalSearchParams<{ id: string; asignacion: string; zona: string }>()
  const { perfil }   = useAuth()
  const router       = useRouter()
  const { ubicacion } = useGeofencing(perfil?.id || '', perfil?.organizacion_id || '')

  // Datos de encuesta
  const [encuesta,   setEncuesta]   = useState<any>(null)
  const [preguntas,  setPreguntas]  = useState<any[]>([])
  const [razonesNR,  setRazonesNR]  = useState<string[]>([])
  const [loading,    setLoading]    = useState(true)

  // Navegación
  const [parcela,    setParcela]    = useState<any>(null)   // próxima parcela
  const [loadingP,   setLoadingP]   = useState(false)

  // Estado de encuesta
  const [pantalla,   setPantalla]   = useState<Pantalla>('mapa')
  const [paso,       setPaso]       = useState(0)
  const [respuestas, setRespuestas] = useState<Record<string, any>>({})
  const [razonNR,    setRazonNR]    = useState('')
  const [ocultas,    setOcultas]    = useState(new Set<string>())
  const [saving,     setSaving]     = useState(false)
  const [noResponde, setNoResponde] = useState(false)

  // ── Carga inicial ──
  useEffect(() => {
    if (id && perfil?.organizacion_id) {
      cargarEncuesta()
      cargarProximaParcela()
    }
  }, [id, perfil?.organizacion_id])

  async function cargarEncuesta() {
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
          .from('razones_no_respuesta').select('id, label').in('id', ids).eq('activa', true)
        if (rData) {
          const map: Record<string, string> = Object.fromEntries(rData.map((r: any) => [r.id, r.label]))
          setRazonesNR(ids.map((i: string) => map[i]).filter(Boolean))
        }
      }
    }
    setLoading(false)
  }

  async function cargarProximaParcela() {
    if (!asignacion) return
    setLoadingP(true)
    const { data, error } = await supabase.rpc('get_proxima_parcela', {
      p_asignacion_id: asignacion,
    })
    if (!error && data?.length > 0) setParcela(data[0])
    else if (!error) setParcela(null)  // sin más parcelas
    setLoadingP(false)
  }

  // ── Detección de llegada a la parcela ──
  const enParcela = useMemo(() => {
    // TEST: siempre true para pruebas sin GPS
    if (!parcela?.punto_centroide) return true  // sin parcela cargada, mostrar botón igual
    if (!ubicacion) return true  // sin GPS, mostrar botón igual
    const d = distanciaMetros(
      ubicacion.lat, ubicacion.lng,
      parcela.punto_centroide.lat, parcela.punto_centroide.lng
    )
    return d <= RADIO_LLEGADA
  }, [ubicacion, parcela])

  // ── Preguntas ──
  const todasLasPreguntas = useMemo(() =>
    preguntas.filter(p => p.clave_base !== 'participa').sort((a: any, b: any) => a.orden - b.orden),
    [preguntas]
  )
  const preguntaParticipa = useMemo(() => preguntas.find(p => p.clave_base === 'participa'), [preguntas])
  const preguntasVisibles = useMemo(() =>
    todasLasPreguntas.filter(p => !ocultas.has(p.id)), [todasLasPreguntas, ocultas]
  )
  const preguntaActual = preguntasVisibles[paso]
  const totalVisible   = preguntasVisibles.length

  // ── Registrar visita fallida y pasar a la siguiente parcela ──
  async function registrarNoVisita(resultado: string) {
    if (parcela?.parcela_id) {
      await supabase.rpc('registrar_visita', {
        p_parcela_id:  parcela.parcela_id,
        p_resultado:   resultado,
        p_latitud:     ubicacion?.lat ?? null,
        p_longitud:    ubicacion?.lng ?? null,
      })
    }
    // Resetear y cargar siguiente
    setRespuestas({}); setRazonNR(''); setNoResponde(false)
    setPaso(0); setOcultas(new Set())
    await cargarProximaParcela()
    setPantalla('mapa')
  }

  // ── Navegación preguntas ──
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

  // ── Guardar respuestas ──
  async function guardarYFinalizar(razon?: string) {
    setSaving(true)
    try {
      const filas = Object.entries(respuestas).map(([pregunta_id, valor]) => {
        // valor puede ser: string (si_no/texto), number (escala), boolean, o {opcionId, texto} (opcion_multiple)
        const esOpcion = valor !== null && typeof valor === 'object' && 'opcionId' in valor
        return {
          pregunta_id,
          opcion_id:      esOpcion ? valor.opcionId : null,
          valor_texto:    esOpcion
                            ? valor.texto                        // texto legible de la opción
                            : typeof valor === 'string'
                              ? valor
                              : null,
          valor_numero:   typeof valor === 'number' ? valor : null,
          valor_booleano: typeof valor === 'boolean' ? valor : null,
        }
      })
      if (razon && preguntaParticipa) {
        filas.push({ pregunta_id: preguntaParticipa.id, opcion_id: null, valor_texto: razon, valor_numero: null, valor_booleano: null })
      }

      const { data: sesionId, error } = await supabase.rpc('guardar_encuesta_completa', {
        p_asignacion_id:       asignacion,
        p_latitud:             ubicacion?.lat ?? null,
        p_longitud:            ubicacion?.lng ?? null,
        p_respuestas:          filas,
        p_razon_no_respuesta:  razon || null,
        p_participa_pregunta_id: preguntaParticipa?.id || null,
      })
      if (error) throw new Error(error.message || JSON.stringify(error))
      if (!sesionId) throw new Error('No se recibió ID de sesión — verificá la asignación')

      // Registrar visita como completada
      if (parcela?.parcela_id) {
        await supabase.rpc('registrar_visita', {
          p_parcela_id: parcela.parcela_id,
          p_resultado:  'completada',
          p_latitud:    ubicacion?.lat ?? null,
          p_longitud:   ubicacion?.lng ?? null,
          p_sesion_id:  sesionId,
        })
      }

      setNoResponde(!!razon)
      setPantalla('fin')
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'No se pudo guardar la encuesta')
    } finally {
      setSaving(false)
    }
  }

  // ── Continuar al siguiente después del fin ──
  async function continuarSiguiente() {
    setRespuestas({}); setRazonNR(''); setNoResponde(false)
    setPaso(0); setOcultas(new Set()); setPantalla('mapa')
    await cargarProximaParcela()
  }

  // ══════════════════ RENDER ══════════════════
  if (loading) return (
    <View style={s.centered}><ActivityIndicator size="large" color="#1a472a" /></View>
  )

  // ── MAPA (navegación a la parcela) ──
  if (pantalla === 'mapa') {
    if (loadingP) return (
      <View style={s.centered}>
        <ActivityIndicator size="large" color="#1a472a" />
        <Text style={{ marginTop: 12, color: '#666' }}>Calculando próxima parada...</Text>
      </View>
    )

    if (!parcela) return (
      <View style={s.centered}>
        <Text style={{ fontSize: 48, marginBottom: 16 }}>🎉</Text>
        <Text style={[s.finTitle, { marginBottom: 12 }]}>¡Zona completada!</Text>
        <Text style={s.finDesc}>No quedan más parcelas para visitar en esta zona.</Text>
        <TouchableOpacity style={s.btnComenzar} onPress={() => router.back()}>
          <Text style={s.btnComenzarText}>← Volver al inicio</Text>
        </TouchableOpacity>
      </View>
    )

    return (
      <View style={{ flex: 1 }}>
        <MapaNavegacion
          parcela={parcela}
          ubicacion={ubicacion}
          enParcela={enParcela}
          stats={{ total_parcelas: parcela.total_parcelas, completadas: parcela.completadas }}
          onNoHayNadie={() => registrarNoVisita('no_hay_nadie')}
          onNoParcela={() => registrarNoVisita('no_es_vivienda')}
        />
        {/* Botón comenzar — solo visible cuando está frente a la parcela */}
        {enParcela && (
          <TouchableOpacity
            style={s.btnFlotante}
            onPress={() => preguntaParticipa ? setPantalla('participa') : setPantalla('encuesta')}
          >
            <Text style={s.btnFlotanteText}>Comenzar encuesta →</Text>
          </TouchableOpacity>
        )}
      </View>
    )
  }

  // ── PARTICIPA ──
  if (pantalla === 'participa') return (
    <View style={s.container}>
      <ProgressBar current={0} total={totalVisible} />
      <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 40 }}>
        <Text style={s.pregLabel}>📌 Pregunta base</Text>
        <Text style={s.pregTexto}>{preguntaParticipa?.texto}</Text>
        <View style={{ gap: 10, marginTop: 8 }}>
          {['Sí', 'No'].map(op => (
            <TouchableOpacity key={op} style={s.opcionBtn} onPress={() => {
              setRespuestas(r => ({ ...r, [preguntaParticipa!.id]: op }))
              if (op === 'No') setPantalla('no_responde')
              else { setPaso(0); setPantalla('encuesta') }
            }}>
              <View style={s.opcionCheck} />
              <Text style={s.opcionText}>{op}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity style={[s.btnSecondary, { marginTop: 24 }]} onPress={() => setPantalla('mapa')}>
          <Text style={s.btnSecondaryText}>← Volver al mapa</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  )

  // ── NO RESPONDE ──
  if (pantalla === 'no_responde') return (
    <View style={s.container}>
      <ProgressBar current={0} total={1} />
      <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 40 }}>
        <Text style={s.pregLabel}>📋 Registrar no-respuesta</Text>
        <Text style={s.pregTexto}>¿Cuál es la razón?</Text>
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
            <Text style={s.btnPrimaryText}>{saving ? 'Guardando...' : 'Registrar y continuar'}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  )

  // ── ENCUESTA (typeform) ──
  if (pantalla === 'encuesta' && preguntaActual) return (
    <View style={s.container}>
      <ProgressBar current={paso} total={totalVisible} />
      <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 32, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <PreguntaCard
          pregunta={preguntaActual}
          respuesta={respuestas[preguntaActual.id]}
          onChange={(v: any) => setRespuestas(r => ({ ...r, [preguntaActual.id]: v }))}
          onSiguiente={handleSiguiente}
          onAnterior={() => { if (paso > 0) setPaso(p => p - 1) }}
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
      <Text style={s.finTitle}>{noResponde ? 'Registrado' : '¡Encuesta completada!'}</Text>
      <Text style={s.finDesc}>
        {noResponde
          ? 'La razón de no-respuesta fue registrada.'
          : 'Las respuestas fueron enviadas al panel central.'}
      </Text>
      <TouchableOpacity style={s.btnComenzar} onPress={continuarSiguiente}>
        <Text style={s.btnComenzarText}>Siguiente parcela →</Text>
      </TouchableOpacity>
    </View>
  )
}

const s = StyleSheet.create({
  container:        { flex: 1, backgroundColor: '#f2f1ee' },
  centered:         { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f2f1ee', padding: 32 },
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
  btnComenzar:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#1a472a', borderRadius: 14, paddingVertical: 18, paddingHorizontal: 32, marginTop: 8 },
  btnComenzarText:  { color: '#fff', fontSize: 16, fontWeight: '800' },
  btnFlotante:      { position: 'absolute', bottom: 100, left: 24, right: 24, backgroundColor: '#1a472a', borderRadius: 16, padding: 20, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: .25, shadowRadius: 16, elevation: 12 },
  btnFlotanteText:  { color: '#fff', fontSize: 18, fontWeight: '800' },
  finTitle:         { fontSize: 26, fontWeight: '800', color: '#111', marginBottom: 12, textAlign: 'center' },
  finDesc:          { fontSize: 15, color: '#666', marginBottom: 40, textAlign: 'center', lineHeight: 22 },
})