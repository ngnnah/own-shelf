// This deployment's own settings, and the only file a fork of own-shelf edits (README: Make your own shelf).
// App code keeps its own settings elsewhere, so GitHub's "Sync fork" seldom has to merge this file.

// Firebase web config: Firebase console → Project settings → General → Your apps → Web app → SDK setup
// and configuration → Config. Paste the object here. These values identify the project; they are not
// secrets. Your data is protected by the Firestore security rules (firestore.rules).
export const firebaseConfig = {
  apiKey: "AIzaSyBcmSfvxEjA_VD2WMUS6nNhA_1m1B8rx7Q",
  authDomain: "upwind-reader.firebaseapp.com",
  projectId: "upwind-reader",
  storageBucket: "upwind-reader.firebasestorage.app",
  messagingSenderId: "828743349896",
  appId: "1:828743349896:web:12daa0dde70b2c4291113d"
};

// Link import helper (your Cloudflare Worker, worker/worker.js), e.g. "https://own-shelf-fetch.you.workers.dev/".
// Leave it empty to go without link import, or to set it per account in the app's Settings instead.
export const WORKER_URL = "https://own-shelf-fetch.ngnnahshop.workers.dev/";
