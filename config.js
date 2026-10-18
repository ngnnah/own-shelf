// Firebase web config. These values identify the project; they are not secrets.
// Your data is protected by the Firestore security rules (firestore.rules).
export const firebaseConfig = {
  apiKey: "AIzaSyBcmSfvxEjA_VD2WMUS6nNhA_1m1B8rx7Q",
  authDomain: "upwind-reader.firebaseapp.com",
  projectId: "upwind-reader",
  storageBucket: "upwind-reader.firebasestorage.app",
  messagingSenderId: "828743349896",
  appId: "1:828743349896:web:12daa0dde70b2c4291113d"
};

export const FIREBASE_VERSION = "10.12.2";

// Link import helper (Cloudflare Worker). Leave empty and set it in the app's
// Settings instead; a value here is the default for every device.
export const WORKER_URL = "";
