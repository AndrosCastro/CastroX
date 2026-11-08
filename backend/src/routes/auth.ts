import { Router } from 'express';
import sql from 'mssql';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { getPool } from '../db';
import { requireAuth, signToken, type AuthUser } from '../auth';
import { HttpError } from '../errors';

const router = Router();

const loginSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

router.post('/login', async (req, res) => {
  const { username, password } = loginSchema.parse(req.body);
  const r = await getPool()
    .request()
    .input('u', sql.NVarChar(50), username)
    .query('SELECT Id, Username, FullName, PasswordHash, Role, Active FROM dbo.Users WHERE Username = @u');
  const row = r.recordset[0];
  if (!row || !(await bcrypt.compare(password, row.PasswordHash))) {
    throw new HttpError(401, 'Usuario o contraseña incorrectos');
  }
  if (!row.Active) throw new HttpError(403, 'Este usuario está desactivado');
  const user: AuthUser = { id: row.Id, username: row.Username, fullName: row.FullName, role: row.Role };
  res.json({ token: signToken(user), user });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1, 'Escribe tu contraseña actual'),
  newPassword: z.string().min(6, 'La nueva contraseña debe tener al menos 6 caracteres').max(100),
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
  res.json({ ok: true });
});

export default router;
