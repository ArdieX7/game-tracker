import { db } from '../db.js';
import { navigate, showToast } from '../app.js';

export async function mount(container, { params }) {
  const buildId = params[0];
  const build = await db.get('builds', buildId);
  if (!build) { navigate('builds-home'); return; }

  const game = await db.get('build_games', build.gameId);
  const sections = (await db.getByIndex('build_sections', 'gameId', build.gameId))
    .sort((a, b) => a.order - b.order);

  // Build a map of all values for this build keyed by fieldId
  const allValues = await db.getByIndex('build_values', 'buildId', buildId);
  const valuesMap = new Map(allValues.map(v => [v.fieldId, v]));

  // Compute total fixed fields for progress
  const totalFixed = sections.reduce((sum, s) => sum + (s.fields?.length || 0), 0);

  container.innerHTML = `
    <div class="screen">
      <div class="app-bar">
        <button class="app-bar-btn back-btn" id="btn-back">‹</button>
        <div class="app-bar-title build-name-display" id="build-name-display">${esc(build.name)}</div>
        <button class="app-bar-btn" id="btn-rename" title="Rename build">✏️</button>
      </div>
      <div class="build-progress-bar-wrap">
        <div class="build-progress-track">
          <div class="build-progress-fill" id="progress-fill" style="width:${calcPct()}%"></div>
        </div>
        <div class="build-progress-label" id="progress-label">${calcLabel()}</div>
      </div>
      <div class="scroll-area" id="build-content"></div>
    </div>`;

  document.getElementById('btn-back').addEventListener('click', () => navigate(`builds-game/${build.gameId}`));
  document.getElementById('btn-rename').addEventListener('click', startRename);

  // Render sections
  if (!sections.length) {
    document.getElementById('build-content').innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🔧</div>
        <h3>No template defined</h3>
        <p>Set up the template for this game first</p>
        <button class="btn btn-primary" style="margin-top:16px;max-width:240px" id="btn-go-template">Edit Template</button>
      </div>`;
    document.getElementById('btn-go-template')?.addEventListener('click', () => navigate(`build-template/${build.gameId}`));
    return;
  }

  const content = document.getElementById('build-content');
  for (const section of sections) {
    content.appendChild(buildSectionEl(section));
  }
  // Bottom spacer for FAB clearance
  const spacer = document.createElement('div');
  spacer.style.height = '32px';
  content.appendChild(spacer);

  // ── Rename ────────────────────────────────────────────────

  function startRename() {
    const titleEl = document.getElementById('build-name-display');
    const input = document.createElement('input');
    input.className = 'form-input';
    input.style.cssText = 'flex:1;padding:4px 8px;font-size:16px';
    input.value = build.name;
    titleEl.replaceWith(input);
    input.focus();
    input.select();
    async function finishRename() {
      const val = input.value.trim() || build.name;
      build.name = val;
      await db.put('builds', build);
      const newTitle = document.createElement('div');
      newTitle.className = 'app-bar-title build-name-display';
      newTitle.id = 'build-name-display';
      newTitle.textContent = val;
      input.replaceWith(newTitle);
    }
    input.addEventListener('blur', finishRename);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
  }

  // ── Section element ───────────────────────────────────────

  function buildSectionEl(section) {
    const wrap = document.createElement('div');

    const header = document.createElement('div');
    header.className = 'build-section-header';
    header.textContent = section.name;
    wrap.appendChild(header);

    // Fixed fields
    for (const field of (section.fields || [])) {
      wrap.appendChild(buildFixedRow(section, field));
    }

    // Dynamic fields for this section
    const dynamics = allValues
      .filter(v => v.sectionId === section.id && v.isDynamic)
      .sort((a, b) => a.order - b.order);
    for (const dv of dynamics) {
      wrap.appendChild(buildDynamicRow(section, dv));
    }

    // Add item button
    const addBtn = document.createElement('button');
    addBtn.className = 'btn-add-dynamic-field';
    addBtn.textContent = '＋ Add item';
    addBtn.addEventListener('click', () => addDynamicField(section, wrap, addBtn));
    wrap.appendChild(addBtn);

    return wrap;
  }

  // ── Fixed field row ───────────────────────────────────────

  function buildFixedRow(section, field) {
    const existing = valuesMap.get(field.id);
    const val = existing?.value || '';
    const checked = existing?.checked || false;

    const row = document.createElement('div');
    row.className = 'build-field-row';
    row.innerHTML = `
      <span class="build-field-label">${esc(field.label)}</span>
      <input class="build-field-value" type="text" placeholder="—" value="${esc(val)}">
      <input type="checkbox" class="build-field-check"${checked ? ' checked' : ''}>`;

    const valueInput = row.querySelector('.build-field-value');
    const checkbox = row.querySelector('.build-field-check');

    valueInput.addEventListener('blur', async () => {
      const rec = getOrCreate(field.id, section.id, false, '');
      rec.value = valueInput.value;
      await db.put('build_values', rec);
      valuesMap.set(field.id, rec);
    });

    checkbox.addEventListener('change', async () => {
      const rec = getOrCreate(field.id, section.id, false, '');
      rec.value = valueInput.value;
      rec.checked = checkbox.checked;
      await db.put('build_values', rec);
      valuesMap.set(field.id, rec);
      updateProgress();
    });

    return row;
  }

  // ── Dynamic field row ─────────────────────────────────────

  function buildDynamicRow(section, dv) {
    const row = document.createElement('div');
    row.className = 'build-field-row';
    row.dataset.valueId = dv.id;
    row.innerHTML = `
      <input class="build-field-label-input" type="text" placeholder="Label" value="${esc(dv.label)}">
      <input class="build-field-value" type="text" placeholder="—" value="${esc(dv.value)}">
      <input type="checkbox" class="build-field-check"${dv.checked ? ' checked' : ''}>
      <button class="build-field-delete" title="Remove">×</button>`;

    const labelInput = row.querySelector('.build-field-label-input');
    const valueInput = row.querySelector('.build-field-value');
    const checkbox = row.querySelector('.build-field-check');
    const deleteBtn = row.querySelector('.build-field-delete');

    labelInput.addEventListener('blur', async () => {
      dv.label = labelInput.value;
      await db.put('build_values', dv);
    });

    valueInput.addEventListener('blur', async () => {
      dv.value = valueInput.value;
      await db.put('build_values', dv);
    });

    checkbox.addEventListener('change', async () => {
      dv.checked = checkbox.checked;
      await db.put('build_values', dv);
    });

    deleteBtn.addEventListener('click', async () => {
      if (!confirm('Remove this item?')) return;
      await db.delete('build_values', dv.id);
      const idx = allValues.indexOf(dv);
      if (idx !== -1) allValues.splice(idx, 1);
      row.remove();
    });

    return row;
  }

  // ── Add dynamic field ─────────────────────────────────────

  async function addDynamicField(section, sectionEl, addBtn) {
    const fieldId = crypto.randomUUID();
    const dynamicsInSection = allValues.filter(v => v.sectionId === section.id && v.isDynamic);
    const dv = {
      id: `${buildId}_${fieldId}`,
      buildId,
      sectionId: section.id,
      fieldId,
      isDynamic: true,
      label: '',
      value: '',
      checked: false,
      order: dynamicsInSection.length,
    };
    await db.put('build_values', dv);
    allValues.push(dv);

    const row = buildDynamicRow(section, dv);
    sectionEl.insertBefore(row, addBtn);
    row.querySelector('.build-field-label-input').focus();
  }

  // ── Progress ──────────────────────────────────────────────

  function calcPct() {
    if (totalFixed === 0) return 0;
    let checked = 0;
    for (const [, v] of valuesMap) {
      if (!v.isDynamic && v.checked) checked++;
    }
    return Math.round((checked / totalFixed) * 100);
  }

  function calcLabel() {
    if (totalFixed === 0) return '—';
    let checked = 0;
    for (const [, v] of valuesMap) {
      if (!v.isDynamic && v.checked) checked++;
    }
    return `${checked}/${totalFixed} obtained`;
  }

  function updateProgress() {
    document.getElementById('progress-fill').style.width = `${calcPct()}%`;
    document.getElementById('progress-label').textContent = calcLabel();
  }

  // ── Helpers ───────────────────────────────────────────────

  function getOrCreate(fieldId, sectionId, isDynamic, label) {
    let rec = valuesMap.get(fieldId);
    if (!rec) {
      rec = {
        id: `${buildId}_${fieldId}`,
        buildId,
        sectionId,
        fieldId,
        isDynamic,
        label,
        value: '',
        checked: false,
        order: 0,
      };
      valuesMap.set(fieldId, rec);
    }
    return rec;
  }
}

function esc(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
