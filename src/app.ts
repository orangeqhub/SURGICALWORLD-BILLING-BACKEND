import express, { type Express } from 'express';
import compression from 'compression';
import cors from 'cors';
import helmet from 'helmet';
import { env, isProduction } from './config/env';
import { requestLogger } from './config/logger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import authRoutes from './routes/authRoutes';
import branchRoutes from './routes/branchRoutes';
import categoryRoutes from './routes/categoryRoutes';
import productRoutes from './routes/productRoutes';
import { batchRoutes, stockRoutes } from './routes/stockRoutes';
import billingRoutes from './routes/billingRoutes';
import transferRoutes from './routes/transferRoutes';
import ledgerRoutes from './routes/ledgerRoutes';
import purchaseRoutes from './routes/purchaseRoutes';
import customerRoutes from './routes/customerRoutes';
import supplierRoutes from './routes/supplierRoutes';
import employeeRoutes, { branchAdminRouter } from './routes/employeeRoutes';
import crmRoutes, { customerNoteRoutes } from './routes/crmRoutes';
import attendanceRoutes from './routes/attendanceRoutes';
import payrollRoutes from './routes/payrollRoutes';
import salesTargetRoutes from './routes/salesTargetRoutes';
import { expenseRoutes, receiptRoutes, paymentRoutes, settingsRoutes } from './routes/operationsRoutes';
import reportRoutes from './routes/reportRoutes';
import { asyncHandler } from './utils/asyncHandler';

/** The API prefix the frontend points at: EXPO_PUBLIC_API_BASE_URL=http://host:5000/api */
export const API_PREFIX = '/api';

export function createApp(): Express {
  const app = express();

  // Behind a proxy/load balancer so req.ip and rate limiting see the real client.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      // The API serves JSON only; a restrictive CSP here would break the Expo
      // web build if the same origin is ever used to serve the app.
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  /**
   * CORS is environment-configured and NEVER wildcarded in production: the
   * frontend's Expo web build and dev server origins must be listed explicitly
   * (see CORS_ORIGIN in .env.example).
   */
  app.use(
    cors({
      origin(origin, callback) {
        // No Origin header = native mobile / server-to-server / curl.
        if (!origin) return callback(null, true);
        if (env.CORS_ORIGIN.length === 0) {
          return callback(null, !isProduction);
        }
        // A wildcard is honoured in development (the Expo dev server picks a new
        // port on restart) but is REFUSED in production: it would let any
        // website issue credentialed requests against the billing API, and it
        // contradicts the guarantee documented above.
        if (env.CORS_ORIGIN.includes('*')) {
          if (isProduction) {
            return callback(new Error(`CORS_ORIGIN must list explicit origins in production; "*" is not allowed.`));
          }
          return callback(null, true);
        }
        if (env.CORS_ORIGIN.includes(origin)) {
          return callback(null, true);
        }
        return callback(new Error(`Origin ${origin} is not allowed by CORS.`));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      maxAge: 86_400,
    }),
  );

  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(requestLogger);

  /**
   * Health check. Deliberately unauthenticated and dependency-free so a probe
   * reports process liveness; `ready` additionally verifies the database.
   */
  app.get(
    `${API_PREFIX}/health`,
    asyncHandler(async (_req, res) => {
      res.status(200).json({ success: true, message: 'Surgical World Billing API is running' });
    }),
  );

  app.get(
    `${API_PREFIX}/health/ready`,
    asyncHandler(async (_req, res) => {
      const { sequelize } = await import('./config/database');
      try {
        await sequelize.authenticate();
        res.status(200).json({ success: true, message: 'Database connection is healthy' });
      } catch {
        res.status(503).json({ success: false, message: 'Database connection is unavailable' });
      }
    }),
  );

  app.use(`${API_PREFIX}/auth`, authRoutes);
  app.use(`${API_PREFIX}/branches`, branchRoutes);

  // --- Phase 4: Product Master + Stock -----------------------------------
  // Mounted at the exact paths the frontend adapters already call:
  //   /products, /products/search, /products/barcode/:barcode, /categories
  //   /stock, /stock/low, /stock/movements, /branches/:branchId/inventory, /batches
  app.use(`${API_PREFIX}/products`, productRoutes);
  app.use(`${API_PREFIX}/categories`, categoryRoutes);
  app.use(`${API_PREFIX}/stock`, stockRoutes);
  app.use(`${API_PREFIX}/batches`, batchRoutes);

  // --- Phase 5: Billing + Invoices + Payments ----------------------------
  app.use(`${API_PREFIX}/invoices`, billingRoutes);

  // --- Phase 6: Stock Transfers -------------------------------------------
  app.use(`${API_PREFIX}/stock-transfers`, transferRoutes);

  // --- Phase 7: Ledger + Manual Entries + Party Balances ------------------
  app.use(`${API_PREFIX}/ledger`, ledgerRoutes);

  // --- Phase 8: Purchases + Supplier Stock Receipt ------------------------
  app.use(`${API_PREFIX}/purchases`, purchaseRoutes);

  // --- Final Phase: Customers, Suppliers, Employees, CRM, HR, Operations --
  app.use(`${API_PREFIX}/customers`, customerRoutes);
  app.use(`${API_PREFIX}/suppliers`, supplierRoutes);
  app.use(`${API_PREFIX}/employees`, employeeRoutes);
  app.use(`${API_PREFIX}/branch-admins`, branchAdminRouter);
  app.use(`${API_PREFIX}/crm`, crmRoutes);
  app.use(`${API_PREFIX}/customers`, customerNoteRoutes);
  app.use(`${API_PREFIX}/attendance`, attendanceRoutes);
  app.use(`${API_PREFIX}/payroll`, payrollRoutes);
  app.use(`${API_PREFIX}/sales-targets`, salesTargetRoutes);
  app.use(`${API_PREFIX}/expenses`, expenseRoutes);
  app.use(`${API_PREFIX}/receipts`, receiptRoutes);
  app.use(`${API_PREFIX}/payments`, paymentRoutes);
  app.use(`${API_PREFIX}/settings`, settingsRoutes);
  app.use(`${API_PREFIX}/reports`, reportRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export default createApp;