/**
 * MapaLeaflet — mapa Leaflet via WebView para usar en Expo Go (sin build nativo)
 * Soporta: zona polígono, manzanas, marcador usuario con GPS
 */
import { useEffect, useRef } from 'react'
import { View, StyleSheet } from 'react-native'
import { WebView } from 'react-native-webview'

type Props = {
  zonaGeojson?: any
  ubicacion?: { lat: number; lng: number } | null
  colorZona?: string
  style?: any
  markers?: Array<{ id: string; lat: number; lng: number; label: string; color: string }>
}

export function MapaLeaflet({ zonaGeojson, ubicacion, colorZona = '#1a472a', style, markers = [] }: Props) {
  const webRef = useRef<any>(null)

  // Cuando cambia la ubicación, la mandamos al WebView
  useEffect(() => {
    if (!ubicacion || !webRef.current) return
    webRef.current.postMessage(JSON.stringify({
      type: 'ubicacion',
      lat: ubicacion.lat,
      lng: ubicacion.lng,
    }))
  }, [ubicacion?.lat, ubicacion?.lng])

  const html = buildHTML(zonaGeojson, ubicacion, colorZona, markers)

  return (
    <View style={[s.container, style]}>
      <WebView
        ref={webRef}
        source={{ html }}
        style={s.map}
        scrollEnabled={false}
        javaScriptEnabled
        originWhitelist={['*']}
        onMessage={() => {}} // por si necesitamos eventos del mapa
      />
    </View>
  )
}

function buildHTML(zonaGeojson: any, ubicacion: any, colorZona: string, markers: any[] = []) {
  const centro = getCentro(zonaGeojson, ubicacion)
  const geojsonStr = zonaGeojson ? JSON.stringify(zonaGeojson) : 'null'
  const ubicStr = ubicacion ? JSON.stringify(ubicacion) : 'null'

  const markersStr = JSON.stringify(markers)

  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body, #map { width: 100%; height: 100%; }
</style>
</head>
<body>
<div id="map"></div>
<script>
  var map = L.map('map', { zoomControl: true, attributionControl: false })
    .setView([${centro[1]}, ${centro[0]}], 14);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19
  }).addTo(map);

  var COLOR = '${colorZona}';
  var geojson = ${geojsonStr};
  var ubicacion = ${ubicStr};
  var markers = ${markersStr};

  // Dibujar zona y manzanas
  if (geojson && geojson.features) {
    var zonas = geojson.features.filter(function(f) { return f.properties && f.properties.tipo === 'zona'; });
    var manzanas = geojson.features.filter(function(f) {
      return f.properties && f.properties.tipo === 'manzana' && f.properties.seleccionada === true;
    });

    if (zonas.length > 0) {
      L.geoJSON({ type: 'FeatureCollection', features: zonas }, {
        style: { color: COLOR, fillColor: COLOR, fillOpacity: 0.12, weight: 2.5 }
      }).addTo(map);
    }
    if (manzanas.length > 0) {
      L.geoJSON({ type: 'FeatureCollection', features: manzanas }, {
        style: { color: COLOR, fillColor: COLOR, fillOpacity: 0.4, weight: 1.5 }
      }).addTo(map);
    }

    // Fit bounds
    var fitFeats = zonas.length > 0 ? zonas : manzanas;
    if (fitFeats.length > 0) {
      try {
        var layer = L.geoJSON({ type: 'FeatureCollection', features: fitFeats });
        map.fitBounds(layer.getBounds(), { padding: [30, 30] });
      } catch(e) {}
    }
  }

  // Marcador de usuario
  var userIcon = L.divIcon({
    className: '',
    html: '<div style="width:16px;height:16px;border-radius:50%;background:#2563eb;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.4)"></div>',
    iconSize: [16,16], iconAnchor: [8,8]
  });

  var userMarker = null;
  if (ubicacion) {
    userMarker = L.marker([ubicacion.lat, ubicacion.lng], { icon: userIcon }).addTo(map);
  }

  // Markers de personas (encuestadores/coordinadores)
  if (markers && markers.length > 0) {
    markers.forEach(function(m) {
      var ic = L.divIcon({
        className: '',
        html: '<div style="width:28px;height:28px;border-radius:50%;background:' + m.color + ';color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:11px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.4)">' + m.label + '</div>',
        iconSize: [28,28], iconAnchor: [14,14]
      });
      L.marker([m.lat, m.lng], { icon: ic }).bindTooltip(m.label).addTo(map);
    });
  }

  // Recibir actualizaciones de ubicación desde React Native
  document.addEventListener('message', function(e) {
    try {
      var msg = JSON.parse(e.data);
      if (msg.type === 'ubicacion') {
        var latlng = [msg.lat, msg.lng];
        if (!userMarker) {
          userMarker = L.marker(latlng, { icon: userIcon }).addTo(map);
        } else {
          userMarker.setLatLng(latlng);
        }
      }
    } catch(err) {}
  });
  // Android usa window.addEventListener para postMessage
  window.addEventListener('message', function(e) {
    try {
      var msg = JSON.parse(e.data);
      if (msg.type === 'ubicacion') {
        var latlng = [msg.lat, msg.lng];
        if (!userMarker) {
          userMarker = L.marker(latlng, { icon: userIcon }).addTo(map);
        } else {
          userMarker.setLatLng(latlng);
        }
      }
    } catch(err) {}
  });
</script>
</body>
</html>`
}

function getCentro(zonaGeojson: any, ubicacion: any): [number, number] {
  if (ubicacion) return [ubicacion.lng, ubicacion.lat]
  if (!zonaGeojson?.features) return [-55.8, -27.5]
  const zonaFeats = zonaGeojson.features.filter((f: any) => f.properties?.tipo === 'zona')
  if (zonaFeats[0]?.geometry?.coordinates?.[0]) {
    const ring = zonaFeats[0].geometry.coordinates[0]
    const lng = ring.reduce((s: number, c: number[]) => s + c[0], 0) / ring.length
    const lat = ring.reduce((s: number, c: number[]) => s + c[1], 0) / ring.length
    return [lng, lat]
  }
  return [-55.8, -27.5]
}

const s = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden' },
  map:       { flex: 1 },
})