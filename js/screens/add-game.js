import { db } from '../db.js';
import { navigate, showToast } from '../app.js';
import { resizeImage } from '../image.js';
import { scheduleNotifications } from '../notifications.js';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export async function mount(container, { screen, params }) {
  const isEdit = screen === 'edit-game';
  const gameId = params[0];
  let game = null;
  let bannerBase64 = null;

  if (isEdit && gameId) {
    game = await db.get('games', gameId);
    if (!game) { navigate('home'); return; }
    bannerBase64 = game.bannerImage || null;
  }

  const defDay = game?.weeklyResetDay ?? 1;

  container.innerHTML = `
    <div class="screen">
      <div class="app-bar">
        <button class="app-bar-btn back-btn" id="btn-back">‹</button>
        <div class="app-bar-title">${isEdit ? 'Edit Game' : 'Add Game'}</div>
      </div>
      <div class="form-screen">
        <div class="form-section">
          <div class="form-label">Game Name</div>
          <input class="form-input" id="game-name" type="text" placeholder="e.g. Genshin Impact" maxlength="50" value="${esc(game?.name || '')}">
        </div>

        <div class="form-section">
          <div class="form-label">Banner Image</div>
          <div class="img-picker" id="img-picker">
            ${bannerBase64 ? `<img id="banner-preview" src="${bannerBase64}" alt="">` : `
              <div class="img-picker-icon">🖼️</div>
              <div class="img-picker-label">Tap to choose an image</div>`}
            <div class="img-picker-overlay">📷 Change</div>
          </div>
          <input type="file" id="img-input" accept="image/*" style="display:none">
          <div class="form-hint">Auto-resized to keep file size light</div>
        </div>

        <div class="form-section">
          <div class="form-label">Daily Reset Time</div>
          <input class="form-input" id="daily-reset" type="time" value="${game?.dailyResetTime || '04:00'}">
        </div>

        <div class="form-section">
          <div class="form-label">Weekly Reset Day</div>
          <div class="day-picker" id="day-picker">
            ${DAYS.map((d, i) => `<button class="day-btn${i === defDay ? ' selected' : ''}" data-day="${i}">${d}</button>`).join('')}
          </div>
        </div>

        <div class="form-section">
          <div class="form-label">Weekly Reset Time</div>
          <input class="form-input" id="weekly-reset" type="time" value="${game?.weeklyResetTime || '04:00'}">
        </div>

        <div class="spacer"></div>
      </div>

      <div class="form-actions">
        <button class="btn btn-primary" id="btn-save">
          ${isEdit ? 'Save Changes' : 'Create Game'}
        </button>
        ${isEdit ? `<button class="btn btn-danger" id="btn-delete">Delete Game</button>` : ''}
      </div>
    </div>`;

  document.getElementById('btn-back').addEventListener('click', () => history.back());

  // Image picker
  const imgPicker = document.getElementById('img-picker');
  const imgInput = document.getElementById('img-input');
  imgPicker.addEventListener('click', () => imgInput.click());
  imgInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      bannerBase64 = await resizeImage(file);
      imgPicker.innerHTML = `<img id="banner-preview" src="${bannerBase64}" alt=""><div class="img-picker-overlay">📷 Change</div>`;
    } catch {
      showToast('Could not load image', 'error');
    }
  });

  // Day picker
  let selectedDay = defDay;
  document.getElementById('day-picker').addEventListener('click', (e) => {
    const btn = e.target.closest('.day-btn');
    if (!btn) return;
    selectedDay = Number(btn.dataset.day);
    document.querySelectorAll('.day-btn').forEach(b => b.classList.toggle('selected', Number(b.dataset.day) === selectedDay));
  });

  // Save
  document.getElementById('btn-save').addEventListener('click', async () => {
    const name = document.getElementById('game-name').value.trim();
    if (!name) { showToast('Please enter a game name', 'error'); return; }

    const allGames = await db.getAll('games');
    const record = {
      id: game?.id || crypto.randomUUID(),
      name,
      bannerImage: bannerBase64 || null,
      dailyResetTime: document.getElementById('daily-reset').value || '04:00',
      weeklyResetDay: selectedDay,
      weeklyResetTime: document.getElementById('weekly-reset').value || '04:00',
      order: game?.order ?? allGames.length,
      createdAt: game?.createdAt ?? Date.now(),
    };

    await db.put('games', record);
    scheduleNotifications();
    showToast(isEdit ? 'Game updated!' : 'Game added!', 'success');
    navigate('home');
  });

  // Delete
  if (isEdit) {
    document.getElementById('btn-delete').addEventListener('click', async () => {
      if (!confirm(`Delete "${game.name}" and all its tasks?`)) return;
      const tasks = await db.getByIndex('tasks', 'gameId', gameId);
      for (const t of tasks) {
        await db.deleteByIndex('completions', 'taskId', t.id);
        await db.delete('tasks', t.id);
      }
      await db.delete('games', gameId);
      showToast('Game deleted', 'success');
      navigate('home');
    });
  }
}

function esc(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
