import * as SecureStore from 'expo-secure-store'
import { createClient } from '@supabase/supabase-js'

const CHUNK_SIZE = 1800

const ChunkedSecureStore = {
  async getItem(key: string): Promise<string | null> {
    try {
      const numChunks = await SecureStore.getItemAsync(`${key}_chunks`)
      if (!numChunks) return await SecureStore.getItemAsync(key)
      const n = parseInt(numChunks)
      let result = ''
      for (let i = 0; i < n; i++) {
        const chunk = await SecureStore.getItemAsync(`${key}_${i}`)
        if (!chunk) return null
        result += chunk
      }
      return result
    } catch { return null }
  },

  async setItem(key: string, value: string): Promise<void> {
    try {
      if (value.length <= CHUNK_SIZE) {
        await SecureStore.setItemAsync(key, value)
        await SecureStore.deleteItemAsync(`${key}_chunks`).catch(() => {})
        return
      }
      const chunks = Math.ceil(value.length / CHUNK_SIZE)
      for (let i = 0; i < chunks; i++) {
        await SecureStore.setItemAsync(`${key}_${i}`, value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE))
      }
      await SecureStore.setItemAsync(`${key}_chunks`, String(chunks))
    } catch {}
  },

  async removeItem(key: string): Promise<void> {
    try {
      const numChunks = await SecureStore.getItemAsync(`${key}_chunks`)
      if (numChunks) {
        const n = parseInt(numChunks)
        for (let i = 0; i < n; i++) {
          await SecureStore.deleteItemAsync(`${key}_${i}`).catch(() => {})
        }
        await SecureStore.deleteItemAsync(`${key}_chunks`).catch(() => {})
      }
      await SecureStore.deleteItemAsync(key).catch(() => {})
    } catch {}
  },
}

// Estas vars se inyectan en build/publish time (EAS Environment Variables por
// ambiente: production/preview/development). Si falta alguna, createClient()
// tira un error genérico al importar el módulo — apenas arranca la app, antes
// de cualquier render — y expo-updates puede enmascararlo como una pantalla
// gris que "no inicia" en vez de mostrar el error real. Este chequeo deja un
// mensaje claro en los logs para no repetir esa cacería.
if (!process.env.EXPO_PUBLIC_SUPABASE_URL || !process.env.EXPO_PUBLIC_SUPABASE_KEY) {
  throw new Error(
    '[supabase] Faltan EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_KEY. ' +
    'Revisar "eas env:list --environment <preview|production|development>".'
  )
}

// Cliente normal (para la mayoría de las operaciones)
export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.EXPO_PUBLIC_SUPABASE_KEY,   // ← anon key
  {
    auth: {
      storage: ChunkedSecureStore,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
)

// supabaseAdmin eliminado por seguridad — la service role key no debe estar en la app móvil