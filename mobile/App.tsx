import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import ComingSoonScreen from './src/screens/ComingSoonScreen';
import CompleteScreen from './src/screens/CompleteScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import EnterpriseScreen from './src/screens/EnterpriseScreen';
import HomeScreen from './src/screens/HomeScreen';
import MyCertificationsScreen from './src/screens/MyCertificationsScreen';
import MyIncentivesScreen from './src/screens/MyIncentivesScreen';
import SilverApplicationScreen from './src/screens/SilverApplicationScreen';
import ApplicationSubmittedScreen from './src/screens/ApplicationSubmittedScreen';
import PaymentScreen from './src/screens/PaymentScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import DocumentsScreen from './src/screens/DocumentsScreen';
import NotificationsScreen from './src/screens/NotificationsScreen';
import OtpScreen from './src/screens/OtpScreen';
import PledgeScreen from './src/screens/PledgeScreen';
import RegisterLandingScreen from './src/screens/RegisterLandingScreen';
import SplashScreen from './src/screens/SplashScreen';
import SignInScreen from './src/screens/SignInScreen';
import ResetPasswordScreen from './src/screens/ResetPasswordScreen';
import SpocScreen from './src/screens/SpocScreen';
import SummaryScreen from './src/screens/SummaryScreen';
import UdyamScreen from './src/screens/UdyamScreen';
import UnitActivityScreen from './src/screens/UnitActivityScreen';
import { AppProvider, useApp } from './src/state/AppContext';
import { colour, type } from './src/theme/theme';
import type { RootStackParamList } from './src/navigation/types';

const Stack = createNativeStackNavigator<RootStackParamList>();

function Root(): React.JSX.Element {
  const { ready, user } = useApp();

  // Held until the database is open and the session restored, so the first
  // screen is the right one rather than the sign-in flashing past somebody who
  // is already signed in.
  if (!ready) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator color={colour.green} size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName={user ? 'Home' : 'Splash'}
        screenOptions={{
          // The registration screens use this native header (the post-login
          // screens hide it and draw their own). The prototype makes it the blue
          // MCLS bar, so it is styled here once for the whole wizard.
          headerStyle: { backgroundColor: colour.blue },
          headerTintColor: colour.surface,
          headerTitleStyle: { fontSize: type.body, fontWeight: '700', color: colour.surface },
          headerRight: () => <Text style={styles.headerBrand}>MCLS</Text>,
          contentStyle: { backgroundColor: colour.page },
        }}
      >
        <Stack.Screen name="Splash" component={SplashScreen} options={{ headerShown: false }} />
        <Stack.Screen name="SignIn" component={SignInScreen} options={{ headerShown: false }} />
        <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} options={{ headerShown: false }} />

        {/* Post-login app. These carry their own app bar (AppShell), so the
            stack header is hidden. */}
        <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
        <Stack.Screen name="MyCertifications" component={MyCertificationsScreen} options={{ headerShown: false }} />
        <Stack.Screen name="MyIncentives" component={MyIncentivesScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Payments" component={PaymentScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Documents" component={DocumentsScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Profile" component={ProfileScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ headerShown: false }} />
        <Stack.Screen name="SilverApplication" component={SilverApplicationScreen} options={{ headerShown: false }} />
        <Stack.Screen name="ApplicationSubmitted" component={ApplicationSubmittedScreen} options={{ headerShown: false }} />

        <Stack.Screen name="Dashboard" component={DashboardScreen} options={{ headerShown: false }} />

        <Stack.Screen name="RegisterLanding" component={RegisterLandingScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Udyam" component={UdyamScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Enterprise" component={EnterpriseScreen} options={{ headerShown: false }} />
        <Stack.Screen name="UnitActivity" component={UnitActivityScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Spoc" component={SpocScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Otp" component={OtpScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Summary" component={SummaryScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Pledge" component={PledgeScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Complete" component={CompleteScreen} options={{ headerShown: false }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App(): React.JSX.Element {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <StatusBar style="dark" />
        <Root />
      </AppProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  headerBrand: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginRight: 4,
  },
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colour.page,
  },
});
