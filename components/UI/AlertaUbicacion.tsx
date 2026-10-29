import { useCallback, useEffect, useRef, useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Linking, ActivityIndicator, AppState } from 'react-native'
import * as Location from 'expo-location'
import { diagnosticarGPS, type EstadoGPS, type PosicionFresca } from '../../lib/location'

const MENSAJES: Record<Exclude<EstadoGPS, 'ok'>, { icono: string; titulo: string; desc: string }> = {
  permiso_denegado: {
    icono: '🚫',
    titulo: 'Falta el permiso de ubicación',
    desc: 'Sin ubicación no podés encuestar. Abrí los ajustes de la app, entrá a Permisos > Ubicación y elegí "Permitir mientras se usa la app".',
  },
  permiso_aproximado: {
    icono: '🎯',
    titulo: 'La ubicación es aproximada',
    desc: 'Le diste permiso de ubicación aproximada. Necesitamos la precisa: en los ajustes de la app, Permisos > Ubicación, activá "Usar ubicación precisa".',
  },
  gps_apagado: {
    icono: '📴',
    titulo: 'El GPS del teléfono está apagado',
    desc: 'Activá la ubicación desde el panel de arriba del teléfono (o en Ajustes > Ubicación) y volvé a probar.',
  },
  sin_senal: {
    icono: '🛰️',
    titulo: 'No hay señal de GPS',
    desc: 'No pudimos medir tu posición. Salí a cielo abierto, esperá unos segundos y volvé a probar.',
  },
}

async function activarUbicacionDelTelefono() {
  try {
    await Location.enableNetworkProviderAsync()
    return
  } catch {}
  try {
    await Linking.sendIntent('android.settings.LOCATION_SOURCE_SETTINGS')
    return
  } catch {}
  Linking.openSettings()
}

type Props = {
  /** Estado que motivó el bloqueo (si ya se conoce), para mostrar el mensaje de entrada. */
  estadoInicial?: EstadoGPS | null
  /** Se llama con la posición verificada cuando el usuario toca el botón final. */
  onListo: (pos: PosicionFresca) => void
  textoListo?: string
  /** Si se pasa, muestra un botón para salir sin continuar. */
  onCancelar?: () => void
}

/**
 * Pantalla completa que bloquea hasta tener un GPS válido. Flujo: "Probar
 * ubicación" → permiso → servicios → posición fresca → check verde → botón final.
 */
export function AlertaUbicacion({ estadoInicial = null, onListo, textoListo = 'Comenzar', onCancelar }: Props) {
  const [estado, setEstado] = useState<EstadoGPS | null>(estadoInicial)
  const [pos, setPos] = useState<PosicionFresca | null>(null)
  const [probando, setProbando] = useState(false)
  const probandoRef = useRef(false)

  const probar = useCallback(async (pedirPermiso: boolean) => {
    if (probandoRef.current) return
    probandoRef.current = true
    setProbando(true)
    try {
      const r = await diagnosticarGPS({ pedirPermiso })
      setEstado(r.estado)
      setPos(r.estado === 'ok' ? r.posicion ?? null : null)
    } finally {
      probandoRef.current = false
      setProbando(false)
    }
  }, [])

  // Al volver de los ajustes, re-probar solo (sin diálogos) si todavía hay un problema.
  useEffect(() => {
    const sub = AppState.addEventListener('change', st => {
      if (st === 'active' && estado && estado !== 'ok') probar(false)
    })
    return () => sub.remove()
  }, [estado, probar])

  const ok = estado === 'ok' && pos
  const msg = estado && estado !== 'ok' ? MENSAJES[estado] : null

  return (
    <View style={s.container}>
      <Text style={s.icon}>{ok ? '✅' : msg ? msg.icono : '📍'}</Text>
      <Text style={s.title}>
        {ok ? 'Ubicación lista' : msg ? msg.titulo : 'Verificá tu ubicación'}
      </Text>
      <Text style={s.desc}>
        {ok
          ? `Lat ${pos!.lat.toFixed(5)}, Lng ${pos!.lng.toFixed(5)}\nPrecisión: ${pos!.accuracy != null ? `±${Math.round(pos!.accuracy)} m` : 'n/d'}`
          : msg
            ? msg.desc
            : 'Antes de encuestar tenemos que comprobar que el GPS funcione. Sin ubicación no se puede iniciar ni guardar encuestas.'}
      </Text>

      {probando ? (
        <ActivityIndicator size="large" color="#1a472a" style={{ marginBottom: 16 }} />
      ) : ok ? (
        <TouchableOpacity style={s.btn} onPress={() => onListo(pos!)}>
          <Text style={s.btnText}>{textoListo}</Text>
        </TouchableOpacity>
      ) : (
        <>
          {(estado === 'permiso_denegado' || estado === 'permiso_aproximado') && (
            <TouchableOpacity style={[s.btn, s.btnGap]} onPress={() => Linking.openSettings()}>
              <Text style={s.btnText}>Abrir ajustes de la app</Text>
            </TouchableOpacity>
          )}
          {estado === 'gps_apagado' && (
            <TouchableOpacity style={[s.btn, s.btnGap]} onPress={activarUbicacionDelTelefono}>
              <Text style={s.btnText}>Activar ubicación del teléfono</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={estado ? s.btnSec : s.btn}
            onPress={() => probar(true)}
          >
            <Text style={estado ? s.btnSecText : s.btnText}>
              {estado ? 'Volver a probar' : 'Probar ubicación'}
            </Text>
          </TouchableOpacity>
        </>
      )}

      {onCancelar && !probando && (
        <TouchableOpacity style={{ marginTop: 20 }} onPress={onCancelar}>
          <Text style={s.cancelar}>Cancelar</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: '#f2f1ee' },
  icon:  { fontSize: 56, marginBottom: 16 },
  title: { fontSize: 22, fontWeight: '800', color: '#1a472a', marginBottom: 12, textAlign: 'center' },
  desc:  { fontSize: 15, color: '#555', textAlign: 'center', lineHeight: 22, marginBottom: 32 },
  btn:   { backgroundColor: '#1a472a', paddingHorizontal: 32, paddingVertical: 14, borderRadius: 12 },
  btnGap: { marginBottom: 12 },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  btnSec: { borderWidth: 2, borderColor: '#1a472a', paddingHorizontal: 32, paddingVertical: 12, borderRadius: 12 },
  btnSecText: { color: '#1a472a', fontSize: 15, fontWeight: '700' },
  cancelar: { color: '#777', fontSize: 14, fontWeight: '600' },
})
