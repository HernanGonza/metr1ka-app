import { Tabs } from 'expo-router'
import { useAuth } from '../../lib/auth'

export default function CoordinadorLayout() {
  const { perfil } = useAuth()

  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: '#1a472a',
      tabBarStyle: { backgroundColor: '#fff', borderTopColor: '#e5e7eb' },
    }}>
      <Tabs.Screen name="dashboard" options={{ title: 'Dashboard' }} />
      <Tabs.Screen name="encuestas" options={{ title: 'Encuestas' }} />
      <Tabs.Screen name="mapa"      options={{ title: 'Mapa', href: null }} />
    </Tabs>
  )
}