// Firebase pieces the app uses. Bundled to vendor/firebase.js by scripts/build-firebase.mjs.
export { initializeApp } from 'firebase/app';
export { getAuth, signInAnonymously, onAuthStateChanged, connectAuthEmulator } from 'firebase/auth';
export {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager, connectFirestoreEmulator,
  doc, collection, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, serverTimestamp,
} from 'firebase/firestore';
