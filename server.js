const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const crypto = require('crypto');
const { createDataStore } = require('./db-store');
const setupPersonnelRoutes = require('./personnel-server');

const app = express();
const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL;
const PLAYER_UPDATE_CODE = 'MESSI';
let dataStore;

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(session({
  secret: 'njuit-int-fc-clubhouse-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 4 } // 4 hours
}));
app.use(express.static(path.join(__dirname)));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/training', (req, res) => {
  res.sendFile(path.join(__dirname, 'training.html'));
});

app.get('/personnel', (req, res) => {
  res.sendFile(path.join(__dirname, 'personnel.html'));
});

app.get('/api/health/db', async (req, res) => {
  if (!dataStore) {
    return res.status(503).json({ ok: false, error: 'Datastore not initialized yet.' });
  }

  try {
    const result = await dataStore.health();
    return res.json({ ok: true, ...result, timestamp: new Date().toISOString() });
  } catch (err) {
    return res.status(503).json({ ok: false, error: err.message || 'Database health check failed.' });
  }
});

// ---------- PostgreSQL-backed datastore helpers ----------
function readData(file) {
  if (!dataStore) throw new Error('Datastore is not initialized.');
  return dataStore.readData(file);
}
function safeReadData(file, fallback) {
  if (!dataStore) throw new Error('Datastore is not initialized.');
  return dataStore.safeReadData(file, fallback);
}
function writeData(file, data) {
  if (!dataStore) throw new Error('Datastore is not initialized.');
  dataStore.writeData(file, data);
}
function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.status(401).json({ error: 'Admin login required.' });
}

// ---------- AUTH ----------
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  const admins = readData('admin.json');
  const admin = admins.find(a => a.username === username);
  if (!admin || !bcrypt.compareSync(password || '', admin.passwordHash)) {
    return res.status(401).json({ error: 'Invalid username or password.' });
  }
  req.session.isAdmin = true;
  req.session.username = admin.username;
  res.json({ ok: true, username: admin.username });
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/auth/me', (req, res) => {
  res.json({ isAdmin: !!(req.session && req.session.isAdmin), username: req.session?.username || null });
});

app.post('/api/auth/change-credentials', requireAdmin, (req, res) => {
  const { currentPassword, newUsername, newPassword } = req.body || {};
  const admins = readData('admin.json');
  const admin = admins.find(a => a.username === req.session.username);

  if (!admin || !bcrypt.compareSync(currentPassword || '', admin.passwordHash)) {
    return res.status(401).json({ error: 'Current password is incorrect.' });
  }

  const username = typeof newUsername === 'string' ? newUsername.trim() : '';
  const password = typeof newPassword === 'string' ? newPassword : '';

  if (!username && !password) {
    return res.status(400).json({ error: 'Provide a new username or new password.' });
  }

  if (username && admins.some(a => a.username === username && a.username !== admin.username)) {
    return res.status(409).json({ error: 'That username is already taken.' });
  }

  if (username) admin.username = username;
  if (password) admin.passwordHash = bcrypt.hashSync(password, 10);

  writeData('admin.json', admins);
  req.session.username = admin.username;
  res.json({ ok: true, username: admin.username });
});

// ---------- PLAYERS ----------
app.get('/api/players', (req, res) => {
  const players = readData('players.json');
  if (req.query.all === '1' && req.session && req.session.isAdmin) {
    return res.json(players);
  }
  res.json(players.filter(p => p.status === 'approved'));
});

app.post('/api/players/register', (req, res) => {
  const { name, number, position, nationality, year, photo, photoPosition, photoZoom } = req.body || {};
  if (!name || !position || !nationality) {
    return res.status(400).json({ error: 'Name, position, and nationality are required.' });
  }
  const players = readData('players.json');
  const newPlayer = {
    id: 'p_' + crypto.randomBytes(4).toString('hex'),
    name: String(name).trim(),
    number: number ? Number(number) : null,
    position,
    nationality,
    year: year || 'Freshman',
    photo: photo ? String(photo).trim() : '',
    photoPosition: photoPosition ? String(photoPosition).trim() : '50% 50%',
    photoZoom: Number(photoZoom || 1),
    status: 'pending',
    stats: { appearances: 0, goals: 0, assists: 0, yellowCards: 0, redCards: 0 },
    registeredAt: new Date().toISOString()
  };
  players.push(newPlayer);
  writeData('players.json', players);
  res.status(201).json({ ok: true, player: newPlayer });
});

