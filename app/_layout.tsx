import { DarkTheme, DefaultTheme, ThemeProvider as NavThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SQLiteProvider } from 'expo-sqlite';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { ThemeProvider } from '@/contexts/theme';
import { initDatabase } from '@/lib/db';

SplashScreen.preventAutoHideAsync();

function InnerLayout() {
  const colorScheme = useColorScheme();

  return (
    <NavThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="filter-modal"
          options={{ presentation: 'modal', title: 'Filters' }}
        />
        <Stack.Screen
          name="export-modal"
          options={{ presentation: 'fullScreenModal', headerShown: false }}
        />
      </Stack>
      <StatusBar style="auto" />
    </NavThemeProvider>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    'Geist-Regular': require('../assets/fonts/Geist-Regular.otf'),
    'Geist-Medium': require('../assets/fonts/Geist-Medium.otf'),
    'Geist-SemiBold': require('../assets/fonts/Geist-SemiBold.otf'),
    'Geist-Bold': require('../assets/fonts/Geist-Bold.otf'),
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <SQLiteProvider databaseName="trails.db" onInit={initDatabase}>
      <ThemeProvider>
        <InnerLayout />
      </ThemeProvider>
    </SQLiteProvider>
  );
}
