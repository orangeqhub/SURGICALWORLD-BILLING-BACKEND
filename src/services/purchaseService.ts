import type { Request } from 'express';
import type { Transaction } from 'sequelize';
import { Op } from 'sequelize';
import { sequelize } from '../config/database';
import { Branch, LedgerEntry, Product, Purchase, PurchaseItem, Supplier } from '../models';
import { AppError } from '../utils/AppError';
import { Decimal, round2, toSqlDecimal } from '../utils/money';
import { ROLES } from '../constants/roles';
import { currentUser } from '../middleware/authenticate';
import { authoritativeBranchId } from '../middleware/authorize';
import { writeAdjustment } from './stockService';
import type { CreatePurchaseBody } from '../validators/purchaseValidators';

type AuthUser = Express.AuthenticatedUser;

// ─── Calculation ──────────────────────────────────────────────────────────────

interface ComputedLine {
  grossAmount: Decimal;
  discountAmount: Decimal;
  taxableAmount: Decimal;
  allocatedDiscount: Decimal;
  adjustedTaxable: Decimal;
  cgst: Decimal;
  sgst: Decimal;
  igst: Decimal;
  lineGst: Decimal;
  lineTotal: Decimal;
}

interface PurchaseTotals {
  lines: ComputedLine[];
  subtotal: Decimal;
  productDiscounts: Decimal;
  safeInvoiceDiscount: Decimal;
  taxableAmount: Decimal;
  cgst: Decimal;
  sgst: Decimal;
  igst: Decimal;
  taxTotal: Decimal;
  otherCharges: Decimal;
  roundOff: Decimal;
  netAmount: Decimal;
}

function calcPurchaseTotals(
  items: CreatePurchaseBody['items'],
  invoiceDiscount: number,
  otherCharges: number,
  taxType: 'INTRA' | 'INTER',
): PurchaseTotals {
  const isInter = taxType === 'INTER';
  const ZERO = new Decimal(0);

  // Step 1: per-line grossAmount, discountAmount, taxableAmount
  const lines = items.map((item) => {
    const qty = new Decimal(item.quantity);
    const price = new Decimal(item.purchasePrice);
    const discPct = new Decimal(item.discountPercent);
    const grossAmount = round2(qty.times(price));
    const discFromPct = round2(grossAmount.times(discPct).dividedBy(100));
    const discountAmount = Decimal.min(discFromPct, grossAmount);
    const taxableAmount = round2(Decimal.max(grossAmount.minus(discountAmount), ZERO));
    return { grossAmount, discountAmount, taxableAmount };
  });

  const totalTaxableBeforeInvDisc = round2(lines.reduce((s, l) => s.plus(l.taxableAmount), ZERO));

  // Step 2: clamp invoice discount
  const safeInvoiceDiscount = round2(
    Decimal.max(Decimal.min(new Decimal(invoiceDiscount), totalTaxableBeforeInvDisc), ZERO),
  );

  // Step 3: allocate invoice discount proportionally (last line absorbs remainder)
  let allocatedSoFar = ZERO;
  const allocations: Decimal[] = lines.map((line, index) => {
    const isLast = index === lines.length - 1;
    let share: Decimal;
    if (isLast) {
      share = round2(safeInvoiceDiscount.minus(allocatedSoFar));
    } else if (totalTaxableBeforeInvDisc.isZero() || safeInvoiceDiscount.isZero()) {
      share = ZERO;
    } else {
      share = round2(safeInvoiceDiscount.times(line.taxableAmount).dividedBy(totalTaxableBeforeInvDisc));
    }
    allocatedSoFar = round2(allocatedSoFar.plus(share));
    return share;
  });

  // Step 4: compute per-line adjusted totals
  const computedLines: ComputedLine[] = lines.map((line, i) => {
    const allocatedDiscount: Decimal = allocations[i] ?? ZERO;
    const adjustedTaxable = round2(Decimal.max(line.taxableAmount.minus(allocatedDiscount), ZERO));
    const gstPct = new Decimal(items[i]!.gstPercent);
    const taxAmount = round2(adjustedTaxable.times(gstPct).dividedBy(100));

    let cgst: Decimal, sgst: Decimal, igst: Decimal;
    if (isInter) {
      cgst = ZERO;
      sgst = ZERO;
      igst = taxAmount;
    } else {
      const halfTax = round2(taxAmount.dividedBy(2));
      cgst = halfTax;
      sgst = round2(taxAmount.minus(halfTax));
      igst = ZERO;
    }

    const lineGst = round2(cgst.plus(sgst).plus(igst));
    const lineTotal = round2(adjustedTaxable.plus(lineGst));

    return { ...line, allocatedDiscount, adjustedTaxable, cgst, sgst, igst, lineGst, lineTotal };
  });

  // Step 5: aggregate
  const subtotal = round2(computedLines.reduce((s, l) => s.plus(l.grossAmount), ZERO));
  const productDiscounts = round2(computedLines.reduce((s, l) => s.plus(l.discountAmount), ZERO));
  const taxableAmount = round2(computedLines.reduce((s, l) => s.plus(l.adjustedTaxable), ZERO));
  const cgst = round2(computedLines.reduce((s, l) => s.plus(l.cgst), ZERO));
  const sgst = round2(computedLines.reduce((s, l) => s.plus(l.sgst), ZERO));
  const igst = round2(computedLines.reduce((s, l) => s.plus(l.igst), ZERO));
  const taxTotal = round2(cgst.plus(sgst).plus(igst));
  const safeOtherCharges = round2(Decimal.max(new Decimal(otherCharges), ZERO));

  const netBeforeRound = taxableAmount.plus(taxTotal).plus(safeOtherCharges);
  const netAmount = netBeforeRound.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  const roundOff = round2(netAmount.minus(netBeforeRound));

  return {
    lines: computedLines,
    subtotal,
    productDiscounts,
    safeInvoiceDiscount,
    taxableAmount,
    cgst,
    sgst,
    igst,
    taxTotal,
    otherCharges: safeOtherCharges,
    roundOff,
    netAmount,
  };
}

