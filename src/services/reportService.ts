import type { Request } from 'express';
import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { ROLES } from '../constants/roles';
import { currentUser } from '../middleware/authenticate';

function effectiveBranchId(req: Request, queryBranchId?: string): string | undefined {
  const user = currentUser(req);
  if (user.role !== ROLES.SUPER_ADMIN) return user.branchId ?? undefined;
  return queryBranchId;
}

export async function getSalesTrend(req: Request, branchId?: string, days = 7): Promise<object[]> {
  const bid = effectiveBranchId(req, branchId);
  const params: unknown[] = [days];
  const branchClause = bid ? 'AND i.branch_id = $2' : '';
  if (bid) params.push(bid);

  const rows = await sequelize.query<{ day: string; total: string }>(
    `SELECT to_char(i.invoice_date, 'YYYY-MM-DD') AS day, COALESCE(SUM(i.grand_total), 0) AS total
     FROM invoices i
     WHERE i.is_held = FALSE ${branchClause}
       AND i.invoice_date >= (CURRENT_DATE - ($1::int - 1) * INTERVAL '1 day')
     GROUP BY day ORDER BY day ASC`,
    { type: QueryTypes.SELECT, bind: params },
  );

  return rows.map((r) => ({ label: r.day?.slice(5) || '', value: parseFloat(r.total) || 0 }));
}

export async function getBranchSales(_req: Request): Promise<object[]> {
  const rows = await sequelize.query<{ branchId: string; value: string }>(
    `SELECT branch_id AS "branchId", COALESCE(SUM(grand_total), 0) AS value
     FROM invoices WHERE is_held = FALSE GROUP BY branch_id`,
    { type: QueryTypes.SELECT },
  );
  return rows.map((r) => ({ branchId: r.branchId, value: parseFloat(r.value) || 0 }));
}

export async function getPaymentSplit(req: Request, branchId?: string): Promise<object[]> {
  const bid = effectiveBranchId(req, branchId);
  const params: unknown[] = [];
  const branchClause = bid ? 'WHERE i.branch_id = $1' : '';
  if (bid) params.push(bid);

  const rows = await sequelize.query<{ label: string; value: string }>(
    `SELECT p.method AS label, COALESCE(SUM(p.amount), 0) AS value
     FROM payments p JOIN invoices i ON i.id = p.invoice_id
     ${branchClause}
     GROUP BY p.method`,
    { type: QueryTypes.SELECT, bind: params },
  );
  return rows.map((r) => ({ label: r.label, value: parseFloat(r.value) || 0 }));
}

export async function getProductSales(req: Request, branchId?: string, limit = 10): Promise<object[]> {
  const bid = effectiveBranchId(req, branchId);
  const params: unknown[] = [limit];
  const branchClause = bid ? 'AND i.branch_id = $2' : '';
  if (bid) params.push(bid);

  const rows = await sequelize.query<{ productId: string; name: string; qty: string; total: string }>(
    `SELECT ii.product_id AS "productId", ii.name AS name,
            COALESCE(SUM(ii.quantity), 0) AS qty, COALESCE(SUM(ii.net_amount), 0) AS total
     FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id
     WHERE i.is_held = FALSE ${branchClause}
     GROUP BY ii.product_id, ii.name ORDER BY total DESC LIMIT $1`,
    { type: QueryTypes.SELECT, bind: params },
  );
  return rows.map((r) => ({ productId: r.productId, name: r.name, qty: Number(r.qty), total: parseFloat(r.total) || 0 }));
}

export async function getCustomerSales(req: Request, branchId?: string, limit = 50): Promise<object[]> {
  const bid = effectiveBranchId(req, branchId);
  const params: unknown[] = [limit];
  const branchClause = bid ? 'AND i.branch_id = $2' : '';
  if (bid) params.push(bid);

  const rows = await sequelize.query<{ customerId: string; bills: string; total: string }>(
    `SELECT i.customer_id AS "customerId", COUNT(*) AS bills, COALESCE(SUM(i.grand_total), 0) AS total
     FROM invoices i
     WHERE i.is_held = FALSE AND i.customer_id IS NOT NULL ${branchClause}
     GROUP BY i.customer_id ORDER BY total DESC LIMIT $1`,
    { type: QueryTypes.SELECT, bind: params },
  );
  return rows.map((r) => ({ customerId: r.customerId, bills: Number(r.bills), total: parseFloat(r.total) || 0 }));
}

export async function getPurchaseProductBreakdown(req: Request, branchId?: string, limit = 50): Promise<object[]> {
  const bid = effectiveBranchId(req, branchId);
  const params: unknown[] = [limit];
  const branchClause = bid ? 'AND p.branch_id = $2' : '';
  if (bid) params.push(bid);

  const rows = await sequelize.query<{ productId: string; qty: string; total: string }>(
    `SELECT pi.product_id AS "productId", COALESCE(SUM(pi.quantity), 0) AS qty, COALESCE(SUM(pi.line_total), 0) AS total
     FROM purchase_items pi JOIN purchases p ON p.id = pi.purchase_id
     WHERE 1=1 ${branchClause}
     GROUP BY pi.product_id ORDER BY total DESC LIMIT $1`,
    { type: QueryTypes.SELECT, bind: params },
  );
  return rows.map((r) => ({ productId: r.productId, qty: Number(r.qty), total: parseFloat(r.total) || 0 }));
}
