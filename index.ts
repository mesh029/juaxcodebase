import { registerRootComponent } from 'expo';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import App from './App';
import { AppErrorBoundary } from './components/AppErrorBoundary';

function Root() {
  return React.createElement(
    SafeAreaProvider,
    null,
    React.createElement(AppErrorBoundary, null, React.createElement(App, null)),
  );
}

registerRootComponent(Root);
