import { Platform } from 'react-native';
import { setApiBaseUrl } from '@dapp/trading-api';

function resolveMobileApiBaseUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (typeof envUrl === 'string' && envUrl.trim()) {
    return envUrl.replace(/\/$/, '');
  }

  // Expo mobile fallback for local backend development.
  return Platform.OS === 'android' ? 'http://10.0.2.2:4000/api' : 'http://localhost:4000/api';
}

setApiBaseUrl(resolveMobileApiBaseUrl());
