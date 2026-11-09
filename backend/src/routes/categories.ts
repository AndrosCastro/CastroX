import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db';
import { requireAdmin, requireAuth } from '../auth';
import { HttpError } from '../errors';
import { optStr } from '../utils';

const router = Router();
router.use(requireAuth);

const schema = z.object({
  name: z.string().trim().min(1).max(80),
  description: optStr(255),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, 'El color debe tener formato #RRGGBB')
    .optional()
    .transform((v) => v || '#6366f1'),
});

const SELECT = `
  SELECT c.Id AS id, c.Name AS name, c.Description AS description, c.Color AS color, c.CreatedAt AS "createdAt",
         COUNT(p.Id) AS "productCount", COALESCE(SUM(p.Quantity), 0) AS units
  FROM Categories c
  LEFT JOIN Products p ON p.CategoryId = c.Id`;

router.get('/', async (_req, res) => {
  const r = await query(`${SELECT} GROUP BY c.Id, c.Name, c.Description, c.Color, c.CreatedAt ORDER BY c.Name`);
  res.json(r.rows);
});

router.post('/', async (req, res) => {
  const data = schema.parse(req.body);
  const r = await query('INSERT INTO Categories (Name, Description, Color) VALUES (@name, @desc, @color) RETURNING Id AS id', {
    name: data.name,
    desc: data.description,
    color: data.color,
  });
  res.status(201).json({ id: r.rows[0].id, ...data });
});

router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const data = schema.parse(req.body);
  const r = await query('UPDATE Categories SET Name = @name, Description = @desc, Color = @color WHERE Id = @id', {
    id,
    name: data.name,
    desc: data.description,
    color: data.color,
  });
  if (!r.rowCount) throw new HttpError(404, 'Categoría no encontrada');
  res.json({ id, ...data });
});

router.delete('/:id', requireAdmin, async (req, res) => {
  const r = await query('DELETE FROM Categories WHERE Id = @id', { id: Number(req.params.id) });
  if (!r.rowCount) throw new HttpError(404, 'Categoría no encontrada');
  res.json({ ok: true });
});

export default router;
