import type { Request } from 'express';
import { Op } from 'sequelize';
import { Customer } from '../models';
import { AppError } from '../utils/AppError';
import { ROLES } from '../constants/roles';
import { currentUser } from '../middleware/authenticate';
import { authoritativeBranchId } from '../middleware/authorize';

export async function listCustomers(req: Request, branchId: string): Promise<Customer[]> {
  const user = currentUser(req);
  if (user.role !== ROLES.SUPER_ADMIN && user.branchId !== branchId) {
    throw AppError.branchForbidden('You do not have access to this branch.');
  }
  return Customer.findAll({
    where: { branchId, status: 'Active' },
    order: [['name', 'ASC']],
  });
}

export async function searchCustomers(req: Request, query: string): Promise<Customer[]> {
  const user = currentUser(req);
  const where: Record<string, unknown> = {
    [Op.or]: [
      { name: { [Op.iLike]: `%${query}%` } },
      { mobile: { [Op.iLike]: `%${query}%` } },
      { customerCode: { [Op.iLike]: `%${query}%` } },
    ],
  };
  if (user.role !== ROLES.SUPER_ADMIN && user.branchId) {
    where.branchId = user.branchId;
  }
  return Customer.findAll({ where, order: [['name', 'ASC']], limit: 50 });
}

export async function createCustomer(req: Request, input: Record<string, unknown>): Promise<Customer> {
  const branchId = authoritativeBranchId(req);
  const user = currentUser(req);

  if (user.role !== ROLES.SUPER_ADMIN && input.branchId && input.branchId !== branchId) {
    throw AppError.branchForbidden('You do not have access to the requested branch.');
  }

  const customer = await Customer.create({
    branchId,
    name: input.name,
    mobile: input.mobile ?? null,
    email: input.email ?? null,
    address: input.address ?? null,
    gst: input.gst ?? null,
    doctor: input.doctor ?? null,
    type: (input.type as string) ?? 'RETAIL',
    customerCode: input.customerCode ?? null,
    creditLimit: input.creditLimit ?? 0,
    openingBalance: input.openingBalance ?? 0,
    openingBalanceType: (input.openingBalanceType as string) ?? 'DEBIT',
    status: 'Active',
    localId: (input.id as string) ?? null,
  } as never);

  return customer;
}

export async function updateCustomer(req: Request, customerId: string, input: Record<string, unknown>): Promise<Customer> {
  const user = currentUser(req);
  const customer = await Customer.findByPk(customerId);
  if (!customer) throw AppError.notFound('Customer not found.');
  if (user.role !== ROLES.SUPER_ADMIN && user.branchId !== customer.branchId) {
    throw AppError.branchForbidden('You do not have access to this customer.');
  }
  await customer.update({
    name: input.name ?? customer.name,
    mobile: input.mobile !== undefined ? input.mobile : customer.mobile,
    email: input.email !== undefined ? input.email : customer.email,
    address: input.address !== undefined ? input.address : customer.address,
    gst: input.gst !== undefined ? input.gst : customer.gst,
    doctor: input.doctor !== undefined ? input.doctor : customer.doctor,
    type: input.type ?? customer.type,
    customerCode: input.customerCode !== undefined ? input.customerCode : customer.customerCode,
    creditLimit: input.creditLimit !== undefined ? input.creditLimit : customer.creditLimit,
    status: input.status ?? customer.status,
  } as never);
  return customer;
}
