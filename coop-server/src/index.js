// ACK Rivals VR co-op room server.
// A room is one Durable Object named by its 4-letter code. Two players at most.
// The first player in is the host: their headset runs the enemies and missions.
// Messages are passed straight to the other player. Nothing is stored.
import { DurableObject } from 'cloudflare:workers';

const CODE_RE = /^[BCDFGHJKLMNPQRSTVWXZ]{4}$/;
const MAX_PLAYERS = 2;
const MAX_MSG = 32 * 1024;

function originOk(origin) {
  if (!origin) return false;
  try {
    const u = new URL(origin);
    if (u.protocol === 'https:' && (u.hostname === 'ack-rivals-vr.vercel.app' || /^ack-rivals-vr-[a-z0-9-]+\.vercel\.app$/.test(u.hostname))) return true;
    if (u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1')) return true;
  } catch (e) {}
  return false;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/' || url.pathname === '/health') {
      return new Response('ACK Rivals co-op server is up', { headers: { 'content-type': 'text/plain' } });
    }
    const m = url.pathname.match(/^\/room\/([A-Za-z]{4})$/);
    if (!m) return new Response('Not found', { status: 404 });
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });
    if (!originOk(req.headers.get('Origin'))) return new Response('Forbidden', { status: 403 });
    const code = m[1].toUpperCase();
    if (!CODE_RE.test(code)) return new Response('Bad code', { status: 400 });
    const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
    return stub.fetch(req);
  },
};

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    // Answer keep-alive pings without waking the room.
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"t":"ping"}', '{"t":"pong"}'));
  }

  players() { return this.ctx.getWebSockets(); }

  async fetch(req) {
    const url = new URL(req.url);
    const want = url.searchParams.get('as'); // 'host' makes a room, 'guest' joins one, 'any' comes back after a dropout
    const now = this.players();
    let why = '';
    if (want === 'host' && now.length > 0) why = 'taken';
    else if (want === 'guest' && now.length === 0) why = 'none';
    else if (now.length >= MAX_PLAYERS) why = 'full';

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    if (why) {
      // tell the game why, then hang up (a browser can't read an HTTP error on a WebSocket)
      server.accept();
      server.send(JSON.stringify({ t: 'err', why }));
      server.close(4000, why);
      return new Response(null, { status: 101, webSocket: client });
    }
    const role = now.length === 0 ? 'host' : 'guest';
    this.ctx.acceptWebSocket(server, [role]);
    server.serializeAttachment({ role });
    server.send(JSON.stringify({ t: 'welcome', role, players: now.length + 1 }));
    for (const ws of now) { try { ws.send(JSON.stringify({ t: 'joined', role })); } catch (e) {} }
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, msg) {
    if (typeof msg !== 'string' || msg.length > MAX_MSG) return;
    for (const other of this.players()) {
      if (other !== ws) { try { other.send(msg); } catch (e) {} }
    }
  }

  async webSocketClose(ws) { this.left(ws); }
  async webSocketError(ws) { this.left(ws); }

  left(ws) {
    const who = (ws.deserializeAttachment() || {}).role || 'guest';
    for (const other of this.players()) {
      if (other !== ws) { try { other.send(JSON.stringify({ t: 'left', role: who })); } catch (e) {} }
    }
    try { ws.close(1000, 'bye'); } catch (e) {}
  }
}
