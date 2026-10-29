import * as Location from 'expo-location'
import { Platform } from 'react-native'
import { supabase } from './supabase'

export async function pedirPermisoUbicacion(): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync()
  return status === 'granted'
}

// Solo para el tracking en segundo plano (cada 10 s). NO usar para guardar
// encuestas: puede devolver una posición de hasta 30 s de antigüedad; para eso
// está obtenerPosicionFresca().
export async function getUbicacionActual(): Promise<{ lat: number; lng: number } | null> {
  try {
    // Primero intentar lastKnown (más rápido, no bloquea)
    const last = await Location.getLastKnownPositionAsync({ maxAge: 30000 })
    if (last) {
      return { lat: last.coords.latitude, lng: last.coords.longitude }
    }
  } catch {}

  try {
    // Si no hay cache, pedir posición actual con Balanced (más rápido que High)
    const loc = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    })
    return { lat: loc.coords.latitude, lng: loc.coords.longitude }
  } catch (e) {
    console.warn('[location] getCurrent falló:', e)
    return null
  }
}

// ── CAPTURA ROBUSTA PARA GUARDAR ENCUESTAS ──────

// Peor precisión (en metros) que aceptamos para asociar una encuesta a un punto.
export const MAX_ACCURACY_M = 100
// Antigüedad máxima de la posición (ms) — nada de posición vieja para guardar.
export const MAX_EDAD_POSICION_MS = 60_000

export type EstadoGPS =
  | 'ok'
  | 'permiso_denegado'
  | 'permiso_aproximado'
  | 'gps_apagado'
  | 'sin_senal'

export type PosicionFresca = {
  lat: number
  lng: number
  accuracy: number | null
  timestamp: number
}

export class GpsError extends Error {
  estado: Exclude<EstadoGPS, 'ok'>
  constructor(estado: Exclude<EstadoGPS, 'ok'>, mensaje?: string) {
    super(mensaje || estado)
    this.name = 'GpsError'
    this.estado = estado
  }
}

function conTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new GpsError('sin_senal', 'timeout')), ms)
    p.then(
      v => { clearTimeout(t); resolve(v) },
      e => { clearTimeout(t); reject(e) },
    )
  })
}

function esErrorServiciosApagados(e: any): boolean {
  const txt = `${e?.code ?? ''} ${e?.message ?? ''}`
  return /SETTINGS_UNSATISFIED|LOCATION_UNAVAILABLE|services? (are |is )?(disabled|not enabled)/i.test(txt)
}

/**
 * Posición recién medida (sin lastKnown). Lanza GpsError si no consigue una
 * posición con precisión y antigüedad aceptables tras los reintentos.
 */
export async function obtenerPosicionFresca(
  { timeoutMs = 15000, reintentos = 2 }: { timeoutMs?: number; reintentos?: number } = {},
): Promise<PosicionFresca> {
  let ultimoError: GpsError = new GpsError('sin_senal')
  for (let intento = 0; intento <= reintentos; intento++) {
    try {
      const loc = await conTimeout(
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
        timeoutMs,
      )
      const { latitude, longitude, accuracy } = loc.coords
      const valida =
        Number.isFinite(latitude) && Number.isFinite(longitude) &&
        !(latitude === 0 && longitude === 0)
      const precisa = accuracy == null || accuracy <= MAX_ACCURACY_M
      const reciente = Date.now() - loc.timestamp <= MAX_EDAD_POSICION_MS
      if (valida && precisa && reciente) {
        return { lat: latitude, lng: longitude, accuracy: accuracy ?? null, timestamp: loc.timestamp }
      }
      ultimoError = new GpsError(
        'sin_senal',
        !precisa ? `precision ${Math.round(accuracy!)}m` : !reciente ? 'posicion vieja' : 'coordenadas invalidas',
      )
    } catch (e: any) {
      if (e instanceof GpsError) ultimoError = e
      else if (esErrorServiciosApagados(e)) throw new GpsError('gps_apagado', e?.message)
      else ultimoError = new GpsError('sin_senal', e?.message)
    }
  }
  throw ultimoError
}