app.post('/api/players/photo', (req, res) => {
  const { name, photo, photoPosition, photoZoom, updateCode, updatedName, updatedNumber, updatedLevel } = req.body || {};
  if (String(updateCode || '').trim().toUpperCase() !== PLAYER_UPDATE_CODE) {
    return res.status(403).json({ error: 'Invalid code password.' });
  }
  if (!name) {
    return res.status(400).json({ error: 'Your name is required.' });
  }
  if (!photo && !updatedName && (updatedNumber === null || updatedNumber === undefined || updatedNumber === '') && !updatedLevel) {
    return res.status(400).json({ error: 'Provide a photo, name update, number update, or level update.' });
  }
  }
  const players = readData('players.json');
  const idx = players.findIndex(p => String(p.name).trim().toLowerCase() === String(name).trim().toLowerCase());
  if (idx === -1) {
    return res.status(404).json({ error: 'No matching player was found. Try the exact name used during registration.' });
  }
  if (photo) {
    players[idx].photo = String(photo).trim();
    players[idx].photoPosition = photoPosition ? String(photoPosition).trim() : (players[idx].photoPosition || '50% 50%');
    players[idx].photoZoom = Number(photoZoom || players[idx].photoZoom || 1);
  }

  if (typeof updatedName === 'string' && updatedName.trim()) {
    const trimmedNewName = updatedName.trim();
    const clash = players.some((p, i) => i !== idx && String(p.name).trim().toLowerCase() === trimmedNewName.toLowerCase());
    if (clash) {
      return res.status(409).json({ error: 'Another player already has that name. Ask a club admin for help.' });
    }
    players[idx].name = trimmedNewName;
  }

  if (updatedNumber !== null && updatedNumber !== undefined && updatedNumber !== '') {
    const parsedNumber = Number(updatedNumber);
    if (!Number.isFinite(parsedNumber) || parsedNumber < 1 || parsedNumber > 99) {
      return res.status(400).json({ error: 'Player number must be between 1 and 99.' });
    }
    players[idx].number = Math.round(parsedNumber);
  }

  if (typeof updatedLevel === 'string' && updatedLevel.trim()) {
    const allowedLevels = ['Freshman', 'Sophomore', 'Junior', 'Senior', 'Graduate'];
    if (!allowedLevels.includes(updatedLevel.trim())) {
      return res.status(400).json({ error: 'Invalid level selected.' });
    }
    players[idx].year = updatedLevel.trim();
  }

  writeData('players.json', players);
  res.json({ ok: true, player: players[idx] });
});

app.put('/api/players/:id', requireAdmin, (req, res) => {
  const players = readData('players.json');
  const idx = players.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Player not found.' });
  players[idx] = { ...players[idx], ...req.body, id: players[idx].id };
  writeData('players.json', players);
  res.json({ ok: true, player: players[idx] });
});

app.delete('/api/players/:id', requireAdmin, (req, res) => {
  let players = readData('players.json');
  const before = players.length;
  players = players.filter(p => p.id !== req.params.id);
  if (players.length === before) return res.status(404).json({ error: 'Player not found.' });
  writeData('players.json', players);
  res.json({ ok: true });
});

// ---------- SUGGESTIONS ----------
app.get('/api/suggestions', requireAdmin, (req, res) => {
  res.json(readData('suggestions.json'));
});

app.post('/api/suggestions', (req, res) => {
  const { message } = req.body || {};
  if (!message) {
    return res.status(400).json({ error: 'A suggestion message is required.' });
  }
  const suggestions = readData('suggestions.json');
  const newSuggestion = {
    id: 's_' + crypto.randomBytes(4).toString('hex'),
    message: String(message).trim(),
    createdAt: new Date().toISOString()
  };
  suggestions.push(newSuggestion);
  writeData('suggestions.json', suggestions);
  res.status(201).json({ ok: true, suggestion: newSuggestion });
});

