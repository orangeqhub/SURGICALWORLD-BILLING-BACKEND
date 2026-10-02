import { Model, type FindOptions, type ModelStatic, type Sequelize, type Transaction } from 'sequelize';
import { Branch, initBranchModel } from './Branch';
import { Category, initCategoryModel } from './Category';
import { Customer, initCustomerModel } from './Customer';
import { Invoice, initInvoiceModel } from './Invoice';
import { InvoiceItem, initInvoiceItemModel } from './InvoiceItem';
import { LedgerEntry, initLedgerEntryModel } from './LedgerEntry';
import { Payment, initPaymentModel } from './Payment';
import { Product, initProductModel } from './Product';
import { Purchase, initPurchaseModel } from './Purchase';
import { PurchaseItem, initPurchaseItemModel } from './PurchaseItem';
import { Setting, initSettingModel } from './Setting';
import { StockBatch, initStockBatchModel } from './StockBatch';
import { StockMovement, initStockMovementModel } from './StockMovement';
import { StockTransfer, initStockTransferModel } from './StockTransfer';
import { StockTransferItem, initStockTransferItemModel } from './StockTransferItem';
import { Supplier, initSupplierModel } from './Supplier';
import { BranchStock, initBranchStockModel } from './BranchStock';
import { User, initUserModel } from './User';
import { CrmNote, initCrmNoteModel } from './CrmNote';
import { CrmFollowUp, initCrmFollowUpModel } from './CrmFollowUp';
import { Attendance, initAttendanceModel } from './Attendance';
import { Payroll, initPayrollModel } from './Payroll';
import { SalesTarget, initSalesTargetModel } from './SalesTarget';
import { Expense, initExpenseModel } from './Expense';
import { Receipt, initReceiptModel } from './Receipt';
import { SupplierPayment, initSupplierPaymentModel } from './SupplierPayment';

export {
  Branch,
  BranchStock,
  Category,
  CrmFollowUp,
  CrmNote,
  Customer,
  Attendance,
  Expense,
  Invoice,
  InvoiceItem,
  LedgerEntry,
  Payment,
  Payroll,
  Product,
  Purchase,
  PurchaseItem,
  Receipt,
  SalesTarget,
  Setting,
  StockBatch,
  StockMovement,
  StockTransfer,
  StockTransferItem,
  Supplier,
  SupplierPayment,
  User,
};

export interface Models {
  Branch: typeof Branch;
  BranchStock: typeof BranchStock;
  Category: typeof Category;
  CrmFollowUp: typeof CrmFollowUp;
  CrmNote: typeof CrmNote;
  Customer: typeof Customer;
  Attendance: typeof Attendance;
  Expense: typeof Expense;
  Invoice: typeof Invoice;
  InvoiceItem: typeof InvoiceItem;
  LedgerEntry: typeof LedgerEntry;
  Payment: typeof Payment;
  Payroll: typeof Payroll;
  Product: typeof Product;
  Purchase: typeof Purchase;
  PurchaseItem: typeof PurchaseItem;
  Receipt: typeof Receipt;
  SalesTarget: typeof SalesTarget;
  Setting: typeof Setting;
  StockBatch: typeof StockBatch;
  StockMovement: typeof StockMovement;
  StockTransfer: typeof StockTransfer;
  StockTransferItem: typeof StockTransferItem;
  Supplier: typeof Supplier;
  SupplierPayment: typeof SupplierPayment;
  User: typeof User;
}

export type ModelsKey = keyof Models;

/**
 * Row-locking helper for use inside a transaction: adds `FOR UPDATE` so two
 * concurrent sales of the last unit serialise instead of both observing
 * stock = 1 (and driving it negative). Sequelize expresses this through the
 * `lock` find-option, not a WHERE symbol.
 *
 * Usage:  await BranchStock.findOne({ ...withRowLock({ branchId, productId }), transaction });
 */
export function withRowLock<T extends object>(where: T, transaction: Transaction): FindOptions<T> {
  return { where, transaction, lock: transaction.LOCK.UPDATE } as FindOptions<T>;
}

/** Initialises every model against the given connection, then wires associations. */
export function defineModels(sequelize: Sequelize): Models {
  const models = {
    Branch: initBranchModel(sequelize),
    Category: initCategoryModel(sequelize),
    Product: initProductModel(sequelize),
    User: initUserModel(sequelize),
    Customer: initCustomerModel(sequelize),
    Supplier: initSupplierModel(sequelize),
    BranchStock: initBranchStockModel(sequelize),
    StockBatch: initStockBatchModel(sequelize),
    StockMovement: initStockMovementModel(sequelize),
    Invoice: initInvoiceModel(sequelize),
    InvoiceItem: initInvoiceItemModel(sequelize),
    Payment: initPaymentModel(sequelize),
    Purchase: initPurchaseModel(sequelize),
    PurchaseItem: initPurchaseItemModel(sequelize),
    StockTransfer: initStockTransferModel(sequelize),
    StockTransferItem: initStockTransferItemModel(sequelize),
    LedgerEntry: initLedgerEntryModel(sequelize),
    Setting: initSettingModel(sequelize),
    CrmNote: initCrmNoteModel(sequelize),
    CrmFollowUp: initCrmFollowUpModel(sequelize),
    Attendance: initAttendanceModel(sequelize),
    Payroll: initPayrollModel(sequelize),
    SalesTarget: initSalesTargetModel(sequelize),
    Expense: initExpenseModel(sequelize),
    Receipt: initReceiptModel(sequelize),
    SupplierPayment: initSupplierPaymentModel(sequelize),
  } as Models;

  defineAssociations(models);
  return models;
}

