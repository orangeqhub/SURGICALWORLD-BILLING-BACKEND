import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import * as authController from '../controllers/authController';
import { changePasswordSchema, createUserSchema, listUsersQuerySchema, loginSchema, userStatusSchema } from '../validators/authValidators';
import { ROLES } from '../constants/roles';
import { env, isTest } from '../config/env';

const router = Router();

/**
 * Throttles credential guessing without affecting normal API traffic.
 *
 * Disabled under NODE_ENV=test so the integration suite can log in as many
 * actors as it needs; the limiter's behaviour itself is unchanged in every
 * other environment.
 */
const loginLimiter = isTest
  ? (_req: unknown, _res: unknown, next: () => void) => next()
  : rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: env.LOGIN_RATE_LIMIT,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      skipSuccessfulRequests: true,
      message: {
        success: false,
        error: { code: 'RATE_LIMITED', message: 'Too many login attempts. Try again later.' },
      },
    });

// --- Public -------------------------------------------------------------
router.post('/login', loginLimiter, validate({ body: loginSchema }), authController.login);

// --- Authenticated ------------------------------------------------------
router.get('/me', authenticate, authController.me);
router.post('/change-password', authenticate, validate({ body: changePasswordSchema }), authController.changePassword);

router.get('/users', authenticate, validate({ query: listUsersQuerySchema }), authController.listUsers);
router.post('/users', authenticate, requireRole(ROLES.SUPER_ADMIN), validate({ body: createUserSchema }), authController.createUser);
router.put('/users/:id/status', authenticate, requireRole(ROLES.SUPER_ADMIN, ROLES.BRANCH_ADMIN), validate({ body: userStatusSchema }), authController.setUserStatus);

export default router;