// ---------- STATS ----------
app.get('/api/stats', (req, res) => {
  const players = readData('players.json').filter(p => p.status === 'approved');
  const fixtures = readData('fixtures.json');
  const recordOverrides = readData('club-records.json');

  const played = fixtures.filter(f => f.status === 'played');
  const wins = played.filter(f => f.result.for > f.result.against).length;
  const draws = played.filter(f => f.result.for === f.result.against).length;
  const losses = played.filter(f => f.result.for < f.result.against).length;
  const goalsFor = played.reduce((s, f) => s + f.result.for, 0);
  const goalsAgainst = played.reduce((s, f) => s + f.result.against, 0);

  const topScorers = [...players]
    .sort((a, b) => (b.stats.goals || 0) - (a.stats.goals || 0))
    .slice(0, 5)
    .map(p => ({ id: p.id, name: p.name, number: p.number, goals: p.stats.goals || 0 }));

  const topAssists = [...players]
    .sort((a, b) => (b.stats.assists || 0) - (a.stats.assists || 0))
    .slice(0, 5)
    .map(p => ({ id: p.id, name: p.name, number: p.number, assists: p.stats.assists || 0 }));

  const club = {
    played: recordOverrides.played ?? played.length,
    wins: recordOverrides.wins ?? wins,
    draws: recordOverrides.draws ?? draws,
    losses: recordOverrides.losses ?? losses,
    goalsFor: recordOverrides.goalsFor ?? goalsFor,
    goalsAgainst: recordOverrides.goalsAgainst ?? goalsAgainst
  };

  res.json({
    club,
    topScorers,
    topAssists,
    squadSize: players.length,
    nationalities: [...new Set(players.map(p => p.nationality))].length
  });
});

app.put('/api/club-records', requireAdmin, (req, res) => {
  const overrides = req.body || {};
  const current = readData('club-records.json');
  const updated = { ...current, ...overrides };
  writeData('club-records.json', updated);
  res.json({ ok: true, clubRecords: updated });
});

app.get('/api/club-records', (req, res) => {
  res.json(readData('club-records.json'));
});

// ---------- TRAINING ----------
app.get('/api/training', (req, res) => {
  res.json(readData('training.json'));
});

app.put('/api/training', requireAdmin, (req, res) => {
  if (!Array.isArray(req.body)) return res.status(400).json({ error: 'Expected an array of training sessions.' });
  writeData('training.json', req.body);
  res.json({ ok: true, training: req.body });
});

// ---------- FIXTURES ----------
app.get('/api/fixtures', (req, res) => {
  res.json(readData('fixtures.json'));
});

// ---------- ATTENDANCE ----------
app.get('/api/attendance', (req, res) => {
  const entries = safeReadData('attendance.json', []);
  res.json(entries);
});

app.get('/api/attendance-config', (req, res) => {
  const config = safeReadData('attendance-config.json', {
    heading: 'Play this evening?',
    description: "Tick if you can join the squad for tonight's session, then see how many people are coming and who is confirmed.",
    checkboxLabel: 'I can play this evening',
    statusTitle: "Tonight's turnout",
    comingTitle: 'Coming',
    notComingTitle: 'Not coming'
  });
  res.json(config);
});

app.put('/api/attendance-config', requireAdmin, (req, res) => {
  const payload = req.body || {};
  const config = safeReadData('attendance-config.json', {
    heading: 'Play this evening?',
    description: "Tick if you can join the squad for tonight's session, then see how many people are coming and who is confirmed.",
    checkboxLabel: 'I can play this evening',
    statusTitle: "Tonight's turnout",
    comingTitle: 'Coming',
    notComingTitle: 'Not coming'
  });
  const updated = { ...config, ...payload };
  writeData('attendance-config.json', updated);
  res.json({ ok: true, config: updated });
});

app.post('/api/attendance', (req, res) => {
  const { name, coming } = req.body || {};
  if (!name || typeof coming !== 'boolean') {
    return res.status(400).json({ error: 'Name and coming status are required.' });
  }
  const entries = safeReadData('attendance.json', []);
  const normalized = String(name).trim();
  const idx = entries.findIndex(item => item.name.toLowerCase() === normalized.toLowerCase());
  const updatedEntry = {
    name: normalized,
    coming,
    updatedAt: new Date().toISOString()
  };
  if (idx === -1) {
    entries.push(updatedEntry);
  } else {
    entries[idx] = { ...entries[idx], ...updatedEntry };
  }
  writeData('attendance.json', entries);
  res.json({ ok: true, entry: updatedEntry });
});

