import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, Alert, StatusBar, Linking
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../lib/supabase'

// Logo tipográfico — mismo estilo que el splash
function Logo({ size = 32 }: { size?: number }) {
  const fs = size
  return (
    <View style={[l.wrap]}>
      <Text style={[l.text, { fontSize: fs }]}>METR</Text>
      <View style={[l.accent, { borderRadius: Math.round(size * 0.18), paddingHorizontal: Math.round(size * 0.1), paddingVertical: Math.round(size * 0.02) }]}>
        <Text style={[l.accentText, { fontSize: fs }]}>1</Text>
      </View>
      <Text style={[l.text, { fontSize: fs }]}>KA</Text>
    </View>
  )
}

const l = StyleSheet.create({
  wrap:       { flexDirection: 'row', alignItems: 'center' },
  text:       { fontWeight: '900', color: '#0f0f0f', letterSpacing: -1 },
  accent:     { backgroundColor: '#1a472a', marginHorizontal: 2 },
  accentText: { fontWeight: '900', color: '#fff', letterSpacing: -1 },
})

export default function Login() {
  const [email,         setEmail]         = useState('')
  const [password,      setPassword]      = useState('')
  const [loading,       setLoading]       = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
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

  async function handleGoogle() {
    // NOTA: Para activar Google:
    // 1. Activar proveedor Google en Supabase Dashboard → Auth → Providers
    // 2. Agregar redirect URL: metr1ka://login
    // 3. El botón ya está listo
    setGoogleLoading(true)
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: 'metr1ka://login',
        skipBrowserRedirect: true,
      }
    })
    if (error) {
      Alert.alert('Error', error.message)
      setGoogleLoading(false)
      return
    }
    if (data?.url) {
      await Linking.openURL(data.url)
    }
    setGoogleLoading(false)
  }

  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar barStyle="dark-content" backgroundColor="#fafaf8" />
      <View style={[s.inner, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 }]}>

        {/* Logo */}
        <View style={s.logoSection}>
          <Logo size={34} />
          <Text style={s.tagline}>Encuestas de campo en tiempo real</Text>
        </View>

        {/* Card */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Bienvenido</Text>

          {/* Google */}
          <TouchableOpacity
            style={[s.btnGoogle, googleLoading && s.btnDisabled]}
            onPress={handleGoogle}
            disabled={googleLoading}
            activeOpacity={0.85}
          >
            <View style={s.googleIcon}>
              <Text style={{ fontSize: 16 }}>G</Text>
            </View>
            <Text style={s.btnGoogleText}>{googleLoading ? 'Conectando...' : 'Continuar con Google'}</Text>
          </TouchableOpacity>

          <View style={s.divider}>
            <View style={s.dividerLine} />
            <Text style={s.dividerText}>o</Text>
            <View style={s.dividerLine} />
          </View>

          {/* Email / contraseña */}
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
            />
          </View>

          <TouchableOpacity
            style={[s.btn, loading && s.btnDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            <Text style={s.btnText}>{loading ? 'Ingresando...' : 'Ingresar'}</Text>
          </TouchableOpacity>
        </View>

        <Text style={s.footer}>
          El acceso es solo por invitación.{'\n'}¿Problemas? Contactá a tu administrador.
        </Text>
      </View>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#fafaf8' },
  inner:        { flex: 1, paddingHorizontal: 28, justifyContent: 'center', gap: 28 },
  logoSection:  { alignItems: 'flex-start', gap: 8 },
  tagline:      { fontSize: 13, color: '#6b7280', letterSpacing: 0.1 },
  card:         { backgroundColor: '#fff', borderRadius: 20, padding: 22, gap: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3, borderWidth: 1, borderColor: '#f0f0ee' },
  cardTitle:    { fontSize: 18, fontWeight: '800', color: '#0f0f0f', letterSpacing: -0.5 },
  btnGoogle:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1.5, borderColor: '#e5e7eb', padding: 13 },
  googleIcon:   { width: 22, height: 22, borderRadius: 4, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' },
  btnGoogleText:{ fontSize: 14, fontWeight: '600', color: '#374151' },
  divider:      { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dividerLine:  { flex: 1, height: 1, backgroundColor: '#e5e7eb' },
  dividerText:  { fontSize: 12, color: '#9ca3af', fontWeight: '500' },
  field:        { gap: 6 },
  label:        { fontSize: 11, fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: 0.5 },
  input:        { backgroundColor: '#f9fafb', borderRadius: 12, borderWidth: 1.5, borderColor: '#e5e7eb', padding: 13, fontSize: 15, color: '#0f0f0f' },
  btn:          { backgroundColor: '#1a472a', borderRadius: 12, padding: 15, alignItems: 'center', marginTop: 2 },
  btnDisabled:  { opacity: 0.6 },
  btnText:      { color: '#fff', fontSize: 15, fontWeight: '800', letterSpacing: -0.3 },
  footer:       { fontSize: 12, color: '#9ca3af', textAlign: 'center', lineHeight: 18 },
})