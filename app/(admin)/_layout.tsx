import { Tabs } from 'expo-router'
import { LayoutDashboard } from 'lucide-react-native'

export default function AdminLayout() {
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: '#1a472a',
      tabBarInactiveTintColor: '#9ca3af',
      tabBarStyle: { backgroundColor: '#fff', borderTopColor: '#e5e7eb', height: 60, paddingBottom: 8 },
      tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
    }}>
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => <LayoutDashboard size={size} color={color} strokeWidth={2} />,
        }}
      />
      <Tabs.Screen name="encuestas" options={{ href: null }} />
    </Tabs>
  )
}