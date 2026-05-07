import { db } from '../db.js';
import { navigate, showToast } from '../app.js';
import { resizeImage } from '../image.js';

export async function mount(container, { screen, params }) {
  const isEdit = screen === 'edit-build-game';
  const gameId = params[0];
  let game = null;
  let bannerBase64 = null;

  if (isEdit && gameId) {
    game = await db.get('build_games', gameId);
    if (!game) { navigate('builds-home'); return; }
    bannerBase64 = game.bannerImage || null;
  }

  container.innerHTML = `
    <div class="screen">
      <div class="app-bar">
        <button class="app-bar-btn back-btn" id="btn-back">‹</button>
        <div class="app-bar-title">${isEdit ? 'Edit Game' : 'Add Game'}</div>
      </div>
      <div class="form-screen">
        <div class="form-section">
          <div class="form-label">Game Name</div>
          <input class="form-input" id="game-name" type="text" placeholder="e.g. Diablo IV" maxlength="50" value="${esc(game?.name || '')}">
        </div>

        <div class="form-section">
          <div class="form-label">Banner Image</div>
          <div class="img-picker" id="img-picker">
            ${bannerBase64 ? `<img src="${bannerBase64}" alt="">` : `
              <div class="img-picker-icon">🖼️</div>
              <div class="img-picker-label">Tap to choose an image</div>`}
            <div class="img-picker-overlay">📷 Change</div>
          </div>
          <input type="file" id="img-input" accept="image/*" style="display:none">
          <div class="form-hint">Auto-resized to keep file size light</div>
        </div>

        <div class="spacer"></div>
      </div>

      <div class="form-actions">
        <button class="btn btn-primary" id="btn-save">${isEdit ? 'Save Changes' : 'Create Game'}</button>
        ${isEdit ? `<button class="btn btn-danger" id="btn-delete">Delete Game</button>` : ''}
      </div>
    </div>`;

  document.getElementById('btn-back').addEventListener('click', () => history.back());

  const imgPicker = document.getElementById('img-picker');
  const imgInput = document.getElementById('img-input');
  imgPicker.addEventListener('click', () => imgInput.click());
  imgInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      bannerBase64 = await resizeImage(file);
      imgPicker.innerHTML = `<img src="${bannerBase64}" alt=""><div class="img-picker-overlay">📷 Change</div>`;
    } catch {
      showToast('Could not load image', 'error');
    }
  });

  document.getElementById('btn-save').addEventListener('click', async () => {
    const name = document.getElementById('game-name').value.trim();
    if (!name) { showToast('Please enter a game name', 'error'); return; }

    const all = await db.getAll('build_games');
    const record = {
      id: game?.id || crypto.randomUUID(),
      name,
      bannerImage: bannerBase64 || null,
      order: game?.order ?? all.length,
      createdAt: game?.createdAt ?? Date.now(),
    };

    await db.put('build_games', record);
    showToast(isEdit ? 'Game updated!' : 'Game added!', 'success');
    navigate('builds-home');
  });

  if (isEdit) {
    document.getElementById('btn-delete').addEventListener('click', async () => {
      if (!confirm(`Delete "${game.name}" and all its builds?`)) return;
      // Cascade: build_values → builds → build_sections → build_game
      const builds = await db.getByIndex('builds', 'gameId', gameId);
      for (const b of builds) {
        await db.deleteByIndex('build_values', 'buildId', b.id);
      }
      await db.deleteByIndex('builds', 'gameId', gameId);
      await db.deleteByIndex('build_sections', 'gameId', gameId);
      await db.delete('build_games', gameId);
      showToast('Game deleted', 'success');
      navigate('builds-home');
    });
  }
}

function esc(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
