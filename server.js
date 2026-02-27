const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── تحميل البيانات ──────────────────────────────────────
const TOOLS_DIR = path.join(__dirname, 'tools');

function loadJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (e) {
    return null;
  }
}

const registry = loadJSON(path.join(TOOLS_DIR, 'registry.json'));

// ─── API Routes ──────────────────────────────────────────

// الصحة
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '5.0.0',
    tools: registry?.tools?.length || 0,
    timestamp: new Date().toISOString(),
  });
});

// فهرس الأدوات
app.get('/api/tools', (req, res) => {
  const tools = (registry?.tools || []).map(t => ({
    id: t.id,
    displayName: t.displayName,
    displayNameAr: t.displayNameAr,
    category: t.category,
    auth: t.auth,
    priority: t.priority,
  }));
  res.json({ total: tools.length, tools });
});

// تفاصيل أداة واحدة
app.get('/api/tools/:id', (req, res) => {
  const tool = registry?.tools?.find(t => t.id === req.params.id);
  if (!tool) return res.status(404).json({ error: 'أداة غير موجودة' });

  const template = loadJSON(path.join(TOOLS_DIR, 'templates', `${tool.id}.json`));
  res.json({ tool, template });
});

// الصناعات
app.get('/api/industries', (req, res) => {
  const dir = path.join(TOOLS_DIR, 'industries');
  if (!fs.existsSync(dir)) return res.json({ industries: [] });

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  const industries = files.map(f => {
    const data = loadJSON(path.join(dir, f));
    return {
      id: data?._industry || f.replace('.json', ''),
      name: data?._displayName || f,
      description: data?._description || '',
      scenarios: data?.scenarios?.length || 0,
    };
  });
  res.json({ total: industries.length, industries });
});

// سيناريوهات صناعة
app.get('/api/industries/:id', (req, res) => {
  const filePath = path.join(TOOLS_DIR, 'industries', `${req.params.id}.json`);
  const data = loadJSON(filePath);
  if (!data) return res.status(404).json({ error: 'صناعة غير موجودة' });
  res.json(data);
});

// فحص flow
app.post('/api/validate', (req, res) => {
  try {
    const { FlowValidator } = require('./tools/validate.js');
    const validator = new FlowValidator(req.body);
    const result = validator.validate();
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// الصفحة الرئيسية
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── تشغيل السيرفر ──────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`⚡ AutoFlow v5.0 شغال على http://localhost:${PORT}`);
  console.log(`🔧 الأدوات: ${registry?.tools?.length || 0}`);
  console.log(`📡 API: /api/health | /api/tools | /api/industries`);
});
