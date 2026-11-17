/**
 * 2026-11-17 (Jarvis): Firebase web config for Team sync (Google login + Firestore).
 *
 * Jack: i-paste dito ang config mula sa Firebase Console →
 *   Project settings → General → Your apps → Web app → "SDK setup and configuration" → Config.
 * These values identify the project; they are not passwords (every Firebase web app ships them).
 * What protects the data is firestore.rules. Habang walang laman ito, nakatago lang ang
 * Team sync at gumagana ang app gaya ng dati.
 */
export const firebaseConfig = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  appId: "",
};

export const isFirebaseConfigured = (): boolean => !!(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);
