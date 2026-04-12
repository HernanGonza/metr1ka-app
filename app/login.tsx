import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  StatusBar, Linking, Modal, ScrollView
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../lib/supabase'
import { LogoSvg } from '../components/UI/LogoSvg'

// Modal de error propio — sin Alert del sistema
function ErrorModal({
  visible,
  titulo,
  mensaje,
  onClose,
  onRecuperar,
}: {
  visible: boolean
  titulo: string
  mensaje: string
  onClose: () => void
  onRecuperar?: () => void
}) {
  if (!visible) return null
  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <View style={em.overlay}>
        <View style={em.card}>
          <LogoSvg width={100} color="#0f0f0f" />
          <View style={em.iconWrap}>
            <Text style={em.iconText}>!</Text>
          </View>
          <Text style={em.titulo}>{titulo}</Text>
          <Text style={em.mensaje}>{mensaje}</Text>
          <TouchableOpacity style={em.btnPrimary} onPress={onClose}>
            <Text style={em.btnPrimaryText}>Entendido</Text>
          </TouchableOpacity>
          {onRecuperar && (
            <TouchableOpacity style={em.btnSecondary} onPress={onRecuperar}>
              <Text style={em.btnSecondaryText}>Recuperar contraseña</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  )
}

const em = StyleSheet.create({
  overlay:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 32 },
  card:           { backgroundColor: '#fff', borderRadius: 20, padding: 28, alignItems: 'center', gap: 12, width: '100%', maxWidth: 340, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 24, elevation: 12 },
  iconWrap:       { width: 48, height: 48, borderRadius: 24, backgroundColor: '#fef2f2', alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  iconText:       { fontSize: 22, fontWeight: '900', color: '#dc2626' },
  titulo:         { fontSize: 17, fontWeight: '800', color: '#0f0f0f', textAlign: 'center', letterSpacing: -0.3 },
  mensaje:        { fontSize: 14, color: '#6b7280', textAlign: 'center', lineHeight: 21 },
  btnPrimary:     { backgroundColor: '#1a472a', borderRadius: 12, paddingVertical: 13, paddingHorizontal: 32, width: '100%', alignItems: 'center', marginTop: 4 },
  btnPrimaryText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  btnSecondary:   { paddingVertical: 10, width: '100%', alignItems: 'center' },
  btnSecondaryText: { color: '#1a472a', fontSize: 14, fontWeight: '600' },
})

// Traduce el mensaje de error de Supabase a español
function traducirError(msg: string): { titulo: string; mensaje: string; mostrarRecuperar: boolean } {
  const m = msg?.toLowerCase() || ''
  if (m.includes('invalid login credentials') || m.includes('invalid email or password')) {
    return {
      titulo: 'Credenciales incorrectas',
      mensaje: 'El email o la contraseña que ingresaste no son correctos. Revisalos e intentá de nuevo.',
      mostrarRecuperar: true,
    }
  }
  if (m.includes('email not confirmed')) {
    return {
      titulo: 'Email sin confirmar',
      mensaje: 'Todavía no confirmaste tu email. Revisá tu casilla de correo y hacé clic en el link de activación.',
      mostrarRecuperar: false,
    }
  }
  if (m.includes('too many requests') || m.includes('rate limit')) {
    return {
      titulo: 'Demasiados intentos',
      mensaje: 'Esperá unos minutos antes de intentar ingresar de nuevo.',
      mostrarRecuperar: false,
    }
  }
  if (m.includes('user not found')) {
    return {
      titulo: 'Usuario no encontrado',
      mensaje: 'No existe una cuenta con ese email. El acceso es solo por invitación.',
      mostrarRecuperar: false,
    }
  }
  return {
    titulo: 'Error al ingresar',
    mensaje: 'Ocurrió un problema. Verificá tus datos e intentá de nuevo.',
    mostrarRecuperar: true,
  }
}

export default function Login() {
  const [email,         setEmail]         = useState('')
  const [password,      setPassword]      = useState('')
  const [loading,       setLoading]       = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error,         setError]         = useState<{ titulo: string; mensaje: string; mostrarRecuperar: boolean } | null>(null)
  const [recuperando,   setRecuperando]   = useState(false)
  const [emailEnviado,  setEmailEnviado]  = useState(false)
  const insets = useSafeAreaInsets()

  async function handleLogin() {
    if (!email.trim() || !password) {
      setError({ titulo: 'Campos requeridos', mensaje: 'Completá tu email y contraseña para continuar.', mostrarRecuperar: false })
      return
    }
    setLoading(true)
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (err) setError(traducirError(err.message))
    setLoading(false)
  }

  async function handleGoogle() {
    setGoogleLoading(true)
    const { data, error: err } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: 'metr1ka://login', skipBrowserRedirect: true }
    })
    if (err) { setError(traducirError(err.message)); setGoogleLoading(false); return }
    if (data?.url) await Linking.openURL(data.url)
    setGoogleLoading(false)
  }

  async function handleRecuperar() {
    setError(null)
    if (!email.trim()) {
      setRecuperando(true)
      return
    }
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim())
    if (err) {
      setError({ titulo: 'Error', mensaje: 'No pudimos enviar el email de recuperación. Verificá el email ingresado.', mostrarRecuperar: false })
    } else {
      setEmailEnviado(true)
    }
  }

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <StatusBar barStyle="dark-content" backgroundColor="#fafaf8" />

      <ErrorModal
        visible={!!error}
        titulo={error?.titulo || ''}
        mensaje={error?.mensaje || ''}
        onClose={() => setError(null)}
        onRecuperar={error?.mostrarRecuperar ? handleRecuperar : undefined}
      />

      <ScrollView
        contentContainerStyle={[s.inner, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Logo centrado */}
        <View style={s.logoSection}>
          <LogoSvg width={160} color="#0f0f0f" />
          <Text style={s.tagline}>Encuestas de campo en tiempo real</Text>
        </View>

        {emailEnviado ? (
          <View style={s.card}>
            <View style={s.successIcon}><Text style={{ fontSize: 28 }}>📬</Text></View>
            <Text style={s.cardTitle}>Revisá tu email</Text>
            <Text style={s.cardSub}>Te enviamos un link para restablecer tu contraseña a {email}.</Text>
            <TouchableOpacity style={s.btn} onPress={() => setEmailEnviado(false)}>
              <Text style={s.btnText}>Volver al login</Text>
            </TouchableOpacity>
          </View>
        ) : recuperando ? (
          <View style={s.card}>
            <Text style={s.cardTitle}>Recuperar contraseña</Text>
            <Text style={s.cardSub}>Ingresá tu email y te enviamos un link para restablecer tu contraseña.</Text>
            <View style={s.field}>
              <Text style={s.label}>Email</Text>
              <TextInput style={s.input} placeholder="tu@email.com" placeholderTextColor="#9ca3af"
                value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
            </View>
            <TouchableOpacity style={s.btn} onPress={handleRecuperar}>
              <Text style={s.btnText}>Enviar link</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.btnLink} onPress={() => setRecuperando(false)}>
              <Text style={s.btnLinkText}>← Volver al login</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={s.card}>
            <Text style={s.cardTitle}>Bienvenido</Text>

            {/* Google */}
            <TouchableOpacity style={[s.btnGoogle, googleLoading && s.btnDisabled]}
              onPress={handleGoogle} disabled={googleLoading} activeOpacity={0.85}>
              <Text style={s.googleG}>G</Text>
              <Text style={s.btnGoogleText}>{googleLoading ? 'Conectando...' : 'Continuar con Google'}</Text>
            </TouchableOpacity>

            <View style={s.divider}>
              <View style={s.dividerLine} />
              <Text style={s.dividerText}>o ingresá con email</Text>
              <View style={s.dividerLine} />
            </View>

            <View style={s.field}>
              <Text style={s.label}>Email</Text>
              <TextInput style={s.input} placeholder="tu@email.com" placeholderTextColor="#9ca3af"
                value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
            </View>
            <View style={s.field}>
              <Text style={s.label}>Contraseña</Text>
              <TextInput style={s.input} placeholder="••••••••" placeholderTextColor="#9ca3af"
                value={password} onChangeText={setPassword} secureTextEntry />
            </View>

            <TouchableOpacity style={[s.btn, loading && s.btnDisabled]}
              onPress={handleLogin} disabled={loading} activeOpacity={0.85}>
              <Text style={s.btnText}>{loading ? 'Ingresando...' : 'Ingresar'}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={s.btnLink} onPress={() => setRecuperando(true)}>
              <Text style={s.btnLinkText}>¿Olvidaste tu contraseña?</Text>
            </TouchableOpacity>
          </View>
        )}

        <Text style={s.footer}>El acceso es solo por invitación.{'\n'}¿Problemas? Contactá a tu administrador.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  container:     { flex: 1, backgroundColor: '#fafaf8' },
  inner:         { flexGrow: 1, paddingHorizontal: 28, justifyContent: 'center', gap: 28 },
  logoSection:   { alignItems: 'center', gap: 10 },
  tagline:       { fontSize: 13, color: '#9ca3af', textAlign: 'center' },
  card:          { backgroundColor: '#fff', borderRadius: 20, padding: 22, gap: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3, borderWidth: 1, borderColor: '#f0f0ee' },
  cardTitle:     { fontSize: 18, fontWeight: '800', color: '#0f0f0f', letterSpacing: -0.4 },
  cardSub:       { fontSize: 13, color: '#6b7280', lineHeight: 19, marginTop: -6 },
  successIcon:   { alignSelf: 'center', width: 56, height: 56, borderRadius: 28, backgroundColor: '#f0fdf4', alignItems: 'center', justifyContent: 'center' },
  btnGoogle:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1.5, borderColor: '#e5e7eb', padding: 13 },
  googleG:       { fontSize: 15, fontWeight: '900', color: '#4285F4', width: 22, textAlign: 'center' },
  btnGoogleText: { fontSize: 14, fontWeight: '600', color: '#374151' },
  divider:       { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dividerLine:   { flex: 1, height: 1, backgroundColor: '#e5e7eb' },
  dividerText:   { fontSize: 11, color: '#9ca3af', fontWeight: '500' },
  field:         { gap: 6 },
  label:         { fontSize: 11, fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: 0.5 },
  input:         { backgroundColor: '#f9fafb', borderRadius: 12, borderWidth: 1.5, borderColor: '#e5e7eb', padding: 13, fontSize: 15, color: '#0f0f0f' },
  btn:           { backgroundColor: '#1a472a', borderRadius: 12, padding: 15, alignItems: 'center', marginTop: 2 },
  btnDisabled:   { opacity: 0.6 },
  btnText:       { color: '#fff', fontSize: 15, fontWeight: '800', letterSpacing: -0.3 },
  btnLink:       { alignItems: 'center', paddingVertical: 6 },
  btnLinkText:   { fontSize: 13, color: '#1a472a', fontWeight: '600' },
  footer:        { fontSize: 12, color: '#9ca3af', textAlign: 'center', lineHeight: 18 },
})