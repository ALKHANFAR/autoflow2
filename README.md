# AutoFlow v5.0 — نظام أتمتة من الصفر

> أذكى نظام أتمتة عربي مبني على Activepieces — 50 أداة، 6 صناعات، صفر أخطاء

## 🚀 البدء السريع

```bash
# 1. فحص الاختبارات
npm test

# 2. سحب أحدث بيانات الأدوات من Activepieces
npm run sync

# 3. فحص flow معين
npm run validate -- flow.json
```

## 📁 هيكل المشروع

```
autoflow-v5/
├── tools/                        # 🧠 قلب النظام
│   ├── registry.json             # فهرس 50 أداة
│   ├── master-prompt-v5.md       # البرومبت الرئيسي
│   ├── validate.js               # الحارس (16 اختبار)
│   ├── blueprint.json            # هيكل Flow الأساسي
│   ├── intent-parser.md          # فهم الطلبات العربية
│   ├── templates/                # 50 ملف template
│   │   ├── gmail.json
│   │   ├── notion.json
│   │   ├── stripe.json
│   │   └── ... (50 أداة)
│   ├── industries/               # 6 صناعات
│   │   ├── clinic.json           # عيادة (6 سيناريوهات)
│   │   ├── ecommerce.json        # متجر (6 سيناريوهات)
│   │   ├── restaurant.json       # مطعم (6 سيناريوهات)
│   │   ├── consulting.json       # استشارات
│   │   ├── construction.json     # مقاولات
│   │   └── training.json         # تدريب
│   └── suggestions/              # اقتراحات ذكية
│       └── auto-suggest.json
├── sync/                         # 🔄 مزامنة
│   └── fetch-all-tools.js        # سحب من API
├── .github/workflows/
│   └── sync-tools.yml            # مزامنة أسبوعية
└── package.json
```

## 🔑 المبدأ: انسخ — لا تخمّن

كل أداة لها template ثابت في `tools/templates/`. الـ AI ينسخ منه حرفياً:
- اسم الحزمة ← من template
- الإصدار ← من template  
- اسم الـ action/trigger ← من template
- الحقول ← من template
- **صفر اجتهاد = صفر أخطاء**

## 📊 الأدوات الـ 50

| الفئة | الأدوات |
|-------|---------|
| أساسية | Schedule, Webhook, HTTP, AI, Storage, Sub Flows, Queue |
| تواصل | Gmail, Slack, WhatsApp, Telegram, Teams, SMTP |
| إنتاجية | Sheets, Airtable, Calendar, Notion, Trello, Asana, Monday, Jira, Excel, Outlook Calendar, Calendly |
| مبيعات | HubSpot, Salesforce, Pipedrive |
| مالية | Stripe, QuickBooks, Xero, Square |
| تسويق | Mailchimp, SendGrid, Brevo, X/Twitter |
| تجارة | Shopify, WooCommerce |
| AI | AI, OpenAI, Perplexity |
| دعم | Zendesk, Intercom |
| ملفات | Drive, OneDrive, WordPress, RSS, SFTP |
| قواعد بيانات | PostgreSQL, MySQL, MongoDB, Supabase |

## ✅ الأوامر

```bash
npm test              # تشغيل 16 اختبار
npm run sync          # سحب كل الأدوات من API
npm run sync:dry      # معاينة بدون كتابة
npm run sync:tool notion  # أداة واحدة
```
