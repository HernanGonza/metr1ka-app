import { useState, useEffect } from 'react'
import { View, Text, FlatList, StyleSheet } from 'react-native'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import { useRealtimeUbicaciones } from '../../lib/realtime'

export default function Encuestadores() {
  const { perfil }              = useAuth()
  const [encuestadores, setEnc] = useState<any[]>([])
  const [ubicaciones, setUbic]  = useState<Record<string, any>>({})

  useEffect(() => {
    if (!perfil?.id) return
    // Solo encuestadores del equipo del coordinador
    supabase
      .from('equipo_coordinadores')
      .select('equipo_id')
      .eq('coordinador_id', perfil.id)
      .single()
      .then(({ data: eqData }) => {
        if (!eqData?.equipo_id) return
        supabase
          .from('equipo_encuestadores')
          .select('encuestador_id, perfiles(id, nombre_completo)')
          .eq('equipo_id', eqData.equipo_id)
          .then(({ data }) => {
            setEnc((data || []).map((r: any) => r.perfiles).filter(Boolean))
          })
      })
  }, [perfil?.id])

  useRealtimeUbicaciones(perfil?.organizacion_id || '', (pos: any) => {
    setUbic(prev => ({ ...prev, [pos.encuestador_id]: pos }))
  })

  return (
    <View style={s.container}>
      <Text style={s.title}>Mi equipo</Text>
      <FlatList
        data={encuestadores}
        keyExtractor={e => e.id}
        contentContainerStyle={{ padding: 16 }}
        ListEmptyComponent={
          <Text style={{ textAlign: 'center', color: '#aaa', marginTop: 40 }}>
            Sin encuestadores en tu equipo
          </Text>
        }
        renderItem={({ item }) => {
          const ubic   = ubicaciones[item.id]
          const mins   = ubic ? Math.floor((Date.now() - new Date(ubic.actualizado_en).getTime()) / 60000) : null
          const activo = mins !== null && mins < 5
          return (
            <View style={s.card}>
              <View style={[s.dot, { backgroundColor: activo ? '#22c55e' : '#d1d5db' }]} />
              <View style={{ flex: 1 }}>
                <Text style={s.nombre}>{item.nombre_completo}</Text>
                <Text style={s.sub}>
                  {activo
                    ? (mins < 1 ? 'Activo ahora' : `Activo hace ${mins} min`)
                    : (mins !== null ? `Última señal hace ${mins} min` : 'Sin señal reciente')}
                </Text>
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
  card:      { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: '#e5e7eb' },
  dot:       { width: 10, height: 10, borderRadius: 5 },
  nombre:    { fontSize: 14, fontWeight: '700', color: '#111' },
  sub:       { fontSize: 12, color: '#888', marginTop: 2 },
})