import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.ifitbest.app',
  appName: 'FITBEST',
  webDir: 'dist',
  backgroundColor: '#f5f6f7',
  ios: {
    contentInset: 'never',
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      showSpinner: false,
      backgroundColor: '#f5f6f7',
    },
  },
}

export default config
