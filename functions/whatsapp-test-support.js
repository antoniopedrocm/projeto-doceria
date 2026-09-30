const assert = require('node:assert/strict');
// Atomic in-memory transaction double: serializes concurrent commits, stages all
// writes, and can fail commit without partially applying data.
const memoryDb = () => {
  const data = new Map();
  let chain = Promise.resolve();
  let failCommit = false;
  const clone = (value) => value === undefined ? undefined : structuredClone(value);
  const snapshot = (name) => ({id: name.split('/').pop(), exists: data.has(name), data: () => clone(data.get(name))});
  const db = {
    data,
    doc: (path) => ({path, get: async () => snapshot(path)}),
    failNextCommit: () => {failCommit = true;},
    runTransaction: (fn) => {
      const operation = chain.then(async () => {
        const writes = [];
        const result = await fn({get: async (ref) => {
          assert.equal(writes.length, 0, 'Firestore requires all reads before writes');
          return snapshot(ref.path);
        }, set: (ref, value) => writes.push([ref.path, clone(value)]),
        update: (ref, value) => writes.push([ref.path, {...clone(data.get(ref.path)), ...clone(value)}])});
        if (failCommit) {failCommit = false; throw new Error('commit unavailable');}
        writes.forEach(([key, value]) => data.set(key, value));
        return result;
      });
      chain = operation.catch(() => {});
      return operation;
    },
    collection: (path) => {
      const query = (filter = () => true) => ({orderBy: (field, direction = 'asc') => ({limit: (limit) => ({get: async () => ({
        docs: [...data.keys()].filter((key) => key.startsWith(`${path}/`) && key.split('/').length === path.split('/').length + 1 && filter(data.get(key)))
          .sort((a, b) => (data.get(a)[field] - data.get(b)[field]) * (direction === 'desc' ? -1 : 1)).slice(0, limit).map(snapshot),
      })})})});
      return {...query(), where: (field, op, value) => {
        assert.equal(op, '<='); return query((doc) => doc[field] <= value);
      }};
    },
  };
  return db;
};

module.exports = {memoryDb};