/**
 * Diagnóstico discreto del GPS. Con pedirPermiso=true muestra el diálogo del
 * sistema si el permiso todavía se puede pedir.
 */
export async function diagnosticarGPS(
  { pedirPermiso = false }: { pedirPermiso?: boolean } = {},
): Promise<{ estado: EstadoGPS; posicion?: PosicionFresca }> {
  try {
    let perm = await Location.getForegroundPermissionsAsync()
    if (!perm.granted && pedirPermiso && perm.canAskAgain) {
      perm = await Location.requestForegroundPermissionsAsync()
    }
    if (!perm.granted) return _fallo('permiso_denegado')
    if (perm.android?.accuracy === 'coarse') return _fallo('permiso_aproximado')

    if (!(await Location.hasServicesEnabledAsync())) return _fallo('gps_apagado')

    const posicion = await obtenerPosicionFresca({ reintentos: 1 })
    _setGpsActivo(true)
    return { estado: 'ok', posicion }
  } catch (e: any) {
    return _fallo(e instanceof GpsError ? e.estado : 'sin_senal', e?.message)
  }
}

function _fallo(estado: Exclude<EstadoGPS, 'ok'>, detalle?: string): { estado: EstadoGPS } {
  _setGpsActivo(false)
  _registrarFalloGPS(estado, detalle)
  return { estado }
}

// ── TELEMETRÍA DE FALLOS (best-effort) ──────────
// Requiere la tabla gps_fallos (migración 20261029000000). Si no existe o no
// hay conexión, falla en silencio: nunca debe afectar el flujo de la encuesta.

let _ctx: { encuestadorId: string; organizacionId: string | null } | null = null
const _ultimoRegistro = new Map<string, number>()
let _telemetriaMuerta = false

export function setContextoTelemetriaGPS(encuestadorId: string, organizacionId: string | null) {
  _ctx = { encuestadorId, organizacionId }
}

function _registrarFalloGPS(estado: string, detalle?: string) {
  if (!_ctx || _telemetriaMuerta) return
  const ahora = Date.now()
  if (ahora - (_ultimoRegistro.get(estado) ?? 0) < 60_000) return
  _ultimoRegistro.set(estado, ahora)
  Promise.resolve(
    supabase.from('gps_fallos').insert({
      encuestador_id:  _ctx.encuestadorId,
      organizacion_id: _ctx.organizacionId,
      motivo:          estado,
      detalle:         detalle ?? null,
      plataforma:      Platform.OS,
      version_so:      String(Platform.Version),
    })
  ).then(({ error }) => {
    // Tabla inexistente (migración sin aplicar): no insistir.
    if (error && (error.code === '42P01' || error.code === 'PGRST205')) _telemetriaMuerta = true
  }).catch(() => {})
}

// ── ESTADO DEL GPS PARA LA UI ───────────────────

let _gpsActivo = false
const _gpsCallbacks = new Set<(ok: boolean) => void>()

function _setGpsActivo(ok: boolean) {
  if (_gpsActivo === ok) return
  _gpsActivo = ok
  _gpsCallbacks.forEach(cb => cb(ok))
}

export function setGpsStatusCallback(cb: (ok: boolean) => void): void {
  _gpsCallbacks.add(cb)
  cb(_gpsActivo)
}

export function removeGpsStatusCallback(cb: (ok: boolean) => void): void {
  _gpsCallbacks.delete(cb)
}

// ── GEO ─────────────────────────────────────────

export function puntoEnPoligono(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (((yi > lat) !== (yj > lat)) && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)) {
      inside = !inside
    }
  }
  return inside
}

// ── SINGLETON ───────────────────────────────────

