import { useEffect, useState } from 'react'
import { AppState, StyleSheet, View } from 'react-native'
import { Stack } from 'expo-router'
import { useAuth } from '../../lib/auth'
import {
  iniciarTrackingSingleton,
  detenerTrackingSingleton,
  diagnosticarGPS,
  setContextoTelemetriaGPS,
} from '../../lib/location'
import { iniciarSyncAutomatico } from '../../lib/offlineQueue'
import { AlertaUbicacion } from '../../components/UI/AlertaUbicacion'

export default function EncuestadorLayout() {
  const { perfil } = useAuth()
  // true recién cuando el encuestador pasó la verificación de GPS. Se vuelve
  // a false si al volver a primer plano el GPS dejó de estar OK.
  const [gpsVerificado, setGpsVerificado] = useState(false)

  const id  = perfil?.id
  const org = perfil?.organizacion_id

  useEffect(() => {
    if (id) setContextoTelemetriaGPS(id, org ?? null)
  }, [id, org])

  useEffect(() => {
    if (!id || !org || !gpsVerificado) return
    iniciarTrackingSingleton(id, org)
  }, [id, org, gpsVerificado])

  useEffect(() => {
    return () => { detenerTrackingSingleton() }
  }, [id, org])

  // Re-verificar al volver al frente: si el GPS se apagó o se quitó el permiso, bloquear.
  useEffect(() => {
    const sub = AppState.addEventListener('change', async st => {
      if (st !== 'active' || !gpsVerificado) return
      const r = await diagnosticarGPS({ pedirPermiso: false })
      if (r.estado !== 'ok') setGpsVerificado(false)
    })
    return () => sub.remove()
  }, [gpsVerificado])

  // Sincronizar cola offline cuando la app vuelve al frente
  useEffect(() => {
    const unsub = iniciarSyncAutomatico()
    return unsub
  }, [])

  // El Stack queda montado debajo del bloqueo para no perder la navegación.
  return (
    <View style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false }} />
      {!gpsVerificado && (
        <View style={[StyleSheet.absoluteFill, { zIndex: 1000, elevation: 1000 }]}>
          <AlertaUbicacion onListo={() => setGpsVerificado(true)} />
        </View>
      )}
    </View>
  )
}