// ─── Purchase number ─────────────────────────────────────────────────────────

async function generatePurchaseNumber(branchId: string, branchCode: string, t: Transaction): Promise<string> {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const count = await Purchase.count({ where: { branchId }, transaction: t });
  return `${branchCode}/PO/${today}/${String(count + 1).padStart(4, '0')}`;
}

// ─── Create purchase ─────────────────────────────────────────────────────────

export async function createPurchase(req: Request, input: CreatePurchaseBody): Promise<Purchase> {
  const user = currentUser(req);
  const branchId = authoritativeBranchId(req);

  if (user.role !== ROLES.SUPER_ADMIN && input.branchId && input.branchId !== branchId) {
    throw AppError.branchForbidden('You do not have access to the requested branch.');
  }

  const localId = input.id ?? null;

  // Fast-path idempotency: same localId means this request already committed.
  if (localId) {
    const existing = await Purchase.findOne({ where: { localId } });
    if (existing) return existing;
  }

  try {
    return await sequelize.transaction(async (t: Transaction) => {
      // Validate branch
      const branch = await Branch.findByPk(branchId, { transaction: t });
      if (!branch || branch.status !== 'Active') {
        throw AppError.notFound('Branch not found or inactive.');
      }

      // Validate supplier belongs to this branch
      const supplier = await Supplier.findOne({
        where: { id: input.supplierId, branchId },
        transaction: t,
      });
      if (!supplier) {
        throw AppError.notFound('Supplier not found in this branch.');
      }

      // Validate all products exist and are active
      for (const item of input.items) {
        const product = await Product.findByPk(item.productId, { transaction: t });
        if (!product || product.status !== 'Active') {
          throw AppError.notFound(`Product "${item.productId}" not found or inactive.`);
        }
      }

      // Calculate server-authoritative totals
      const totals = calcPurchaseTotals(input.items, input.invoiceDiscount, input.otherCharges, input.taxType);

      // Clamp paid amount to net amount
      const paidAmount = round2(Decimal.min(Decimal.max(new Decimal(input.paidAmount), new Decimal(0)), totals.netAmount));
      const balanceAmount = round2(Decimal.max(totals.netAmount.minus(paidAmount), new Decimal(0)));

      // Increase stock for every line (qty + freeQty received)
      for (const item of input.items) {
        const totalReceived = item.quantity + item.freeQuantity;
        if (totalReceived > 0) {
          await writeAdjustment(
            {
              branchId,
              productId: item.productId,
              delta: totalReceived,
              movementType: 'PURCHASE',
              reason: 'Purchase receipt',
              referenceType: 'PURCHASE',
            },
            t,
          );
        }
      }

      // Generate server-side purchase number
      const branchCode = branch.code ?? 'GEN';
      const purchaseNumber = await generatePurchaseNumber(branchId, branchCode, t);

      // Create purchase header
      const purchase = await Purchase.create(
        {
          localId,
          branchId,
          supplierId: input.supplierId,
          invoiceNumber: input.supplierInvoiceNumber ?? null,
          purchaseNumber,
          supplierInvoiceNumber: input.supplierInvoiceNumber ?? null,
          purchaseType: input.purchaseType,
          taxType: input.taxType,
          totalAmount: toSqlDecimal(totals.netAmount),
          subtotal: toSqlDecimal(totals.subtotal),
          productDiscounts: toSqlDecimal(totals.productDiscounts),
          invoiceDiscount: toSqlDecimal(totals.safeInvoiceDiscount),
          taxableAmount: toSqlDecimal(totals.taxableAmount),
          cgst: toSqlDecimal(totals.cgst),
          sgst: toSqlDecimal(totals.sgst),
          igst: toSqlDecimal(totals.igst),
          otherCharges: toSqlDecimal(totals.otherCharges),
          roundOff: toSqlDecimal(totals.roundOff),
          netAmount: toSqlDecimal(totals.netAmount),
          paidAmount: toSqlDecimal(paidAmount),
          balanceAmount: toSqlDecimal(balanceAmount),
          notes: input.notes ?? null,
          status: 'RECEIVED',
          purchaseDate: input.purchaseDate ? new Date(input.purchaseDate) : new Date(),
          createdBy: user.id,
        } as never,
        { transaction: t },
      );

      // Create purchase items with full snapshot
      await PurchaseItem.bulkCreate(
        input.items.map((item, i) => {
          const line = totals.lines[i]!;
          return {
            purchaseId: purchase.id,
            productId: item.productId,
            name: item.productName ?? item.productId,
            skuSnapshot: item.sku ?? null,
            hsnSnapshot: item.hsn ?? null,
            quantity: item.quantity,
            freeQuantity: item.freeQuantity,
            unit: item.unit ?? null,
            purchasePrice: toSqlDecimal(new Decimal(item.purchasePrice)),
            sellingPriceSnapshot: toSqlDecimal(new Decimal(item.sellingPrice)),
            mrpSnapshot: toSqlDecimal(new Decimal(item.mrp)),
            discountPercent: toSqlDecimal(new Decimal(item.discountPercent)),
            discountAmount: toSqlDecimal(line.discountAmount),
            netAmount: toSqlDecimal(line.taxableAmount),
            adjustedTaxable: toSqlDecimal(line.adjustedTaxable),
            gstPercent: toSqlDecimal(new Decimal(item.gstPercent)),
            cgst: toSqlDecimal(line.cgst),
            sgst: toSqlDecimal(line.sgst),
            igst: toSqlDecimal(line.igst),
            lineGst: toSqlDecimal(line.lineGst),
            lineTotal: toSqlDecimal(line.lineTotal),
            batchNumber: item.batchNumber ?? null,
            mfgDate: item.mfgDate ?? null,
            expiryDate: item.expiryDate ?? null,
          };
        }),
        { transaction: t },
      );

      // Supplier ledger entry: DEBIT (we owe supplier)
      await LedgerEntry.create(
        {
          branchId,
          partyType: 'SUPPLIER',
          partyId: supplier.id,
          partyName: supplier.name,
          type: 'DEBIT',
          amount: toSqlDecimal(totals.netAmount),
          note: `Purchase ${purchaseNumber}`,
          referenceType: 'PURCHASE',
          referenceId: purchase.id,
          entryDate: new Date(),
          createdBy: user.id,
        } as never,
        { transaction: t },
      );

      return purchase;
    });
  } catch (err: any) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      // Race condition: two concurrent requests with same localId both passed the fast-path check.
      const existing = await Purchase.findOne({ where: { localId: localId ?? '' } });
      if (existing) return existing;
      throw AppError.conflict('A purchase with this ID already exists.', 'DUPLICATE_LOCAL_ID');
    }
    throw err;
  }
}

