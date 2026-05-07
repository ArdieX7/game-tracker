import { db } from '../db.js';
import { navigate, showToast } from '../app.js';

export async function mount(container, { screen, params }) {
  const isEdit = screen === 'edit-task';
  let task = null;
  let gameId = null;
  let defaultType = 'daily';

  if (isEdit) {
    const taskId = params[0];
    task = await db.get('tasks', taskId);
    if (!task) { navigate('home'); return; }
    gameId = task.gameId;
    defaultType = task.type;
  } else {
    // params: [gameId, type?]
    gameId = params[0];
    defaultType = params[1] === 'weekly' ? 'weekly' : 'daily';
  }

  let selectedType = defaultType;
  let count = task?.maxCount ?? 1;

  container.innerHTML = `
    <div class="screen">
      <div class="app-bar">
        <button class="app-bar-btn back-btn" id="btn-back">‹</button>
        <div class="app-bar-title">${isEdit ? 'Edit Task' : 'Add Task'}</div>
      </div>
      <div class="form-screen">
        <div class="form-section">
          <div class="form-label">Task Name</div>
          <input class="form-input" id="task-name" type="text" placeholder="e.g. Daily Commissions" maxlength="80" value="${esc(task?.name || '')}">
        </div>

        <div class="form-section">
          <div class="form-label">Type</div>
          <div class="type-toggle" id="type-toggle">
            <div class="type-btn${selectedType === 'daily' ? ' selected' : ''}" data-type="daily">📅 Daily</div>
            <div class="type-btn${selectedType === 'weekly' ? ' selected' : ''}" data-type="weekly">📆 Weekly</div>
          </div>
        </div>

        <div class="form-section">
          <div class="form-label">Max Completions Per Period</div>
          <div class="count-stepper">
            <button class="stepper-btn" id="btn-minus">−</button>
            <div class="stepper-val" id="stepper-val">${count}</div>
            <button class="stepper-btn" id="btn-plus">＋</button>
          </div>
          <div class="form-hint" id="count-hint">${countHint(count, selectedType)}</div>
        </div>

        <div class="spacer"></div>
      </div>

      <div class="form-actions">
        <button class="btn btn-primary" id="btn-save">${isEdit ? 'Save Changes' : 'Add Task'}</button>
        ${isEdit ? `<button class="btn btn-danger" id="btn-delete">Delete Task</button>` : ''}
      </div>
    </div>`;

  document.getElementById('btn-back').addEventListener('click', () => history.back());

  // Type toggle
  document.getElementById('type-toggle').addEventListener('click', (e) => {
    const btn = e.target.closest('.type-btn');
    if (!btn) return;
    selectedType = btn.dataset.type;
    document.querySelectorAll('.type-btn').forEach(b => b.classList.toggle('selected', b.dataset.type === selectedType));
    document.getElementById('count-hint').textContent = countHint(count, selectedType);
  });

  // Stepper
  document.getElementById('btn-minus').addEventListener('click', () => {
    if (count > 1) count--;
    updateStepper();
  });
  document.getElementById('btn-plus').addEventListener('click', () => {
    if (count < 99) count++;
    updateStepper();
  });

  function updateStepper() {
    document.getElementById('stepper-val').textContent = count;
    document.getElementById('btn-minus').disabled = count <= 1;
    document.getElementById('count-hint').textContent = countHint(count, selectedType);
  }
  updateStepper();

  // Save
  document.getElementById('btn-save').addEventListener('click', async () => {
    const name = document.getElementById('task-name').value.trim();
    if (!name) { showToast('Please enter a task name', 'error'); return; }

    const tasks = await db.getByIndex('tasks', 'gameId', gameId);
    const record = {
      id: task?.id || crypto.randomUUID(),
      gameId,
      name,
      type: selectedType,
      maxCount: count,
      order: task?.order ?? tasks.length,
    };

    await db.put('tasks', record);
    showToast(isEdit ? 'Task updated!' : 'Task added!', 'success');
    navigate(`game/${gameId}`);
  });

  // Delete
  if (isEdit) {
    document.getElementById('btn-delete').addEventListener('click', async () => {
      if (!confirm(`Delete task "${task.name}"?`)) return;
      await db.deleteByIndex('completions', 'taskId', task.id);
      await db.delete('tasks', task.id);
      showToast('Task deleted', 'success');
      navigate(`game/${gameId}`);
    });
  }
}

function countHint(count, type) {
  const period = type === 'daily' ? 'day' : 'week';
  if (count === 1) return `Simple checkbox — once per ${period}`;
  return `Can be completed ${count} times per ${period}`;
}

function esc(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
