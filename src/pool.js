/**
 * Fixed-capacity, zero-GC object pool backed by dense swap-remove.
 * Active elements always occupy items[0 .. pool.count - 1].
 */
export function createPool(capacity, factory) {
  const cap = Math.max(0, capacity | 0);
  const items = new Array(cap);
  for (let i = 0; i < cap; i++) {
    items[i] = factory(i);
  }

  const pool = {
    items,
    count: 0,
    capacity: cap,

    spawn(initFn) {
      if (pool.count >= pool.capacity) {
        return null;
      }
      const item = pool.items[pool.count];
      if (typeof initFn === 'function') {
        initFn(item);
      }
      pool.count++;
      return item;
    },

    removeAt(index) {
      if (index < 0 || index >= pool.count) {
        return;
      }
      const last = pool.count - 1;
      if (index !== last) {
        const removed = pool.items[index];
        pool.items[index] = pool.items[last];
        pool.items[last] = removed;
      }
      pool.count = last;
    },

    clear() {
      pool.count = 0;
    },
  };

  return pool;
}
