import { Tabs } from 'expo-router'
import { LayoutDashboard, Users, Map } from 'lucide-react-native'

export default function CoordinadorLayout() {
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: '#0369a1',
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
      <Tabs.Screen
        name="encuestadores"
        options={{
          title: 'Mi equipo',
          tabBarIcon: ({ color, size }) => <Users size={size} color={color} strokeWidth={2} />,
        }}
      />
      <Tabs.Screen
        name="mapa"
        options={{
          title: 'Mapa en vivo',
          tabBarIcon: ({ color, size }) => <Map size={size} color={color} strokeWidth={2} />,
        }}
      />
    </Tabs>
  )
}