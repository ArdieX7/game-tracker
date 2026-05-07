import { db } from '../db.js';
import { navigate } from '../app.js';
import { getDailyPeriodKey, getWeeklyPeriodKey, getNextDailyReset, getNextWeeklyReset, timeUntil } from '../reset.js';

const DOTS_THRESHOLD = 8; // maxCount <= this → dots; > this → progress bar

export async function mount(container, { params }) {
  const gameId = params[0];
  const game = await db.get('games', gameId);
  if (!game) { navigate('tracker'); return; }

  let activeTab = 'daily';

  container.innerHTML = `
    <div class="screen" id="game-screen">
      <div class="banner-header">
        ${game.bannerImage
          ? `<img src="${game.bannerImage}" alt="">`
          : `<div class="banner-header-no-img">🎮</div>`}
        <div class="banner-header-overlay"></div>
        <div class="banner-header-actions">
          <button class="app-bar-btn back-btn" id="btn-back" style="color:#fff">‹</button>
          <div style="flex:1"></div>
          <button class="app-bar-btn" id="btn-history" style="color:#fff" title="History">📅</button>
          <button class="app-bar-btn" id="btn-edit" style="color:#fff" title="Edit Game">⚙️</button>
        </div>
        <div class="banner-header-title">${esc(game.name)}</div>
      </div>

      <div class="tabs" id="tabs">
        <div class="tab active" data-tab="daily">📅 Daily</div>
        <div class="tab" data-tab="weekly">📆 Weekly</div>
      </div>

      <div class="scroll-area" id="task-area"></div>
    </div>
    <button class="fab" id="fab-add">＋</button>`;

  document.getElementById('btn-back').addEventListener('click', () => navigate('tracker'));
  document.getElementById('btn-edit').addEventListener('click', () => navigate(`edit-game/${gameId}`));
  document.getElementById('btn-history').addEventListener('click', () => navigate(`history/${gameId}`));
  document.getElementById('fab-add').addEventListener('click', () => navigate(`add-task/${gameId}/${activeTab}`));

  document.getElementById('tabs').addEventListener('click', (e) => {
    const tab = e.target.closest('.tab');
    if (!tab || tab.dataset.tab === activeTab) return;
    activeTab = tab.dataset.tab;
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === activeTab));
    renderTasks();
  });

  async function renderTasks() {
    const area = document.getElementById('task-area');
    area.innerHTML = '';

    const all = await db.getByIndex('tasks', 'gameId', gameId);
    const todayDow = new Date().getDay();
    const allForTab = all.filter(t => t.type === activeTab).sort((a, b) => a.order - b.order);
    const tasks = activeTab === 'daily'
      ? allForTab.filter(t => !t.activeDays?.length || t.activeDays.includes(todayDow))
      : allForTab;

    const nextReset = activeTab === 'daily'
      ? getNextDailyReset(game.dailyResetTime)
      : getNextWeeklyReset(game.weeklyResetDay, game.weeklyResetTime);
    const periodKey = activeTab === 'daily'
      ? getDailyPeriodKey(game.dailyResetTime)
      : getWeeklyPeriodKey(game.weeklyResetDay, game.weeklyResetTime);

    const banner = document.createElement('div');
    banner.className = 'reset-banner';
    banner.innerHTML = `<span class="reset-banner-icon">⏱</span> Resets in <strong style="margin:0 4px">${timeUntil(nextReset)}</strong> · ${fmtTime(nextReset)}`;
    area.appendChild(banner);

    if (!tasks.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      if (allForTab.length > 0 && activeTab === 'daily') {
        empty.innerHTML = `
          <div class="empty-state-icon">📅</div>
          <h3>No tasks today</h3>
          <p>All daily tasks are scheduled for specific days only</p>`;
      } else {
        empty.innerHTML = `
          <div class="empty-state-icon">${activeTab === 'daily' ? '📅' : '📆'}</div>
          <h3>No ${activeTab} tasks</h3>
          <p>Tap the + button to add your first ${activeTab} task</p>`;
      }
      area.appendChild(empty);
      return;
    }

    for (const task of tasks) {
      const compId = `${task.id}_${periodKey}`;
      const comp = (await db.get('completions', compId))
        || { id: compId, taskId: task.id, gameId, type: activeTab, periodKey, count: 0, updatedAt: 0 };
      area.appendChild(buildTaskRow(task, comp));
    }

    const hint = document.createElement('div');
    hint.className = 'swipe-hint';
    hint.textContent = 'Long press a task to edit it';
    area.appendChild(hint);
  }

  // ── Row builders ──────────────────────────────────────────

  function buildTaskRow(task, comp) {
    const row = document.createElement('div');
    const done = comp.count >= task.maxCount;
    row.className = `task-item${done ? ' completed' : ''}`;

    if (task.maxCount === 1) {
      // Simple checkbox
      row.innerHTML = `
        <div class="task-checkbox">${done ? '✓' : ''}</div>
        <div class="task-name">${esc(task.name)}</div>`;
      row.addEventListener('click', () => toggleSingle(task, comp, row));

    } else if (task.maxCount <= DOTS_THRESHOLD) {
      // Dot indicators
      row.innerHTML = `
        <div class="task-dots" id="dots-${task.id}">${buildDots(comp.count, task.maxCount)}</div>
        <div class="task-name">${esc(task.name)}</div>
        <div class="task-dot-count" id="cnt-${task.id}">${comp.count}/${task.maxCount}</div>
        <div class="task-undo-slot" id="undo-slot-${task.id}"></div>`;
      row.addEventListener('click', (e) => {
        if (e.target.closest('.task-undo-slot')) return;
        incrementTask(task, comp, row);
      });
      syncUndoSlot(row, task, comp);

    } else {
      // Progress bar for high-count tasks
      const pct = pctOf(comp.count, task.maxCount);
      row.classList.add('task-item-progress');
      row.innerHTML = `
        <div class="task-progress-content">
          <div class="task-name">${esc(task.name)}</div>
          <div class="task-progress-row">
            <div class="task-progress-wrap" id="progress-${task.id}">
              <div class="task-progress-fill" style="width:${pct}%"></div>
            </div>
            <div class="task-progress-label" id="cnt-${task.id}">${comp.count}/${task.maxCount}</div>
          </div>
        </div>
        <div class="task-undo-slot" id="undo-slot-${task.id}"></div>`;
      row.addEventListener('click', (e) => {
        if (e.target.closest('.task-undo-slot')) return;
        incrementTask(task, comp, row);
      });
      syncUndoSlot(row, task, comp);
    }

    // Long press → edit task
    let pressTimer;
    row.addEventListener('pointerdown', () => { pressTimer = setTimeout(() => navigate(`edit-task/${task.id}`), 600); });
    row.addEventListener('pointerup', () => clearTimeout(pressTimer));
    row.addEventListener('pointercancel', () => clearTimeout(pressTimer));

    return row;
  }

  // ── Completion actions ────────────────────────────────────

  async function toggleSingle(task, comp, row) {
    comp.count = comp.count >= task.maxCount ? 0 : 1;
    comp.updatedAt = Date.now();
    await db.put('completions', comp);
    refreshRow(task, comp, row);
  }

  async function incrementTask(task, comp, row) {
    if (comp.count >= task.maxCount) return;
    comp.count++;
    comp.updatedAt = Date.now();
    await db.put('completions', comp);
    refreshRow(task, comp, row);
  }

  async function decrementTask(task, comp, row) {
    if (comp.count <= 0) return;
    comp.count--;
    comp.updatedAt = Date.now();
    await db.put('completions', comp);
    refreshRow(task, comp, row);
  }

  // ── Refresh a row in place ────────────────────────────────

  function refreshRow(task, comp, row) {
    const done = comp.count >= task.maxCount;
    row.classList.toggle('completed', done);

    if (task.maxCount === 1) {
      row.querySelector('.task-checkbox').textContent = done ? '✓' : '';

    } else if (task.maxCount <= DOTS_THRESHOLD) {
      row.querySelector(`#dots-${task.id}`).innerHTML = buildDots(comp.count, task.maxCount);
      row.querySelector(`#cnt-${task.id}`).textContent = `${comp.count}/${task.maxCount}`;
      syncUndoSlot(row, task, comp);

    } else {
      const fill = row.querySelector(`#progress-${task.id} .task-progress-fill`);
      if (fill) fill.style.width = `${pctOf(comp.count, task.maxCount)}%`;
      row.querySelector(`#cnt-${task.id}`).textContent = `${comp.count}/${task.maxCount}`;
      syncUndoSlot(row, task, comp);
    }
  }

  // ── Undo slot: always kept in sync, never searches by style attr ──

  function syncUndoSlot(row, task, comp) {
    const slot = row.querySelector(`#undo-slot-${task.id}`);
    if (!slot) return;

    if (comp.count > 0) {
      if (!slot.querySelector('.task-undo')) {
        slot.innerHTML = '';
        const btn = document.createElement('button');
        btn.className = 'task-undo';
        btn.title = 'Undo last';
        btn.textContent = '↩';
        btn.addEventListener('click', (e) => { e.stopPropagation(); decrementTask(task, comp, row); });
        slot.appendChild(btn);
      }
    } else {
      slot.innerHTML = '';
    }
  }

  // ── Helpers ───────────────────────────────────────────────

  function buildDots(count, max) {
    let html = '';
    for (let i = 0; i < max; i++) {
      html += `<div class="task-dot${i < count ? ' filled' : ''}"></div>`;
    }
    return html;
  }

  function pctOf(count, max) {
    return Math.round((count / max) * 100);
  }

  renderTasks();
}

function fmtTime(date) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function esc(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
