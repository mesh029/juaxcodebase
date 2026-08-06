import { registerRootComponent } from 'expo';
import React, { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';

import App from './App';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { AuthProvider } from './context/AuthContext';
import { OfflineProvider } from './context/OfflineProvider';
import { initSentry } from './lib/sentry';
import { initPushNotifications, registerPushDeviceToken } from './lib/notifications';
import { createAppQueryClient } from './lib/query-client';

const queryClient = createAppQueryClient();

function Bootstrap({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initSentry();
    void initPushNotifications().then(() => registerPushDeviceToken());
  }, []);
  return React.createElement(React.Fragment, null, children);
}

function Root() {
  return React.createElement(
    SafeAreaProvider,
    null,
    React.createElement(
      QueryClientProvider,
      { client: queryClient },
      React.createElement(
        AuthProvider,
        null,
        React.createElement(
          OfflineProvider,
          null,
          React.createElement(
            AppErrorBoundary,
            null,
            React.createElement(Bootstrap, null, React.createElement(App, null)),
          ),
        ),
      ),
    ),
  );
}

registerRootComponent(Root);
