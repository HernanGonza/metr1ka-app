// Wrapper que carga MapLibre solo si está disponible en el entorno nativo
// En Expo Go (sin build nativo) muestra un placeholder

import { View, Text, StyleSheet } from 'react-native'

let MapLibreDisponible = false
let MLMap: any = null
let Camera: any = null
let Marker: any = null
let GeoJSONSource: any = null
let Layer: any = null
let UserLocation: any = null

try {
  const ml = require('@maplibre/maplibre-react-native')
  MLMap        = ml.Map
  Camera       = ml.Camera
  Marker       = ml.Marker
  GeoJSONSource = ml.GeoJSONSource
  Layer        = ml.Layer
  UserLocation = ml.UserLocation
  MapLibreDisponible = true
} catch {
  MapLibreDisponible = false
}

export function MapaPlaceholder({ mensaje = 'Mapa disponible en la app compilada' }: { mensaje?: string }) {
  return (
    <View style={s.container}>
      <Text style={s.icon}>🗺️</Text>
      <Text style={s.text}>{mensaje}</Text>
      <Text style={s.sub}>Esta función requiere un build nativo</Text>
    </View>
  )
}

export { MapLibreDisponible, MLMap, Camera, Marker, GeoJSONSource, Layer, UserLocation }

const s = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f2f1ee', gap: 8 },
  icon:      { fontSize: 48 },
  text:      { fontSize: 15, fontWeight: '700', color: '#374151', textAlign: 'center' },
  sub:       { fontSize: 13, color: '#9ca3af', textAlign: 'center' },
})