export function defineAssociations(m: Models): void {
  const {
    Branch,
    User,
    Category,
    Product,
    Customer,
    Supplier,
    BranchStock,
    StockBatch,
    StockMovement,
    Invoice,
    InvoiceItem,
    Payment,
    Purchase,
    PurchaseItem,
    StockTransfer,
    StockTransferItem,
    LedgerEntry,
    CrmNote,
    CrmFollowUp,
    Attendance,
    Payroll,
    SalesTarget,
    Expense,
    Receipt,
    SupplierPayment,
  } = m;

  // --- Branch ownership -------------------------------------------------
  Branch.hasMany(User, { foreignKey: 'branchId', as: 'users' });
  User.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch' });
  Branch.hasMany(Customer, { foreignKey: 'branchId', as: 'customers' });
  Customer.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch' });
  Branch.hasMany(Supplier, { foreignKey: 'branchId', as: 'suppliers' });
  Supplier.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch' });
  Branch.hasMany(BranchStock, { foreignKey: 'branchId', as: 'stocks' });
  BranchStock.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch' });
  Branch.hasMany(StockBatch, { foreignKey: 'branchId', as: 'batches' });
  StockBatch.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch' });
  Branch.hasMany(Invoice, { foreignKey: 'branchId', as: 'invoices' });
  Invoice.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch' });
  Branch.hasMany(LedgerEntry, { foreignKey: 'branchId', as: 'ledgerEntries' });
  LedgerEntry.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch' });
  Branch.hasMany(StockTransfer, { foreignKey: 'branchId', as: 'owningTransfers' });
  Branch.hasMany(StockTransfer, { foreignKey: 'fromBranchId', as: 'outgoingTransfers' });
  Branch.hasMany(StockTransfer, { foreignKey: 'toBranchId', as: 'incomingTransfers' });
  Branch.hasMany(Purchase, { foreignKey: 'branchId', as: 'purchases' });
  Branch.hasMany(Payment, { foreignKey: 'branchId', as: 'payments' });
  Branch.hasMany(StockMovement, { foreignKey: 'branchId', as: 'movements' });

  // --- Users ------------------------------------------------------------
  User.hasMany(Invoice, { foreignKey: 'employeeId', as: 'employeeInvoices' });
  User.hasMany(Invoice, { foreignKey: 'createdBy', as: 'createdInvoices' });
  User.hasMany(StockTransfer, { foreignKey: 'requestedBy', as: 'requestedTransfers' });
  User.hasMany(StockTransfer, { foreignKey: 'approvedBy', as: 'approvedTransfers' });
  User.hasMany(StockTransfer, { foreignKey: 'rejectedBy', as: 'rejectedTransfers' });
  User.hasMany(StockTransfer, { foreignKey: 'dispatchedBy', as: 'dispatchedTransfers' });
  User.hasMany(StockTransfer, { foreignKey: 'receivedBy', as: 'receivedTransfers' });
  User.hasMany(LedgerEntry, { foreignKey: 'createdBy', as: 'createdLedgerEntries' });
  User.hasMany(Payment, { foreignKey: 'createdBy', as: 'createdPayments' });

  // --- Product / category / stock --------------------------------------
  Category.hasMany(Product, { foreignKey: 'categoryId', as: 'products' });
  Product.belongsTo(Category, { foreignKey: 'categoryId', as: 'category' });
  Product.hasMany(BranchStock, { foreignKey: 'productId', as: 'stocks' });
  BranchStock.belongsTo(Product, { foreignKey: 'productId', as: 'product' });
  Product.hasMany(StockBatch, { foreignKey: 'productId', as: 'batches' });
  StockBatch.belongsTo(Product, { foreignKey: 'productId', as: 'product' });
  Product.hasMany(StockMovement, { foreignKey: 'productId', as: 'movements' });
  StockMovement.belongsTo(Product, { foreignKey: 'productId', as: 'product' });
  StockBatch.hasMany(StockMovement, { foreignKey: 'batchId', as: 'movements' });
  StockMovement.belongsTo(StockBatch, { foreignKey: 'batchId', as: 'batch' });

  // --- Billing ----------------------------------------------------------
  Customer.hasMany(Invoice, { foreignKey: 'customerId', as: 'invoices' });
  Invoice.belongsTo(Customer, { foreignKey: 'customerId', as: 'customer' });
  Invoice.belongsTo(User, { foreignKey: 'employeeId', as: 'employee' });
  Invoice.belongsTo(User, { foreignKey: 'createdBy', as: 'createdByUser' });
  Invoice.hasMany(InvoiceItem, { foreignKey: 'invoiceId', as: 'items', onDelete: 'CASCADE' });
  InvoiceItem.belongsTo(Invoice, { foreignKey: 'invoiceId', as: 'invoice' });
  InvoiceItem.belongsTo(Product, { foreignKey: 'productId', as: 'product' });
  InvoiceItem.belongsTo(StockBatch, { foreignKey: 'batchId', as: 'batch' });
  Invoice.hasMany(Payment, { foreignKey: 'invoiceId', as: 'payments', onDelete: 'CASCADE' });
  Payment.belongsTo(Invoice, { foreignKey: 'invoiceId', as: 'invoice' });
  Payment.belongsTo(User, { foreignKey: 'createdBy', as: 'createdByUser' });

  // --- Purchasing -------------------------------------------------------
  Supplier.hasMany(Purchase, { foreignKey: 'supplierId', as: 'supplierPurchases' });
  Purchase.belongsTo(Supplier, { foreignKey: 'supplierId', as: 'supplier' });
  Purchase.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch' });
  Purchase.belongsTo(User, { foreignKey: 'createdBy', as: 'createdByUser' });
  Purchase.hasMany(PurchaseItem, { foreignKey: 'purchaseId', as: 'items', onDelete: 'CASCADE' });
  PurchaseItem.belongsTo(Purchase, { foreignKey: 'purchaseId', as: 'purchase' });
  PurchaseItem.belongsTo(Product, { foreignKey: 'productId', as: 'product' });

  // --- Stock transfers --------------------------------------------------
  StockTransfer.belongsTo(Branch, { foreignKey: 'branchId', as: 'owningBranch' });
  StockTransfer.belongsTo(Branch, { foreignKey: 'fromBranchId', as: 'fromBranch' });
  StockTransfer.belongsTo(Branch, { foreignKey: 'toBranchId', as: 'toBranch' });
  StockTransfer.belongsTo(User, { foreignKey: 'requestedBy', as: 'requestedByUser' });
  StockTransfer.belongsTo(User, { foreignKey: 'approvedBy', as: 'approvedByUser' });
  StockTransfer.belongsTo(User, { foreignKey: 'rejectedBy', as: 'rejectedByUser' });
  StockTransfer.belongsTo(User, { foreignKey: 'dispatchedBy', as: 'dispatchedByUser' });
  StockTransfer.belongsTo(User, { foreignKey: 'receivedBy', as: 'receivedByUser' });
  StockTransfer.hasMany(StockTransferItem, { foreignKey: 'transferId', as: 'items', onDelete: 'CASCADE' });
  StockTransferItem.belongsTo(StockTransfer, { foreignKey: 'transferId', as: 'transfer' });
  StockTransferItem.belongsTo(Product, { foreignKey: 'productId', as: 'product' });
  StockTransferItem.belongsTo(StockBatch, { foreignKey: 'batchId', as: 'batch' });

  // --- Ledger -----------------------------------------------------------
  // LedgerEntry.belongsTo(Branch) is declared once, in the branch-ownership
  // block above.
  //
  // Deliberately no belongsTo(Customer/Supplier): partyId is a polymorphic
  // reference validated at the service layer against partyType, so the ledger
  // cannot be joined to the wrong party table by mistake.
  LedgerEntry.belongsTo(User, { foreignKey: 'createdBy', as: 'createdByUser' });

  // --- CRM ------------------------------------------------------------------
  Customer.hasMany(CrmNote, { foreignKey: 'customerId', as: 'crmNotes' });
  CrmNote.belongsTo(Customer, { foreignKey: 'customerId', as: 'customer' });
  CrmNote.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch' });
  Customer.hasMany(CrmFollowUp, { foreignKey: 'customerId', as: 'followUps' });
  CrmFollowUp.belongsTo(Customer, { foreignKey: 'customerId', as: 'customer' });
  CrmFollowUp.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch' });

  // --- HR -------------------------------------------------------------------
  User.hasMany(Attendance, { foreignKey: 'employeeId', as: 'attendanceRecords' });
  Attendance.belongsTo(User, { foreignKey: 'employeeId', as: 'employee' });
  Attendance.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch' });
  User.hasMany(Payroll, { foreignKey: 'employeeId', as: 'payrollRecords' });
  Payroll.belongsTo(User, { foreignKey: 'employeeId', as: 'employee' });
  Payroll.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch' });

  // --- Operations -----------------------------------------------------------
  SalesTarget.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch' });
  Expense.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch' });
  Branch.hasMany(Expense, { foreignKey: 'branchId', as: 'expenses' });
  Receipt.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch' });
  Branch.hasMany(Receipt, { foreignKey: 'branchId', as: 'receipts' });
  SupplierPayment.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch' });
  Branch.hasMany(SupplierPayment, { foreignKey: 'branchId', as: 'supplierPayments' });
}

export type AnyModel = ModelStatic<Model>;