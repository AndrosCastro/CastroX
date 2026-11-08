// Cliente de la API de CastroX
const TOKEN_KEY = 'castrox_token';
const USER_KEY = 'castrox_user';

function safeGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeSet(key, value) {
  try { value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value); } catch { /* sin almacenamiento */ }
}

let memToken = safeGet(TOKEN_KEY);
let memUser = (() => { try { return JSON.parse(safeGet(USER_KEY) || 'null'); } catch { return null; } })();

export const auth = {
  get token() { return memToken; },
  get user() { return memUser; },
  get isAdmin() { return memUser?.role === 'admin'; },
  save(token, user) {
    memToken = token; memUser = user;
    safeSet(TOKEN_KEY, token); safeSet(USER_KEY, JSON.stringify(user));
  },
  clear() {
    memToken = null; memUser = null;
    safeSet(TOKEN_KEY, null); safeSet(USER_KEY, null);
  },
};

export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export async function api(path, { method = 'GET', body, raw = false } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth.token) headers.Authorization = `Bearer ${auth.token}`;

  let res;
  try {
    res = await fetch(`/api${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError(0, 'No hay conexión con el servidor');
  }

  if (res.status === 401 && !path.startsWith('/auth/login')) {
    auth.clear();
    if (location.hash !== '#/login') location.hash = '#/login';
    throw new ApiError(401, 'Tu sesión expiró, inicia sesión de nuevo');
  }
  if (raw) {
    if (!res.ok) throw new ApiError(res.status, `Error ${res.status}`);
    return res;
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.error || `Error ${res.status}`);
  return data;
}

export const qs = (params) => {
  const s = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') s.set(k, v); });
  const str = s.toString();
  return str ? `?${str}` : '';
};

export async function download(path, fallbackName) {
  const res = await api(path, { raw: true });
  const cd = res.headers.get('Content-Disposition') || '';
  const name = /filename="?([^"]+)"?/.exec(cd)?.[1] || fallbackName;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const qrUrl = (text, size = 300) => `/api/qr?text=${encodeURIComponent(text)}&size=${size}`;
