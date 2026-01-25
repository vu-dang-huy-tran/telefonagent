import dotenv from 'dotenv';
import http from 'http';
import { promises as fs } from 'fs';
import path from 'path';

dotenv.config({ path: '.env.local' });
dotenv.config();

const PORT = Number(process.env.PORT || process.env.BACKEND_PORT || 3001);
const DEBUG = true;

const debug = (...args) => {
  if (DEBUG) {
    console.log('[debug]', ...args);
  }
};


const dataDir = path.resolve(process.cwd(), 'backend', 'data');
const sickNotesFile = path.join(dataDir, 'sick-notes.json');
const schoolsFile = path.join(dataDir, 'schools.json');

const jsonResponse = (res, status, payload) => {
  debug('HTTP response', { status, payloadType: typeof payload });
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(payload));
};

const readJsonArray = async (filePath) => {
  try {
    debug('Read JSON', { filePath });
    const raw = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    debug('Read JSON failed', { filePath, error: e?.message });
    return [];
  }
};

const writeJsonArray = async (filePath, data) => {
  debug('Write JSON', { filePath, count: Array.isArray(data) ? data.length : null });
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
};

const saveSickNote = async (note) => {
  try {
    debug('Save sick note', { note });
    const current = await readJsonArray(sickNotesFile);
    const entry = {
      ...note,
      savedAt: new Date().toISOString()
    };

    current.push(entry);
    await writeJsonArray(sickNotesFile, current);
    return entry;
  } catch (e) {
    console.error('Failed to persist sick note:', e);
    return null;
  }
};


const distDir = path.resolve(process.cwd(), 'dist');
const indexFile = path.join(distDir, 'index.html');

const getContentType = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.html': return 'text/html; charset=utf-8';
    case '.js': return 'application/javascript; charset=utf-8';
    case '.css': return 'text/css; charset=utf-8';
    case '.svg': return 'image/svg+xml';
    case '.json': return 'application/json; charset=utf-8';
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.ico': return 'image/x-icon';
    case '.woff': return 'font/woff';
    case '.woff2': return 'font/woff2';
    default: return 'application/octet-stream';
  }
};

const serveStatic = async (req, res) => {
  if (req.method !== 'GET') return false;
  const urlPath = req.url?.split('?')[0] || '/';
  const filePath = urlPath === '/' ? indexFile : path.join(distDir, urlPath);

  try {
    debug('Serve static', { urlPath, filePath });
    const data = await fs.readFile(filePath);
    res.writeHead(200, { 'Content-Type': getContentType(filePath) });
    res.end(data);
    return true;
  } catch (e) {
    debug('Static miss', { urlPath, filePath, error: e?.message });
    if (urlPath !== '/' && !urlPath.startsWith('/api/')) {
      try {
        const data = await fs.readFile(indexFile);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(data);
        return true;
      } catch (err) {
        return false;
      }
    }
    return false;
  }
};

const httpServer = http.createServer(async (req, res) => {
  debug('HTTP request', { method: req.method, url: req.url });
  if (!req.url) {
    return jsonResponse(res, 404, { error: 'Not found' });
  }

  if (req.method === 'OPTIONS') {
    debug('CORS preflight');
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  if (req.url === '/api/health') {
    debug('Health check');
    return jsonResponse(res, 200, { ok: true });
  }

  if (req.url?.startsWith('/api/sick-notes') && req.method === 'GET') {
    debug('List sick notes');
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const schoolId = url.searchParams.get('schoolId');
    const notes = await readJsonArray(sickNotesFile);
    const filtered = schoolId ? notes.filter(n => n.schoolId === schoolId) : notes;
    return jsonResponse(res, 200, filtered);
  }

  if (req.url === '/api/sick-notes' && req.method === 'POST') {
    debug('Create sick note');
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', async () => {
      try {
        debug('Create sick note payload', { body });
        const payload = JSON.parse(body || '{}');
        const { schoolId, city, schoolName, childName, dateOfBirth, sickUntil, status } = payload;
        if (!city || !schoolName || !childName || !dateOfBirth || !sickUntil) {
          return jsonResponse(res, 400, { error: 'Missing fields' });
        }
        const saved = await saveSickNote({
          schoolId: schoolId || null,
          city,
          schoolName,
          childName,
          dateOfBirth,
          sickUntil,
          status: status || 'collected'
        });
        if (!saved) {
          return jsonResponse(res, 500, { error: 'Failed to save' });
        }
        return jsonResponse(res, 201, saved);
      } catch (e) {
        return jsonResponse(res, 400, { error: 'Invalid JSON' });
      }
    });
    return;
  }

  if (req.url === '/api/schools' && req.method === 'GET') {
    debug('List schools');
    const schools = await readJsonArray(schoolsFile);
    return jsonResponse(res, 200, schools);
  }

  if (req.url === '/api/schools/summary' && req.method === 'GET') {
    debug('Schools summary');
    const schools = await readJsonArray(schoolsFile);
    const notes = await readJsonArray(sickNotesFile);
    const counts = {};
    for (const note of notes) {
      if (note?.schoolId) {
        counts[note.schoolId] = (counts[note.schoolId] || 0) + 1;
      }
    }
    return jsonResponse(res, 200, {
      total: notes.length,
      counts,
      schools: schools.length
    });
  }

  if (req.url === '/api/schools' && req.method === 'POST') {
    debug('Create school');
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', async () => {
      try {
        debug('Create school payload', { body });
        const payload = JSON.parse(body || '{}');
        const { name, city, email } = payload;
        if (!name || !city || !email) {
          return jsonResponse(res, 400, { error: 'Missing fields' });
        }
        const schools = await readJsonArray(schoolsFile);
        const entry = {
          id: payload.id || crypto.randomUUID(),
          name,
          city,
          email
        };
        schools.unshift(entry);
        await writeJsonArray(schoolsFile, schools);
        return jsonResponse(res, 201, entry);
      } catch (e) {
        return jsonResponse(res, 400, { error: 'Invalid JSON' });
      }
    });
    return;
  }

  if (req.url?.startsWith('/api/schools/') && req.method === 'PUT') {
    debug('Update school');
    const id = req.url.split('/').pop();
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', async () => {
      try {
        debug('Update school payload', { id, body });
        const payload = JSON.parse(body || '{}');
        const { name, city, email } = payload;
        if (!id || !name || !city || !email) {
          return jsonResponse(res, 400, { error: 'Missing fields' });
        }
        const schools = await readJsonArray(schoolsFile);
        const next = schools.map(s => s.id === id ? { ...s, name, city, email } : s);
        await writeJsonArray(schoolsFile, next);
        return jsonResponse(res, 200, { id, name, city, email });
      } catch (e) {
        return jsonResponse(res, 400, { error: 'Invalid JSON' });
      }
    });
    return;
  }

  if (req.url?.startsWith('/api/schools/') && req.method === 'DELETE') {
    debug('Delete school');
    const id = req.url.split('/').pop();
    if (!id) {
      return jsonResponse(res, 400, { error: 'Missing id' });
    }
    const schools = await readJsonArray(schoolsFile);
    const next = schools.filter(s => s.id !== id);
    await writeJsonArray(schoolsFile, next);
    return jsonResponse(res, 200, { ok: true });
  }

  const served = await serveStatic(req, res);
  if (served) return;

  return jsonResponse(res, 404, { error: 'Not found' });
});

httpServer.listen(PORT, () => {
  console.log(`Backend HTTP listening on http://localhost:${PORT}`);
  debug('Debug logging enabled');
});