app.get('/api/home-next', (req, res) => {
  const current = readData('home-next.json');
  const data = {
    mode: current.mode || 'fixture',
    fixtureId: current.fixtureId || '',
    potmPlayerId: current.potmPlayerId || '',
    message: current.message || '',
    announcement: current.announcement || '',
    showAnnouncement: typeof current.showAnnouncement === 'boolean' ? current.showAnnouncement : Boolean(current.announcement)
  };
  res.json(data);
});

app.put('/api/home-next', requireAdmin, (req, res) => {
  const current = readData('home-next.json');
  const updated = { ...current, ...req.body };
  writeData('home-next.json', updated);
  res.json({ ok: true, homeNext: updated });
});

app.get('/api/announcement', (req, res) => {
  const current = readData('home-next.json');
  res.json({
    message: current.announcement || '',
    show: !!current.showAnnouncement && !!current.announcement
  });
});

app.put('/api/announcement', requireAdmin, (req, res) => {
  const current = readData('home-next.json');
  const updated = {
    ...current,
    announcement: req.body?.message || '',
    showAnnouncement: !!req.body?.show
  };
  writeData('home-next.json', updated);
  res.json({ ok: true, announcement: { message: updated.announcement, show: updated.showAnnouncement } });
});

app.get('/api/site-config', (req, res) => {
  const config = safeReadData('site-config.json', {
    logoImage: '',
    logoPosition: '50% 50%',
    logoZoom: 1,
    brandName: 'NJUIT INT FC',
    brandSubtext: 'NANJING · EST. 2024',
    homeHeadline: 'WEAR THE CREST.\nEARN THE SHIRT.',
    homeDescription: "NJUIT INT FC is the international students' football club of NJUIT, fielding a squad drawn from across the globe since 2024. Same badge, every accent."
  });
  res.json(config);
});

app.put('/api/site-config', requireAdmin, (req, res) => {
  const current = safeReadData('site-config.json', {
    logoImage: '',
    brandName: 'NJUIT INT FC',
    brandSubtext: 'NANJING · EST. 2024',
    homeHeadline: 'WEAR THE CREST.\nEARN THE SHIRT.',
    homeDescription: "NJUIT INT FC is the international students' football club of NJUIT, fielding a squad drawn from across the globe since 2024. Same badge, every accent."
  });
  const updated = { ...current, ...req.body };
  writeData('site-config.json', updated);
  res.json({ ok: true, config: updated });
});

setupPersonnelRoutes(app, requireAdmin, { readData, writeData });

app.post('/api/fixtures', requireAdmin, (req, res) => {
  const fixtures = readData('fixtures.json');
  const f = {
    id: 'f_' + crypto.randomBytes(4).toString('hex'),
    status: 'scheduled',
    result: null,
    ...req.body
  };
  fixtures.push(f);
  writeData('fixtures.json', fixtures);
  res.status(201).json({ ok: true, fixture: f });
});

