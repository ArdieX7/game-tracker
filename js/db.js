const DB_NAME = 'GameTrackerDB';
const DB_VERSION = 2;
let _db = null;

function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      // v1 stores — guarded so existing users don't lose data
      if (!db.objectStoreNames.contains('games')) {
        const games = db.createObjectStore('games', { keyPath: 'id' });
        games.createIndex('order', 'order');
      }
      if (!db.objectStoreNames.contains('tasks')) {
        const tasks = db.createObjectStore('tasks', { keyPath: 'id' });
        tasks.createIndex('gameId', 'gameId');
        tasks.createIndex('gameId_type', ['gameId', 'type']);
      }
      if (!db.objectStoreNames.contains('completions')) {
        const completions = db.createObjectStore('completions', { keyPath: 'id' });
        completions.createIndex('gameId', 'gameId');
        completions.createIndex('taskId', 'taskId');
        completions.createIndex('taskId_periodKey', ['taskId', 'periodKey']);
      }
      // v2 stores — Game Builds feature
      if (e.oldVersion < 2) {
        const bg = db.createObjectStore('build_games', { keyPath: 'id' });
        bg.createIndex('order', 'order');

        const bs = db.createObjectStore('build_sections', { keyPath: 'id' });
        bs.createIndex('gameId', 'gameId');

        const builds = db.createObjectStore('builds', { keyPath: 'id' });
        builds.createIndex('gameId', 'gameId');

        const bv = db.createObjectStore('build_values', { keyPath: 'id' });
        bv.createIndex('buildId', 'buildId');
        bv.createIndex('buildId_sectionId', ['buildId', 'sectionId']);
      }
    };
    req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
    req.onerror = (e) => reject(e.target.error);
  });
}

async function tx(storeName, mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(storeName, mode);
    const store = t.objectStore(storeName);
    const req = fn(store);
    if (req && req.onsuccess !== undefined) {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    } else {
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    }
  });
}

export const db = {
  async getAll(store) {
    return tx(store, 'readonly', s => s.getAll());
  },
  async getByIndex(store, index, value) {
    return tx(store, 'readonly', s => s.index(index).getAll(value));
  },
  async get(store, id) {
    return tx(store, 'readonly', s => s.get(id));
  },
  async put(store, record) {
    return tx(store, 'readwrite', s => s.put(record));
  },
  async delete(store, id) {
    return tx(store, 'readwrite', s => s.delete(id));
  },
  async deleteByIndex(storeName, indexName, value) {
    const dbInstance = await openDB();
    return new Promise((resolve, reject) => {
      const t = dbInstance.transaction(storeName, 'readwrite');
      const store = t.objectStore(storeName);
      const req = store.index(indexName).openCursor(IDBKeyRange.only(value));
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) { cursor.delete(); cursor.continue(); }
      };
      t.oncomplete = resolve;
      t.onerror = () => reject(t.error);
    });
  },
  async count(storeName) {
    return tx(storeName, 'readonly', s => s.count());
  }
};

export { openDB };
