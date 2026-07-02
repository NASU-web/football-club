function positionInitial(pos) {
  return { Goalkeeper: 'GK', Defender: 'DF', Midfielder: 'MF', Forward: 'FW' }[pos] || pos;
}

let ALL_PLAYERS = [];
let ACTIVE_FILTER = 'All';

function renderRoster() {
  const grid = document.getElementById('roster-grid');
  const list = ACTIVE_FILTER === 'All' ? ALL_PLAYERS : ALL_PLAYERS.filter(p => p.position === ACTIVE_FILTER);
  if (!list.length) {
    grid.innerHTML = '<div class="empty-state">No players in this position yet.</div>';
    return;
  }
  grid.innerHTML = list
    .sort((a, b) => (a.number ?? 99) - (b.number ?? 99))
    .map(p => `
      <div class="player-card">
        <div class="player-card-photo ${p.photo ? '' : 'placeholder'}">
          ${p.photo ? `<img src="${p.photo}" alt="${p.name}" style="object-position:${p.photoPosition || '50% 50%'}; transform:scale(${p.photoZoom || 1}); transform-origin:${p.photoPosition || '50% 50%'};">` : 'No photo yet'}
        </div>
        <div class="number">${p.number ?? ''}</div>
        <p class="position">${positionInitial(p.position)} &middot; ${p.nationality}</p>
        <h3>${p.name}</h3>
        <div class="meta">
          <div><span>Class</span><span>${p.year}</span></div>
          <div><span>Apps</span><span>${p.stats.appearances}</span></div>
          <div><span>Goals</span><span>${p.stats.goals}</span></div>
          <div><span>Assists</span><span>${p.stats.assists}</span></div>
        </div>
      </div>`).join('');
}

function renderFilters() {
  const wrap = document.getElementById('position-filters');
  const positions = ['All', 'Goalkeeper', 'Defender', 'Midfielder', 'Forward'];
  wrap.innerHTML = positions.map(pos => `
    <button type="button" class="btn small${pos === ACTIVE_FILTER ? ' solid' : ''}" data-pos="${pos}">${pos}</button>
  `).join('');
  wrap.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      ACTIVE_FILTER = btn.dataset.pos;
      renderFilters();
      renderRoster();
    });
  });
}

async function loadRoster() {
  try {
    ALL_PLAYERS = await fetch('/api/players').then(r => r.json());
    renderFilters();
    renderRoster();
  } catch (e) {
    document.getElementById('roster-grid').innerHTML = '<div class="empty-state">Could not load the roster right now.</div>';
  }
}

function showAlert(message, type, targetId = 'register-alert') {
  const box = document.getElementById(targetId);
  if (!box) return;
  box.innerHTML = `<div class="alert ${type === 'success' ? 'success' : ''}">${message}</div>`;
}

function updatePreviewPosition(preview, controls, xInput, yInput, zoomInput) {
  if (!preview || !controls || !xInput || !yInput) return;
  const x = xInput.value;
  const y = yInput.value;
  const zoom = zoomInput ? zoomInput.value : 1;
  const position = `${x}% ${y}%`;
  preview.style.objectPosition = position;
  preview.style.transformOrigin = position;
  preview.style.transform = `scale(${zoom})`;
  controls.style.display = 'grid';
}

function readImageFileAsDataUrl(file, maxWidth = 640, maxHeight = 640, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const ratio = Math.min(maxWidth / img.width, maxHeight / img.height, 1);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * ratio);
        canvas.height = Math.round(img.height * ratio);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('Could not load the selected image.'));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error('Could not read the selected image.'));
    reader.readAsDataURL(file);
  });
}