// ─── List purchases ───────────────────────────────────────────────────────────

export async function listPurchasesForBranch(
  req: Request,
  branchId: string,
  limit: number,
  offset: number,
): Promise<Purchase[]> {
  const user = currentUser(req);

  // Branch access: non-SA can only see their own branch
  if (user.role !== ROLES.SUPER_ADMIN && user.branchId !== branchId) {
    throw AppError.branchForbidden('You do not have access to this branch.');
  }

  return Purchase.findAll({
    where: { branchId },
    order: [['purchaseDate', 'DESC'], ['createdAt', 'DESC']],
    limit,
    offset,
  });
}

// ─── Get purchase items ───────────────────────────────────────────────────────

export async function getPurchaseItems(req: Request, identifier: string): Promise<PurchaseItem[]> {
  const user = currentUser(req);

  // Accept either the UUID primary key or the localId.
  // Only include the `id` UUID column when the identifier looks like a UUID;
  // passing a non-UUID string to a UUID column causes a PostgreSQL cast error.
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);
  const purchase = await Purchase.findOne({
    where: isUuid
      ? { [Op.or]: [{ id: identifier }, { localId: identifier }] }
      : { localId: identifier },
  });

  if (!purchase) throw AppError.notFound('Purchase not found.');

  // Branch isolation for non-SA
  if (user.role !== ROLES.SUPER_ADMIN && user.branchId !== purchase.branchId) {
    throw AppError.branchForbidden('You do not have access to this purchase.');
  }

  return PurchaseItem.findAll({
    where: { purchaseId: purchase.id },
    order: [['createdAt', 'ASC']],
  });
}
