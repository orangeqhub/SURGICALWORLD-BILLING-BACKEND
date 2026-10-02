import { AppError } from '../utils/AppError';
import { Branch } from '../models';
import { ROLES, type Role } from '../constants/roles';

/** Branch CRUD. Branch data matches the frontend's branches_cache row shape. */

export interface BranchInput {
  code: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  gst?: string | null;
  manager?: string | null;
  opening?: string | null;
  closing?: string | null;
  status?: 'Active' | 'Inactive';
}

/** SUPER_ADMIN gets every branch; everyone else gets only their own. */
export async function listBranches(scopeToBranchId?: string): Promise<Branch[]> {
  if (scopeToBranchId) {
    const branch = await Branch.findByPk(scopeToBranchId);
    return branch ? [branch] : [];
  }
  return Branch.findAll({ order: [['name', 'ASC']] });
}

export async function getBranchOrThrow(branchId: string): Promise<Branch> {
  const branch = await Branch.findByPk(branchId);
  if (!branch) throw AppError.notFound('Branch not found.');
  return branch;
}

/** Asserts a branch exists and is Active. Used wherever a branch is written to. */
export async function requireActiveBranch(branchId: string): Promise<Branch> {
  const branch = await Branch.findByPk(branchId);
  if (!branch) throw AppError.badRequest('The specified branch does not exist.');
  if (branch.status !== 'Active') throw AppError.badRequest('The specified branch is inactive.');
  return branch;
}

/** Only a SUPER_ADMIN may create or modify branches. */
export async function createBranch(input: BranchInput): Promise<Branch> {
  const existing = await Branch.findOne({ where: { code: input.code.trim() } });
  if (existing) throw AppError.conflict('A branch with this code already exists.');
  return Branch.create({
    code: input.code.trim(),
    name: input.name.trim(),
    address: input.address ?? null,
    phone: input.phone ?? null,
    gst: input.gst ?? null,
    manager: input.manager ?? null,
    opening: input.opening ?? null,
    closing: input.closing ?? null,
    status: input.status ?? 'Active',
  });
}

export async function updateBranch(branchId: string, patch: Partial<BranchInput>): Promise<Branch> {
  const branch = await getBranchOrThrow(branchId);
  if (patch.code && patch.code.trim() !== branch.code) {
    const clash = await Branch.findOne({ where: { code: patch.code.trim() } });
    if (clash) throw AppError.conflict('A branch with this code already exists.');
  }
  await branch.update({
    ...(patch.code !== undefined ? { code: patch.code.trim() } : {}),
    ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
    ...(patch.address !== undefined ? { address: patch.address } : {}),
    ...(patch.phone !== undefined ? { phone: patch.phone } : {}),
    ...(patch.gst !== undefined ? { gst: patch.gst } : {}),
    ...(patch.manager !== undefined ? { manager: patch.manager } : {}),
    ...(patch.opening !== undefined ? { opening: patch.opening } : {}),
    ...(patch.closing !== undefined ? { closing: patch.closing } : {}),
    ...(patch.status !== undefined ? { status: patch.status } : {}),
  });
  return branch;
}

export async function assertCanAccessBranch(actor: { role: Role; branchId: string | null }, branchId: string): Promise<void> {
  if (actor.role === ROLES.SUPER_ADMIN) return;
  if (actor.branchId !== branchId) {
    throw AppError.branchForbidden('You do not have access to this branch.');
  }
}