function setupRegisterForm() {
  const form = document.getElementById('register-form');
  const fileInput = document.getElementById('reg-photo');
  const preview = document.getElementById('reg-photo-preview');
  const controls = document.getElementById('reg-photo-position-controls');
  const xInput = document.getElementById('reg-photo-position-x');
  const yInput = document.getElementById('reg-photo-position-y');
  const zoomInput = document.getElementById('reg-photo-zoom');
  if (!form) return;

  fileInput?.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await readImageFileAsDataUrl(file);
      preview.src = dataUrl;
      preview.style.display = 'block';
      updatePreviewPosition(preview, controls, xInput, yInput, zoomInput);
    } catch (err) {
      showAlert(err.message, 'error');
    }
  });

  xInput?.addEventListener('input', () => updatePreviewPosition(preview, controls, xInput, yInput, zoomInput));
  yInput?.addEventListener('input', () => updatePreviewPosition(preview, controls, xInput, yInput, zoomInput));
  zoomInput?.addEventListener('input', () => updatePreviewPosition(preview, controls, xInput, yInput, zoomInput));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    try {
      const photo = fileInput?.files?.[0] ? await readImageFileAsDataUrl(fileInput.files[0]) : null;
      const payload = {
        name: form.elements.name.value.trim(),
        number: form.elements.number.value || null,
        position: form.elements.position.value,
        nationality: form.elements.nationality.value.trim(),
        year: form.elements.year.value,
        photo,
        photoPosition: `${xInput?.value || 50}% ${yInput?.value || 50}%`,
        photoZoom: Number(zoomInput?.value || 1)
      };
      const res = await fetch('/api/players/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Something went wrong.');
      showAlert('Registration submitted! You\'ll appear on the roster once an admin approves it.', 'success');
      form.reset();
      preview.style.display = 'none';
      preview.removeAttribute('src');
      if (controls) controls.style.display = 'none';
    } catch (err) {
      showAlert(err.message, 'error');
    } finally {
      submitBtn.disabled = false;
    }
  });
}

async function updatePlayerPhoto() {
  const form = document.getElementById('photo-update-form');
  const fileInput = document.getElementById('photo-file');
  const preview = document.getElementById('photo-preview');
  const controls = document.getElementById('photo-position-controls');
  const xInput = document.getElementById('photo-position-x');
  const yInput = document.getElementById('photo-position-y');
  const zoomInput = document.getElementById('photo-zoom');
  if (!form) return;

  fileInput?.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await readImageFileAsDataUrl(file);
      preview.src = dataUrl;
      preview.style.display = 'block';
      updatePreviewPosition(preview, controls, xInput, yInput, zoomInput);
    } catch (err) {
      showAlert(err.message, 'error', 'photo-update-alert');
    }
  });

  xInput?.addEventListener('input', () => updatePreviewPosition(preview, controls, xInput, yInput, zoomInput));
  yInput?.addEventListener('input', () => updatePreviewPosition(preview, controls, xInput, yInput, zoomInput));
  zoomInput?.addEventListener('input', () => updatePreviewPosition(preview, controls, xInput, yInput, zoomInput));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;

    const file = fileInput?.files?.[0];
    const updatedName = form.elements.updatedName.value.trim();
    const updatedNumberRaw = form.elements.updatedNumber.value;
    const updatedLevel = form.elements.updatedLevel.value;

    if (!file && !updatedName && updatedNumberRaw === '' && !updatedLevel) {
      showAlert('Choose a photo, or enter a name/number/level update before submitting.', 'error', 'photo-update-alert');
      submitBtn.disabled = false;
      return;
    }

    const updateCode = form.elements.updateCode.value.trim();
    if (!updateCode) {
      showAlert('Please enter the code password.', 'error', 'photo-update-alert');
      submitBtn.disabled = false;
      return;
    }

    try {
      const photo = file ? await readImageFileAsDataUrl(file) : null;
      const payload = {
        name: form.elements.playerName.value.trim(),
        updateCode,
        photo,
        updatedName: updatedName || null,
        updatedNumber: updatedNumberRaw !== '' ? Number(updatedNumberRaw) : null,
        updatedLevel: updatedLevel || null,
        photoPosition: `${xInput?.value || 50}% ${yInput?.value || 50}%`,
        photoZoom: Number(zoomInput?.value || 1)
      };
      const res = await fetch('/api/players/photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not update your photo/details.');
      showAlert('Photo/details updated successfully.', 'success', 'photo-update-alert');
      loadRoster();
      form.reset();
      preview.style.display = 'none';
      preview.removeAttribute('src');
      if (controls) controls.style.display = 'none';
    } catch (err) {
      showAlert(err.message, 'error', 'photo-update-alert');
    } finally {
      submitBtn.disabled = false;
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  loadRoster();
  setupRegisterForm();
  updatePlayerPhoto();
});
