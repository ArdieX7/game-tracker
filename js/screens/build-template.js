import { db } from '../db.js';
import { navigate, showToast } from '../app.js';

export async function mount(container, { params }) {
  const gameId = params[0];
  const game = await db.get('build_games', gameId);
  if (!game) { navigate('builds-home'); return; }

  // In-memory state: editable until Save
  let sections = (await db.getByIndex('build_sections', 'gameId', gameId))
    .sort((a, b) => a.order - b.order)
    .map(s => ({ ...s, fields: s.fields ? [...s.fields] : [] }));

  const deletedSectionIds = new Set();
  const deletedFieldIds = new Set(); // fieldIds removed from any section

  container.innerHTML = `
    <div class="screen">
      <div class="app-bar">
        <button class="app-bar-btn back-btn" id="btn-back">‹</button>
        <div class="app-bar-title">Edit <span>Template</span></div>
      </div>
      <div class="form-screen" id="template-body"></div>
      <div class="form-actions">
        <button class="btn btn-primary" id="btn-save">Save Template</button>
      </div>
    </div>`;

  document.getElementById('btn-back').addEventListener('click', () => history.back());
  document.getElementById('btn-save').addEventListener('click', saveTemplate);

  renderSections();

  function renderSections() {
    const body = document.getElementById('template-body');
    body.innerHTML = '';

    sections.forEach((section, si) => {
      const item = document.createElement('div');
      item.className = 'template-section-item';

      // Header
      const header = document.createElement('div');
      header.className = 'template-section-header';
      header.innerHTML = `
        <div class="template-section-name" id="sname-${si}">${esc(section.name)}</div>
        <button class="template-section-edit-btn" data-si="${si}" title="Rename">✏️</button>
        <button class="template-section-delete-btn" data-si="${si}" title="Delete section">×</button>`;
      item.appendChild(header);

      // Fields area
      const fieldsArea = document.createElement('div');
      fieldsArea.className = 'template-fields-area';

      section.fields.forEach((field, fi) => {
        const chip = document.createElement('div');
        chip.className = 'template-field-chip';
        chip.innerHTML = `<span>${esc(field.label)}</span><button class="template-field-chip-del" data-si="${si}" data-fi="${fi}" title="Remove field">×</button>`;
        fieldsArea.appendChild(chip);
      });

      const addFieldBtn = document.createElement('button');
      addFieldBtn.className = 'btn-add-field';
      addFieldBtn.dataset.si = si;
      addFieldBtn.textContent = '＋ Add field';
      fieldsArea.appendChild(addFieldBtn);
      item.appendChild(fieldsArea);
      body.appendChild(item);
    });

    // Add Section button
    const addSectionBtn = document.createElement('button');
    addSectionBtn.className = 'btn-add-section';
    addSectionBtn.textContent = '＋ Add Section';
    body.appendChild(addSectionBtn);

    attachEvents();
  }

  function attachEvents() {
    const body = document.getElementById('template-body');

    // Rename section
    body.querySelectorAll('.template-section-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const si = Number(btn.dataset.si);
        const nameEl = document.getElementById(`sname-${si}`);
        const current = sections[si].name;
        const input = document.createElement('input');
        input.className = 'form-input';
        input.style.cssText = 'flex:1;padding:4px 8px;font-size:14px';
        input.value = current;
        nameEl.replaceWith(input);
        input.focus();
        input.select();
        input.addEventListener('blur', () => {
          const val = input.value.trim() || current;
          sections[si].name = val;
          renderSections();
        });
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
      });
    });

    // Delete section
    body.querySelectorAll('.template-section-delete-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const si = Number(btn.dataset.si);
        if (!confirm(`Delete section "${sections[si].name}" and all its fields?`)) return;
        const removed = sections.splice(si, 1)[0];
        if (removed.id) deletedSectionIds.add(removed.id);
        removed.fields.forEach(f => { if (f.id) deletedFieldIds.add(f.id); });
        renderSections();
      });
    });

    // Delete field chip
    body.querySelectorAll('.template-field-chip-del').forEach(btn => {
      btn.addEventListener('click', () => {
        const si = Number(btn.dataset.si);
        const fi = Number(btn.dataset.fi);
        const removed = sections[si].fields.splice(fi, 1)[0];
        if (removed.id) deletedFieldIds.add(removed.id);
        renderSections();
      });
    });

    // Add field — inline input
    body.querySelectorAll('.btn-add-field').forEach(btn => {
      btn.addEventListener('click', () => {
        const si = Number(btn.dataset.si);
        const label = prompt('Field label (e.g. Skill 1):')?.trim();
        if (!label) return;
        sections[si].fields.push({ id: crypto.randomUUID(), label });
        renderSections();
      });
    });

    // Add section
    body.querySelector('.btn-add-section')?.addEventListener('click', () => {
      const name = prompt('Section name (e.g. Skills):')?.trim();
      if (!name) return;
      sections.push({ id: crypto.randomUUID(), gameId, name, order: sections.length, fields: [] });
      renderSections();
    });
  }

  async function saveTemplate() {
    // Validate
    for (const s of sections) {
      if (!s.name.trim()) { showToast('Section names cannot be empty', 'error'); return; }
      for (const f of s.fields) {
        if (!f.label.trim()) { showToast('Field labels cannot be empty', 'error'); return; }
      }
    }

    // Save/update sections
    for (let i = 0; i < sections.length; i++) {
      sections[i].order = i;
      await db.put('build_sections', sections[i]);
    }

    // Delete removed sections
    for (const id of deletedSectionIds) {
      await db.delete('build_sections', id);
    }

    // Clean up orphaned build_values for removed field ids
    if (deletedFieldIds.size > 0) {
      const builds = await db.getByIndex('builds', 'gameId', gameId);
      for (const build of builds) {
        const values = await db.getByIndex('build_values', 'buildId', build.id);
        for (const v of values) {
          if (deletedFieldIds.has(v.fieldId)) {
            await db.delete('build_values', v.id);
          }
        }
      }
    }

    showToast('Template saved!', 'success');
    navigate(`builds-game/${gameId}`);
  }
}

function esc(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
