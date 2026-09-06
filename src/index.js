// COSMART IA — Worker (ia.cosmart.com.ar)
//
// KV Namespaces:
//   IA_USERS    → cuentas de usuario (email -> {nombre, email, rol, salt, hash, archivos: [...]})
//   IA_SESSIONS → tokens de sesión (30 días, TTL nativo de KV)
// R2 Buckets:
//   IA_PERFILES → fotos/videos/audios subidos por cada perfil
// Secrets (Cloudflare Worker → Settings → Variables and Secrets, NUNCA acá):
//   SETUP_SECRET → string random para poder crear las cuentas iniciales (Vaneh, Ger)
//
// Roles: "admin" (Vaneh, Ger) = sin límite de storage/generaciones (ver HANDOFF.md).
// Los perfiles NUNCA se comparten entre usuarios, ni siquiera entre dos admins:
// cada quien sube y ve solo sus propias fotos/videos/audios.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};
const JSON_H = { 'Content-Type': 'application/json', ...CORS };
const ok = d => new Response(JSON.stringify(d), { headers: JSON_H });
const err = (msg, s = 400) => new Response(JSON.stringify({ error: msg }), { status: s, headers: JSON_H });

const SESSION_TTL_SEG = 60 * 60 * 24 * 30; // 30 días

const TIPOS_VALIDOS = ['foto', 'video', 'audio'];
const MIME_POR_TIPO = {
  foto: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'],
  video: ['video/mp4', 'video/quicktime', 'video/webm'],
  audio: ['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-m4a', 'audio/ogg'],
};

// ── Crypto (mismo esquema que marketing-hub: HMAC-SHA256 con salt) ──
async function hashPwd(password, salt) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(password),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(salt));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}
function randomToken() {
  return crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
}
function normalizarEmail(email) {
  return String(email || '').toLowerCase().trim();
}

async function getUser(env, email) {
  const raw = await env.IA_USERS.get(normalizarEmail(email));
  return raw ? JSON.parse(raw) : null;
}
async function putUser(env, user) {
  await env.IA_USERS.put(user.email, JSON.stringify(user));
}

async function requireSession(req, env) {
  const auth = req.headers.get('Authorization') || '';
  const token = auth.replace('Bearer ', '').trim();
  if (!token) return null;
  const email = await env.IA_SESSIONS.get(token);
  if (!email) return null;
  return getUser(env, email);
}

// ── Setup inicial (crea las cuentas de Vaneh/Ger — uso único por cuenta) ──
async function handleSetup(req, env) {
  if (!env.SETUP_SECRET) return err('SETUP_SECRET no configurado en el Worker', 500);
  const body = await req.json().catch(() => ({}));
  const { secret, nombre, email, password, rol } = body;
  if (secret !== env.SETUP_SECRET) return err('Secret inválido', 403);
  if (!nombre || !email || !password) return err('Faltan datos (nombre, email, password)');
  if (password.length < 8) return err('La contraseña debe tener al menos 8 caracteres');

  const emailNorm = normalizarEmail(email);
  const existente = await getUser(env, emailNorm);
  if (existente) return err('Ya existe una cuenta con ese email', 409);

  const salt = crypto.randomUUID();
  const hash = await hashPwd(password, salt);
  await putUser(env, {
    email: emailNorm,
    nombre,
    salt,
    hash,
    rol: rol === 'admin' ? 'admin' : 'user',
    creadoEn: Date.now(),
    archivos: [],
  });
  return ok({ creado: true, email: emailNorm });
}

// ── Login / sesión ──
async function handleLogin(req, env) {
  const { email, password } = await req.json().catch(() => ({}));
  if (!email || !password) return err('Faltan datos');
  const user = await getUser(env, email);
  if (!user) return err('Email o contraseña incorrectos', 401);
  const hash = await hashPwd(password, user.salt);
  if (hash !== user.hash) return err('Email o contraseña incorrectos', 401);

  const token = randomToken();
  await env.IA_SESSIONS.put(token, user.email, { expirationTtl: SESSION_TTL_SEG });
  return ok({ token, nombre: user.nombre, email: user.email, rol: user.rol });
}

async function handleLogout(req, env) {
  const auth = req.headers.get('Authorization') || '';
  const token = auth.replace('Bearer ', '').trim();
  if (token) await env.IA_SESSIONS.delete(token);
  return ok({ ok: true });
}

