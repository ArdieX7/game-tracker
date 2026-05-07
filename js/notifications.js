import { db } from './db.js';
import { getNextDailyReset, getNextWeeklyReset } from './reset.js';

const WARN_MS = 30 * 60 * 1000; // 30 min before reset

export async function requestPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  return (await Notification.requestPermission()) === 'granted';
}

export async function scheduleNotifications() {
  if (!('serviceWorker' in navigator) || Notification.permission !== 'granted') return;
  const reg = await navigator.serviceWorker.ready;
  if (!reg.active) return;

  const games = await db.getAll('games');
  const notifications = [];
  const now = Date.now();

  for (const game of games) {
    const nextDaily = getNextDailyReset(game.dailyResetTime);
    const nextWeekly = getNextWeeklyReset(game.weeklyResetDay, game.weeklyResetTime);
    const dailyWarn = nextDaily.getTime() - WARN_MS;
    const weeklyWarn = nextWeekly.getTime() - WARN_MS;

    if (dailyWarn > now) {
      notifications.push({
        id: `daily_${game.id}`,
        title: `⏰ ${game.name}`,
        body: 'Daily reset in 30 minutes!',
        timestamp: dailyWarn
      });
    }
    if (weeklyWarn > now) {
      notifications.push({
        id: `weekly_${game.id}`,
        title: `⏰ ${game.name}`,
        body: 'Weekly reset in 30 minutes!',
        timestamp: weeklyWarn
      });
    }
  }

  reg.active.postMessage({ type: 'SCHEDULE_NOTIFICATIONS', notifications });
}
