import Decimal from 'decimal.js';
import { round2 } from '../utils/money';
import { DISCOUNT_TYPES } from '../constants/enums';

/**
 * Server-side financial calculation engine for billing.
 *
 * Mirrors frontend/src/utils/discountAllocation.js exactly so the on-screen
 * preview and the persisted totals always agree. All arithmetic uses Decimal.js
 * (ROUND_HALF_UP, 2dp) — no JS floats touch invoice amounts.
 *
 * Calculation order (per Phase 5 spec):
 *   1. itemGross    = qty × sellingPrice
 *   2. itemDiscount = itemGross × discountPercent / 100
 *   3. netAmount    = itemGross − itemDiscount                    (taxable before inv. discount)
 *   4. subtotal     = Σ netAmount
 *   5. invoiceDiscount  resolved from (discountType, discountValue, subtotal)
 *   6. allocatedInvoiceDiscount[i] = invoiceDiscount × netAmount[i] / subtotal
 *      (last line absorbs rounding remainder)
 *   7. adjustedTaxable = netAmount − allocatedInvoiceDiscount
 *   8. lineGst         = adjustedTaxable × gstPercent / 100
 *   9. effectiveUnitPrice = adjustedTaxable / qty
 *  10. cutOffViolation   = cutOffPrice > 0 && effectiveUnitPrice < cutOffPrice
 */

export interface CalcItemInput {
  productId: string;
  name: string;
  unit: string | null;
  quantity: number;
  sellingPrice: Decimal;
  discountPercent: Decimal;
  gstPercent: Decimal;
  cutOffPrice: Decimal;
}

export interface CalcItemResult extends CalcItemInput {
  grossAmount: Decimal;
  discountAmount: Decimal;
  netAmount: Decimal;
  allocatedInvoiceDiscount: Decimal;
  adjustedTaxable: Decimal;
  lineGst: Decimal;
  effectiveUnitPrice: Decimal;
  cutOffViolation: boolean;
}

export interface CalcInvoiceInput {
  items: CalcItemInput[];
  discountType: string;
  discountValue: Decimal;
}

export interface CalcInvoiceResult {
  items: CalcItemResult[];
  subtotal: Decimal;
  itemDiscountTotal: Decimal;
  invoiceDiscount: Decimal;
  gstTotal: Decimal;
  grandTotal: Decimal;
  hasCutOffViolation: boolean;
}

function resolveInvoiceDiscount(discountType: string, discountValue: Decimal, subtotal: Decimal): Decimal {
  const safe = Decimal.max(discountValue, 0);
  if (discountType === DISCOUNT_TYPES.PERCENT) {
    const pct = Decimal.min(safe, 100);
    return round2(subtotal.mul(pct).div(100));
  }
  return round2(Decimal.min(safe, subtotal));
}

export function calcInvoice(input: CalcInvoiceInput): CalcInvoiceResult {
  // Step 1–3: item-level gross, discount, net
  const lineAmounts = input.items.map((item) => {
    const grossAmount = round2(new Decimal(item.quantity).mul(item.sellingPrice));
    const discountAmount = round2(grossAmount.mul(item.discountPercent).div(100));
    const netAmount = round2(Decimal.max(grossAmount.sub(discountAmount), 0));
    return { ...item, grossAmount, discountAmount, netAmount };
  });

  // Step 4: subtotals
  const subtotal = round2(lineAmounts.reduce((s, l) => s.add(l.netAmount), new Decimal(0)));
  const itemDiscountTotal = round2(lineAmounts.reduce((s, l) => s.add(l.discountAmount), new Decimal(0)));

  // Step 5: resolve invoice discount
  const invoiceDiscount = resolveInvoiceDiscount(input.discountType, input.discountValue, subtotal);

  // Step 6: proportional allocation (last line absorbs remainder)
  const allocations: Decimal[] = [];
  if (subtotal.gt(0) && invoiceDiscount.gt(0)) {
    const safeDiscount = Decimal.min(invoiceDiscount, subtotal);
    let allocated = new Decimal(0);
    lineAmounts.forEach((line, i) => {
      const isLast = i === lineAmounts.length - 1;
      const share = isLast
        ? round2(safeDiscount.sub(allocated))
        : round2(safeDiscount.mul(line.netAmount).div(subtotal));
      allocated = round2(allocated.add(share));
      allocations.push(share);
    });
  } else {
    lineAmounts.forEach(() => allocations.push(new Decimal(0)));
  }

  // Steps 7–10: per-line final calc
  let gstTotal = new Decimal(0);
  let grandTotal = new Decimal(0);
  const items: CalcItemResult[] = lineAmounts.map((line, i) => {
    const allocatedInvoiceDiscount = allocations[i] ?? new Decimal(0);
    const adjustedTaxable = round2(Decimal.max(line.netAmount.sub(allocatedInvoiceDiscount), 0));
    const lineGst = round2(adjustedTaxable.mul(line.gstPercent).div(100));
    const effectiveUnitPrice = line.quantity > 0 ? round2(adjustedTaxable.div(line.quantity)) : new Decimal(0);
    const cutOffViolation = line.cutOffPrice.gt(0) && effectiveUnitPrice.lt(line.cutOffPrice);

    gstTotal = round2(gstTotal.add(lineGst));
    grandTotal = round2(grandTotal.add(adjustedTaxable).add(lineGst));

    return {
      ...line,
      allocatedInvoiceDiscount,
      adjustedTaxable,
      lineGst,
      effectiveUnitPrice,
      cutOffViolation,
    };
  });

  return {
    items,
    subtotal,
    itemDiscountTotal,
    invoiceDiscount,
    gstTotal,
    grandTotal,
    hasCutOffViolation: items.some((i) => i.cutOffViolation),
  };
}
