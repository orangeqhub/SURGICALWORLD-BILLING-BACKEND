import type { Request } from 'express';
import type { Role } from '../constants/roles';
import type { Permission } from '../constants/permissions';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface AuthenticatedUser {
      id: string;
      loginId: string;
      role: Role;
      /** Authoritative branch. Null for SUPER_ADMIN. */
      branchId: string | null;
      name: string;
      /** Only meaningful for EMPLOYEE. */
      permissions: Permission[];
    }

    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export {};