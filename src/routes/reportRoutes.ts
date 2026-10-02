import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/authorize';
import { PERMISSIONS } from '../constants/permissions';
import * as reportController from '../controllers/reportController';

const router = Router();
router.use(authenticate);
router.use(requirePermission(PERMISSIONS.REPORTS_VIEW));

router.get('/sales-trend', reportController.salesTrend);
router.get('/branch-sales', reportController.branchSales);
router.get('/payment-split', reportController.paymentSplit);
router.get('/product-sales', reportController.productSales);
router.get('/customer-sales', reportController.customerSales);
router.get('/purchase-product-breakdown', reportController.purchaseProductBreakdown);

export default router;
