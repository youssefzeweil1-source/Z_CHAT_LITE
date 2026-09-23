const { onValueCreated } = require('firebase-functions/v2/database');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const { getMessaging } = require('firebase-admin/messaging');
const {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} = require('@simplewebauthn/server');

initializeApp();

const PASSKEY_RP_ID = process.env.PASSKEY_RP_ID || 'zeweil-chat.web.app';
const PASSKEY_ORIGIN = process.env.PASSKEY_ORIGIN || `https://${PASSKEY_RP_ID}`;
const PASSKEY_REGION = 'europe-west1';

function requireAuth(request) {
  if (!request.auth || !request.auth.uid) throw new HttpsError('unauthenticated', 'سجل دخولك أولاً.');
  return request.auth.uid;
}

function safeRoomName(value) {
  const room = String(value || '').trim();
  if (!room || room.length > 64 || /[.#$\[\]/]/.test(room)) throw new HttpsError('invalid-argument', 'اسم الغرفة غير صالح.');
  return room;
}

function passkeyRef(room, uid) {
  return getDatabase().ref(`roomPasskeys/${room}/${uid}`);
}

async function requireRoomMember(room, uid) {
  const roomData = (await getDatabase().ref(`rooms/${room}`).get()).val();
  if (!roomData) throw new HttpsError('not-found', 'الغرفة غير موجودة.');
  if (!roomData.members || !roomData.members[uid]) throw new HttpsError('permission-denied', 'هذه الميزة متاحة لأعضاء الغرفة فقط.');
  return roomData;
}

exports.startRoomPasskeyRegistration = onCall({ region: PASSKEY_REGION }, async (request) => {
  const uid = requireAuth(request);
  const room = safeRoomName(request.data && request.data.room);
  await requireRoomMember(room, uid);
  const user = (await getDatabase().ref(`users/${uid}`).get()).val() || {};
  const existing = (await passkeyRef(room, uid).child('credentials').get()).val() || {};
  const options = await generateRegistrationOptions({
    rpName: 'ZEWEIL CHAT', rpID: PASSKEY_RP_ID,
    userName: String(user.email || user.name || uid), userID: uid,
    attestationType: 'none',
    excludeCredentials: Object.values(existing).map(item => ({ id: item.credentialID, transports: item.transports || [] })),
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
  });
  await passkeyRef(room, uid).child('challenge').set({ value: options.challenge, expiresAt: Date.now() + 5 * 60 * 1000 });
  return options;
});

exports.finishRoomPasskeyRegistration = onCall({ region: PASSKEY_REGION }, async (request) => {
  const uid = requireAuth(request);
  const room = safeRoomName(request.data && request.data.room);
  await requireRoomMember(room, uid);
  const challenge = (await passkeyRef(room, uid).child('challenge').get()).val() || {};
  if (!challenge.value || challenge.expiresAt < Date.now()) throw new HttpsError('failed-precondition', 'انتهت صلاحية طلب Passkey.');
  const verification = await verifyRegistrationResponse({ response: request.data.credential, expectedChallenge: challenge.value, expectedOrigin: PASSKEY_ORIGIN, expectedRPID: PASSKEY_RP_ID });
  if (!verification.verified || !verification.registrationInfo) throw new HttpsError('permission-denied', 'تعذر التحقق من Passkey.');
  const { credential } = verification.registrationInfo;
  await passkeyRef(room, uid).child(`credentials/${credential.id}`).set({
    credentialID: credential.id, publicKey: Buffer.from(credential.publicKey).toString('base64url'), counter: credential.counter,
    transports: request.data.credential.response.transports || [], createdAt: Date.now(),
  });
  await passkeyRef(room, uid).child('challenge').remove();
  return { verified: true };
});

exports.startRoomPasskeyAuthentication = onCall({ region: PASSKEY_REGION }, async (request) => {
  const uid = requireAuth(request);
  const room = safeRoomName(request.data && request.data.room);
  const credentials = (await passkeyRef(room, uid).child('credentials').get()).val() || {};
  const options = await generateAuthenticationOptions({ rpID: PASSKEY_RP_ID, userVerification: 'required', allowCredentials: Object.values(credentials).map(item => ({ id: item.credentialID, transports: item.transports || [] })) });
  await passkeyRef(room, uid).child('challenge').set({ value: options.challenge, expiresAt: Date.now() + 5 * 60 * 1000 });
  return options;
});

exports.finishRoomPasskeyAuthentication = onCall({ region: PASSKEY_REGION }, async (request) => {
  const uid = requireAuth(request);
  const room = safeRoomName(request.data && request.data.room);
  const challenge = (await passkeyRef(room, uid).child('challenge').get()).val() || {};
  const credentialID = String(request.data && request.data.credential && request.data.credential.id || '');
  const stored = (await passkeyRef(room, uid).child(`credentials/${credentialID}`).get()).val();
  if (!stored || !challenge.value || challenge.expiresAt < Date.now()) throw new HttpsError('failed-precondition', 'تعذر التحقق من Passkey.');
  const verification = await verifyAuthenticationResponse({ response: request.data.credential, expectedChallenge: challenge.value, expectedOrigin: PASSKEY_ORIGIN, expectedRPID: PASSKEY_RP_ID, credential: { id: stored.credentialID, publicKey: Buffer.from(stored.publicKey, 'base64url'), counter: stored.counter, transports: stored.transports || [] } });
  if (!verification.verified) throw new HttpsError('permission-denied', 'تعذر التحقق من Passkey.');
  await passkeyRef(room, uid).child(`credentials/${credentialID}/counter`).set(verification.authenticationInfo.newCounter);
  await passkeyRef(room, uid).child('challenge').remove();
  return { verified: true };
});

exports.setRoomBiometricLock = onCall({ region: PASSKEY_REGION }, async (request) => {
  const uid = requireAuth(request);
  const room = safeRoomName(request.data && request.data.room);
  const roomData = await requireRoomMember(room, uid);
  if (roomData.createdBy !== uid) throw new HttpsError('permission-denied', 'منشئ الغرفة فقط يمكنه تغيير القفل البيومتري.');
  await getDatabase().ref(`rooms/${room}/settings/biometricLock`).set({ enabled: request.data.enabled === true, updatedAt: Date.now(), updatedBy: uid });
  return { enabled: request.data.enabled === true };
});

exports.notifyFriendChatMessage = onValueCreated(
  { ref: '/friendChats/{chatId}/messages/{messageId}', region: 'europe-west1' },
  async (event) => {
    const message = event.data.val() || {};
    const chatId = String(event.params.chatId || '');
    const senderId = String(message.senderId || '');
    const messageId = String(event.params.messageId || '');
    if (!senderId || !chatId || !message.text) return null;

    const participants = chatId.split('__').filter(Boolean);
    const recipientId = participants.find((id) => id !== senderId);
    if (!recipientId) return null;

    const snapshot = await getDatabase().ref(`users/${recipientId}/fcmTokens`).get();
    const tokenEntries = snapshot.val() || {};
    const tokens = Object.values(tokenEntries)
      .map((item) => typeof item === 'string' ? item : item && item.token)
      .filter(Boolean);
    if (!tokens.length) return null;

    const senderName = String(message.senderName || 'صديقك');
    const response = await getMessaging().sendEachForMulticast({
      tokens,
      data: {
        title: '💬 رسالة خاصة جديدة',
        body: `${senderName}: ${String(message.text).slice(0, 180)}`,
        senderId,
        senderName,
        chatId,
        messageId,
        timestamp: String(message.timestamp || Date.now()),
        icon: 'friend-chat-notification.svg',
        badge: 'friend-chat-notification.svg',
        url: './Test.html'
      }
    });

    const staleTokens = [];
    response.responses.forEach((result, index) => {
      const code = result.error && result.error.code;
      if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') {
        staleTokens.push(tokens[index]);
      }
    });
    if (staleTokens.length) {
      const cleanup = {};
      Object.entries(tokenEntries).forEach(([key, item]) => {
        const token = typeof item === 'string' ? item : item && item.token;
        if (staleTokens.includes(token)) cleanup[key] = null;
      });
      await getDatabase().ref(`users/${recipientId}/fcmTokens`).update(cleanup);
    }
    return null;
  }
);
