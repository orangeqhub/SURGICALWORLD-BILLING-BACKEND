import type { Transaction } from 'sequelize';
import { sequelize } from '../config/database';
import { Branch, Invoice, InvoiceItem, Payment, Product } from '../models';
import { AppError } from '../utils/AppError';
import { fromColumn, round2, toSqlDecimal } from '../utils/money';
import Decimal from 'decimal.js';
import { calcInvoice, type CalcItemInput } from './billingCalculationService';
import { writeAdjustment } from './stockService';
import { ROLES } from '../constants/roles';
import { PERMISSIONS } from '../constants/permissions';
type AuthUser = Express.AuthenticatedUser;

/**
 * Mirrors frontend/src/utils/permissions.js hasPermission() — SUPER_ADMIN and
 * BRANCH_ADMIN hold every permission implicitly; EMPLOYEE needs it explicitly.
 */
function hasPermission(user: AuthUser, permission: string): boolean {
  if (user.role === ROLES.SUPER_ADMIN || user.role === ROLES.BRANCH_ADMIN) return true;
  return user.permissions.includes(permission as never);
}

export interface CreateInvoiceItemInput {
  productId: string;
  quantity: number;
  /** The price the employee charged (may differ from catalog via PRICE_EDIT). */
  sellingPrice: number;
}

export interface CreatePaymentInput {
  method: string;
  amount: number;
  reference?: string;
  note?: string;
}

export interface CreateInvoiceInput {
  localId: string;
  branchId: string;
  customerId: string | null;
  items: CreateInvoiceItemInput[];
  discountType: string;
  discountValue: number;
  payments: CreatePaymentInput[];
}

function computePaymentStatus(payments: CreatePaymentInput[], grandTotal: Decimal): 'PAID' | 'PARTIAL' | 'CREDIT' {
  const paid = round2(payments.reduce((s, p) => s.add(new Decimal(p.amount)), new Decimal(0)));
  if (paid.gte(grandTotal)) return 'PAID';
  if (paid.lte(0)) return 'CREDIT';
  return 'PARTIAL';
}

/**
 * Creates an invoice atomically:
 *   lock products → read authoritative prices/gst/cutOff → calculate totals
 *   → validate cut-off → lock stock → validate availability → deduct stock
 *   → write invoice + items + payments
 *
 * Idempotent on `localId`: returns the existing invoice without re-processing
 * if the same localId arrives twice (client retry / network replay).
 */
