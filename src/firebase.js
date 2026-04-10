import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getMessaging, getToken, onMessage } from "firebase/messaging";

// ⚠️ REPLACE WITH YOUR ACTUAL FIREBASE SECRETS BEFORE DEPLOYMENT
const firebaseConfig = {
  apiKey: "AIzaSyBold_lXv7eDFEAeZSuXjGa_6ApulM2N3Q",
  authDomain: "movify-dae45.firebaseapp.com",
  projectId: "movify-dae45",
  storageBucket: "movify-dae45.firebasestorage.app",
  messagingSenderId: "443872765883",
  appId: "1:443872765883:web:3d5d6bc6553ae9733ac69e",
  measurementId: "G-1T7MYPFZ2H"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);
export const messaging = getMessaging(app);

// Authentication Helpers
export const logInWithGoogle = () => signInWithPopup(auth, googleProvider);
export const logOut = () => signOut(auth);

// Push Notifications Setup
export const requestForToken = () => {
  return getToken(messaging, { vapidKey: 'YOUR_VAPID_KEY_HERE' })
    .then((currentToken) => {
      if (currentToken) {
        console.log('Firebase Token:', currentToken);
        // Send this token to Backend or store in Firestore
      } else {
        console.log('No registration token available.');
      }
    })
    .catch((err) => {
      console.error('An error occurred while retrieving token.', err);
    });
};

export const onMessageListener = () =>
  new Promise((resolve) => {
    onMessage(messaging, (payload) => {
      resolve(payload);
    });
});
