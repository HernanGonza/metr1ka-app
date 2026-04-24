import { Tabs } from 'expo-router'
import { LayoutDashboard, Users, ClipboardList } from 'lucide-react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

export default function CoordinadorLayout() {
  const insets = useSafeAreaInsets()

  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: '#0369a1',
      tabBarInactiveTintColor: '#9ca3af',
      tabBarStyle: {
        backgroundColor: '#fff',
        borderTopColor: '#e5e7eb',
        height: 56 + insets.bottom,
        paddingBottom: insets.bottom,
        paddingTop: 6,
      },
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
        name="encuestas"
        options={{
          title: 'Encuestas',
          tabBarIcon: ({ color, size }) => <ClipboardList size={size} color={color} strokeWidth={2} />,
        }}
      />
    </Tabs>
  )
}