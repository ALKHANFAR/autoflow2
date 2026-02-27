#!/usr/bin/env node
/**
 * AutoFlow v5 — Validate.js v2.0
 * ================================
 * حارس ذكي يفحص أي Flow JSON ضد الـ templates الرسمية
 * 
 * الاستخدام:
 *   node tools/validate.js flow.json
 *   node tools/validate.js --test              # تشغيل الاختبارات
 *   node tools/validate.js --test --verbose    # مع تفاصيل
 */

const fs = require('fs');
const path = require('path');

const TOOLS_DIR = path.join(__dirname);
const REGISTRY_PATH = path.join(TOOLS_DIR, 'registry.json');
const TEMPLATES_DIR = path.join(TOOLS_DIR, 'templates');

// ─── تحميل الفهرس والـ templates ────────────────────────
let registry = null;
const templatesCache = {};

function loadRegistry() {
  if (!registry) {
    registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8'));
  }
  return registry;
}

function loadTemplate(toolId) {
  if (!templatesCache[toolId]) {
    const filePath = path.join(TEMPLATES_DIR, `${toolId}.json`);
    if (fs.existsSync(filePath)) {
      templatesCache[toolId] = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  }
  return templatesCache[toolId] || null;
}

function findToolByPackage(packageName) {
  const reg = loadRegistry();
  return reg.tools.find(t => t.package === packageName);
}

// ─── أنواع الأخطاء ─────────────────────────────────────
const SEVERITY = {
  FATAL: '🔴 FATAL',
  ERROR: '🟠 ERROR',
  WARN: '🟡 WARN',
  INFO: 'ℹ️  INFO',
};

// ─── الفحوصات ───────────────────────────────────────────
class FlowValidator {
  constructor(flowJson) {
    this.flow = typeof flowJson === 'string' ? JSON.parse(flowJson) : flowJson;
    this.errors = [];
    this.warnings = [];
    this.stepNames = new Set();
  }

  addIssue(severity, message, path = '') {
    const issue = { severity, message, path };
    if (severity === SEVERITY.FATAL || severity === SEVERITY.ERROR) {
      this.errors.push(issue);
    } else {
      this.warnings.push(issue);
    }
  }

  // ─── 1. هيكل الـ Flow الأساسي ──────────────
  checkStructure() {
    if (!this.flow.formatVersion) {
      this.addIssue(SEVERITY.FATAL, 'مفقود: formatVersion');
    } else if (this.flow.formatVersion !== '4') {
      this.addIssue(SEVERITY.ERROR, `formatVersion يجب أن يكون "4" — الحالي: "${this.flow.formatVersion}"`);
    }

    if (!this.flow.template) {
      this.addIssue(SEVERITY.FATAL, 'مفقود: template');
      return;
    }

    if (!this.flow.template.trigger) {
      this.addIssue(SEVERITY.FATAL, 'مفقود: template.trigger');
      return;
    }

    if (!this.flow.template.displayName) {
      this.addIssue(SEVERITY.WARN, 'مفقود: template.displayName — أضف اسم عربي');
    }
  }

  // ─── 2. فحص كل Step ────────────────────────
  checkStep(step, pathStr = 'trigger') {
    if (!step) return;

    // فحص النوع
    const validTypes = ['PIECE_TRIGGER', 'PIECE', 'BRANCH', 'LOOP_ON_ITEMS', 'CODE'];
    if (!validTypes.includes(step.type)) {
      this.addIssue(SEVERITY.ERROR, `نوع غير معروف: ${step.type}`, pathStr);
    }

    // فحص الاسم الفريد
    if (!step.name) {
      this.addIssue(SEVERITY.ERROR, 'مفقود: name', pathStr);
    } else if (this.stepNames.has(step.name)) {
      this.addIssue(SEVERITY.ERROR, `اسم مكرر: ${step.name}`, pathStr);
    } else {
      this.stepNames.add(step.name);
    }

    // فحص الخطوات من نوع PIECE
    if (step.type === 'PIECE_TRIGGER' || step.type === 'PIECE') {
      this.checkPieceStep(step, pathStr);
    }

    // فحص الشرطيات
    if (step.type === 'BRANCH') {
      this.checkBranch(step, pathStr);
    }

    // فحص التكرار
    if (step.type === 'LOOP_ON_ITEMS') {
      if (step.firstLoopAction) {
        this.checkStep(step.firstLoopAction, `${pathStr}.firstLoopAction`);
      }
    }

    // الخطوة التالية
    if (step.nextAction) {
      this.checkStep(step.nextAction, `${pathStr}.nextAction`);
    }
  }

  // ─── 3. فحص خطوة Piece ─────────────────────
  checkPieceStep(step, pathStr) {
    const s = step.settings;
    if (!s) {
      this.addIssue(SEVERITY.FATAL, 'مفقود: settings', pathStr);
      return;
    }

    // الحقول الإلزامية
    const requiredFields = ['pieceName', 'pieceVersion', 'pieceType', 'packageType'];
    for (const field of requiredFields) {
      if (!s[field]) {
        this.addIssue(SEVERITY.ERROR, `مفقود: settings.${field}`, pathStr);
      }
    }

    // فحص pieceName في registry
    if (s.pieceName) {
      const tool = findToolByPackage(s.pieceName);
      if (!tool) {
        this.addIssue(SEVERITY.FATAL,
          `أداة غير معروفة: ${s.pieceName} — مو موجودة في registry.json`, pathStr);
      } else {
        // فحص ضد template
        const template = loadTemplate(tool.id);
        if (template) {
          this.checkAgainstTemplate(step, template, pathStr);
        }
      }
    }

    // فحص الإصدار
    if (s.pieceVersion && !s.pieceVersion.startsWith('~')) {
      this.addIssue(SEVERITY.WARN,
        `الإصدار لازم يبدأ بـ ~ — الحالي: ${s.pieceVersion}`, pathStr);
    }

    // فحص actionName أو triggerName
    if (step.type === 'PIECE' && !s.actionName) {
      this.addIssue(SEVERITY.ERROR, 'مفقود: settings.actionName', pathStr);
    }
    if (step.type === 'PIECE_TRIGGER' && !s.triggerName) {
      this.addIssue(SEVERITY.ERROR, 'مفقود: settings.triggerName', pathStr);
    }

    // فحص input موجود
    if (s.input === undefined || s.input === null) {
      this.addIssue(SEVERITY.WARN, 'مفقود: settings.input — يجب أن يكون {} على الأقل', pathStr);
    }
  }

  // ─── 4. فحص ضد Template الأداة ─────────────
  checkAgainstTemplate(step, template, pathStr) {
    const s = step.settings;
    const isAction = step.type === 'PIECE';
    const targetName = isAction ? s.actionName : s.triggerName;

    if (!targetName) return;

    const pool = isAction ? template.actions : template.triggers;
    if (!pool || !pool[targetName]) {
      const available = pool ? Object.keys(pool).join(', ') : 'لا يوجد';
      this.addIssue(SEVERITY.ERROR,
        `${isAction ? 'Action' : 'Trigger'} غير موجود: "${targetName}" — المتاح: [${available}]`, pathStr);
      return;
    }

    // فحص الحقول المرسلة ضد props
    const definition = pool[targetName];
    if (s.input && definition.props) {
      const validProps = Object.keys(definition.props);
      for (const inputKey of Object.keys(s.input)) {
        if (s.input[inputKey] === '' || s.input[inputKey] === null) continue;
        if (!validProps.includes(inputKey)) {
          this.addIssue(SEVERITY.WARN,
            `حقل غير معروف: "${inputKey}" — المتاح: [${validProps.join(', ')}]`, pathStr);
        }
      }
    }
  }

  // ─── 5. فحص الشرطيات ──────────────────────
  checkBranch(step, pathStr) {
    if (!step.settings?.conditions) {
      this.addIssue(SEVERITY.ERROR, 'BRANCH بدون conditions', pathStr);
    }
    if (step.onSuccessAction) {
      this.checkStep(step.onSuccessAction, `${pathStr}.onSuccess`);
    }
    if (step.onFailureAction) {
      this.checkStep(step.onFailureAction, `${pathStr}.onFailure`);
    }
  }

  // ─── 6. فحص الأخطاء الشائعة من v4 ─────────
  checkKnownMistakes() {
    const json = JSON.stringify(this.flow);
    
    const mistakes = [
      { pattern: '"spreadsheet_id"', fix: 'spreadsheetId', tool: 'Google Sheets' },
      { pattern: '"sheet_id"', fix: 'sheetId', tool: 'Google Sheets' },
      { pattern: '"first_row_headers"', fix: 'firstRowHeaders', tool: 'Google Sheets' },
      { pattern: '"parse_mode"', fix: 'format', tool: 'Telegram' },
      { pattern: '"cronExpression"', fix: 'cron_expression', tool: 'Schedule' },
      { pattern: '"maxTokens"', fix: 'maxOutputTokens', tool: 'AI' },
      { pattern: /temperature.*[0-1]\.[0-9]/, fix: 'creativity (0-100)', tool: 'AI' },
      { pattern: '"piece-openai"', fix: 'piece-ai (لوظائف AI العامة)', tool: 'AI' },
      { pattern: '"piece-whatsapp-business"', fix: 'piece-whatsapp', tool: 'WhatsApp' },
      { pattern: '"sendTextMessage"', fix: 'send_text_message', tool: 'Telegram' },
      { pattern: '"ask_chatgpt"', fix: 'askAi', tool: 'AI' },
      { pattern: '"sendMedia"', fix: 'send_media', tool: 'Telegram' },
    ];

    for (const m of mistakes) {
      const found = typeof m.pattern === 'string'
        ? json.includes(m.pattern)
        : m.pattern.test(json);
      
      if (found) {
        this.addIssue(SEVERITY.ERROR,
          `خطأ معروف (${m.tool}): استخدم "${m.fix}" بدلاً من النمط الممنوع`);
      }
    }
  }

  // ─── تشغيل كل الفحوصات ─────────────────────
  validate() {
    this.checkStructure();
    if (this.flow.template?.trigger) {
      this.checkStep(this.flow.template.trigger, 'trigger');
    }
    this.checkKnownMistakes();

    return {
      valid: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings,
      stats: {
        steps: this.stepNames.size,
        errors: this.errors.length,
        warnings: this.warnings.length,
      },
    };
  }
}

// ─── الاختبارات ─────────────────────────────────────────
function runTests(verbose) {
  let passed = 0;
  let failed = 0;

  function test(name, flowJson, expectValid, expectErrorContains = null) {
    const v = new FlowValidator(flowJson);
    const result = v.validate();
    const ok = result.valid === expectValid;
    const errorMatch = !expectErrorContains || 
      result.errors.some(e => e.message.includes(expectErrorContains));

    if (ok && errorMatch) {
      passed++;
      if (verbose) console.log(`  ✅ ${name}`);
    } else {
      failed++;
      console.log(`  ❌ ${name}`);
      if (verbose) {
        console.log(`    المتوقع: valid=${expectValid}, الفعلي: valid=${result.valid}`);
        result.errors.forEach(e => console.log(`    ${e.severity} ${e.message}`));
      }
    }
  }

  console.log('\n🧪 تشغيل الاختبارات...\n');

  // ─── اختبارات الهيكل ────────────
  test('هيكل فاضي = خطأ', {}, false, 'formatVersion');
  test('formatVersion خطأ', { formatVersion: '3', template: {} }, false);
  test('بدون trigger = خطأ', { formatVersion: '4', template: {} }, false);
  
  // ─── هيكل صحيح أساسي ────────────
  const validBase = {
    formatVersion: '4',
    template: {
      displayName: 'تست',
      trigger: {
        type: 'PIECE_TRIGGER',
        name: 'trigger',
        settings: {
          pieceName: '@activepieces/piece-schedule',
          pieceVersion: '~0.1.16',
          pieceType: 'OFFICIAL',
          packageType: 'REGISTRY',
          triggerName: 'every_hour',
          input: {},
          inputUiInfo: {},
        },
        valid: false,
        nextAction: null,
      },
    },
  };
  test('هيكل صحيح = نجاح', validBase, true);

  // ─── أسماء مكررة ────────────────
  const duplicateNames = JSON.parse(JSON.stringify(validBase));
  duplicateNames.template.trigger.nextAction = {
    type: 'PIECE', name: 'trigger', // مكرر!
    settings: {
      pieceName: '@activepieces/piece-gmail',
      pieceVersion: '~0.11.3',
      pieceType: 'OFFICIAL',
      packageType: 'REGISTRY',
      actionName: 'send_email',
      input: {},
    },
    valid: false, nextAction: null,
  };
  test('أسماء مكررة = خطأ', duplicateNames, false, 'مكرر');

  // ─── أداة غير معروفة ────────────
  const unknownPiece = JSON.parse(JSON.stringify(validBase));
  unknownPiece.template.trigger.settings.pieceName = '@activepieces/piece-fake';
  test('أداة غير معروفة = خطأ', unknownPiece, false, 'غير معروفة');

  // ─── إصدار بدون ~ ──────────────
  const noTilde = JSON.parse(JSON.stringify(validBase));
  noTilde.template.trigger.settings.pieceVersion = '0.1.16';
  // هذا warning مو error — لازم يكون valid
  test('إصدار بدون ~ = warning فقط', noTilde, true);

  // ─── أخطاء معروفة ──────────────
  const knownMistake1 = JSON.parse(JSON.stringify(validBase));
  knownMistake1.template.trigger.nextAction = {
    type: 'PIECE', name: 'step_1',
    settings: {
      pieceName: '@activepieces/piece-openai', // ممنوع
      pieceVersion: '~1.0.0', pieceType: 'OFFICIAL', packageType: 'REGISTRY',
      actionName: 'ask', input: {},
    },
    valid: false, nextAction: null,
  };
  test('piece-openai ممنوع', knownMistake1, false);

  const knownMistake2 = JSON.parse(JSON.stringify(validBase));
  knownMistake2.template.trigger.nextAction = {
    type: 'PIECE', name: 'step_1',
    settings: {
      pieceName: '@activepieces/piece-google-sheets',
      pieceVersion: '~0.14.5', pieceType: 'OFFICIAL', packageType: 'REGISTRY',
      actionName: 'insert_row',
      input: { spreadsheet_id: 'abc' }, // خطأ!
    },
    valid: false, nextAction: null,
  };
  test('spreadsheet_id ممنوع', knownMistake2, false, 'spreadsheetId');

  const knownMistake3 = JSON.parse(JSON.stringify(validBase));
  knownMistake3.template.trigger.nextAction = {
    type: 'PIECE', name: 'step_1',
    settings: {
      pieceName: '@activepieces/piece-telegram-bot',
      pieceVersion: '~0.5.5', pieceType: 'OFFICIAL', packageType: 'REGISTRY',
      actionName: 'sendTextMessage', // ممنوع!
      input: {},
    },
    valid: false, nextAction: null,
  };
  test('sendTextMessage ممنوع', knownMistake3, false, 'send_text_message');

  // ─── بدون actionName ────────────
  const noAction = JSON.parse(JSON.stringify(validBase));
  noAction.template.trigger.nextAction = {
    type: 'PIECE', name: 'step_1',
    settings: {
      pieceName: '@activepieces/piece-gmail',
      pieceVersion: '~0.11.3', pieceType: 'OFFICIAL', packageType: 'REGISTRY',
      input: {},
    },
    valid: false, nextAction: null,
  };
  test('بدون actionName = خطأ', noAction, false, 'actionName');

  // ─── BRANCH بدون conditions ─────
  const branchNoConditions = JSON.parse(JSON.stringify(validBase));
  branchNoConditions.template.trigger.nextAction = {
    type: 'BRANCH', name: 'branch_1', settings: {},
    valid: false, nextAction: null,
  };
  test('BRANCH بدون conditions = خطأ', branchNoConditions, false, 'conditions');

  // ─── BRANCH صحيح ────────────────
  const branchValid = JSON.parse(JSON.stringify(validBase));
  branchValid.template.trigger.nextAction = {
    type: 'BRANCH', name: 'branch_1',
    settings: {
      conditions: [[{ firstValue: '{{trigger.x}}', operator: 'TEXT_CONTAINS', secondValue: 'y' }]],
    },
    valid: false, nextAction: null,
    onSuccessAction: null, onFailureAction: null,
  };
  test('BRANCH صحيح = نجاح', branchValid, true);

  // ─── Multi-step ─────────────────
  const multiStep = JSON.parse(JSON.stringify(validBase));
  multiStep.template.trigger.nextAction = {
    type: 'PIECE', name: 'step_1',
    settings: {
      pieceName: '@activepieces/piece-gmail', pieceVersion: '~0.11.3',
      pieceType: 'OFFICIAL', packageType: 'REGISTRY',
      actionName: 'send_email', input: {},
    },
    valid: false,
    nextAction: {
      type: 'PIECE', name: 'step_2',
      settings: {
        pieceName: '@activepieces/piece-slack', pieceVersion: '~0.12.2',
        pieceType: 'OFFICIAL', packageType: 'REGISTRY',
        actionName: 'send_channel_message', input: {},
      },
      valid: false, nextAction: null,
    },
  };
  test('Multi-step = نجاح', multiStep, true);

  // ─── whatsapp-business ممنوع ────
  const waBiz = JSON.parse(JSON.stringify(validBase));
  waBiz.template.trigger.settings.pieceName = '@activepieces/piece-whatsapp-business';
  test('piece-whatsapp-business ممنوع', waBiz, false);

  // ─── cronExpression ممنوع ───────
  const cronBad = JSON.parse(JSON.stringify(validBase));
  cronBad.template.trigger.settings.input = { cronExpression: '0 * * * *' };
  test('cronExpression ممنوع', cronBad, false, 'cron_expression');

  console.log(`\n📊 النتائج: ${passed} نجح | ${failed} فشل | ${passed + failed} إجمالي`);
  return failed === 0;
}

// ─── البرنامج الرئيسي ────────────────────────────────────
function main() {
  const args = process.argv.slice(2);

  if (args.includes('--test')) {
    const verbose = args.includes('--verbose');
    const ok = runTests(verbose);
    process.exit(ok ? 0 : 1);
  }

  const filePath = args[0];
  if (!filePath) {
    console.log('الاستخدام: node validate.js <flow.json>');
    console.log('           node validate.js --test');
    process.exit(1);
  }

  if (!fs.existsSync(filePath)) {
    console.error(`❌ الملف غير موجود: ${filePath}`);
    process.exit(1);
  }

  const json = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const validator = new FlowValidator(json);
  const result = validator.validate();

  console.log('\n╔══════════════════════════════════╗');
  console.log('║   AutoFlow v5 — فحص الـ Flow     ║');
  console.log('╚══════════════════════════════════╝');
  console.log(`📄 الملف: ${filePath}`);
  console.log(`📊 الخطوات: ${result.stats.steps}`);
  console.log('');

  if (result.errors.length > 0) {
    console.log('❌ أخطاء:');
    result.errors.forEach(e => {
      console.log(`  ${e.severity} ${e.message}${e.path ? ` [${e.path}]` : ''}`);
    });
  }

  if (result.warnings.length > 0) {
    console.log('\n⚠️  تحذيرات:');
    result.warnings.forEach(w => {
      console.log(`  ${w.severity} ${w.message}${w.path ? ` [${w.path}]` : ''}`);
    });
  }

  console.log(`\n${result.valid ? '✅ الـ Flow صالح!' : '❌ الـ Flow فيه أخطاء — لازم تصلحها'}`);
  process.exit(result.valid ? 0 : 1);
}

main();

// تصدير للاستخدام كـ module
module.exports = { FlowValidator };
