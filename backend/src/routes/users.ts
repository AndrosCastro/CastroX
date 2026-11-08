import { Router } from 'express';
import sql from 'mssql';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { getPool } from '../db';
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
  const r = await getPool().request().query(`
    SELECT u.Id AS id, u.Username AS username, u.FullName AS fullName, u.Role AS role, u.Active AS active, u.CreatedAt AS createdAt,
           (SELECT COUNT(*) FROM dbo.Movements m WHERE m.UserId = u.Id) AS movements
    FROM dbo.Users u ORDER BY u.Username`);
  res.json(r.recordset);
});

router.post('/', async (req, res) => {
  const data = createSchema.parse(req.body);
  const hash = await bcrypt.hash(data.password, 10);
  const r = await getPool()
    .request()
    .input('u', sql.NVarChar(50), data.username)
    .input('n', sql.NVarChar(100), data.fullName)
    .input('h', sql.NVarChar(200), hash)
    .input('r', sql.NVarChar(20), data.role)
    .query('INSERT INTO dbo.Users (Username, FullName, PasswordHash, Role) OUTPUT INSERTED.Id AS id VALUES (@u, @n, @h, @r)');
  res.status(201).json({ id: r.recordset[0].id, username: data.username, fullName: data.fullName, role: data.role, active: true });
});

router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const data = updateSchema.parse(req.body);
  if (id === req.user!.id && (data.role !== 'admin' || !data.active)) {
    throw new HttpError(400, 'No puedes quitarte el rol de administrador ni desactivar tu propia cuenta');
  }
  const request = getPool()
    .request()
    .input('id', sql.Int, id)
    .input('n', sql.NVarChar(100), data.fullName)
    .input('r', sql.NVarChar(20), data.role)
    .input('a', sql.Bit, data.active);
  let setPassword = '';
  if (data.password) {
    request.input('h', sql.NVarChar(200), await bcrypt.hash(data.password, 10));
    setPassword = ', PasswordHash = @h';
  }
  const r = await request.query(`UPDATE dbo.Users SET FullName = @n, Role = @r, Active = @a${setPassword} WHERE Id = @id`);
  if (!r.rowsAffected[0]) throw new HttpError(404, 'Usuario no encontrado');
  res.json({ ok: true });
});

router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user!.id) throw new HttpError(400, 'No puedes eliminar tu propia cuenta');
  const r = await getPool().request().input('id', sql.Int, id).query('DELETE FROM dbo.Users WHERE Id = @id');
  if (!r.rowsAffected[0]) throw new HttpError(404, 'Usuario no encontrado');
  res.json({ ok: true });
});

export default router;
