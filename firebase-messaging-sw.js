importScripts('https://www.gstatic.com/firebasejs/11.0.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.0.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyAlim9FOvDcMqTJWINoBCHk3k6DNXS-jTo',
  authDomain: 'zeweil-chat.firebaseapp.com',
  databaseURL: 'https://zeweil-chat-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'zeweil-chat',
  storageBucket: 'zeweil-chat.firebasestorage.app',
  messagingSenderId: '79843372176',
  appId: '1:79843372176:web:ea511efffae60c2a6cfc15'
});

const messaging = firebase.messaging();
messaging.onBackgroundMessage(payload => {
  const data = payload.data || payload.notification || {};
  const title = data.title || 'صديقك متصل الآن';
  const body = data.body || `${data.senderName || 'صديقك'} متصل الآن`;
  self.registration.showNotification(title, {
    body,
    icon: 'friend-chat-notification.svg',
    badge: 'friend-chat-notification.svg',
    tag: data.senderId ? `friend-online-${data.senderId}` : 'zeweil-online',
    data
  });
});
