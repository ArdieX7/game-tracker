import { openDB } from './db.js';
import { scheduleNotifications } from './notifications.js';

const moduleCache = {};

async function loadScreen(name) {
  if (!moduleCache[name]) {
    moduleCache[name] = await import(`./screens/${name}.js`);
  }
  return moduleCache[name];
}

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '') || 'home';
  const parts = raw.split('/');
  return { screen: parts[0], params: parts.slice(1) };
}

const SCREEN_MAP = {
  home: 'home',
  game: 'game',
  'add-game': 'add-game',
  'edit-game': 'add-game',
  'add-task': 'add-task',
  'edit-task': 'add-task',
  history: 'history',
};

let currentCleanup = null;

async function render() {
  const app = document.getElementById('app');
  if (currentCleanup) { currentCleanup(); currentCleanup = null; }
  app.innerHTML = '';

  const { screen, params } = parseHash();
  const file = SCREEN_MAP[screen] || 'home';

  try {
    const mod = await loadScreen(file);
    const cleanup = await mod.mount(app, { screen, params });
    if (typeof cleanup === 'function') currentCleanup = cleanup;
    app.classList.add('screen-enter');
    setTimeout(() => app.classList.remove('screen-enter'), 300);
  } catch (err) {
    console.error('Screen load error:', err);
    app.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div><h3>Error loading screen</h3><p>${err.message}</p></div>`;
  }
}

export function navigate(hash) {
  location.hash = hash;
}

export function showToast(msg, type = '') {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast${type ? ' ' + type : ''}`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

window.addEventListener('hashchange', render);

(async () => {
  await openDB();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(console.warn);
  }

  // Only schedule if permission already granted (request comes from UI gesture in home screen)
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    scheduleNotifications();
  }

  await render();
})();
