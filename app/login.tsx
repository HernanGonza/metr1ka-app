import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, Alert, StatusBar
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../lib/supabase'

// Logo tipográfico inline (sin SVG externo)
function Logo() {
  return (
    <View style={l.wrap}>
      <Text style={l.text}>METR</Text>
      <View style={l.accent}><Text style={l.accentText}>1</Text></View>
      <Text style={l.text}>KA</Text>
    </View>
  )
}

const l = StyleSheet.create({
  wrap:       { flexDirection: 'row', alignItems: 'center', gap: 0 },
  text:       { fontSize: 40, fontWeight: '900', color: '#0f0f0f', letterSpacing: -1.5 },
  accent:     { backgroundColor: '#1a472a', borderRadius: 7, paddingHorizontal: 4, paddingVertical: 1, marginHorizontal: 2 },
  accentText: { fontSize: 40, fontWeight: '900', color: '#fff', letterSpacing: -1.5 },
})

export default function Login() {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)
  const insets = useSafeAreaInsets()

  async function handleLogin() {
    if (!email.trim() || !password) {
      Alert.alert('Campos requeridos', 'Completá tu email y contraseña.')
      return
    }
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) Alert.alert('Error de acceso', error.message)
    setLoading(false)
  }

  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar barStyle="dark-content" backgroundColor="#fafaf8" />
      <View style={[s.inner, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 32 }]}>

        {/* Logo */}
        <View style={s.logoSection}>
          <Logo />
          <Text style={s.tagline}>Plataforma de encuestas de campo</Text>
        </View>

        {/* Card */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Ingresar</Text>
          <Text style={s.cardSub}>Solo con invitación. Si no tenés acceso, contactá a tu coordinador.</Text>

          <View style={s.field}>
            <Text style={s.label}>Email</Text>
            <TextInput
              style={s.input}
              placeholder="tu@email.com"
              placeholderTextColor="#9ca3af"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
            />
          </View>

          <View style={s.field}>
            <Text style={s.label}>Contraseña</Text>
            <TextInput
              style={s.input}
              placeholder="••••••••"
              placeholderTextColor="#9ca3af"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="password"
            />
          </View>

          <TouchableOpacity
            style={[s.btn, loading && s.btnLoading]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            <Text style={s.btnText}>{loading ? 'Ingresando...' : 'Ingresar'}</Text>
          </TouchableOpacity>
        </View>

        <Text style={s.footer}>
          ¿Problemas para ingresar? Contactá a tu administrador.
        </Text>
      </View>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#fafaf8' },
  inner:       { flex: 1, paddingHorizontal: 28, justifyContent: 'center', gap: 32 },
  logoSection: { alignItems: 'flex-start', gap: 8 },
  tagline:     { fontSize: 14, color: '#6b7280', fontWeight: '400', letterSpacing: 0.1 },
  card:        { backgroundColor: '#fff', borderRadius: 20, padding: 24, gap: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3, borderWidth: 1, borderColor: '#f0f0ee' },
  cardTitle:   { fontSize: 20, fontWeight: '800', color: '#0f0f0f', letterSpacing: -0.5 },
  cardSub:     { fontSize: 13, color: '#6b7280', lineHeight: 19, marginTop: -8 },
  field:       { gap: 6 },
  label:       { fontSize: 12, fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: 0.5 },
  input:       { backgroundColor: '#f9fafb', borderRadius: 12, borderWidth: 1.5, borderColor: '#e5e7eb', padding: 14, fontSize: 15, color: '#0f0f0f' },
  btn:         { backgroundColor: '#1a472a', borderRadius: 14, padding: 17, alignItems: 'center', marginTop: 4 },
  btnLoading:  { opacity: 0.7 },
  btnText:     { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: -0.3 },
  footer:      { fontSize: 12, color: '#9ca3af', textAlign: 'center', lineHeight: 18 },
})