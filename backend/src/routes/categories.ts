import { Router } from 'express';
import sql from 'mssql';
import { z } from 'zod';
import { getPool } from '../db';
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
  SELECT c.Id AS id, c.Name AS name, c.Description AS description, c.Color AS color, c.CreatedAt AS createdAt,
         COUNT(p.Id) AS productCount, ISNULL(SUM(p.Quantity), 0) AS units
  FROM dbo.Categories c
  LEFT JOIN dbo.Products p ON p.CategoryId = c.Id`;

router.get('/', async (_req, res) => {
  const r = await getPool().request().query(`${SELECT} GROUP BY c.Id, c.Name, c.Description, c.Color, c.CreatedAt ORDER BY c.Name`);
  res.json(r.recordset);
});

router.post('/', async (req, res) => {
  const data = schema.parse(req.body);
  const r = await getPool()
    .request()
    .input('name', sql.NVarChar(80), data.name)
    .input('desc', sql.NVarChar(255), data.description)
    .input('color', sql.NVarChar(7), data.color)
    .query('INSERT INTO dbo.Categories (Name, Description, Color) OUTPUT INSERTED.Id AS id VALUES (@name, @desc, @color)');
  res.status(201).json({ id: r.recordset[0].id, ...data });
});

router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const data = schema.parse(req.body);
  const r = await getPool()
    .request()
    .input('id', sql.Int, id)
    .input('name', sql.NVarChar(80), data.name)
    .input('desc', sql.NVarChar(255), data.description)
    .input('color', sql.NVarChar(7), data.color)
    .query('UPDATE dbo.Categories SET Name = @name, Description = @desc, Color = @color WHERE Id = @id');
  if (!r.rowsAffected[0]) throw new HttpError(404, 'Categoría no encontrada');
  res.json({ id, ...data });
});

router.delete('/:id', requireAdmin, async (req, res) => {
  const r = await getPool().request().input('id', sql.Int, Number(req.params.id)).query('DELETE FROM dbo.Categories WHERE Id = @id');
  if (!r.rowsAffected[0]) throw new HttpError(404, 'Categoría no encontrada');
  res.json({ ok: true });
});

export default router;
