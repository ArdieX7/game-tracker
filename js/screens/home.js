import { db } from '../db.js';
import { navigate, showToast } from '../app.js';
import { getDailyPeriodKey, getWeeklyPeriodKey } from '../reset.js';

export async function mount(container) {
  const games = (await db.getAll('games')).sort((a, b) => a.order - b.order);

  container.innerHTML = `
    <div class="screen">
      <div class="app-bar">
        <div class="app-bar-title">Game <span>Tracker</span></div>
        <button class="app-bar-btn accent" id="btn-add-game" title="Add Game">＋</button>
      </div>
      <div class="scroll-area">
        <div id="notif-banner-area"></div>
        <div id="games-list"></div>
      </div>
    </div>`;

  document.getElementById('btn-add-game').addEventListener('click', () => navigate('add-game'));

  // Notification permission banner — only shown if not yet decided
  if ('Notification' in window && Notification.permission === 'default') {
    document.getElementById('notif-banner-area').innerHTML = `
      <div class="notif-request-banner">
        <div>
          <div style="font-weight:600;margin-bottom:2px">🔔 Reset Notifications</div>
          <div style="font-size:13px;color:var(--text-muted)">Get reminded 30 min before resets</div>
        </div>
        <button class="btn-enable-notif" id="btn-enable-notif">Enable</button>
      </div>`;

    document.getElementById('btn-enable-notif').addEventListener('click', async () => {
      const { requestPermission, scheduleNotifications } = await import('../notifications.js');
      const granted = await requestPermission();
      if (granted) {
        await scheduleNotifications();
        document.getElementById('notif-banner-area').innerHTML = '';
        showToast('Notifications enabled!', 'success');
      } else {
        showToast('Permission denied — check browser settings', 'error');
      }
    });
  }

  await renderGames(games, document.getElementById('games-list'));
}

async function renderGames(games, list) {
  if (!games.length) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🎮</div>
        <h3>No games yet</h3>
        <p>Tap the + button to add your first game and start tracking tasks</p>
      </div>`;
    return;
  }

  const cards = await Promise.all(games.map(async (game) => {
    const tasks = await db.getByIndex('tasks', 'gameId', game.id);
    const dailyTasks = tasks.filter(t => t.type === 'daily');
    const weeklyTasks = tasks.filter(t => t.type === 'weekly');

    const dKey = getDailyPeriodKey(game.dailyResetTime);
    const wKey = getWeeklyPeriodKey(game.weeklyResetDay, game.weeklyResetTime);

    let dDone = 0, wDone = 0;
    for (const t of dailyTasks) {
      const c = await db.get('completions', `${t.id}_${dKey}`);
      if (c && c.count >= t.maxCount) dDone++;
    }
    for (const t of weeklyTasks) {
      const c = await db.get('completions', `${t.id}_${wKey}`);
      if (c && c.count >= t.maxCount) wDone++;
    }

    return { game, dDone, dTotal: dailyTasks.length, wDone, wTotal: weeklyTasks.length };
  }));

  list.innerHTML = `<div class="games-grid">${cards.map(({ game, dDone, dTotal, wDone, wTotal }) => {
    const imgHtml = game.bannerImage
      ? `<img class="game-card-bg" src="${game.bannerImage}" alt="">`
      : `<div class="game-card-no-img">🎮</div>`;

    const dClass = dTotal === 0 ? '' : dDone === dTotal ? 'done' : dDone > 0 ? 'partial' : '';
    const wClass = wTotal === 0 ? '' : wDone === wTotal ? 'done' : wDone > 0 ? 'partial' : '';

    const pills = [
      dTotal > 0 ? `<span class="progress-pill ${dClass}">D ${dDone}/${dTotal}</span>` : '',
      wTotal > 0 ? `<span class="progress-pill ${wClass}">W ${wDone}/${wTotal}</span>` : '',
    ].filter(Boolean).join('');

    return `
      <div class="game-card" data-id="${game.id}">
        ${imgHtml}
        <div class="game-card-overlay"></div>
        <div class="game-card-info">
          <div class="game-card-name">${esc(game.name)}</div>
          <div class="game-card-progress">${pills}</div>
        </div>
      </div>`;
  }).join('')}</div>`;

  list.querySelectorAll('.game-card').forEach(card => {
    card.addEventListener('click', () => navigate(`game/${card.dataset.id}`));
    card.addEventListener('contextmenu', (e) => { e.preventDefault(); navigate(`edit-game/${card.dataset.id}`); });
  });
}

function esc(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
