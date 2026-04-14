import { Stack, useRouter } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { TouchableOpacity } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { initDatabase } from '@/lib/database';
import { ThemeProvider, useTheme } from '@/lib/theme';
import { WorkoutProvider } from '@/lib/workout-context';

// Initialize database synchronously before rendering
initDatabase();

function InnerLayout() {
  const { colors } = useTheme();
  const router = useRouter();

  const BackButton = () => (
    <TouchableOpacity onPress={() => router.back()} style={{ paddingLeft: 8, paddingRight: 16 }}>
      <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={colors.primary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M15 18l-6-6 6-6" />
      </Svg>
    </TouchableOpacity>
  );

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.text,
        contentStyle: { backgroundColor: colors.background }
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="template/[id]" options={{ title: 'Template Details', headerLeft: () => <BackButton /> }} />
      <Stack.Screen name="template/edit/[id]" options={{ title: 'Edit Template', headerLeft: () => <BackButton /> }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <WorkoutProvider>
          <InnerLayout />
        </WorkoutProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
