import { Tabs } from 'expo-router'

export default function EncuestadorLayout() {
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: '#1a472a',
      tabBarStyle: { backgroundColor: '#fff', borderTopColor: '#e5e7eb' },
    }}>
      <Tabs.Screen name="home"     options={{ title: 'Encuestas' }} />
      <Tabs.Screen name="mapa"     options={{ title: 'Mapa', href: null }} />
    </Tabs>
  )
}