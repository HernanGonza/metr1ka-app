import { Tabs } from 'expo-router'

export default function AdminLayout() {
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: '#1a472a',
      tabBarStyle: { backgroundColor: '#fff', borderTopColor: '#e5e7eb' },
    }}>
      <Tabs.Screen name="dashboard" options={{ title: 'Dashboard' }} />
      {/* encuestas oculto — el select está dentro del dashboard */}
      <Tabs.Screen name="encuestas" options={{ href: null }} />
    </Tabs>
  )
}