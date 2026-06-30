function positionInitial(pos) {
  return { Goalkeeper: 'GK', Defender: 'DF', Midfielder: 'MF', Forward: 'FW' }[pos] || pos;
}

async function loadHeroStats() {
  try {
    const stats = await fetch('/api/stats').then(r => r.json());
    const nums = document.querySelectorAll('#hero-stats .stat-num');
    const values = [stats.club.played, stats.club.wins, stats.club.goalsFor, stats.nationalities];
    nums.forEach((el, i) => { el.textContent = values[i]; });
  } catch (e) { /* leave placeholders */ }
}

async function loadAnnouncement() {
  const box = document.getElementById('home-announcement');
  try {
    const announcement = await fetch('/api/announcement?t=' + Date.now(), { cache: 'no-store' }).then(r => r.json());
    if (announcement.show && announcement.message) {
      box.style.display = 'block';
      box.innerHTML = `
        <div class="card" style="border-left:4px solid var(--crimson); background:rgba(190,34,51,0.08); padding:14px 16px;">
          <strong style="display:block; margin-bottom:4px; color:var(--crimson);">Announcement</strong>
          <span>${announcement.message}</span>
        </div>`;
    } else {
      box.style.display = 'none';
      box.innerHTML = '';
    }
  } catch (e) {
    box.style.display = 'none';
    box.innerHTML = '';
  }
}

async function loadNextFixture() {
  const box = document.getElementById('next-fixture');
  try {
    const [homeNext, fixtures] = await Promise.all([
      fetch('/api/home-next?t=' + Date.now(), { cache: 'no-store' }).then(r => r.json()),
      fetch('/api/fixtures?t=' + Date.now(), { cache: 'no-store' }).then(r => r.json())
    ]);

    if (homeNext.mode === 'message' && homeNext.message) {
      box.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;">
          <div>
            <p class="eyebrow" style="margin-bottom:6px;">Club update</p>
            <h3 style="margin-bottom:4px;">${homeNext.message}</h3>
          </div>
        </div>`;
      return;
    }

    const selectedFixture = fixtures.find(f => f.id === homeNext.fixtureId) || fixtures
      .filter(f => f.status === 'scheduled')
      .sort((a, b) => new Date(a.date) - new Date(b.date))[0];

    if (!selectedFixture) { box.innerHTML = '<p>No fixtures currently scheduled. Check back soon.</p>'; return; }

    const d = new Date(selectedFixture.date);
    const dateStr = d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    const timeStr = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

    box.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;">
        <div>
          <p class="eyebrow" style="margin-bottom:6px;">${selectedFixture.competition} &middot; ${selectedFixture.venue === 'home' ? 'Home' : 'Away'}</p>
          <h3 style="margin-bottom:4px;">NJUIT INT FC ${selectedFixture.venue === 'home' ? 'vs' : '@'} ${selectedFixture.opponent}</h3>
          <p style="margin:0;">${dateStr} &middot; ${timeStr} &middot; ${selectedFixture.location}</p>
        </div>
        <div id="next-weather"><span class="weather-pill">Checking weather&hellip;</span></div>
      </div>`;

    try {
      const w = await getWeatherForHome(selectedFixture.id);
      const wbox = document.getElementById('next-weather');
      if (w && w.available && w.precipitationProbability !== null) {
        const rain = Math.round(w.precipitationProbability);
        const quality = w.weatherQuality === 'good' ? 'good weather' : 'bad weather';
        wbox.innerHTML = `<span class="weather-pill">Rain ${rain}% • ${quality}</span>`;
      } else {
        wbox.innerHTML = `<span class="weather-pill">Forecast not yet available</span>`;
      }
    } catch (e) {
      document.getElementById('next-weather').innerHTML = `<span class="weather-pill">Forecast unavailable</span>`;
    }
  } catch (e) {
    box.innerHTML = '<p>Could not load the next fixture right now.</p>';
  }
}

async function loadFeaturedPlayers() {
  const grid = document.getElementById('home-players');
  try {
    const players = await fetch('/api/players').then(r => r.json());
    const featured = [...players].sort((a, b) => (b.stats.goals + b.stats.assists) - (a.stats.goals + a.stats.assists)).slice(0, 3);
    grid.innerHTML = featured.map(p => `
      <div class="player-card">
        <div class="player-card-photo ${p.photo ? '' : 'placeholder'}">
          ${p.photo ? `<img src="${p.photo}" alt="${p.name}" style="object-position:${p.photoPosition || '50% 50%'}; transform:scale(${p.photoZoom || 1}); transform-origin:${p.photoPosition || '50% 50%'};">` : 'No photo yet'}
        </div>
        <div class="player-card-body">
          <div class="number">${p.number ?? ''}</div>
          <p class="position">${positionInitial(p.position)} &middot; ${p.nationality}</p>
          <h3>${p.name}</h3>
          <div class="meta">
            <div><span>Goals</span><span>${p.stats?.goals ?? 0}</span></div>
            <div><span>Assists</span><span>${p.stats?.assists ?? 0}</span></div>
          </div>
        </div>
      </div>`).join('');
  } catch (e) {
    grid.innerHTML = '<p>Could not load players right now.</p>';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadHeroStats();
  loadAnnouncement();
  loadNextFixture();
  loadFeaturedPlayers();
});