import type { Request } from 'express';
import { Supplier } from '../models';
import { AppError } from '../utils/AppError';
import { ROLES } from '../constants/roles';
import { currentUser } from '../middleware/authenticate';
import { authoritativeBranchId } from '../middleware/authorize';

export async function listSuppliers(req: Request, branchId?: string): Promise<Supplier[]> {
  const user = currentUser(req);
  const effectiveBranchId = branchId ?? (user.role !== ROLES.SUPER_ADMIN ? user.branchId : undefined);

  if (user.role !== ROLES.SUPER_ADMIN) {
    if (!effectiveBranchId) throw AppError.badRequest('branchId is required.');
    if (user.branchId !== effectiveBranchId) {
      throw AppError.branchForbidden('You do not have access to this branch.');
    }
  }

  const where: Record<string, unknown> = { status: 'Active' };
  if (effectiveBranchId) where.branchId = effectiveBranchId;

  return Supplier.findAll({ where, order: [['name', 'ASC']] });
}

export async function createSupplier(req: Request, input: Record<string, unknown>): Promise<Supplier> {
  const branchId = authoritativeBranchId(req);
  const user = currentUser(req);

  if (user.role !== ROLES.SUPER_ADMIN && input.branchId && input.branchId !== branchId) {
    throw AppError.branchForbidden('You do not have access to the requested branch.');
  }

  const supplier = await Supplier.create({
    branchId,
    name: input.name,
    mobile: input.mobile ?? null,
    email: input.email ?? null,
    address: input.address ?? null,
    gst: input.gst ?? null,
    supplierCode: input.supplierCode ?? null,
    openingBalance: input.openingBalance ?? 0,
    openingBalanceType: (input.openingBalanceType as string) ?? 'DEBIT',
    status: 'Active',
    localId: (input.id as string) ?? null,
  } as never);

  return supplier;
}

export async function updateSupplier(req: Request, supplierId: string, input: Record<string, unknown>): Promise<Supplier> {
  const user = currentUser(req);
  const supplier = await Supplier.findByPk(supplierId);
  if (!supplier) throw AppError.notFound('Supplier not found.');
  if (user.role !== ROLES.SUPER_ADMIN && user.branchId !== supplier.branchId) {
    throw AppError.branchForbidden('You do not have access to this supplier.');
  }
  await supplier.update({
    name: input.name ?? supplier.name,
    mobile: input.mobile !== undefined ? input.mobile : supplier.mobile,
    email: input.email !== undefined ? input.email : supplier.email,
    address: input.address !== undefined ? input.address : supplier.address,
    gst: input.gst !== undefined ? input.gst : supplier.gst,
    supplierCode: input.supplierCode !== undefined ? input.supplierCode : supplier.supplierCode,
    status: input.status ?? supplier.status,
  } as never);
  return supplier;
}