export async function createInvoice(input: CreateInvoiceInput, user: AuthUser): Promise<Invoice> {
  // Fast-path idempotency: return immediately if this localId is already stored.
  const existing = await Invoice.findOne({ where: { localId: input.localId } });
  if (existing) return existing;

  try {
  return await sequelize.transaction(async (t: Transaction) => {
    // Lock product rows and build calculation inputs using authoritative DB values.
    const calcInputs: CalcItemInput[] = [];
    for (const item of input.items) {
      const product = await Product.findByPk(item.productId, { transaction: t, lock: t.LOCK.UPDATE });
      if (!product || product.status !== 'Active') {
        throw AppError.notFound(`Product "${item.productId}" not found or inactive.`);
      }
      // sellingPrice: accepted from client ONLY when the user holds PRICE_EDIT.
      // Without it, the DB's catalog price is authoritative — a malicious client
      // cannot undersell by submitting sellingPrice = 1.
      const effectiveSellingPrice = hasPermission(user, PERMISSIONS.PRICE_EDIT)
        ? new Decimal(item.sellingPrice)
        : fromColumn(product.sellingPrice);

      // discountPercent, gst, cutOffPrice, name, unit → always from the DB.
      calcInputs.push({
        productId: item.productId,
        name: product.name,
        unit: product.unit || null,
        quantity: item.quantity,
        sellingPrice: effectiveSellingPrice,
        discountPercent: fromColumn(product.discountPercent),
        gstPercent: fromColumn(product.gst),
        cutOffPrice: fromColumn(product.cutOffPrice),
      });
    }

    // Calculate invoice totals server-side.
    const calc = calcInvoice({
      items: calcInputs,
      discountType: input.discountType,
      discountValue: new Decimal(input.discountValue),
    });

    // Reject if any line's effective unit price falls below its cut-off floor.
    if (calc.hasCutOffViolation) {
      const names = calc.items.filter((i) => i.cutOffViolation).map((i) => i.name);
      throw AppError.cutOffViolation(
        `Effective unit price is below the cut-off price for: ${names.join(', ')}.`,
        { violating: names },
      );
    }

    // Deduct stock for every line inside the same transaction.
    // writeAdjustment locks the stock row and rejects if qty goes negative.
    for (const item of input.items) {
      await writeAdjustment(
        {
          branchId: input.branchId,
          productId: item.productId,
          delta: -item.quantity,
          movementType: 'SALE',
          reason: 'Billing sale',
          referenceType: 'INVOICE',
        },
        t,
      );
    }

    // Generate server-side invoice number: {branchCode}/{YYYYMMDD}/{seq}.
    const branch = await Branch.findByPk(input.branchId, { transaction: t });
    const branchCode = branch?.code ?? 'GEN';
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const seqCount = await Invoice.count({ where: { branchId: input.branchId }, transaction: t });
    const invoiceNumber = `${branchCode}/${today}/${String(seqCount + 1).padStart(4, '0')}`;

    const paidTotal = round2(
      input.payments.reduce((s, p) => s.add(new Decimal(p.amount)), new Decimal(0)),
    );
    const paymentStatus = computePaymentStatus(input.payments, calc.grandTotal);

    const invoice = await Invoice.create(
      {
        localId: input.localId,
        invoiceNumber,
        branchId: input.branchId,
        customerId: input.customerId,
        employeeId: user.id,
        createdBy: user.id,
        subtotal: toSqlDecimal(calc.subtotal),
        itemDiscountTotal: toSqlDecimal(calc.itemDiscountTotal),
        discount: toSqlDecimal(calc.invoiceDiscount),
        discountType: input.discountType,
        discountValue: String(input.discountValue),
        gst: toSqlDecimal(calc.gstTotal),
        grandTotal: toSqlDecimal(calc.grandTotal),
        paidTotal: toSqlDecimal(paidTotal),
        paymentStatus,
        isHeld: false,
        invoiceDate: new Date(),
      },
      { transaction: t },
    );

    await InvoiceItem.bulkCreate(
      calc.items.map((ci) => ({
        invoiceId: invoice.id,
        productId: ci.productId,
        name: ci.name,
        unit: ci.unit,
        quantity: ci.quantity,
        sellingPrice: toSqlDecimal(ci.sellingPrice),
        discountPercent: toSqlDecimal(ci.discountPercent),
        grossAmount: toSqlDecimal(ci.grossAmount),
        discountAmount: toSqlDecimal(ci.discountAmount),
        netAmount: toSqlDecimal(ci.netAmount),
        allocatedInvoiceDiscount: toSqlDecimal(ci.allocatedInvoiceDiscount),
        adjustedTaxable: toSqlDecimal(ci.adjustedTaxable),
        gstPercent: toSqlDecimal(ci.gstPercent),
        lineGst: toSqlDecimal(ci.lineGst),
        effectiveUnitPrice: toSqlDecimal(ci.effectiveUnitPrice),
        cutOffPrice: toSqlDecimal(ci.cutOffPrice),
      })),
      { transaction: t },
    );

    if (input.payments.length > 0) {
      await Payment.bulkCreate(
        input.payments.map((p) => ({
          invoiceId: invoice.id,
          branchId: input.branchId,
          method: p.method,
          amount: String(p.amount),
          reference: p.reference ?? null,
          note: p.note ?? null,
          createdBy: user.id,
        })),
        { transaction: t },
      );
    }

    return invoice;
  });
  } catch (err: unknown) {
    // Concurrent duplicate: both requests cleared the pre-transaction check,
    // but the DB UNIQUE constraint on localId let only one through. The loser
    // gets a 23505 (unique_violation); we resolve it to the winner's row.
    const pgCode = (err as { parent?: { code?: string } })?.parent?.code;
    if (pgCode === '23505') {
      const idempotent = await Invoice.findOne({ where: { localId: input.localId } });
      if (idempotent) return idempotent;
    }
    throw err;
  }
}

/**
 * Returns a list of invoices (newest first).
 * When branchId is omitted (SUPER_ADMIN cross-branch), returns all invoices.
 */
export async function listInvoices(branchId: string | null, limit = 50): Promise<Invoice[]> {
  const where: Record<string, unknown> = { isHeld: false };
  if (branchId) where.branchId = branchId;
  return Invoice.findAll({
    where,
    order: [['invoiceDate', 'DESC'], ['createdAt', 'DESC']],
    limit,
  });
}

/**
 * Returns a single invoice with its items and payments.
 * Accepts either the UUID primary key or the client-generated localId
 * (format: "INV-<timestamp>-<random>").
 */
export async function getInvoice(id: string): Promise<Invoice | null> {
  const include = [
    { model: InvoiceItem, as: 'items' },
    { model: Payment, as: 'payments' },
  ];
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRe.test(id)) {
    return Invoice.findByPk(id, { include });
  }
  return Invoice.findOne({ where: { localId: id }, include });
}
