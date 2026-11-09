import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query } from '../db';
import { requireAdmin, requireAuth } from '../auth';
import { HttpError } from '../errors';

const router = Router();
router.use(requireAuth, requireAdmin);

const createSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3)
    .max(50)
    .regex(/^[a-zA-Z0-9._-]+$/, 'El usuario solo puede tener letras, números, punto, guion y guion bajo'),
  fullName: z.string().trim().min(1).max(100),
  password: z.string().min(6).max(100),
  role: z.enum(['admin', 'operador']),
});

const updateSchema = z.object({
  fullName: z.string().trim().min(1).max(100),
  role: z.enum(['admin', 'operador']),
  active: z.boolean(),
  password: z
    .string()
    .max(100)
    .optional()
    .transform((v) => v || undefined)
    .refine((v) => v === undefined || v.length >= 6, 'La contraseña debe tener al menos 6 caracteres'),
});

router.get('/', async (_req, res) => {
  const r = await query(`
    SELECT u.Id AS id, u.Username AS username, u.FullName AS "fullName", u.Role AS role, u.Active AS active, u.CreatedAt AS "createdAt",
           (SELECT COUNT(*) FROM Movements m WHERE m.UserId = u.Id) AS movements
    FROM Users u ORDER BY u.Username`);
  res.json(r.rows);
});

router.post('/', async (req, res) => {
  const data = createSchema.parse(req.body);
  const hash = await bcrypt.hash(data.password, 10);
  const r = await query('INSERT INTO Users (Username, FullName, PasswordHash, Role) VALUES (@u, @n, @h, @r) RETURNING Id AS id', {
    u: data.username,
    n: data.fullName,
    h: hash,
    r: data.role,
  });
  res.status(201).json({ id: r.rows[0].id, username: data.username, fullName: data.fullName, role: data.role, active: true });
});

router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const data = updateSchema.parse(req.body);
  if (id === req.user!.id && (data.role !== 'admin' || !data.active)) {
    throw new HttpError(400, 'No puedes quitarte el rol de administrador ni desactivar tu propia cuenta');
  }
  const params: Record<string, unknown> = { id, n: data.fullName, r: data.role, a: data.active };
  let setPassword = '';
  if (data.password) {
    params.h = await bcrypt.hash(data.password, 10);
    setPassword = ', PasswordHash = @h';
  }
  const r = await query(`UPDATE Users SET FullName = @n, Role = @r, Active = @a${setPassword} WHERE Id = @id`, params);
  if (!r.rowCount) throw new HttpError(404, 'Usuario no encontrado');
  res.json({ ok: true });
});

router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user!.id) throw new HttpError(400, 'No puedes eliminar tu propia cuenta');
  const r = await query('DELETE FROM Users WHERE Id = @id', { id });
  if (!r.rowCount) throw new HttpError(404, 'Usuario no encontrado');
  res.json({ ok: true });
});

export default router;
