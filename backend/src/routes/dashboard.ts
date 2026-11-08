import { Router } from 'express';
import sql from 'mssql';
import { getPool } from '../db';
import { requireAuth } from '../auth';
import { MOVEMENT_SELECT } from './movements';
import { PRODUCT_COLUMNS, PRODUCT_FROM } from './products';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  // Minutos de diferencia del navegador respecto a UTC (Date.getTimezoneOffset)
  const tz = Math.max(-840, Math.min(840, Number(req.query.tz) || 0));
  const pool = getPool();

  const [totals, today, chart, lowStock, recent, byCategory] = await Promise.all([
    pool.request().query(`
      SELECT COUNT(*) AS totalProducts,
             ISNULL(SUM(Quantity), 0) AS totalUnits,
             ISNULL(SUM(Quantity * Cost), 0) AS inventoryCost,
             ISNULL(SUM(Quantity * Price), 0) AS inventoryValue,
             ISNULL(SUM(CASE WHEN Quantity <= MinStock AND Quantity > 0 THEN 1 ELSE 0 END), 0) AS lowStock,
             ISNULL(SUM(CASE WHEN Quantity <= 0 THEN 1 ELSE 0 END), 0) AS outOfStock,
             (SELECT COUNT(*) FROM dbo.Categories) AS totalCategories
      FROM dbo.Products`),
    pool.request().input('tz', sql.Int, tz).query(`
      SELECT COUNT(*) AS movementsToday,
             ISNULL(SUM(CASE WHEN Type = 'IN' THEN Quantity ELSE 0 END), 0) AS inToday,
             ISNULL(SUM(CASE WHEN Type = 'OUT' THEN Quantity ELSE 0 END), 0) AS outToday
      FROM dbo.Movements
      WHERE CAST(DATEADD(minute, -@tz, CreatedAt) AS DATE) = CAST(DATEADD(minute, -@tz, SYSUTCDATETIME()) AS DATE)`),
    pool.request().input('tz', sql.Int, tz).query(`
      SELECT CONVERT(CHAR(10), CAST(DATEADD(minute, -@tz, CreatedAt) AS DATE), 23) AS day, Type AS type, SUM(ABS(Quantity)) AS qty
      FROM dbo.Movements
      WHERE CreatedAt >= DATEADD(day, -7, SYSUTCDATETIME()) AND Type IN ('IN','OUT')
      GROUP BY CAST(DATEADD(minute, -@tz, CreatedAt) AS DATE), Type`),
    pool.request().query(`SELECT TOP 8 ${PRODUCT_COLUMNS} ${PRODUCT_FROM} WHERE p.Quantity <= p.MinStock ORDER BY p.Quantity - p.MinStock, p.Name`),
    pool.request().query(`SELECT TOP 8 ${MOVEMENT_SELECT} ORDER BY m.CreatedAt DESC, m.Id DESC`),
    pool.request().query(`
      SELECT ISNULL(c.Name, N'Sin categoría') AS name, ISNULL(c.Color, '#94a3b8') AS color,
             COUNT(p.Id) AS products, ISNULL(SUM(p.Quantity), 0) AS units, ISNULL(SUM(p.Quantity * p.Price), 0) AS value
      FROM dbo.Products p LEFT JOIN dbo.Categories c ON c.Id = p.CategoryId
      GROUP BY c.Name, c.Color
      ORDER BY units DESC`),
  ]);

  res.json({
    ...totals.recordset[0],
    ...today.recordset[0],
    chart: chart.recordset,
    lowStockItems: lowStock.recordset,
    recentMovements: recent.recordset,
    byCategory: byCategory.recordset,
  });
});

export default router;
