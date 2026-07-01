async function api(method, url, body) {
  const opts = {
    method,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read image file.'));
    reader.readAsDataURL(file);
  });
}

async function loadPersonnelAdmin() {
  try {
    const people = await api('GET', '/api/personnel');
    const list = document.getElementById('personnel-list');
    list.innerHTML = people.map(person => `
      <div class="card" style="margin-bottom:16px;">
        <div class="form-grid">
          <div class="field full">
            <label>Role</label>
            <input value="${person.role}" data-id="${person.id}" data-field="role" />
          </div>
          <div class="field full">
            <label>Name</label>
            <input value="${person.name}" data-id="${person.id}" data-field="name" />
          </div>
          <div class="field full">
            <label>Bio</label>
            <textarea rows="3" data-id="${person.id}" data-field="bio">${person.bio}</textarea>
          </div>
          <div class="field full">
            <label>Photo</label>
            <input type="file" accept="image/*" data-id="${person.id}" data-field="photo" />
          </div>
          <div class="field full">
            <button class="btn small solid" type="button" data-action="save" data-id="${person.id}">Save person</button>
          </div>
        </div>
      </div>`).join('');
    list.querySelectorAll('[data-field="photo"]').forEach(input => {
      input.addEventListener('change', async () => {
        const file = input.files?.[0];
        if (!file) return;
        try {
          const dataUrl = await readFileAsDataUrl(file);
          input.dataset.preview = dataUrl;
        } catch (e) {
          alert(e.message);
        }
      });
    });
    list.querySelectorAll('[data-action="save"]').forEach(button => {
      button.addEventListener('click', async () => {
        const id = button.dataset.id;
        const role = list.querySelector(`[data-id="${id}"][data-field="role"]`).value.trim();
        const name = list.querySelector(`[data-id="${id}"][data-field="name"]`).value.trim();
        const bio = list.querySelector(`[data-id="${id}"][data-field="bio"]`).value.trim();
        const photoInput = list.querySelector(`[data-id="${id}"][data-field="photo"]`);
        const photoDataUrl = photoInput.dataset.preview || '';
        try {
          await api('PUT', '/api/personnel/' + id, { role, name, bio, photoDataUrl });
          showMsg('personnel-alert', 'Personnel updated.', true);
          loadPersonnelAdmin();
        } catch (e) {
          showMsg('personnel-alert', e.message, false);
        }
      });
    });
  } catch (e) {
    document.getElementById('personnel-list').innerHTML = '<div class="empty-state">Could not load personnel.</div>';
  }
}

function showMsg(id, msg, ok) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = `<div class="alert${ok ? ' success' : ''}">${msg}</div>`;
  setTimeout(() => { el.innerHTML = ''; }, 4000);
}

window.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('personnel-list')) {
    loadPersonnelAdmin();
  }
});
