import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { requireAdmin } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import {
  createLedgerEntryBodySchema,
  listLedgerEntriesQuerySchema,
  partyBalanceQuerySchema,
} from '../validators/ledgerValidators';
import * as lc from '../controllers/ledgerController';

/**
 * Ledger routes.
 *
 * Authorization:
 *   POST /         requireAdmin (SUPER_ADMIN + BRANCH_ADMIN) — create manual entry
 *   GET  /balance  any authenticated              — party balance (cross-branch sum)
 *   GET  /         any authenticated              — list entries (branch-scoped for BA/EMP)
 */
const router = Router();

router.use(authenticate);

router.post('/', requireAdmin, validate({ body: createLedgerEntryBodySchema }), lc.create);

// /balance must be registered before / to avoid capturing 'balance' as a resource id
router.get('/balance', validate({ query: partyBalanceQuerySchema }), lc.balance);

router.get('/', validate({ query: listLedgerEntriesQuerySchema }), lc.list);

export default router;
