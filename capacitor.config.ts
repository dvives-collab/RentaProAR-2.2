import { CapacitorConfig } from '@capacitor/cli';
const config: CapacitorConfig = {
  appId: 'com.rentapro.ar',
  appName: 'RentaPro AR',
  webDir: 'dist',
  server: { androidScheme: 'https', cleartext: true },
  plugins: {
    Camera: { presentationStyle: 'popover' },
    Filesystem: { androidStorageMode: 'EXTERNAL' }
  }
};
export default config;
