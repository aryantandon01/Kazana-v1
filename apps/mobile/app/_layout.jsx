import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="auto" />
      <Stack>
        <Stack.Screen name="index" options={{ title: 'Kazana' }} />
        <Stack.Screen name="login" options={{ title: 'Login' }} />
        <Stack.Screen name="discover" options={{ title: 'Discover' }} />
        <Stack.Screen name="jobs" options={{ title: 'Jobs' }} />
        <Stack.Screen name="matches" options={{ title: 'Matches' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      </Stack>
    </>
  );
}