let _trackingId: string | null = null
let _trackingInterval: ReturnType<typeof setInterval> | null = null
let _lastLocation: { lat: number; lng: number } | null = null

// Múltiples listeners — cada hook puede suscribirse sin pisarse
const _callbacks = new Set<(pos: { lat: number; lng: number }) => void>()

export function setLocationCallback(cb: (pos: { lat: number; lng: number }) => void): void {
  _callbacks.add(cb)
  // Replay inmediato si ya hay una ubicación conocida
  if (_lastLocation) {
    console.log('[location] replay última ubicación conocida')
    cb(_lastLocation)
  }
}

export function removeLocationCallback(cb: (pos: { lat: number; lng: number }) => void): void {
  _callbacks.delete(cb)
}

function _notify(pos: { lat: number; lng: number }) {
  _lastLocation = pos
  _setGpsActivo(true)
  _callbacks.forEach(cb => cb(pos))
}

export async function iniciarTrackingSingleton(encuestadorId: string, organizacionId: string) {
  // Si ya está corriendo para este usuario, no hacer nada
  if (_trackingId === encuestadorId && _trackingInterval) {
    console.log('[location] Tracking ya activo para', encuestadorId)
    // Replay última ubicación para los nuevos callbacks
    if (_lastLocation) _notify(_lastLocation)
    return
  }

  // Limpiar tracking anterior si era para otro usuario
  if (_trackingInterval) {
    clearInterval(_trackingInterval)
    _trackingInterval = null
  }

  _trackingId = encuestadorId

  // Primera ubicación
  const pos = await getUbicacionActual()
  if (pos) {
    console.log('[location] Posición inicial:', pos.lat, pos.lng)
    _notify(pos)
    await _guardarUbicacion(encuestadorId, organizacionId, pos)
  } else {
    console.warn('[location] Sin GPS en arranque')
    _setGpsActivo(false)
  }

  // Loop cada 10 segundos
  _trackingInterval = setInterval(async () => {
    const pos = await getUbicacionActual()
    if (!pos) {
      console.warn('[location] Tick sin GPS')
      _setGpsActivo(false)
      return
    }
    console.log('[location] Tick:', pos.lat, pos.lng)
    _notify(pos)
    await _guardarUbicacion(encuestadorId, organizacionId, pos)
  }, 10000)

  console.log('[location] Tracking iniciado para', encuestadorId)
}

export function detenerTrackingSingleton() {
  if (_trackingInterval) {
    clearInterval(_trackingInterval)
    _trackingInterval = null
    _trackingId = null
    _lastLocation = null
    _callbacks.clear()
    console.log('[location] Tracking detenido')
  }
}

let _errorCount = 0
const MAX_ERRORS = 3

async function _guardarUbicacion(
  encuestadorId: string,
  organizacionId: string,
  pos: { lat: number; lng: number }
) {
  // Circuit breaker — si hay muchos errores seguidos, no seguir intentando
  if (_errorCount >= MAX_ERRORS) {
    return
  }
  try {
    const { error } = await supabase.from('ubicaciones_encuestadores').upsert(
      {
        encuestador_id:  encuestadorId,
        organizacion_id: organizacionId,
        lat:             pos.lat,
        lng:             pos.lng,
        actualizado_en:  new Date().toISOString(),
      },
      { onConflict: 'encuestador_id' }
    )
    if (error) {
      _errorCount++
      if (_errorCount >= MAX_ERRORS) {
        console.warn('[location] Demasiados errores guardando ubicación, pausando tracking de DB')
      }
    } else {
      _errorCount = 0 // reset al tener éxito
    }
  } catch (e) {
    _errorCount++
    console.error('[location] error guardando:', e)
  }
}

// Alias para compatibilidad
export async function actualizarUbicacion(encuestadorId: string, organizacionId: string) {
  const pos = await getUbicacionActual()
  if (!pos) return
  await _guardarUbicacion(encuestadorId, organizacionId, pos)
}