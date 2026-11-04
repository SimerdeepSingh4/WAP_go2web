import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import mongoose from 'mongoose';

const id = (n) => String(n).padStart(24, '0');
const admin = id(1), reseller = id(2), otherReseller = id(3), user = id(4), otherUser = id(5), assigned = id(6), transferred = id(7);
const accounts = [
  { _id: user, role: 'User', resellerId: reseller, createdBy: reseller },
  { _id: otherUser, role: 'User', resellerId: otherReseller, createdBy: otherReseller },
  { _id: assigned, role: 'User', resellerId: reseller, createdBy: admin },
  { _id: transferred, role: 'User', resellerId: otherReseller, createdBy: reseller },
];
const rows = [
  { _id: 'a', fromUser: admin, toUser: user, type: 'ALLOCATE' },
  { _id: 'b', fromUser: user, toUser: user, type: 'DEDUCT' },
  { _id: 'c', fromUser: admin, toUser: otherUser, type: 'REFUND' },
  { _id: 'd', fromUser: admin, toUser: reseller, type: 'ALLOCATE' },
  { _id: 'e', fromUser: reseller, toUser: user, type: 'ALLOCATE' },
  { _id: 'f', fromUser: admin, toUser: assigned, type: 'ALLOCATE' },
  { _id: 'g', fromUser: admin, toUser: otherReseller, type: 'ALLOCATE' },
  { _id: 'h', fromUser: user, toUser: reseller, type: 'REQUEST' },
  { _id: 'i', fromUser: admin, toUser: transferred, type: 'ALLOCATE' },
];
function matches(row, filter) {
  return Object.entries(filter).every(([key, value]) => key === '$or'
    ? value.some((branch) => matches(row, branch))
    : value?.$in ? value.$in.some((id) => String(id) === String(row[key])) : String(value) === String(row[key]));
}
async function invoke(role, accountId, query = {}) {
  const dependencies = {
    mongoose: { default: mongoose },
    '../services/socket.service.js': { notifyUser() {} },
    '../helpers/credit.helper.js': { reconcileWallet() {} },
    '../models/user.model.js': { default: { find: (filter) => ({ select: async () => accounts.filter((row) => matches(row, filter)) }) } },
    '../models/transaction.model.js': { default: {
      countDocuments: async (filter) => rows.filter((row) => matches(row, filter)).length,
      find: (filter) => {
        let result = rows.filter((row) => matches(row, filter));
        const chain = { populate: () => chain, sort: () => chain, skip: (n) => { result = result.slice(n); return chain; }, limit: (n) => { result = result.slice(0, n); return chain; }, then: (resolve) => Promise.resolve(result).then(resolve) };
        return chain;
      },
    } },
  };
  const context = vm.createContext({ console });
  const module = new vm.SourceTextModule(await readFile(new URL('./src/controllers/credit.controller.js', import.meta.url), 'utf8'), { context });
  await module.link(async (specifier) => {
    const exports = dependencies[specifier] || { default: {} };
    return new vm.SyntheticModule(Object.keys(exports), function () { for (const [key, value] of Object.entries(exports)) this.setExport(key, value); }, { context });
  });
  await module.evaluate();
  const response = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await module.namespace.getTransactions({ user: { role, _id: accountId }, query }, response);
  return response;
}

test('user sees only their own transactions and cannot select another account', async () => {
  const result = await invoke('User', user);
  assert.equal(result.code, 200);
  assert.deepEqual(Array.from(result.body.transactions, (row) => row._id), ['a', 'b', 'e', 'h']);
  assert.equal(result.body.pagination.total, 4);
  assert.equal((await invoke('User', user, { userId: otherUser })).code, 403);
});

test('reseller sees own transactions and users they created, excluding other reseller accounts', async () => {
  const result = await invoke('Reseller', reseller);
  assert.equal(result.code, 200);
  assert.deepEqual(Array.from(result.body.transactions, (row) => row._id), ['a', 'b', 'd', 'e', 'h']);
  assert.equal(result.body.pagination.total, 5);
  for (const account of [otherUser, assigned, transferred]) assert.equal((await invoke('Reseller', reseller, { userId: account })).code, 403);
});

test('account and type filters narrow reseller scope, including requests', async () => {
  const own = await invoke('Reseller', reseller, { userId: reseller });
  assert.deepEqual(Array.from(own.body.transactions, (row) => row._id), ['d', 'e', 'h']);
  const requests = await invoke('Reseller', reseller, { userId: user, type: 'REQUEST', limit: 1 });
  assert.deepEqual(Array.from(requests.body.transactions, (row) => row._id), ['h']);
  assert.equal(requests.body.pagination.total, 1);
});

test('unsupported roles are denied and admin retains access', async () => {
  assert.equal((await invoke('Unknown', user)).code, 403);
  assert.equal((await invoke('User', user, { userId: 'bad-id' })).code, 400);
  const result = await invoke('Super Admin', admin);
  assert.equal(result.body.transactions.length, rows.length);
});
