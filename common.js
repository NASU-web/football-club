// Shared across every page: draws the club crest, marks the active nav link,
// and fills the matchday ticker from live data.

const CREST_SVG = `
<svg viewBox="0 0 100 114" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="NJUIT INT FC crest">
  <path d="M50 2 L96 16 V58 C96 86 76 104 50 112 C24 104 4 86 4 58 V16 Z"
        fill="#0b1f3a" stroke="#c9a227" stroke-width="3"/>
  <path d="M50 8 L90 20 V57 C90 81 73 97 50 105 C27 97 10 81 10 57 V20 Z"
        fill="none" stroke="#e7cd72" stroke-width="1"/>
  <text x="50" y="40" text-anchor="middle" font-family="'Space Mono', monospace" font-size="11" fill="#e7cd72" letter-spacing="1">NJUIT</text>
  <circle cx="50" cy="64" r="17" fill="#f3efe2" stroke="#c9a227" stroke-width="2"/>
  <path d="M50 51 L58 57 L55 67 L45 67 L42 57 Z" fill="#0b1f3a"/>
  <path d="M50 51 L42 57 M50 51 L58 57 M45 67 L37 60 M55 67 L63 60 M45 67 L50 78 M55 67 L50 78" stroke="#0b1f3a" stroke-width="1.4" fill="none"/>
  <text x="50" y="98" text-anchor="middle" font-family="'Space Mono', monospace" font-size="9" fill="#e7cd72" letter-spacing="1">EST 2024</text>
</svg>`;

function paintCrests() {
  document.querySelectorAll('.crest').forEach(el => {
    el.innerHTML = CREST_SVG;
  });
}

function highlightNav() {
  const here = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('nav.primary-nav a').forEach(a => {
    const target = a.getAttribute('href');
    if (target === here || (here === '' && target === 'index.html')) a.classList.add('active');
  });
}

function setYear() {
  document.querySelectorAll('.this-year').forEach(el => { el.textContent = new Date().getFullYear(); });
}

async function loadSiteConfig() {
  try {
    const config = await fetch('/api/site-config?t=' + Date.now(), { cache: 'no-store' }).then(r => r.ok ? r.json() : null);
    if (!config) {
      paintCrests();
      return;
    }
    const brandName = config.brandName?.trim() || 'NJUIT INT FC';
    const brandSubtext = config.brandSubtext?.trim() || 'NANJING · EST. 2024';
    document.querySelectorAll('.brand-name').forEach(el => {
      el.innerHTML = `${brandName}${brandSubtext ? `<small>${brandSubtext}</small>` : ''}`;
    });
    if (config.logoImage?.trim()) {
      const src = config.logoImage.trim();
      const logoPosition = config.logoPosition?.trim() || '50% 50%';
      const logoZoom = Number(config.logoZoom || 1);
      document.querySelectorAll('.crest').forEach(el => {
        const existingImg = el.querySelector('img');
        if (existingImg) existingImg.remove();
        const img = document.createElement('img');
        img.src = src;
        img.alt = `${brandName} crest`;
        img.style.objectPosition = logoPosition;
        img.style.transformOrigin = logoPosition;
        img.style.transform = `scale(${logoZoom})`;
        img.onload = () => {
          img.classList.add('loaded');
        };
        img.onerror = () => {
          img.remove();
        };
        el.appendChild(img);
      });
    } else {
      paintCrests();
    }
  } catch (e) {
    paintCrests();
  }
}

function getWeatherSummary(weather) {
  if (!weather || !weather.available || weather.precipitationProbability === null) {
    return 'Weather unavailable';
  }
  const rain = Math.round(weather.precipitationProbability);
  const quality = weather.weatherQuality === 'good' ? 'good weather' : 'bad weather';
  return `Rain ${rain}% — ${quality}`;
}

async function getWeatherForHome(fixtureId) {
  const isHomePage = location.pathname === '/' || location.pathname.endsWith('/index.html') || location.pathname.endsWith('index.html');
  if (!isHomePage) {
    return fixtureId ? fetch('/api/weather/' + fixtureId).then(r => r.json()) : null;
  }

  const fallbackLocation = 'Nanjing';
  try {
    const weather = await fetch(`/api/weather/search?location=${encodeURIComponent(fallbackLocation)}`).then(r => r.json());
    return weather;
  } catch (e) {
    return fixtureId ? fetch('/api/weather/' + fixtureId).then(r => r.json()) : null;
  }
}

async function fillTicker() {
  const track = document.querySelector('.ticker-track');
  if (!track) return;
  try {
    const weather = await fetch('/api/weather/search?location=' + encodeURIComponent('Nanjing')).then(r => r.json());
    const summary = getWeatherSummary(weather);
    track.innerHTML = `<span>The weather man… ${summary}</span><span>The weather man… ${summary}</span>`;
  } catch (e) {
    track.innerHTML = '<span>The weather man…</span><span>The weather man…</span>';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  highlightNav();
  setYear();
  loadSiteConfig();
  fillTicker();
});