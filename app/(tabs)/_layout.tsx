import { Tabs } from 'expo-router';
import { View, Text, TouchableOpacity } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '@/lib/theme';
import { useWorkout, formatElapsed } from '@/lib/workout-context';
import { useRouter } from 'expo-router';

function TabIcon({ d, color }: { d: string; color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d={d} />
    </Svg>
  );
}

export default function TabLayout() {
  const { colors } = useTheme();
  const { workoutMode, elapsedSeconds } = useWorkout();
  const router = useRouter();

  const BackButton = () => (
    <TouchableOpacity onPress={() => router.back()} style={{ paddingLeft: 8, paddingRight: 16 }}>
      <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={colors.primary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M15 18l-6-6 6-6" />
      </Svg>
    </TouchableOpacity>
  );
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.text,
      }}
    >
      <Tabs.Screen
        name="log"
        options={{
          title: 'Log',
          tabBarIcon: ({ color }) => (
            <View>
              <TabIcon color={workoutMode ? colors.warning : color} d="M12 5v14M5 12h14" />
              {workoutMode === 'active' && (
                <View style={{ position: 'absolute', top: -4, right: -18, backgroundColor: colors.warning, borderRadius: 8, paddingHorizontal: 4, paddingVertical: 1 }}>
                  <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700' }}>{formatElapsed(elapsedSeconds)}</Text>
                </View>
              )}
              {workoutMode === 'quick' && (
                <View style={{ position: 'absolute', top: -2, right: -6, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.warning }} />
              )}
            </View>
          )
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'History',
          tabBarIcon: ({ color }) => (
            <TabIcon color={color} d="M12 8v4l3 3M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
          )
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          title: 'Progress',
          tabBarIcon: ({ color }) => (
            <TabIcon color={color} d="M3 20l4-8 4 4 4-12 4 8" />
          )
        }}
      />
      <Tabs.Screen
        name="insights"
        options={{
          title: 'Insights',
          tabBarIcon: ({ color }) => (
            <TabIcon color={color} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 1 1 7.072 0l-.548.547A3.374 3.374 0 0 0 14 18.469V19a2 2 0 1 1-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          )
        }}
      />
      <Tabs.Screen
        name="profiles"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => (
            <TabIcon color={color} d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
          )
        }}
      />
      {/* Hidden screens — accessible via router.push but not in tab bar */}
      <Tabs.Screen
        name="index"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="workouts"
        options={{ title: 'Workout Templates', href: null, headerLeft: () => <BackButton /> }}
      />
      <Tabs.Screen
        name="exercises"
        options={{ title: 'Exercises', href: null, headerLeft: () => <BackButton /> }}
      />
      <Tabs.Screen
        name="template-builder"
        options={{ title: 'Create Template', href: null, headerLeft: () => <BackButton /> }}
      />
      <Tabs.Screen
        name="calendar"
        options={{ title: 'Calendar', href: null, headerLeft: () => <BackButton /> }}
      />
    </Tabs>
  );
}
