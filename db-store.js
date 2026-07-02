const { Pool } = require('pg');

const DEFAULT_DATA = {
  'admin.json': [
    {
      username: 'admin',
      passwordHash: '$2a$10$TZGDdbLmpgC75//GX63SIuYkpV.uH8l4GDmrDlZg8y3bi5d3apTjK'
    }
  ],
  'players.json': [],
  'suggestions.json': [],
  'fixtures.json': [],
  'lineup.json': {
    fixtureId: '',
    formation: '4-3-3',
    captain: '',
    startingXI: [],
    substitutes: [],
    generalInstruction: '',
    attacking: '',
    defending: '',
    passing: '',
    structure: '',
    updatedAt: null
  },
  'history.json': [],
  'training.json': [],
  'attendance.json': [],
  'attendance-config.json': {
    heading: 'Play this evening?',
    description: "Tick if you can join the squad for tonight's session, then see how many people are coming and who is confirmed.",
    checkboxLabel: 'I can play this evening',
    statusTitle: "Tonight's turnout",
    comingTitle: 'Coming',
    notComingTitle: 'Not coming'
  },
  'home-next.json': {
    mode: 'fixture',
    fixtureId: '',
    potmPlayerId: '',
    message: '',
    announcement: '',
    showAnnouncement: false
  },
  'site-config.json': {
    logoImage: '',
    logoPosition: '50% 50%',
    logoZoom: 1,
    brandName: 'NJUIT INT FC',
    brandSubtext: 'NANJING · EST. 2024',
    homeHeadline: 'WEAR THE CREST.\nEARN THE SHIRT.',
    homeDescription: "NJUIT INT FC is the international students' football club of NJUIT, fielding a squad drawn from across the globe since 2024. Same badge, every accent."
  },
  'club-records.json': {},
  'personnel.json': []
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function hasValidAdminRecord(value) {
  return Array.isArray(value)
    && value.length > 0
    && typeof value[0]?.username === 'string'
    && typeof value[0]?.passwordHash === 'string'
    && value[0].username.trim() !== ''
    && value[0].passwordHash.trim() !== '';
}

function createDataStore({ connectionString }) {
  const useSsl = String(process.env.PGSSL || '').toLowerCase() === 'true';
  const pool = new Pool({
    connectionString,
    ssl: useSsl ? { rejectUnauthorized: false } : false
  });

  const cache = new Map();

  const writeQueue = new Map();

  function enqueueWrite(key, data) {
    const payload = clone(data);
    const previous = writeQueue.get(key) || Promise.resolve();
    const next = previous
      .then(() => pool.query(
        `
          INSERT INTO app_data (key, value, updated_at)
          VALUES ($1, $2::jsonb, NOW())
          ON CONFLICT (key)
          DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
        `,
        [key, JSON.stringify(payload)]
      ))
      .catch((err) => {
        console.error(`Failed to persist key ${key} to PostgreSQL:`, err.message);
      })
      .finally(() => {
        if (writeQueue.get(key) === next) {
          writeQueue.delete(key);
        }
      });

    writeQueue.set(key, next);
    return next;
  }

  async function init() {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS app_data (
        key TEXT PRIMARY KEY,
        value JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const existing = await pool.query('SELECT key, value FROM app_data');
    existing.rows.forEach((row) => {
      cache.set(row.key, row.value);
    });

    for (const file of Object.keys(DEFAULT_DATA)) {
      if (cache.has(file)) {
        if (file === 'admin.json' && !hasValidAdminRecord(cache.get(file))) {
          const repaired = clone(DEFAULT_DATA[file]);
          cache.set(file, repaired);
          await pool.query(
            `
              INSERT INTO app_data (key, value, updated_at)
              VALUES ($1, $2::jsonb, NOW())
              ON CONFLICT (key)
              DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
            `,
            [file, JSON.stringify(repaired)]
          );
        }
        continue;
      }

      const seeded = clone(DEFAULT_DATA[file]);
      cache.set(file, clone(seeded));
      await pool.query(
        `
          INSERT INTO app_data (key, value, updated_at)
          VALUES ($1, $2::jsonb, NOW())
          ON CONFLICT (key)
          DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
        `,
        [file, JSON.stringify(seeded)]
      );
    }
  }

  function readData(file) {
    if (!cache.has(file)) {
      throw new Error(`Missing data key: ${file}`);
    }
    return clone(cache.get(file));
  }

  function safeReadData(file, fallback) {
    if (!cache.has(file)) {
      const value = clone(fallback);
      cache.set(file, value);
      enqueueWrite(file, value);
      return clone(value);
    }
    return clone(cache.get(file));
  }

  function writeData(file, data) {
    const value = clone(data);
    cache.set(file, value);
    enqueueWrite(file, value);
  }

  async function close() {
    await Promise.all([...writeQueue.values()]);
    await pool.end();
  }

  async function health() {
    await pool.query('SELECT 1');
    return {
      ok: true,
      cacheKeys: cache.size
    };
  }

  return {
    init,
    readData,
    safeReadData,
    writeData,
    close,
    health
  };
}

module.exports = {
  createDataStore
};
