const MAX_ID_LENGTH = 128;
const MAX_FRIENDS = 500;

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

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return json({ ok: true });
    const url = new URL(request.url);
    if (url.pathname === '/health') return json({ ok: true, service: 'zeweil-online-push' });

    if (url.pathname !== '/connect' || request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return json({ error: 'WebSocket endpoint. استخدم /connect.' }, 426);
    }

    const id = env.PRESENCE_HUB.idFromName('global');
    return env.PRESENCE_HUB.get(id).fetch(request);
  },
};

export class PresenceHub {
  constructor(state) {
    this.state = state;
    this.sessions = new Map();
    this.onlineUsers = new Set();
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

    if (session.userId && session.userId !== userId) this.removeSession(session);
    session.userId = userId;
    session.friendIds = new Set(
      Array.isArray(payload.friendIds)
        ? payload.friendIds.map(cleanId).filter(Boolean).slice(0, MAX_FRIENDS)
        : [],
    );

    if (!this.onlineUsers.has(userId)) {
      this.onlineUsers.add(userId);
      this.broadcastToInterested(userId, {
        type: 'friend_online',
        senderId: userId,
        timestamp: Date.now(),
      });
    }

    for (const friendId of session.friendIds) {
      if (this.onlineUsers.has(friendId)) {
        this.send(session.socket, { type: 'friend_online', senderId: friendId, timestamp: Date.now() });
      }
    }
    this.send(session.socket, { type: 'ready', onlineFriendIds: [...this.onlineUsers].filter(id => session.friendIds.has(id)) });
  }

  broadcastToInterested(senderId, message) {
    for (const session of this.sessions.values()) {
      if (session.userId && session.userId !== senderId && session.friendIds.has(senderId)) {
        this.send(session.socket, message);
      }
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
      this.broadcastToInterested(userId, {
        type: 'friend_offline',
        senderId: userId,
        timestamp: Date.now(),
      });
    }
  }
}