async function handleMe(req, env) {
  const user = await requireSession(req, env);
  if (!user) return err('No autenticado', 401);
  return ok({ nombre: user.nombre, email: user.email, rol: user.rol });
}

// ── Archivos de perfil (fotos/videos/audios) ──
async function handleListarArchivos(req, env) {
  const user = await requireSession(req, env);
  if (!user) return err('No autenticado', 401);
  const archivos = (user.archivos || []).slice().sort((a, b) => b.subidoEn - a.subidoEn);
  return ok({ archivos });
}

async function handleSubirArchivo(req, env) {
  const user = await requireSession(req, env);
  if (!user) return err('No autenticado', 401);

  const form = await req.formData().catch(() => null);
  if (!form) return err('Body inválido, se espera multipart/form-data');
  const tipo = form.get('tipo');
  const file = form.get('archivo');
  if (!TIPOS_VALIDOS.includes(tipo)) return err('Tipo inválido (foto/video/audio)');
  if (!file || typeof file === 'string') return err('Falta el archivo');
  if (!MIME_POR_TIPO[tipo].includes(file.type)) {
    return err(`Formato no soportado para ${tipo}: ${file.type || 'desconocido'}`);
  }

  const id = crypto.randomUUID();
  const extension = (file.name.split('.').pop() || '').toLowerCase();
  const r2Key = `${user.email}/${tipo}/${id}${extension ? '.' + extension : ''}`;

  await env.IA_PERFILES.put(r2Key, file.stream(), {
    httpMetadata: { contentType: file.type },
  });

  const entrada = {
    id,
    tipo,
    r2Key,
    nombreOriginal: file.name,
    tamanoBytes: file.size,
    subidoEn: Date.now(),
  };
  user.archivos = user.archivos || [];
  user.archivos.push(entrada);
  await putUser(env, user);

  return ok({ archivo: entrada });
}

async function handleContenidoArchivo(req, env, id) {
  const user = await requireSession(req, env);
  if (!user) return err('No autenticado', 401);
  const entrada = (user.archivos || []).find(a => a.id === id);
  if (!entrada) return err('No encontrado', 404);
  const obj = await env.IA_PERFILES.get(entrada.r2Key);
  if (!obj) return err('No encontrado en storage', 404);
  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream',
      'Cache-Control': 'private, max-age=3600',
      ...CORS,
    },
  });
}

async function handleBorrarArchivo(req, env, id) {
  const user = await requireSession(req, env);
  if (!user) return err('No autenticado', 401);
  const idx = (user.archivos || []).findIndex(a => a.id === id);
  if (idx === -1) return err('No encontrado', 404);
  const [entrada] = user.archivos.splice(idx, 1);
  await env.IA_PERFILES.delete(entrada.r2Key);
  await putUser(env, user);
  return ok({ ok: true });
}

// ── Router ──
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    try {
      if (pathname === '/api/setup' && request.method === 'POST') return await handleSetup(request, env);
      if (pathname === '/api/login' && request.method === 'POST') return await handleLogin(request, env);
      if (pathname === '/api/logout' && request.method === 'POST') return await handleLogout(request, env);
      if (pathname === '/api/me' && request.method === 'GET') return await handleMe(request, env);
      if (pathname === '/api/archivos' && request.method === 'GET') return await handleListarArchivos(request, env);
      if (pathname === '/api/archivos' && request.method === 'POST') return await handleSubirArchivo(request, env);

      const matchContenido = pathname.match(/^\/api\/archivos\/([a-f0-9-]+)\/contenido$/);
      if (matchContenido && request.method === 'GET') return await handleContenidoArchivo(request, env, matchContenido[1]);

      const matchBorrar = pathname.match(/^\/api\/archivos\/([a-f0-9-]+)$/);
      if (matchBorrar && request.method === 'DELETE') return await handleBorrarArchivo(request, env, matchBorrar[1]);

      if (pathname.startsWith('/api/')) return err('No encontrado', 404);

      // Cualquier otra ruta la sirve el binding de assets estáticos (public/)
      return env.ASSETS.fetch(request);
    } catch (e) {
      console.error(e);
      return err('Error interno', 500);
    }
  },
};
