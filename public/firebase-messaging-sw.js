importScripts('https://www.gstatic.com/firebasejs/9.22.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.1/firebase-messaging-compat.js');

// ⚠️ REPLACE WITH YOUR ACTUAL FIREBASE SECRETS
const firebaseConfig = {
  apiKey: "AIzaSyBold_lXv7eDFEAeZSuXjGa_6ApulM2N3Q",
  authDomain: "movify-dae45.firebaseapp.com",
  projectId: "movify-dae45",
  storageBucket: "movify-dae45.firebasestorage.app",
  messagingSenderId: "443872765883",
  appId: "1:443872765883:web:3d5d6bc6553ae9733ac69e"
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/vite.svg'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
