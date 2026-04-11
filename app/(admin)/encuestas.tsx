import { useState, useEffect } from 'react'
import { View, Text, FlatList, StyleSheet, TouchableOpacity } from 'react-native'
import { useRouter } from 'expo-router'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'

export default function Encuestas() {
  const { perfil }           = useAuth()
  const router               = useRouter()
  const [encuestas, setEnc]  = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!perfil?.organizacion_id) return
    supabase.from('encuestas')
      .select('id, nombre, descripcion, estado_produccion, creado_en')
      .eq('organizacion_id', perfil.organizacion_id)
      .eq('estado_produccion', 'publicada')
      .order('creado_en', { ascending: false })
      .then(({ data }) => { setEnc(data || []); setLoading(false) })
  }, [perfil])

  return (
    <View style={s.container}>
      <Text style={s.title}>Encuestas</Text>
      <FlatList
        data={encuestas}
        keyExtractor={e => e.id}
        contentContainerStyle={{ padding: 16 }}
        renderItem={({ item }) => (
          <TouchableOpacity style={s.card} onPress={() => router.push(`/(admin)/encuesta/${item.id}`)}>
            <Text style={s.nombre}>{item.nombre}</Text>
            {item.descripcion && <Text style={s.desc} numberOfLines={2}>{item.descripcion}</Text>}
          </TouchableOpacity>
        )}
      />
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f1ee' },
  title:     { fontSize: 24, fontWeight: '800', color: '#111', padding: 24, paddingTop: 56 },
  card:      { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: '#e5e7eb' },
  nombre:    { fontSize: 15, fontWeight: '700', color: '#111' },
  desc:      { fontSize: 13, color: '#888', marginTop: 4 },
})
