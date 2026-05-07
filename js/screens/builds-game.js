import { db } from '../db.js';
import { navigate, showToast } from '../app.js';

export async function mount(container, { params }) {
  const gameId = params[0];
  const game = await db.get('build_games', gameId);
  if (!game) { navigate('builds-home'); return; }

  container.innerHTML = `
    <div class="screen">
      <div class="banner-header">
        ${game.bannerImage
          ? `<img src="${game.bannerImage}" alt="">`
          : `<div class="banner-header-no-img">⚔️</div>`}
        <div class="banner-header-overlay"></div>
        <div class="banner-header-actions">
          <button class="app-bar-btn back-btn" id="btn-back" style="color:#fff">‹</button>
          <div style="flex:1"></div>
          <button class="app-bar-btn" id="btn-template" style="color:#fff" title="Edit Template">🔧</button>
          <button class="app-bar-btn" id="btn-edit" style="color:#fff" title="Edit Game">⚙️</button>
        </div>
        <div class="banner-header-title">${esc(game.name)}</div>
      </div>

      <div class="scroll-area" id="builds-list"></div>
    </div>
    <button class="fab" id="fab-add" title="New Build">＋</button>`;

  document.getElementById('btn-back').addEventListener('click', () => navigate('builds-home'));
  document.getElementById('btn-edit').addEventListener('click', () => navigate(`edit-build-game/${gameId}`));
  document.getElementById('btn-template').addEventListener('click', () => navigate(`build-template/${gameId}`));
  document.getElementById('fab-add').addEventListener('click', addBuild);

  await renderBuilds();

  async function renderBuilds() {
    const list = document.getElementById('builds-list');
    const builds = (await db.getByIndex('builds', 'gameId', gameId))
      .sort((a, b) => a.createdAt - b.createdAt);

    if (!builds.length) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📋</div>
          <h3>No builds yet</h3>
          <p>Tap the + button to create your first build</p>
        </div>`;
      return;
    }

    // Compute progress for each build
    const sections = await db.getByIndex('build_sections', 'gameId', gameId);
    const totalFixed = sections.reduce((sum, s) => sum + (s.fields?.length || 0), 0);

    list.innerHTML = '';
    const container = document.createElement('div');
    container.className = 'builds-list';

    for (const build of builds) {
      const values = await db.getByIndex('build_values', 'buildId', build.id);
      const checkedFixed = values.filter(v => !v.isDynamic && v.checked).length;
      const pct = totalFixed > 0 ? Math.round((checkedFixed / totalFixed) * 100) : 0;

      const card = document.createElement('div');
      card.className = 'build-card';
      card.dataset.id = build.id;
      card.innerHTML = `
        <div class="build-card-info">
          <div class="build-card-name">${esc(build.name)}</div>
          <div class="build-card-progress-wrap">
            <div class="build-card-progress-fill" style="width:${pct}%"></div>
          </div>
        </div>
        <div class="build-card-count">${totalFixed > 0 ? `${checkedFixed}/${totalFixed}` : '—'}</div>`;

      card.addEventListener('click', () => navigate(`build-detail/${build.id}`));

      let pressTimer;
      card.addEventListener('pointerdown', () => {
        pressTimer = setTimeout(async () => {
          if (!confirm(`Delete build "${build.name}"?`)) return;
          await db.deleteByIndex('build_values', 'buildId', build.id);
          await db.delete('builds', build.id);
          showToast('Build deleted', 'success');
          renderBuilds();
        }, 600);
      });
      card.addEventListener('pointerup', () => clearTimeout(pressTimer));
      card.addEventListener('pointercancel', () => clearTimeout(pressTimer));

      container.appendChild(card);
    }

    list.appendChild(container);
  }

  async function addBuild() {
    const name = prompt('Build name (e.g. Fire Build):')?.trim();
    if (!name) return;

    const build = {
      id: crypto.randomUUID(),
      gameId,
      name,
      createdAt: Date.now(),
    };
    await db.put('builds', build);
    showToast('Build created!', 'success');
    navigate(`build-detail/${build.id}`);
  }
}

function esc(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
