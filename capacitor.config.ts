import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.shiftmate.app',
  appName: 'ShiftMate',
  webDir: 'www',
  bundledWebRuntime: false,
  backgroundColor: '#f6f8fb',
  ios: {
    contentInset: 'automatic',
    preferredContentMode: 'mobile'
  },
  android: {
    allowMixedContent: false
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: '#f6f8fb',
      showSpinner: false
    },
    StatusBar: {
      backgroundColor: '#f6f8fb',
      style: 'DARK'
    },
    Keyboard: {
      resize: 'body',
      style: 'LIGHT'
    }
  }
};

export default config;
