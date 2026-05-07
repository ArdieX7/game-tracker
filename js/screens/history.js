import { db } from '../db.js';
import { navigate } from '../app.js';
import { getDailyPeriodKey, getWeeklyPeriodKey } from '../reset.js';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export async function mount(container, { params }) {
  const gameId = params[0];
  const game = await db.get('games', gameId);
  if (!game) { navigate('tracker'); return; }

  container.innerHTML = `
    <div class="screen">
      <div class="app-bar">
        <button class="app-bar-btn back-btn" id="btn-back">‹</button>
        <div class="app-bar-title">History</div>
      </div>
      <div class="scroll-area" id="history-area">
        <div class="loading"><div class="spinner"></div></div>
      </div>
    </div>`;

  document.getElementById('btn-back').addEventListener('click', () => history.back());

  const area = document.getElementById('history-area');
  const tasks = await db.getByIndex('tasks', 'gameId', gameId);
  const dailyTasks = tasks.filter(t => t.type === 'daily').sort((a, b) => a.order - b.order);
  const weeklyTasks = tasks.filter(t => t.type === 'weekly').sort((a, b) => a.order - b.order);

  // Build 4 weeks of data (28 days back)
  const today = new Date();
  today.setHours(23, 59, 59, 999);

  // Group days into weeks (Mon–Sun)
  const weeks = [];
  let d = new Date(today);
  // Start from today and go back 28 days
  const days = [];
  for (let i = 0; i < 28; i++) {
    days.push(new Date(d));
    d.setDate(d.getDate() - 1);
  }
  // days[0] = today, days[27] = 27 days ago

  // Group into weeks of 7
  for (let w = 0; w < 4; w++) {
    weeks.push(days.slice(w * 7, w * 7 + 7));
  }

  // Get all completions for this game
  const allComps = await db.getByIndex('completions', 'gameId', gameId);
  const compMap = {};
  for (const c of allComps) compMap[c.id] = c;

  function getDayKey(date) {
    const y = date.getFullYear();
    const mo = String(date.getMonth() + 1).padStart(2, '0');
    const da = String(date.getDate()).padStart(2, '0');
    return `${y}-${mo}-${da}`;
  }

  // Build simulated period keys for each day
  function simulateDailyPeriodKey(date) {
    // If the time has passed the reset time → that day, else → previous day
    // We assume the date is a day in the past, so we treat the date itself as the period
    return `daily:${getDayKey(date)}`;
  }

  // For weekly, find which week start each day belongs to (using game's reset config)
  function simulateWeeklyPeriodKey(date) {
    const dow = date.getDay();
    const [rh, rm] = game.weeklyResetTime.split(':').map(Number);
    let daysBack = (dow - game.weeklyResetDay + 7) % 7;
    const weekStart = new Date(date);
    weekStart.setDate(weekStart.getDate() - daysBack);
    weekStart.setHours(rh, rm, 0, 0);
    if (date < weekStart) weekStart.setDate(weekStart.getDate() - 7);
    return `weekly:${getDayKey(weekStart)}`;
  }

  const todayKey = getDayKey(today);

  area.innerHTML = '';

  // Render each week (0 = most recent)
  for (let wi = 0; wi < 4; wi++) {
    const weekDays = weeks[wi];
    const weekLabel = wi === 0 ? 'This Week' : wi === 1 ? 'Last Week' : `${wi + 1} Weeks Ago`;

    // Compute weekly period key for this week (use first day of the week)
    const repDay = weekDays[6]; // oldest day in this week group
    const wKey = simulateWeeklyPeriodKey(repDay);

    const section = document.createElement('div');
    section.className = 'history-week';
    section.dataset.open = wi === 0 ? '1' : '0';

    let dailyRowsHtml = '';
    for (const day of weekDays) {
      const dKey = `daily:${getDayKey(day)}`;
      let done = 0, total = dailyTasks.length;
      for (const t of dailyTasks) {
        const c = compMap[`${t.id}_${dKey}`];
        if (c && c.count >= t.maxCount) done++;
      }
      const isToday = getDayKey(day) === todayKey;
      const pct = total > 0 ? (done / total) * 100 : 0;
      const barClass = pct === 100 ? '' : pct > 0 ? 'partial' : '';
      const dayName = DAY_NAMES[day.getDay()];
      const dateStr = `${day.getMonth() + 1}/${day.getDate()}`;

      dailyRowsHtml += `
        <div class="history-day-row">
          <div class="history-day-name${isToday ? ' today' : ''}" title="${dateStr}">${dayName}</div>
          <div class="history-bar-wrap">
            <div class="history-bar-fill ${barClass}" style="width:${pct}%"></div>
          </div>
          <div class="history-day-count">${total > 0 ? `${done}/${total}` : '—'}</div>
        </div>`;
    }

    let weeklyRowsHtml = '';
    if (weeklyTasks.length > 0) {
      weeklyRowsHtml += `<div class="history-section-label">Weekly Tasks</div>`;
      for (const t of weeklyTasks) {
        const c = compMap[`${t.id}_${wKey}`];
        const cnt = c?.count || 0;
        const isDone = cnt >= t.maxCount;
        weeklyRowsHtml += `
          <div class="history-weekly-row">
            <div class="history-weekly-name">${esc(t.name)}</div>
            <div class="history-weekly-count${isDone ? ' done' : ''}">${cnt}/${t.maxCount}</div>
          </div>`;
      }
    }

    const bodyStyle = wi === 0 ? '' : 'display:none';
    section.innerHTML = `
      <div class="history-week-header">
        <div class="history-week-label">${weekLabel}</div>
        <div style="color:var(--text-muted);font-size:18px">${wi === 0 ? '▾' : '▸'}</div>
      </div>
      <div class="history-week-body" style="${bodyStyle}">
        ${dailyTasks.length > 0 ? `<div class="history-section-label">Daily Tasks</div>${dailyRowsHtml}` : ''}
        ${weeklyRowsHtml}
        ${dailyTasks.length === 0 && weeklyTasks.length === 0 ? '<div class="text-muted" style="padding:16px">No tasks configured.</div>' : ''}
      </div>`;

    section.querySelector('.history-week-header').addEventListener('click', () => {
      const body = section.querySelector('.history-week-body');
      const arrow = section.querySelector('.history-week-header div:last-child');
      const isOpen = body.style.display !== 'none';
      body.style.display = isOpen ? 'none' : '';
      arrow.textContent = isOpen ? '▸' : '▾';
    });

    area.appendChild(section);
  }

  const spacer = document.createElement('div');
  spacer.className = 'spacer';
  area.appendChild(spacer);
}

function esc(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