app.put('/api/fixtures/:id', requireAdmin, (req, res) => {
  const fixtures = readData('fixtures.json');
  const idx = fixtures.findIndex(f => f.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Fixture not found.' });
  fixtures[idx] = { ...fixtures[idx], ...req.body, id: fixtures[idx].id };
  writeData('fixtures.json', fixtures);
  res.json({ ok: true, fixture: fixtures[idx] });
});

app.delete('/api/fixtures/:id', requireAdmin, (req, res) => {
  let fixtures = readData('fixtures.json');
  const before = fixtures.length;
  fixtures = fixtures.filter(f => f.id !== req.params.id);
  if (fixtures.length === before) return res.status(404).json({ error: 'Fixture not found.' });
  writeData('fixtures.json', fixtures);
  res.json({ ok: true });
});

// ---------- LINEUP ----------
app.get('/api/lineup', (req, res) => {
  res.json(readData('lineup.json'));
});

app.put('/api/lineup', requireAdmin, (req, res) => {
  const current = readData('lineup.json');
  const updated = { ...current, ...req.body, updatedAt: new Date().toISOString() };
  writeData('lineup.json', updated);
  res.json({ ok: true, lineup: updated });
});

// ---------- HISTORY ----------
app.get('/api/history', (req, res) => {
  res.json(readData('history.json'));
});

app.put('/api/history', requireAdmin, (req, res) => {
  if (!Array.isArray(req.body)) return res.status(400).json({ error: 'Expected an array of milestones.' });
  writeData('history.json', req.body);
  res.json({ ok: true });
});

// ---------- WEATHER (Open-Meteo, no key required) ----------
async function fetchWeatherSnapshot({ lat, lon, targetTime }) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&hourly=temperature_2m,precipitation_probability,wind_speed_10m,weather_code` +
    `&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto` +
    `&forecast_days=16`;

  const response = await fetch(url);
  if (!response.ok) throw new Error('Weather provider error: ' + response.status);
  const weather = await response.json();

  const targetMs = targetTime ? new Date(targetTime).getTime() : Date.now();
  let bestIdx = 0, bestDiff = Infinity;
  (weather.hourly.time || []).forEach((t, i) => {
    const diff = Math.abs(new Date(t).getTime() - targetMs);
    if (diff < bestDiff) { bestDiff = diff; bestIdx = i; }
  });

  const precipitationProbability = weather.hourly.precipitation_probability?.[bestIdx] ?? null;
  const weatherQuality = precipitationProbability === null ? 'unknown' : (precipitationProbability < 40 ? 'good' : 'bad');
  const inRange = bestDiff < 1000 * 60 * 60 * 24 * 16;

  return {
    available: inRange,
    time: weather.hourly.time?.[bestIdx] || null,
    temperatureF: weather.hourly.temperature_2m?.[bestIdx] ?? null,
    precipitationProbability,
    windMph: weather.hourly.wind_speed_10m?.[bestIdx] ?? null,
    weatherCode: weather.hourly.weather_code?.[bestIdx] ?? null,
    weatherQuality
  };
}

app.get('/api/weather/search', async (req, res) => {
  try {
    const location = String(req.query.location || 'Nanjing').trim();
    if (!location) return res.status(400).json({ error: 'Provide a location.' });

    const geocodeUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en&format=json`;
    const geoResponse = await fetch(geocodeUrl);
    if (!geoResponse.ok) throw new Error('Geocoding provider error: ' + geoResponse.status);
    const geodata = await geoResponse.json();
    const place = geodata.results?.[0];
    if (!place) return res.status(404).json({ error: 'Location not found.' });

    const snapshot = await fetchWeatherSnapshot({ lat: place.latitude, lon: place.longitude, targetTime: req.query.time || new Date().toISOString() });
    res.json({ location: place.name, country: place.country, ...snapshot });
  } catch (err) {
    res.status(502).json({ error: 'Could not reach the weather service.', detail: err.message });
  }
});

app.get('/api/weather/:fixtureId', async (req, res) => {
  try {
    const fixtures = readData('fixtures.json');
    const fixture = fixtures.find(f => f.id === req.params.fixtureId);
    if (!fixture) return res.status(404).json({ error: 'Fixture not found.' });
    if (!fixture.lat || !fixture.lon) return res.status(400).json({ error: 'Fixture has no location set.' });

    const snapshot = await fetchWeatherSnapshot({ lat: fixture.lat, lon: fixture.lon, targetTime: fixture.date });
    res.json({ fixtureId: fixture.id, ...snapshot });
  } catch (err) {
    res.status(502).json({ error: 'Could not reach the weather service.', detail: err.message });
  }
});

app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'Invalid JSON payload.' });
  }
  next(err);
});

async function start() {
  try {
    if (!DATABASE_URL) {
      throw new Error('DATABASE_URL is not set. Provide your Railway PostgreSQL URL via environment variables.');
    }

    dataStore = createDataStore({
      connectionString: DATABASE_URL
    });
    await dataStore.init();

    app.listen(PORT, () => {
      console.log(`NJUIT INT FC site running at http://localhost:${PORT}`);
      console.log('Using PostgreSQL datastore.');
    });
  } catch (err) {
    console.error('Failed to start server with PostgreSQL datastore:', err);
    process.exit(1);
  }
}

process.on('SIGINT', async () => {
  if (dataStore) {
    await dataStore.close();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  if (dataStore) {
    await dataStore.close();
  }
  process.exit(0);
});

start();
