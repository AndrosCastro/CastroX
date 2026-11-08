import { Router } from 'express';
import sql from 'mssql';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { getPool } from '../db';
import { DEFAULT_PASSWORD, requireAuth, signToken, type AuthUser } from '../auth';
import { HttpError } from '../errors';

const router = Router();

// ---- Límite de intentos fallidos por IP (protección contra fuerza bruta) ----
const MAX_FAILS = 10;
const WINDOW_MS = 15 * 60 * 1000;
const failures = new Map<string, { count: number; until: number }>();

function assertNotLocked(ip: string) {
  const f = failures.get(ip);
  if (f && f.until > Date.now() && f.count >= MAX_FAILS) {
    const min = Math.ceil((f.until - Date.now()) / 60000);
    throw new HttpError(429, `Demasiados intentos fallidos. Espera ${min} minuto(s) e inténtalo de nuevo.`);
  }
}
function registerFailure(ip: string) {
  const now = Date.now();
  const f = failures.get(ip);
  if (!f || f.until < now) failures.set(ip, { count: 1, until: now + WINDOW_MS });
  else f.count++;
  if (failures.size > 10000) {
    for (const [k, v] of failures) if (v.until < now) failures.delete(k);
  }
}

const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

router.post('/login', async (req, res) => {
  const { username, password } = loginSchema.parse(req.body);
  const ip = `${req.ip || 'unknown'}|${username.toLowerCase()}`;
  assertNotLocked(ip);
  const r = await getPool()
    .request()
    .input('u', sql.NVarChar(50), username)
    .query('SELECT Id, Username, FullName, PasswordHash, Role, Active FROM dbo.Users WHERE Username = @u');
  const row = r.recordset[0];
  if (!row || !(await bcrypt.compare(password, row.PasswordHash))) {
    registerFailure(ip);
    throw new HttpError(401, 'Usuario o contraseña incorrectos');
  }
  if (!row.Active) throw new HttpError(403, 'Este usuario está desactivado');
  failures.delete(ip);
  const user: AuthUser = { id: row.Id, username: row.Username, fullName: row.FullName, role: row.Role };
  if (password === DEFAULT_PASSWORD) user.mustChangePassword = true;
  res.json({ token: signToken(user), user });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1, 'Escribe tu contraseña actual'),
  newPassword: z
    .string()
    .min(6, 'La nueva contraseña debe tener al menos 6 caracteres')
    .max(100)
    .refine((v) => v !== DEFAULT_PASSWORD, 'Elige una contraseña distinta a la inicial'),
});

router.put('/password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = passwordSchema.parse(req.body);
  const pool = getPool();
  const r = await pool.request().input('id', sql.Int, req.user!.id).query('SELECT PasswordHash FROM dbo.Users WHERE Id = @id');
  const row = r.recordset[0];
  if (!row || !(await bcrypt.compare(currentPassword, row.PasswordHash))) {
    throw new HttpError(400, 'La contraseña actual no es correcta');
  }
  const hash = await bcrypt.hash(newPassword, 10);
  await pool.request().input('id', sql.Int, req.user!.id).input('h', sql.NVarChar(200), hash).query('UPDATE dbo.Users SET PasswordHash = @h WHERE Id = @id');
  // Nuevo token sin la marca de "debe cambiar contraseña"
  const { mustChangePassword: _m, ...user } = req.user!;
  res.json({ ok: true, token: signToken(user), user });
});

export default router;
