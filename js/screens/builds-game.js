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
          <button class="app-bar-btn" id="btn-template" style="color:#fff" title="Edit Template"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg></button>
          <button class="app-bar-btn" id="btn-edit" style="color:#fff" title="Edit Game"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg></button>
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

    const sections = await db.getByIndex('build_sections', 'gameId', gameId);
    const totalFixed = sections.reduce((sum, s) => sum + (s.fields?.length || 0), 0);

    list.innerHTML = '';
    const listContainer = document.createElement('div');
    listContainer.className = 'builds-list';

    for (const build of builds) {
      const values = await db.getByIndex('build_values', 'buildId', build.id);
      const checkedFixed = values.filter(v => !v.isDynamic && v.checked).length;
      const pct = totalFixed > 0 ? Math.round((checkedFixed / totalFixed) * 100) : 0;

      const card = document.createElement('div');
      card.className = 'build-card';
      card.dataset.id = build.id;

      const bgHtml = build.bannerImage
        ? `<img class="build-card-bg" src="${build.bannerImage}" alt="">
           <div class="build-card-overlay"></div>`
        : '';

      card.innerHTML = `
        ${bgHtml}
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
          await db.deleteByIndex('build_photos', 'buildId', build.id);
          await db.deleteByIndex('build_values', 'buildId', build.id);
          await db.delete('builds', build.id);
          showToast('Build deleted', 'success');
          renderBuilds();
        }, 600);
      });
      card.addEventListener('pointerup', () => clearTimeout(pressTimer));
      card.addEventListener('pointercancel', () => clearTimeout(pressTimer));

      listContainer.appendChild(card);
    }

    list.appendChild(listContainer);
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
