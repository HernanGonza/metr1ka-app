import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, Alert
} from 'react-native'
import { SvgXml } from 'react-native-svg'
import { supabase } from '../lib/supabase'

const logoSvg = `<svg width="751" height="62" viewBox="0 0 751 62" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M76.224 54.144H61.824L114.24 0H138.24V61.44H114.24V19.584L121.44 22.56L83.52 61.44H54.72L16.704 22.656L24 19.68V61.44H0V0H24L76.224 54.144Z" fill="black"/>
<path d="M174.727 35.52V43.2H247.688V61.44H150.727V0H247.495V18.24H174.727V25.92H234.247V35.52H174.727Z" fill="black"/>
<path d="M255.334 0H355.174V18.24H255.334V0ZM293.254 16.992H317.254V61.44H293.254V16.992Z" fill="black"/>
<path d="M363.776 61.44V0H437.984C443.808 0 449.024 0.672001 453.632 2.016C458.304 3.296 461.984 5.472 464.672 8.544C467.424 11.616 468.8 15.808 468.8 21.12C468.8 24.64 468.16 27.552 466.88 29.856C465.6 32.16 463.84 33.952 461.6 35.232C459.36 36.512 456.8 37.44 453.92 38.016C451.04 38.592 448.032 38.944 444.896 39.072L437.888 37.728C445.504 37.792 451.36 38.112 455.456 38.688C459.616 39.264 462.496 40.32 464.096 41.856C465.76 43.328 466.592 45.472 466.592 48.288V61.44H442.592V51.168C442.592 49.248 442.208 47.808 441.44 46.848C440.736 45.824 439.136 45.12 436.64 44.736C434.208 44.352 430.432 44.16 425.312 44.16H387.776V61.44H363.776ZM387.776 28.128H437.984C439.904 28.128 441.504 27.808 442.784 27.168C444.128 26.528 444.8 25.312 444.8 23.52C444.8 21.856 444.128 20.736 442.784 20.16C441.504 19.52 439.904 19.2 437.984 19.2H387.776V28.128Z" fill="black"/>
<path d="M476.809 32.64V14.4H518.473V61.44H495.433V32.64H476.809Z" fill="#52B788"/>
<path d="M582.149 31.2V25.824L637.541 61.44H601.829L554.789 28.8L598.181 0H632.357L582.149 31.2ZM530.981 0H554.981V61.44H530.981V0Z" fill="black"/>
<path d="M662.39 52.128V37.728H728.054V52.128H662.39ZM640.886 61.44L682.07 0H708.758L750.326 61.44H723.926L688.31 6.432H702.614L667.286 61.44H640.886Z" fill="black"/>
</svg>`

export default function Login() {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)

  async function handleLogin() {
    if (!email || !password) return
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) Alert.alert('Error', error.message)
    setLoading(false)
  }

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={s.inner}>
        <View style={s.logo}>
          <SvgXml xml={logoSvg} width={200} height={30} />
        </View>
        <Text style={s.subtitle}>Plataforma de encuestas en campo</Text>

        <TextInput
          style={s.input}
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TextInput
          style={s.input}
          placeholder="Contraseña"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <TouchableOpacity style={[s.btn, loading && s.btnDisabled]} onPress={handleLogin} disabled={loading}>
          <Text style={s.btnText}>{loading ? 'Ingresando...' : 'Ingresar'}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

const s = StyleSheet.create({
  container:  { flex: 1, backgroundColor: '#f2f1ee' },
  inner:      { flex: 1, padding: 32, justifyContent: 'center' },
  logo:       { backgroundColor: '#1a472a', borderRadius: 16, padding: 20, alignItems: 'center', marginBottom: 12 },
  logoText:   { color: '#fff', fontSize: 28, fontWeight: '900', letterSpacing: 2 },
  subtitle:   { color: '#888', fontSize: 14, textAlign: 'center', marginBottom: 40 },
  input:      { backgroundColor: '#fff', borderRadius: 12, padding: 14, fontSize: 15, marginBottom: 12, borderWidth: 1.5, borderColor: '#e5e7eb' },
  btn:        { backgroundColor: '#1a472a', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8 },
  btnDisabled:{ opacity: 0.6 },
  btnText:    { color: '#fff', fontSize: 16, fontWeight: '700' },
})
