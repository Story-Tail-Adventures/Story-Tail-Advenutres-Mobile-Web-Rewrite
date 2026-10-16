import type { FirebaseOptions } from "firebase/app";

/**
 * The Firebase web app's public config, from NEXT_PUBLIC_FIREBASE_*. P1.
 *
 * These values are not secrets — Firebase ships them to every browser by design — but they
 * live in env so preview and production can point at different Firebase projects.
 *
 * Returns null unless every field Analytics needs is set. Unconfigured means OFF, not an
 * error: no consent banner, no 2.5.9 switch, no SDK download. Asking a visitor to allow a
 * tracker that is not there would be a control that lies.
 *
 * Each variable is read by its full literal name so Next.js can inline it into the bundle.
 */
export function firebaseWebConfig(): FirebaseOptions | null {
  const config = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
  };
  if (!config.apiKey || !config.projectId || !config.appId || !config.measurementId) return null;
  return config;
}

export const firebaseAnalyticsConfigured = firebaseWebConfig() !== null;
