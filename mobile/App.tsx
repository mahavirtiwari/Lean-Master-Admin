import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
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
        initialRouteName={user ? 'Home' : 'SignIn'}
        screenOptions={{
          headerStyle: { backgroundColor: colour.surface },
          headerTintColor: colour.text,
          headerTitleStyle: { fontSize: type.body, fontWeight: '700' },
          contentStyle: { backgroundColor: colour.page },
        }}
      >
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

        <Stack.Screen name="Dashboard" component={DashboardScreen} options={{ title: 'LEAN Scheme' }} />

        <Stack.Screen
          name="RegisterLanding"
          component={RegisterLandingScreen}
          options={{ title: 'Register' }}
        />
        <Stack.Screen name="Udyam" component={UdyamScreen} options={{ title: 'Udyam Validation' }} />
        <Stack.Screen
          name="Enterprise"
          component={EnterpriseScreen}
          options={{ title: 'Enterprise Details' }}
        />
        <Stack.Screen
          name="UnitActivity"
          component={UnitActivityScreen}
          options={{ title: 'Unit & Activity' }}
        />
        <Stack.Screen name="Spoc" component={SpocScreen} options={{ title: 'SPOC & Awareness' }} />
        <Stack.Screen name="Otp" component={OtpScreen} options={{ title: 'Verify Email' }} />
        <Stack.Screen name="Summary" component={SummaryScreen} options={{ title: 'Summary' }} />
        <Stack.Screen name="Pledge" component={PledgeScreen} options={{ title: 'LEAN Pledge' }} />
        <Stack.Screen
          name="Complete"
          component={CompleteScreen}
          options={{ title: 'Complete', headerBackVisible: false }}
        />
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
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colour.page,
  },
});
