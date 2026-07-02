const crypto = require('crypto');

module.exports = function setupPersonnelRoutes(app, requireAdmin, store) {
  const { readData, writeData } = store;

  app.get('/api/personnel', (req, res) => {
    res.json(readData('personnel.json'));
  });

  app.post('/api/personnel', requireAdmin, (req, res) => {
    const personnel = readData('personnel.json');
    const item = {
      id: 'p_' + crypto.randomBytes(4).toString('hex'),
      role: String(req.body.role || 'New role').trim(),
      name: String(req.body.name || 'New person').trim(),
      bio: String(req.body.bio || ''),
      photoDataUrl: String(req.body.photoDataUrl || ''),
      photoPosition: String(req.body.photoPosition || '50% 50%'),
      photoZoom: Number(req.body.photoZoom || 1)
    };
    personnel.push(item);
    writeData('personnel.json', personnel);
    res.status(201).json({ ok: true, person: item });
  });

  app.put('/api/personnel/:id', requireAdmin, (req, res) => {
    const personnel = readData('personnel.json');
    const idx = personnel.findIndex(item => item.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Personnel not found.' });
    personnel[idx] = { ...personnel[idx], ...req.body, id: personnel[idx].id };
    writeData('personnel.json', personnel);
    res.json({ ok: true, person: personnel[idx] });
  });

  app.delete('/api/personnel/:id', requireAdmin, (req, res) => {
    let personnel = readData('personnel.json');
    const before = personnel.length;
    personnel = personnel.filter(item => item.id !== req.params.id);
    if (personnel.length === before) return res.status(404).json({ error: 'Personnel not found.' });
    writeData('personnel.json', personnel);
    res.json({ ok: true });
  });
};
