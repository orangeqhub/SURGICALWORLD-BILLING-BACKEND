import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireBranchAccess, requireAdmin, requirePermission } from '../middleware/authorize';
import { PERMISSIONS } from '../constants/permissions';
import * as ops from '../controllers/operationsController';

/** Branch-scoped sub-routes, inserted into branchRoutes */
export const branchOperationsRoutes = Router({ mergeParams: true });
branchOperationsRoutes.use(authenticate);

branchOperationsRoutes.get(
  '/:branchId/expenses',
  requireBranchAccess({ param: 'branchId' }),
  ops.listExpenses,
);
branchOperationsRoutes.get(
  '/:branchId/receipts',
  requireBranchAccess({ param: 'branchId' }),
  ops.listReceipts,
);
branchOperationsRoutes.get(
  '/:branchId/payments',
  requireBranchAccess({ param: 'branchId' }),
  ops.listPayments,
);

/** Top-level routes */
const expenseRouter = Router();
expenseRouter.use(authenticate);
expenseRouter.post('/', requirePermission(PERMISSIONS.EXPENSE_MANAGE), ops.createExpense);
export { expenseRouter as expenseRoutes };

const receiptRouter = Router();
receiptRouter.use(authenticate);
receiptRouter.post('/', requirePermission(PERMISSIONS.RECEIPTS_MANAGE), ops.createReceipt);
export { receiptRouter as receiptRoutes };

const paymentRouter = Router();
paymentRouter.use(authenticate);
paymentRouter.post('/', requirePermission(PERMISSIONS.PAYMENTS_MANAGE), ops.createPayment);
export { paymentRouter as paymentRoutes };

const settingsRouter = Router();
settingsRouter.use(authenticate);
settingsRouter.put('/:key', requireAdmin, ops.upsertSetting);
export { settingsRouter as settingsRoutes };
