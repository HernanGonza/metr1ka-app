import { useState, useEffect } from 'react'
import { View, Text, FlatList, StyleSheet } from 'react-native'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import { useRealtimeUbicaciones } from '../../lib/realtime'

export default function Encuestadores() {
  const { perfil }                = useAuth()
  const [encuestadores, setEnc]   = useState<any[]>([])
  const [ubicaciones, setUbic]    = useState<Record<string,any>>({})

  useEffect(() => {
    if (!perfil?.organizacion_id) return
    supabase.from('perfiles')
      .select('id, nombre_completo, activo, equipo_encuestadores(equipos(nombre))')
      .eq('organizacion_id', perfil.organizacion_id)
      .eq('rol', 'encuestador')
      .eq('activo', true)
      .then(({ data }) => setEnc(data || []))
  }, [perfil])

  useRealtimeUbicaciones(perfil?.organizacion_id || '', (pos) => {
    setUbic(prev => ({ ...prev, [pos.encuestador_id]: pos }))
  })

  return (
    <View style={s.container}>
      <Text style={s.title}>Encuestadores</Text>
      <FlatList
        data={encuestadores}
        keyExtractor={e => e.id}
        contentContainerStyle={{ padding: 16 }}
        renderItem={({ item }) => {
          const ubic = ubicaciones[item.id]
          const activo = ubic && (Date.now() - new Date(ubic.actualizado_en).getTime()) < 5 * 60 * 1000
          return (
            <View style={s.card}>
              <View style={[s.dot, { backgroundColor: activo ? '#22c55e' : '#d1d5db' }]} />
              <View style={{ flex: 1 }}>
                <Text style={s.nombre}>{item.nombre_completo}</Text>
                <Text style={s.sub}>{activo ? 'Activo en campo' : 'Sin señal reciente'}</Text>
              </View>
            </View>
          )
        }}
      />
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f1ee' },
  title:     { fontSize: 24, fontWeight: '800', color: '#111', padding: 24, paddingTop: 56 },
  card:      { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 12 },
  dot:       { width: 10, height: 10, borderRadius: 5 },
  nombre:    { fontSize: 14, fontWeight: '700', color: '#111' },
  sub:       { fontSize: 12, color: '#888', marginTop: 2 },
})
