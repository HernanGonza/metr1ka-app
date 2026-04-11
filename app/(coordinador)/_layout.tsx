import { Tabs } from 'expo-router'

export default function CoordinadorLayout() {
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: '#1a472a',
      tabBarStyle: { backgroundColor: '#fff', borderTopColor: '#e5e7eb' },
    }}>
      <Tabs.Screen name="dashboard"     options={{ title: 'Dashboard' }} />
      <Tabs.Screen name="encuestadores" options={{ title: 'Mi equipo' }} />
      {/* mapa oculto por ahora */}
      <Tabs.Screen name="mapa"          options={{ href: null }} />
    </Tabs>
  )
}