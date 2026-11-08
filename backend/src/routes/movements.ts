import { Router, type Request } from 'express';
import sql from 'mssql';
import { z } from 'zod';
import { getPool } from '../db';
import { requireAuth } from '../auth';
import { HttpError } from '../errors';
import { escapeLike, nonNegative, optStr, round2, sendCsv } from '../utils';

const router = Router();
router.use(requireAuth);

export const MOVEMENT_SELECT = `
  m.Id AS id, m.ProductId AS productId, p.Code AS productCode, p.Name AS productName, p.Unit AS unit,
  m.Type AS type, m.Quantity AS quantity, m.PreviousQty AS previousQty, m.NewQty AS newQty,
  m.Reason AS reason, m.UserId AS userId, u.FullName AS userName, m.CreatedAt AS createdAt
  FROM dbo.Movements m
  JOIN dbo.Products p ON p.Id = m.ProductId
  LEFT JOIN dbo.Users u ON u.Id = m.UserId`;

const TYPE_LABEL: Record<string, string> = { IN: 'Entrada', OUT: 'Salida', ADJUST: 'Ajuste' };

function buildFilters(req: Request, request: sql.Request): string {
  const where = ['1 = 1'];
  const productId = Number(req.query.productId);
  const type = String(req.query.type ?? '');
  const from = req.query.from ? new Date(String(req.query.from)) : null;
  const to = req.query.to ? new Date(String(req.query.to)) : null;
  const search = String(req.query.search ?? '').trim();

  if (productId > 0) {
    where.push('m.ProductId = @pid');
    request.input('pid', sql.Int, productId);
  }
  if (['IN', 'OUT', 'ADJUST'].includes(type)) {
    where.push('m.Type = @type');
    request.input('type', sql.NVarChar(10), type);
  }
  if (from && !isNaN(from.getTime())) {
    where.push('m.CreatedAt >= @from');
    request.input('from', sql.DateTime2, from);
  }
  if (to && !isNaN(to.getTime())) {
    where.push('m.CreatedAt < @to');
    request.input('to', sql.DateTime2, to);
  }
  if (search) {
    where.push('(p.Name LIKE @s OR p.Code LIKE @s OR m.Reason LIKE @s)');
    request.input('s', sql.NVarChar(200), `%${escapeLike(search)}%`);
  }
  return where.join(' AND ');
}

router.get('/', async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(500, Math.max(1, Number(req.query.pageSize) || 30));
  const request = getPool().request();
  const where = buildFilters(req, request);
  request.input('off', sql.Int, (page - 1) * pageSize).input('ps', sql.Int, pageSize);
  const r = await request.query(`
    SELECT ${MOVEMENT_SELECT.replace('m.Id AS id,', 'm.Id AS id, COUNT(*) OVER() AS total,')}
    WHERE ${where}
    ORDER BY m.CreatedAt DESC, m.Id DESC
    OFFSET @off ROWS FETCH NEXT @ps ROWS ONLY`);
  const total = r.recordset[0]?.total ?? 0;
  const items = r.recordset.map(({ total: _t, ...rest }) => rest);
  res.json({ items, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) });
});

router.get('/export.csv', async (req, res) => {
  const request = getPool().request();
  const where = buildFilters(req, request);
  const r = await request.query(`SELECT ${MOVEMENT_SELECT} WHERE ${where} ORDER BY m.CreatedAt DESC, m.Id DESC`);
  sendCsv(
    res,
    `castrox-movimientos-${new Date().toISOString().slice(0, 10)}.csv`,
    ['Fecha (UTC)', 'Código', 'Producto', 'Tipo', 'Cantidad', 'Stock anterior', 'Stock nuevo', 'Unidad', 'Motivo', 'Usuario'],
    r.recordset.map((m) => [
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

  const pool = getPool();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const lookup = new sql.Request(tx);
    let where: string;
    if (data.productId) {
      lookup.input('id', sql.Int, data.productId);
      where = 'Id = @id';
    } else {
      lookup.input('code', sql.NVarChar(100), data.code);
      where = 'Code = @code';
    }
    const found = await lookup.query(`SELECT Id, Quantity, Name FROM dbo.Products WITH (UPDLOCK, ROWLOCK) WHERE ${where}`);
    const row = found.recordset[0];
    if (!row) throw new HttpError(404, 'Producto no registrado');

    const previous = Number(row.Quantity);
    let next: number;
    let delta: number;
    if (data.type === 'IN') {
      next = round2(previous + data.quantity);
      delta = data.quantity;
    } else if (data.type === 'OUT') {
      next = round2(previous - data.quantity);
      delta = data.quantity;
      if (next < 0) throw new HttpError(400, `Stock insuficiente: solo hay ${previous} disponibles de "${row.Name}"`);
    } else {
      next = round2(data.quantity);
      delta = round2(next - previous);
    }

    await new sql.Request(tx)
      .input('id', sql.Int, row.Id)
      .input('q', sql.Decimal(18, 2), next)
      .query('UPDATE dbo.Products SET Quantity = @q, UpdatedAt = SYSUTCDATETIME() WHERE Id = @id');

    const ins = await new sql.Request(tx)
      .input('pid', sql.Int, row.Id)
      .input('type', sql.NVarChar(10), data.type)
      .input('q', sql.Decimal(18, 2), delta)
      .input('prev', sql.Decimal(18, 2), previous)
      .input('next', sql.Decimal(18, 2), next)
      .input('reason', sql.NVarChar(255), data.reason)
      .input('uid', sql.Int, req.user!.id)
      .query(`
        INSERT INTO dbo.Movements (ProductId, Type, Quantity, PreviousQty, NewQty, Reason, UserId)
        OUTPUT INSERTED.Id AS id
        VALUES (@pid, @type, @q, @prev, @next, @reason, @uid)`);

    const movement = await new sql.Request(tx).input('mid', sql.Int, ins.recordset[0].id).query(`SELECT ${MOVEMENT_SELECT} WHERE m.Id = @mid`);
    await tx.commit();
    res.status(201).json(movement.recordset[0]);
  } catch (err) {
    await tx.rollback().catch(() => undefined);
    throw err;
  }
});

export default router;
