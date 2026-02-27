#!/usr/bin/env node
/**
 * AutoFlow v5 — سكربت سحب الأدوات من Activepieces API
 * =====================================================
 * يسحب بيانات كل أداة من API الرسمي ويولّد ملفات templates جاهزة
 * 
 * الاستخدام:
 *   node sync/fetch-all-tools.js
 *   node sync/fetch-all-tools.js --tool=notion     # أداة واحدة
 *   node sync/fetch-all-tools.js --dry-run          # معاينة بدون كتابة
 * 
 * المتطلبات:
 *   - Node.js 18+
 *   - الـ Activepieces server شغال (أو cloud.activepieces.com)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// ─── الإعدادات ───────────────────────────────────────────
const CONFIG = {
  // غيّر هذا لرابط سيرفرك لو self-hosted
  baseUrl: process.env.AP_BASE_URL || 'https://cloud.activepieces.com',
  apiPath: '/api/v1/pieces',
  outputDir: path.join(__dirname, '..', 'tools', 'templates'),
  registryPath: path.join(__dirname, '..', 'tools', 'registry.json'),
  timeout: 30000,
};

// ─── قراءة الفهرس ────────────────────────────────────────
function loadRegistry() {
  const raw = fs.readFileSync(CONFIG.registryPath, 'utf-8');
  return JSON.parse(raw);
}

// ─── سحب بيانات أداة واحدة ──────────────────────────────
function fetchPiece(packageName) {
  return new Promise((resolve, reject) => {
    const url = `${CONFIG.baseUrl}${CONFIG.apiPath}/${encodeURIComponent(packageName)}`;
    const client = url.startsWith('https') ? https : http;
    
    console.log(`  ⬇️  سحب: ${packageName}`);
    
    const req = client.get(url, { timeout: CONFIG.timeout }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`خطأ في JSON: ${packageName} — ${e.message}`));
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode} لـ ${packageName}`));
        }
      });
    });
    
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`انتهت المهلة: ${packageName}`));
    });
  });
}

// ─── تحويل بيانات API إلى template مبسّط ────────────────
function buildTemplate(apiData, toolConfig) {
  const template = {
    _autoflow: {
      version: '5.0',
      generatedAt: new Date().toISOString(),
      source: 'activepieces-api',
      toolId: toolConfig.id,
      toolNameAr: toolConfig.displayNameAr,
    },
    
    // معلومات الحزمة — تنسخ حرفياً في كل flow
    piece: {
      packageType: apiData.packageType || 'REGISTRY',
      pieceType: apiData.pieceType || 'OFFICIAL',
      pieceName: apiData.name,
      pieceVersion: `~${apiData.version}`,
    },
    
    // نوع المصادقة
    auth: {
      type: apiData.auth?.type || 'NONE',
      description: apiData.auth?.description || '',
    },
    
    // الـ Triggers — كل واحد بـ template كامل
    triggers: {},
    
    // الـ Actions — كل واحد بـ template كامل
    actions: {},
  };
  
  // ─── معالجة الـ Triggers ─────────────
  if (apiData.triggers) {
    for (const [triggerName, triggerData] of Object.entries(apiData.triggers)) {
      template.triggers[triggerName] = {
        displayName: triggerData.displayName || triggerName,
        description: triggerData.description || '',
        type: triggerData.type || 'POLLING',
        requireAuth: triggerData.requireAuth !== false,
        sampleData: triggerData.sampleData || {},
        props: extractProps(triggerData.props),
        // الـ template الجاهز للنسخ
        _copyPaste: {
          type: 'PIECE_TRIGGER',
          settings: {
            pieceName: apiData.name,
            pieceVersion: `~${apiData.version}`,
            pieceType: apiData.pieceType || 'OFFICIAL',
            packageType: apiData.packageType || 'REGISTRY',
            triggerName: triggerName,
            input: buildDefaultInput(triggerData.props),
            inputUiInfo: {},
          },
          valid: false,
          name: triggerName,
        },
      };
    }
  }
  
  // ─── معالجة الـ Actions ──────────────
  if (apiData.actions) {
    for (const [actionName, actionData] of Object.entries(apiData.actions)) {
      template.actions[actionName] = {
        displayName: actionData.displayName || actionName,
        description: actionData.description || '',
        requireAuth: actionData.requireAuth !== false,
        sampleData: actionData.sampleData || {},
        props: extractProps(actionData.props),
        errorHandlingOptions: actionData.errorHandlingOptions || {
          continueOnFailure: { value: false },
          retryOnFailure: { value: false },
        },
        // الـ template الجاهز للنسخ
        _copyPaste: {
          type: 'PIECE',
          settings: {
            pieceName: apiData.name,
            pieceVersion: `~${apiData.version}`,
            pieceType: apiData.pieceType || 'OFFICIAL',
            packageType: apiData.packageType || 'REGISTRY',
            actionName: actionName,
            input: buildDefaultInput(actionData.props),
            inputUiInfo: {},
          },
          valid: false,
          name: actionName,
        },
      };
    }
  }
  
  return template;
}

// ─── استخراج الحقول (props) ─────────────────────────────
function extractProps(props) {
  if (!props) return {};
  const result = {};
  for (const [propName, propData] of Object.entries(props)) {
    result[propName] = {
      displayName: propData.displayName || propName,
      type: propData.type || 'SHORT_TEXT',
      required: propData.required || false,
      description: propData.description || '',
    };
    if (propData.options) result[propName].options = propData.options;
    if (propData.refreshers) result[propName].refreshers = propData.refreshers;
    if (propData.defaultValue !== undefined) result[propName].defaultValue = propData.defaultValue;
  }
  return result;
}

// ─── بناء input افتراضي ─────────────────────────────────
function buildDefaultInput(props) {
  if (!props) return {};
  const input = {};
  for (const [propName, propData] of Object.entries(props)) {
    if (propData.type === 'MARKDOWN' || propData.type === 'LABEL') continue;
    input[propName] = '';
  }
  return input;
}

// ─── حفظ الـ template ────────────────────────────────────
function saveTemplate(toolId, template, dryRun) {
  const filePath = path.join(CONFIG.outputDir, `${toolId}.json`);
  
  if (dryRun) {
    const triggers = Object.keys(template.triggers).length;
    const actions = Object.keys(template.actions).length;
    console.log(`  📄 [DRY] ${toolId}.json — ${triggers} triggers, ${actions} actions`);
    return;
  }
  
  fs.mkdirSync(CONFIG.outputDir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(template, null, 2), 'utf-8');
  
  const triggers = Object.keys(template.triggers).length;
  const actions = Object.keys(template.actions).length;
  console.log(`  ✅ ${toolId}.json — ${triggers} triggers, ${actions} actions`);
}

// ─── تحديث registry.json بالإصدارات الجديدة ─────────────
function updateRegistry(registry, updates) {
  let changed = 0;
  for (const [toolId, newVersion] of Object.entries(updates)) {
    const tool = registry.tools.find(t => t.id === toolId);
    if (tool && tool.lastVersion !== newVersion) {
      tool.lastVersion = newVersion;
      tool.lastSync = new Date().toISOString();
      changed++;
    }
  }
  if (changed > 0) {
    registry._lastSync = new Date().toISOString();
    fs.writeFileSync(CONFIG.registryPath, JSON.stringify(registry, null, 2), 'utf-8');
    console.log(`\n📝 تحديث registry.json — ${changed} أداة محدثة`);
  }
}

// ─── البرنامج الرئيسي ────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const singleTool = args.find(a => a.startsWith('--tool='))?.split('=')[1];
  
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   AutoFlow v5 — سحب الأدوات من API      ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log(`📡 السيرفر: ${CONFIG.baseUrl}`);
  console.log(`📁 المخرجات: ${CONFIG.outputDir}`);
  if (dryRun) console.log('⚠️  وضع المعاينة — لن يتم كتابة ملفات');
  console.log('');
  
  const registry = loadRegistry();
  let toolsToFetch = registry.tools;
  
  if (singleTool) {
    toolsToFetch = toolsToFetch.filter(t => t.id === singleTool);
    if (toolsToFetch.length === 0) {
      console.error(`❌ الأداة "${singleTool}" غير موجودة في الفهرس`);
      process.exit(1);
    }
  }
  
  console.log(`🔧 الأدوات: ${toolsToFetch.length} من ${registry.tools.length}`);
  console.log('─'.repeat(50));
  
  let success = 0;
  let failed = 0;
  const errors = [];
  const versionUpdates = {};
  
  for (const tool of toolsToFetch) {
    try {
      const apiData = await fetchPiece(tool.package);
      const template = buildTemplate(apiData, tool);
      saveTemplate(tool.id, template, dryRun);
      versionUpdates[tool.id] = apiData.version;
      success++;
    } catch (err) {
      console.log(`  ❌ فشل: ${tool.id} — ${err.message}`);
      errors.push({ tool: tool.id, error: err.message });
      failed++;
    }
    
    // تأخير بسيط عشان ما نضغط على API
    await new Promise(r => setTimeout(r, 500));
  }
  
  console.log('─'.repeat(50));
  console.log(`\n📊 النتائج:`);
  console.log(`  ✅ نجح: ${success}`);
  console.log(`  ❌ فشل: ${failed}`);
  
  if (errors.length > 0) {
    console.log(`\n⚠️  الأخطاء:`);
    errors.forEach(e => console.log(`  - ${e.tool}: ${e.error}`));
  }
  
  if (!dryRun && Object.keys(versionUpdates).length > 0) {
    updateRegistry(registry, versionUpdates);
  }
  
  console.log('\n✨ تم!');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('❌ خطأ غير متوقع:', err);
  process.exit(1);
});
