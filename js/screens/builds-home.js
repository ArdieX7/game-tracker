import { db } from '../db.js';
import { navigate } from '../app.js';

export async function mount(container) {
  const games = (await db.getAll('build_games')).sort((a, b) => a.order - b.order);

  container.innerHTML = `
    <div class="screen">
      <div class="app-bar">
        <button class="app-bar-btn back-btn" id="btn-back">‹</button>
        <div class="app-bar-title">Game <span>Builds</span></div>
        <button class="app-bar-btn accent" id="btn-add" title="Add Game">＋</button>
      </div>
      <div class="scroll-area" id="games-list"></div>
    </div>`;

  document.getElementById('btn-back').addEventListener('click', () => navigate('home'));
  document.getElementById('btn-add').addEventListener('click', () => navigate('add-build-game'));

  const list = document.getElementById('games-list');

  if (!games.length) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⚔️</div>
        <h3>No games yet</h3>
        <p>Tap the + button to add your first game and create builds</p>
      </div>`;
    return;
  }

  list.innerHTML = `<div class="games-grid">${games.map(game => {
    const imgHtml = game.bannerImage
      ? `<img class="game-card-bg" src="${game.bannerImage}" alt="">`
      : `<div class="game-card-no-img">⚔️</div>`;
    return `
      <div class="game-card" data-id="${game.id}">
        ${imgHtml}
        <div class="game-card-overlay"></div>
        <div class="game-card-info">
          <div class="game-card-name">${esc(game.name)}</div>
        </div>
      </div>`;
  }).join('')}</div>`;

  let pressTimer;
  list.querySelectorAll('.game-card').forEach(card => {
    card.addEventListener('click', () => navigate(`builds-game/${card.dataset.id}`));
    card.addEventListener('pointerdown', () => { pressTimer = setTimeout(() => navigate(`edit-build-game/${card.dataset.id}`), 600); });
    card.addEventListener('pointerup', () => clearTimeout(pressTimer));
    card.addEventListener('pointercancel', () => clearTimeout(pressTimer));
  });
}

function esc(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
