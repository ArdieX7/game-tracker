import { db } from '../db.js';
import { navigate, showToast } from '../app.js';
import { resizeImage } from '../image.js';

export async function mount(container, { params }) {
  const buildId = params[0];
  const build = await db.get('builds', buildId);
  if (!build) { navigate('builds-home'); return; }

  const game = await db.get('build_games', build.gameId);
  const sections = (await db.getByIndex('build_sections', 'gameId', build.gameId))
    .sort((a, b) => a.order - b.order);

  const allValues = await db.getByIndex('build_values', 'buildId', buildId);
  const valuesMap = new Map(allValues.map(v => [v.fieldId, v]));

  const totalFixed = sections.reduce((sum, s) => sum + (s.fields?.length || 0), 0);

  container.innerHTML = `
    <div class="screen">
      <div class="app-bar">
        <button class="app-bar-btn back-btn" id="btn-back">‹</button>
        <div class="app-bar-title build-name-display" id="build-name-display">${esc(build.name)}</div>
        <button class="app-bar-btn" id="btn-cover" title="Set cover image"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg></button>
        <button class="app-bar-btn" id="btn-rename" title="Rename build"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></button>
      </div>
      <input type="file" id="cover-input" accept="image/*" style="display:none">
      <div class="build-progress-bar-wrap">
        <div class="build-progress-track">
          <div class="build-progress-fill" id="progress-fill" style="width:${calcPct()}%"></div>
        </div>
        <div class="build-progress-label" id="progress-label">${calcLabel()}</div>
      </div>
      <div class="build-photo-strip-wrap" id="photo-strip-wrap"></div>
      <div class="scroll-area" id="build-content"></div>
    </div>`;

  // ── Cover image ───────────────────────────────────────────

  const coverInput = document.getElementById('cover-input');
  document.getElementById('btn-cover').addEventListener('click', () => coverInput.click());
  coverInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      build.bannerImage = await resizeImage(file);
      await db.put('builds', build);
      showToast('Cover updated', 'success');
    } catch {
      showToast('Could not load image', 'error');
    }
    coverInput.value = '';
  });

  // ── Back / rename ─────────────────────────────────────────

  document.getElementById('btn-back').addEventListener('click', () => navigate(`builds-game/${build.gameId}`));
  document.getElementById('btn-rename').addEventListener('click', startRename);

  // ── Photo gallery ─────────────────────────────────────────

  const photos = (await db.getByIndex('build_photos', 'buildId', buildId))
    .sort((a, b) => a.createdAt - b.createdAt);

  const stripWrap = document.getElementById('photo-strip-wrap');
  stripWrap.innerHTML = `
    <div class="build-photo-strip" id="photo-strip">
      <label class="build-photo-add" title="Add photo">
        ＋
        <input type="file" accept="image/*" multiple style="display:none" id="photo-input">
      </label>
    </div>`;

  const strip = document.getElementById('photo-strip');
  const photoInput = document.getElementById('photo-input');

  for (const photo of photos) {
    strip.appendChild(makeThumb(photo));
  }

  photoInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    for (const file of files) {
      try {
        const image = await resizeImage(file, 1200, 0.82);
        const photo = { id: crypto.randomUUID(), buildId, image, createdAt: Date.now() };
        await db.put('build_photos', photo);
        strip.appendChild(makeThumb(photo));
      } catch {
        showToast('Could not load photo', 'error');
      }
    }
    photoInput.value = '';
  });

  function makeThumb(photo) {
    const wrap = document.createElement('div');
    wrap.className = 'build-photo-thumb';
    wrap.dataset.id = photo.id;
    const img = document.createElement('img');
    img.src = photo.image;
    img.addEventListener('click', () => openLightbox(photo.image));
    const del = document.createElement('button');
    del.className = 'build-photo-del';
    del.textContent = '×';
    del.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm('Remove this photo?')) return;
      await db.delete('build_photos', photo.id);
      wrap.remove();
    });
    wrap.appendChild(img);
    wrap.appendChild(del);
    return wrap;
  }

  // ── Lightbox ──────────────────────────────────────────────

  if (!document.getElementById('photo-lightbox')) {
    const lb = document.createElement('div');
    lb.id = 'photo-lightbox';
    lb.className = 'build-photo-lightbox';
    lb.innerHTML = `<button class="build-photo-lightbox-close">×</button><img id="lightbox-img" src="">`;
    lb.addEventListener('click', (e) => { if (e.target === lb) closeLightbox(); });
    lb.querySelector('.build-photo-lightbox-close').addEventListener('click', closeLightbox);
    document.body.appendChild(lb);
  }

  function openLightbox(src) {
    document.getElementById('lightbox-img').src = src;
    document.getElementById('photo-lightbox').classList.add('active');
  }
  function closeLightbox() {
    document.getElementById('photo-lightbox').classList.remove('active');
    document.getElementById('lightbox-img').src = '';
  }

  // ── Sections ──────────────────────────────────────────────

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

    for (const field of (section.fields || [])) {
      wrap.appendChild(buildFixedRow(section, field));
    }

    const dynamics = allValues
      .filter(v => v.sectionId === section.id && v.isDynamic)
      .sort((a, b) => a.order - b.order);
    for (const dv of dynamics) {
      wrap.appendChild(buildDynamicRow(section, dv));
    }

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
