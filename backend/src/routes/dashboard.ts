import { Router } from 'express';
import { query } from '../db';
import { requireAuth } from '../auth';
import { MOVEMENT_SELECT } from './movements';
import { PRODUCT_COLUMNS, PRODUCT_FROM } from './products';

const router = Router();
router.use(requireAuth);

// Fecha local del navegador: hora UTC desplazada por @tz minutos
const localDate = (expr: string) => `((${expr} AT TIME ZONE 'UTC') - @tz::int * INTERVAL '1 minute')::date`;

router.get('/', async (req, res) => {
  // Minutos de diferencia del navegador respecto a UTC (Date.getTimezoneOffset)
  const tz = Math.trunc(Math.max(-840, Math.min(840, Number(req.query.tz) || 0)));

  const [totals, today, chart, lowStock, recent, byCategory] = await Promise.all([
    query(`
      SELECT COUNT(*) AS "totalProducts",
             COALESCE(SUM(Quantity), 0) AS "totalUnits",
             COALESCE(SUM(Quantity * Cost), 0) AS "inventoryCost",
             COALESCE(SUM(Quantity * Price), 0) AS "inventoryValue",
             COALESCE(SUM(CASE WHEN Quantity <= MinStock AND Quantity > 0 THEN 1 ELSE 0 END), 0) AS "lowStock",
             COALESCE(SUM(CASE WHEN Quantity <= 0 THEN 1 ELSE 0 END), 0) AS "outOfStock",
             (SELECT COUNT(*) FROM Categories) AS "totalCategories"
      FROM Products`),
    query(
      `
      SELECT COUNT(*) AS "movementsToday",
             COALESCE(SUM(CASE WHEN Type = 'IN' THEN Quantity ELSE 0 END), 0) AS "inToday",
             COALESCE(SUM(CASE WHEN Type = 'OUT' THEN Quantity ELSE 0 END), 0) AS "outToday"
      FROM Movements
      WHERE ${localDate('CreatedAt')} = ${localDate('now()')}`,
      { tz },
    ),
    query(
      `
      SELECT to_char(${localDate('CreatedAt')}, 'YYYY-MM-DD') AS day, Type AS type, SUM(ABS(Quantity)) AS qty
      FROM Movements
      WHERE CreatedAt >= now() - INTERVAL '7 days' AND Type IN ('IN','OUT')
      GROUP BY 1, 2`,
      { tz },
    ),
    query(`SELECT ${PRODUCT_COLUMNS} ${PRODUCT_FROM} WHERE p.Quantity <= p.MinStock ORDER BY p.Quantity - p.MinStock, p.Name LIMIT 8`),
    query(`SELECT ${MOVEMENT_SELECT} ORDER BY m.CreatedAt DESC, m.Id DESC LIMIT 8`),
    query(`
      SELECT COALESCE(c.Name, 'Sin categoría') AS name, COALESCE(c.Color, '#94a3b8') AS color,
             COUNT(p.Id) AS products, COALESCE(SUM(p.Quantity), 0) AS units, COALESCE(SUM(p.Quantity * p.Price), 0) AS value
      FROM Products p LEFT JOIN Categories c ON c.Id = p.CategoryId
      GROUP BY c.Name, c.Color
      ORDER BY units DESC`),
  ]);

  res.json({
    ...totals.rows[0],
    ...today.rows[0],
    chart: chart.rows,
    lowStockItems: lowStock.rows,
    recentMovements: recent.rows,
    byCategory: byCategory.rows,
  });
});

export default router;
