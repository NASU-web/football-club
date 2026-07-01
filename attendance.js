let attendanceConfig = {
  heading: 'Play this evening?',
  description: 'Tick if you can join the squad for tonight\'s session, then see how many people are coming and who is confirmed.',
  checkboxLabel: 'I can play this evening',
  statusTitle: 'Tonight\'s turnout',
  comingTitle: 'Coming',
  notComingTitle: 'Not coming'
};

async function parseJsonResponse(response) {
  const text = await response.text();
  if (!text) return null;
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error(`Server returned non-JSON response: ${text.slice(0, 200)}`);
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`Invalid JSON response: ${text.slice(0, 200)}`);
  }
}

async function loadAttendanceConfig() {
  try {
    const res = await fetch('/api/attendance-config');
    const config = await parseJsonResponse(res);
    if (config && typeof config === 'object') {
      attendanceConfig = { ...attendanceConfig, ...config };
    }
  } catch (e) {
    console.warn('Could not load attendance config:', e.message);
  }
  document.getElementById('attendance-heading').textContent = attendanceConfig.heading;
  document.getElementById('attendance-description').textContent = attendanceConfig.description;
  document.getElementById('attendance-checkbox-label').textContent = attendanceConfig.checkboxLabel;
}

async function fetchAttendance() {
  const list = document.getElementById('attendance-answers');
  try {
    const res = await fetch('/api/attendance');
    const data = await parseJsonResponse(res);
    if (!Array.isArray(data)) throw new Error('Unexpected attendance response format.');

    const coming = data.filter(item => item.coming);
    const notComing = data.filter(item => !item.coming);
    const statusTitle = attendanceConfig.statusTitle || "Tonight's turnout";
    const comingTitle = attendanceConfig.comingTitle || 'Coming';
    const notComingTitle = attendanceConfig.notComingTitle || 'Not coming';
    document.getElementById('attendance-status').innerHTML = `
      <div style="display:flex; justify-content:space-between; flex-wrap:wrap; gap:10px; align-items:center;">
        <div>
          <p class="eyebrow" style="margin-bottom:6px;">${statusTitle}</p>
          <h3 style="margin:0;">${coming.length} coming${notComing.length ? ` &middot; ${notComing.length} not coming` : ''}</h3>
        </div>
      </div>`;
    if (!data.length) {
      list.innerHTML = '<p class="form-note">No responses yet. Be the first to confirm availability.</p>';
      return;
    }
    list.innerHTML = `
      <div style="display:grid; gap:12px;">
        ${coming.length ? `
          <div>
            <strong>${comingTitle} (${coming.length})</strong>
            <ul style="margin:10px 0 0 0; padding-left:18px;">
              ${coming.map(item => `<li>${item.name}</li>`).join('')}
            </ul>
          </div>` : `<div><strong>${comingTitle}</strong><p class="form-note">No one has confirmed yet.</p></div>`}
        ${notComing.length ? `
          <div>
            <strong>${notComingTitle} (${notComing.length})</strong>
            <ul style="margin:10px 0 0 0; padding-left:18px;">
              ${notComing.map(item => `<li>${item.name}</li>`).join('')}
            </ul>
          </div>` : ''}
      </div>`;
  } catch (e) {
    document.getElementById('attendance-status').innerHTML = `<div class="alert">Could not load attendance. ${e.message}</div>`;
    list.innerHTML = '';
    console.error(e);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadAttendanceConfig();
  fetchAttendance();
  const form = document.getElementById('attendance-form');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const nameInput = document.getElementById('attendance-name');
    const comingInput = document.getElementById('attendance-coming');
    const feedback = document.getElementById('attendance-feedback');
    const name = nameInput.value.trim();
    if (!name) {
      feedback.innerHTML = '<div class="alert">Please enter your name.</div>';
      return;
    }
    try {
      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, coming: comingInput.checked })
      });
      const data = await parseJsonResponse(res);
      if (!res.ok) throw new Error(data?.error || 'Save failed');
      feedback.innerHTML = '<div class="alert success">Availability saved.</div>';
      nameInput.value = '';
      comingInput.checked = false;
      fetchAttendance();
    } catch (err) {
      feedback.innerHTML = `<div class="alert">${err.message}</div>`;
    }
  });
});
