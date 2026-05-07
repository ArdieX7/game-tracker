// Returns which "daily period" is currently active for the given reset time.
// If now >= resetTime today → today's date. Otherwise → yesterday's date.
export function getDailyPeriodKey(dailyResetTime) {
  const now = new Date();
  const [rh, rm] = dailyResetTime.split(':').map(Number);
  const resetToday = new Date(now);
  resetToday.setHours(rh, rm, 0, 0);
  const ref = now >= resetToday ? now : new Date(now - 86400000);
  return `daily:${_dateStr(ref)}`;
}

// Returns which "weekly period" is currently active.
// Finds the most recent occurrence of weeklyResetDay at weeklyResetTime.
export function getWeeklyPeriodKey(weeklyResetDay, weeklyResetTime) {
  const now = new Date();
  const [rh, rm] = weeklyResetTime.split(':').map(Number);
  const dow = now.getDay();
  let daysBack = (dow - weeklyResetDay + 7) % 7;
  const lastReset = new Date(now);
  lastReset.setDate(lastReset.getDate() - daysBack);
  lastReset.setHours(rh, rm, 0, 0);
  if (now < lastReset) lastReset.setDate(lastReset.getDate() - 7);
  return `weekly:${_dateStr(lastReset)}`;
}

// Returns a Date for the next daily reset.
export function getNextDailyReset(dailyResetTime) {
  const now = new Date();
  const [rh, rm] = dailyResetTime.split(':').map(Number);
  const next = new Date(now);
  next.setHours(rh, rm, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next;
}

// Returns a Date for the next weekly reset.
export function getNextWeeklyReset(weeklyResetDay, weeklyResetTime) {
  const now = new Date();
  const [rh, rm] = weeklyResetTime.split(':').map(Number);
  const dow = now.getDay();
  let daysAhead = (weeklyResetDay - dow + 7) % 7;
  const next = new Date(now);
  next.setDate(next.getDate() + daysAhead);
  next.setHours(rh, rm, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 7);
  return next;
}

// Human-readable "resets in Xh Ym" string.
export function timeUntil(date) {
  const diff = date - Date.now();
  if (diff <= 0) return 'now';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function _dateStr(d) {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}
