const MAX_ID_LENGTH = 128;
const MAX_FRIENDS = 500;
const FIREBASE_DATABASE_URL = 'https://zeweil-chat-default-rtdb.europe-west1.firebasedatabase.app';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'content-type',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
    },
  });
}

function cleanId(value) {
  const id = String(value || '').trim();
  return id && id.length <= MAX_ID_LENGTH && /^[A-Za-z0-9_-]+$/.test(id) ? id : '';
}

function base64UrlBytes(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlText(text) {
  return base64UrlBytes(new TextEncoder().encode(text));
}

function pemToBytes(pem) {
  const base64 = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '');
  const binary = atob(base64);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

async function getGoogleAccessToken(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlText(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64UrlText(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging https://www.googleapis.com/auth/firebase.database',
    aud: GOOGLE_TOKEN_URL,
    iat: now,
    exp: now + 3600,
  }));
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToBytes(serviceAccount.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(`${header}.${claim}`),
  );
  const assertion = `${header}.${claim}.${base64UrlBytes(new Uint8Array(signature))}`;
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) throw new Error(`Google token request failed: ${response.status}`);
  return data.access_token;
}

async function firebaseGet(path, accessToken) {
  const response = await fetch(`${FIREBASE_DATABASE_URL}/${path}.json?access_token=${encodeURIComponent(accessToken)}`);
  if (!response.ok) throw new Error(`Firebase read failed: ${response.status}`);
  return response.json();
}

async function sendFriendOnlinePush(userId, senderName, env) {
  if (!env.FIREBASE_SERVICE_ACCOUNT) return;
  const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
  const accessToken = await getGoogleAccessToken(serviceAccount);
  const friends = await firebaseGet(`users/${encodeURIComponent(userId)}/friends`, accessToken) || {};
  const senderText = `${senderName || 'صديقك'} متصل الآن`;
  const fcmUrl = `https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`;

  await Promise.all(Object.keys(friends).map(async friendId => {
    const tokenEntries = await firebaseGet(`users/${encodeURIComponent(friendId)}/fcmTokens`, accessToken) || {};
    const tokens = Object.values(tokenEntries)
      .map(item => typeof item === 'string' ? item : item && item.token)
      .filter(Boolean)
      .slice(0, 20);
    await Promise.all(tokens.map(token => fetch(fcmUrl, {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ message: {
        token,
        notification: { title: 'صديقك متصل الآن', body: senderText },
        data: { type: 'friend_online', senderId: userId, senderName: senderName || 'صديقك', timestamp: String(Date.now()) },
        android: { priority: 'high', notification: { channel_id: 'zeweil-online', sound: 'default' } },
      } }),
    })));
  }));
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return json({ ok: true });
    const url = new URL(request.url);
    if (url.pathname === '/health') return json({ ok: true, service: 'zeweil-online-push', fcm: !!env.FIREBASE_SERVICE_ACCOUNT });
    if (url.pathname !== '/connect' || request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return json({ error: 'WebSocket endpoint. استخدم /connect.' }, 426);
    }
    const id = env.PRESENCE_HUB.idFromName('global');
    return env.PRESENCE_HUB.get(id).fetch(request);
  },
};

export class PresenceHub {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Map();
    this.onlineUsers = new Set();
    this.lastFcmNotify = new Map();
  }

  async fetch(request) {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    const session = { socket: server, userId: '', friendIds: new Set() };
    this.sessions.set(server, session);
    server.addEventListener('message', event => {
      this.handleMessage(session, event.data).catch(() => {
        try { server.send(JSON.stringify({ type: 'error', message: 'طلب غير صالح.' })); } catch (_) {}
      });
    });
    server.addEventListener('close', () => this.removeSession(session));
    server.addEventListener('error', () => this.removeSession(session));
    return new Response(null, { status: 101, webSocket: client });
  }

  async handleMessage(session, raw) {
    const payload = JSON.parse(String(raw || '{}'));
    const userId = cleanId(payload.userId);
    if (!userId) throw new Error('invalid user');
    session.userId = userId;
    session.senderName = String(payload.senderName || 'صديقك').slice(0, 80);
    session.friendIds = new Set(Array.isArray(payload.friendIds) ? payload.friendIds.map(cleanId).filter(Boolean).slice(0, MAX_FRIENDS) : []);

    if (!this.onlineUsers.has(userId)) {
      this.onlineUsers.add(userId);
      this.broadcastToInterested(userId, { type: 'friend_online', senderId: userId, timestamp: Date.now() });
      const last = this.lastFcmNotify.get(userId) || 0;
      if (Date.now() - last > 30000) {
        this.lastFcmNotify.set(userId, Date.now());
        this.state.waitUntil(sendFriendOnlinePush(userId, session.senderName, this.env).catch(error => console.error('FCM send failed', error.message)));
      }
    }

    for (const friendId of session.friendIds) {
      if (this.onlineUsers.has(friendId)) this.send(session.socket, { type: 'friend_online', senderId: friendId, timestamp: Date.now() });
    }
    this.send(session.socket, { type: 'ready', onlineFriendIds: [...this.onlineUsers].filter(id => session.friendIds.has(id)) });
  }

  broadcastToInterested(senderId, message) {
    for (const session of this.sessions.values()) {
      if (session.userId && session.userId !== senderId && session.friendIds.has(senderId)) this.send(session.socket, message);
    }
  }

  send(socket, message) {
    try { socket.send(JSON.stringify(message)); } catch (_) {}
  }

  removeSession(session) {
    if (!this.sessions.delete(session.socket)) return;
    const userId = session.userId;
    if (!userId) return;
    const stillConnected = [...this.sessions.values()].some(item => item.userId === userId);
    if (!stillConnected && this.onlineUsers.delete(userId)) {
      this.broadcastToInterested(userId, { type: 'friend_offline', senderId: userId, timestamp: Date.now() });
    }
  }
}
