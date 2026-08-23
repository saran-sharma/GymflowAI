/**
 * Root layout: providers, theme and the auth gate.
 *
 * The gate is the only place that decides which role's app is mounted. Screens
 * below it can assume a signed-in user of the right role — but the *server*
 * still enforces every permission; this is presentation only.
 */

import { DMMono_400Regular, DMMono_500Medium } from '@expo-google-fonts/dm-mono';
import {
  Fraunces_300Light,
  Fraunces_300Light_Italic,
  Fraunces_400Regular,
} from '@expo-google-fonts/fraunces';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Loading } from '../src/components/ui';
import { configureForegroundBehaviour } from '../src/notifications';
import { AuthProvider, homeRouteForRole, useAuth } from '../src/store/AuthContext';
import { NetworkProvider } from '../src/store/NetworkContext';
import { ThemeProvider, useTheme } from '../src/store/ThemeContext';
import { colors } from '../src/theme';

void SplashScreen.preventAutoHideAsync();
configureForegroundBehaviour();

function AuthGate({ children }: { children: React.ReactNode }) {
  const { status, user } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (status === 'loading') return;
    void SplashScreen.hideAsync();

    const inAuthGroup = segments[0] === '(auth)';

    if (status === 'anonymous' && !inAuthGroup) {
      router.replace('/(auth)/login');
      return;
    }
    if (status === 'authenticated' && user && inAuthGroup) {
      router.replace(homeRouteForRole(user.role) as never);
    }
  }, [status, user, segments, router]);

  if (status === 'loading') return <Loading label="Starting GymFlow" />;
  return <>{children}</>;
}

/**
 * The theme-aware chrome — background, status bar icon colour, and the
 * navigator's own content background — plus everything that already lived
 * here. Rendered as a *child* of `ThemeProvider`, not alongside it: a
 * component only re-renders when its own state (or an ancestor's) changes,
 * and the resolved scheme lives in `ThemeProvider`'s state, not
 * `RootLayout`'s — so this has to sit below it in the tree to ever see a
 * theme switch.
 */
function ThemedApp() {
  const { resolvedScheme } = useTheme();
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider>
        <NetworkProvider>
          <AuthProvider>
            <StatusBar style={resolvedScheme === 'dark' ? 'light' : 'dark'} />
            <AuthGate>
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: colors.bg },
                  animation: 'fade',
                }}
              >
                <Stack.Screen name="(auth)" />
                <Stack.Screen name="(trainer)" />
                <Stack.Screen name="(owner)" />
                <Stack.Screen name="(member)" />
              </Stack>
            </AuthGate>
          </AuthProvider>
        </NetworkProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default function RootLayout() {
  // Every typeface the design system names, loaded before anything paints.
  // A screen rendered against a family that has not arrived falls back to the
  // system font and then reflows when it does, which is visible and looks like
  // a bug — so the splash is held until they are all in.
  const [fontsLoaded] = useFonts({
    Fraunces_300Light,
    Fraunces_300Light_Italic,
    Fraunces_400Regular,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    DMMono_400Regular,
    DMMono_500Medium,
  });

  if (!fontsLoaded) return null;

  return (
    <ThemeProvider>
      <ThemedApp />
    </ThemeProvider>
  );
}
