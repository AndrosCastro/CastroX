import { Router, type Request } from 'express';
import { z } from 'zod';
import { query, transaction, type Params } from '../db';
import { requireAuth } from '../auth';
import { HttpError } from '../errors';
import { escapeLike, nonNegative, optStr, round2, sendCsv } from '../utils';

const router = Router();
router.use(requireAuth);

export const MOVEMENT_SELECT = `
  m.Id AS id, m.ProductId AS "productId", p.Code AS "productCode", p.Name AS "productName", p.Unit AS unit,
  m.Type AS type, m.Quantity AS quantity, m.PreviousQty AS "previousQty", m.NewQty AS "newQty",
  m.Reason AS reason, m.UserId AS "userId", u.FullName AS "userName", m.CreatedAt AS "createdAt"
  FROM Movements m
  JOIN Products p ON p.Id = m.ProductId
  LEFT JOIN Users u ON u.Id = m.UserId`;

const TYPE_LABEL: Record<string, string> = { IN: 'Entrada', OUT: 'Salida', ADJUST: 'Ajuste' };

function buildFilters(req: Request, params: Params): string {
  const where = ['1 = 1'];
  const productId = Number(req.query.productId);
  const type = String(req.query.type ?? '');
  const from = req.query.from ? new Date(String(req.query.from)) : null;
  const to = req.query.to ? new Date(String(req.query.to)) : null;
  const search = String(req.query.search ?? '').trim();

  if (productId > 0) {
    where.push('m.ProductId = @pid');
    params.pid = productId;
  }
  if (['IN', 'OUT', 'ADJUST'].includes(type)) {
    where.push('m.Type = @type');
    params.type = type;
  }
  if (from && !isNaN(from.getTime())) {
    where.push('m.CreatedAt >= @from');
    params.from = from;
  }
  if (to && !isNaN(to.getTime())) {
    where.push('m.CreatedAt < @to');
    params.to = to;
  }
  if (search) {
    where.push('(p.Name ILIKE @s OR p.Code ILIKE @s OR m.Reason ILIKE @s)');
    params.s = `%${escapeLike(search)}%`;
  }
  return where.join(' AND ');
}

router.get('/', async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(500, Math.max(1, Number(req.query.pageSize) || 30));
  const params: Params = { off: (page - 1) * pageSize, ps: pageSize };
  const where = buildFilters(req, params);
  const r = await query(
    `
    SELECT ${MOVEMENT_SELECT.replace('m.Id AS id,', 'm.Id AS id, COUNT(*) OVER() AS total,')}
    WHERE ${where}
    ORDER BY m.CreatedAt DESC, m.Id DESC
    OFFSET @off LIMIT @ps`,
    params,
  );
  const total = r.rows[0]?.total ?? 0;
  const items = r.rows.map(({ total: _t, ...rest }) => rest);
  res.json({ items, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) });
});

router.get('/export.csv', async (req, res) => {
  const params: Params = {};
  const where = buildFilters(req, params);
  const r = await query(`SELECT ${MOVEMENT_SELECT} WHERE ${where} ORDER BY m.CreatedAt DESC, m.Id DESC`, params);
  sendCsv(
    res,
    `castrox-movimientos-${new Date().toISOString().slice(0, 10)}.csv`,
    ['Fecha (UTC)', 'Código', 'Producto', 'Tipo', 'Cantidad', 'Stock anterior', 'Stock nuevo', 'Unidad', 'Motivo', 'Usuario'],
    r.rows.map((m) => [
      m.createdAt, m.productCode, m.productName, TYPE_LABEL[m.type] ?? m.type, m.quantity, m.previousQty, m.newQty, m.unit, m.reason, m.userName,
    ]),
  );
});

const createSchema = z
  .object({
    productId: z.coerce.number().int().positive().optional(),
    code: z.string().trim().max(100).optional(),
    type: z.enum(['IN', 'OUT', 'ADJUST']),
    quantity: nonNegative,
    reason: optStr(255),
  })
  .refine((d) => d.productId || d.code, { message: 'Debes indicar el producto' });

router.post('/', async (req, res) => {
  const data = createSchema.parse(req.body);
  if (data.type !== 'ADJUST' && data.quantity <= 0) throw new HttpError(400, 'La cantidad debe ser mayor a 0');

  const movement = await transaction(async (tx) => {
    // FOR UPDATE bloquea la fila del producto hasta terminar, evitando que dos movimientos simultáneos se pisen
    const found = await query(
      `SELECT Id AS id, Quantity AS quantity, Name AS name FROM Products WHERE ${data.productId ? 'Id = @id' : 'Code = @code'} FOR UPDATE`,
      data.productId ? { id: data.productId } : { code: data.code },
      tx,
    );
    const row = found.rows[0];
    if (!row) throw new HttpError(404, 'Producto no registrado');

    const previous = Number(row.quantity);
    let next: number;
    let delta: number;
    if (data.type === 'IN') {
      next = round2(previous + data.quantity);
      delta = data.quantity;
    } else if (data.type === 'OUT') {
      next = round2(previous - data.quantity);
      delta = data.quantity;
      if (next < 0) throw new HttpError(400, `Stock insuficiente: solo hay ${previous} disponibles de "${row.name}"`);
    } else {
      next = round2(data.quantity);
      delta = round2(next - previous);
    }

    await query('UPDATE Products SET Quantity = @q, UpdatedAt = now() WHERE Id = @id', { id: row.id, q: next }, tx);

    const ins = await query(
      `INSERT INTO Movements (ProductId, Type, Quantity, PreviousQty, NewQty, Reason, UserId)
       VALUES (@pid, @type, @q, @prev, @next, @reason, @uid)
       RETURNING Id AS id`,
      { pid: row.id, type: data.type, q: delta, prev: previous, next, reason: data.reason, uid: req.user!.id },
      tx,
    );

    const m = await query(`SELECT ${MOVEMENT_SELECT} WHERE m.Id = @mid`, { mid: ins.rows[0].id }, tx);
    return m.rows[0];
  });
  res.status(201).json(movement);
});

export default router;
