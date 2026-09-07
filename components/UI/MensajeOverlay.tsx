import { useEffect, useState, useCallback } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native'
import { useAuth } from '../../lib/auth'
import { fetchMensajesPendientes, marcarMensajeLeido, useMensajesRealtime, MensajePendiente } from '../../lib/mensajes'

// Overlay a pantalla completa, montado como hermano de <Stack> en
// app/_layout.tsx (no es una ruta) — así se puede mostrar arriba de
// cualquier pantalla, incluso a mitad de una encuesta, sin navegar y sin
// perder el estado del formulario en curso (a diferencia del redirect a
// /desactivado que sí navega).
//
// Si llegan varios mensajes sin leer se muestran de a uno, en orden de
// llegada; "Entendido" marca el actual como leído y pasa al siguiente.
export function MensajeOverlay() {
  const { perfil } = useAuth()
  const [cola, setCola] = useState<MensajePendiente[]>([])

  const cargar = useCallback(async () => {
    if (!perfil?.id || perfil.rol !== 'encuestador') return
    const pendientes = await fetchMensajesPendientes(perfil.id)
    setCola(pendientes)
  }, [perfil?.id, perfil?.rol])

  useEffect(() => { cargar() }, [cargar])

  useMensajesRealtime(perfil?.rol === 'encuestador' ? perfil?.id : undefined, cargar)

  if (!cola.length) return null

  const actual = cola[0]

  async function cerrar() {
    await marcarMensajeLeido(actual.destinatario_id)
    setCola((prev) => prev.slice(1))
  }

  return (
    <View style={s.overlay}>
      <View style={s.card}>
        <Text style={s.icon}>📢</Text>
        <Text style={s.titulo}>{actual.titulo}</Text>
        <ScrollView style={s.scroll} contentContainerStyle={{ paddingBottom: 4 }}>
          <Text style={s.texto}>{actual.texto}</Text>
        </ScrollView>
        {cola.length > 1 && (
          <Text style={s.contador}>{cola.length - 1} mensaje{cola.length - 1 === 1 ? '' : 's'} más pendiente{cola.length - 1 === 1 ? '' : 's'}</Text>
        )}
        <TouchableOpacity style={s.btn} onPress={cerrar}>
          <Text style={s.btnText}>Entendido</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center', justifyContent: 'center',
    padding: 24, zIndex: 9999, elevation: 9999,
  },
  card: {
    width: '100%', maxWidth: 420, maxHeight: '80%',
    backgroundColor: '#fff', borderRadius: 20, padding: 28,
    alignItems: 'center',
  },
  icon:   { fontSize: 48, marginBottom: 12 },
  titulo: { fontSize: 20, fontWeight: '800', color: '#1a472a', marginBottom: 12, textAlign: 'center' },
  scroll: { alignSelf: 'stretch', flexGrow: 0 },
  texto:  { fontSize: 15, color: '#333', textAlign: 'center', lineHeight: 22 },
  contador: { fontSize: 12, color: '#888', marginTop: 12 },
  btn:    { backgroundColor: '#1a472a', paddingHorizontal: 36, paddingVertical: 14, borderRadius: 12, marginTop: 20 },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
})
