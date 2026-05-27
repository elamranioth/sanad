const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'data', 'search');
const SHARD_DIR = path.join(OUT_DIR, 'shards');

const baseStopWords = new Set([
  'هذا','هذه','ذلك','تلك','التي','الذي','الذين','اللذين','اللتي','فيه','فيها','عليه','عليها',
  'عنه','عنها','اليه','اليها','منه','منها','له','لها','به','بها','ان','إن','أن','كان','كانت',
  'يكون','تكون','وقد','كما','لما','حيث','ومن','الى','إلى','على','علي','عن','من','في','ما',
  'لا','لم','لن','قد','كل','اي','أي','او','أو','ثم','اذا','إذا','بين','بعد','قبل','غير',
  'دون','مع','ضد','رقم','لسنة','سنة','بتاريخ','المحكمة','محكمة','الحكم','الطعن','طعن',
  'المطعون','الطاعن','الصادر','الاسباب','الأسباب','دبي','جلسة','بالجلسة','التمييز'
]);
const shortLegalTerms = new Set(['حق','دين','ضرر','غش','عيب','فسخ','بيع','رهن','اجر','عمل','اصل']);

function readDataFile(relativePath, context) {
  const fullPath = path.join(ROOT, relativePath.replace(/^\.\//, ''));
  vm.runInContext(fs.readFileSync(fullPath, 'utf8'), context, { filename: fullPath });
}

function normalizeDigits(value) {
  return String(value || '')
    .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
}

function extractYear(value) {
  const match = normalizeDigits(value).match(/(?:^|[^\d])((?:19|20)\d{2})(?=$|[^\d])/);
  return match ? match[1] : '';
}

function docYear(doc) {
  return extractYear(doc.year) || extractYear(doc.num) || extractYear(doc.title) || extractYear(doc.date) || 'unknown';
}

function normalizeSearchText(value) {
  return normalizeDigits(value).toLowerCase()
    .replace(/[إأآا]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[^\u0600-\u06FFa-z0-9\s/.-]/g, ' ');
}

function tokenize(value, removeStopWords = true) {
  return [...new Set(normalizeSearchText(value).split(/\s+/)
    .map(word => word.trim())
    .filter(word => {
      if (!word) return false;
      if (/^\d+$/.test(word)) return true;
      if (word.length < 3 && !shortLegalTerms.has(word)) return false;
      return !removeStopWords || !baseStopWords.has(word);
    }))];
}

function compactText(value, max = 430) {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  return clean.length > max ? `${clean.slice(0, max).trim()}...` : clean;
}

function splitParagraphs(text) {
  return String(text || '').replace(/\r/g, '').split(/\n+/).map(line => line.trim()).filter(Boolean);
}

function sectionSnippets(body) {
  const lines = splitParagraphs(body);
  const introEnd = lines.findIndex(line => line.includes('أصـدرت') || line.includes('أصدرت'));
  const main = introEnd >= 0 ? lines.slice(introEnd + 1) : lines;
  const mainText = main.join('\n');

  const facts = main.find(line => /الوقائع|تتحصل|تخلص/.test(line)) || main[0] || '';
  const principle = main.find(line => /المقرر|ومن المقرر|المقرر في قضاء|جرى به قضاء|قضاء هذه المحكمة/.test(line)) || '';
  const reasoning = main.find(line => /هذا النعي|النعي مردود|النعي في محله|وحيث إن النعي|وحيث ان النعي/.test(line)) || '';
  const operativeMatch = mainText.match(/فلهذه\s+الأسباب[\s\S]{0,520}|فلهذه\s+الاسباب[\s\S]{0,520}/);
  const operative = operativeMatch ? operativeMatch[0] : (main.find(line => /حكمت المحكمة|قضت المحكمة/.test(line)) || '');

  return {
    facts: compactText(facts),
    principle: compactText(principle),
    reasoning: compactText(reasoning),
    operative: compactText(operative),
    preview: compactText(mainText, 520)
  };
}

function stableObject(object) {
  return Object.fromEntries(Object.entries(object).sort(([a], [b]) => a.localeCompare(b)));
}

function writeJs(relativePath, code) {
  const fullPath = path.join(ROOT, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, code, 'utf8');
}

const context = {
  window: { SANAD_DATA: {} },
  console
};
vm.createContext(context);
readDataFile('data/judgments/index.js', context);

const catalog = context.window.SANAD_DATA.judgmentCatalog || { chunks: {} };
for (const chunkPath of Object.values(catalog.chunks || {})) {
  readDataFile(chunkPath, context);
}

const indexed = context.window.SANAD_DATA.judgmentIndex || context.window.SANAD_DATA.judgments || [];
const chunks = context.window.SANAD_DATA.judgmentChunks || {};
const fullById = new Map();
for (const chunkDocs of Object.values(chunks)) {
  for (const doc of chunkDocs || []) fullById.set(Number(doc.id), doc);
}

const docs = indexed.map(doc => ({ ...doc, ...(fullById.get(Number(doc.id)) || {}) }));
const docTermSets = new Map();
const df = new Map();

for (const doc of docs) {
  const text = [doc.title, doc.court, doc.date, doc.num, doc.appeal, doc.source, doc.body].join(' ');
  const terms = tokenize(text);
  docTermSets.set(Number(doc.id), terms);
  for (const term of terms) df.set(term, (df.get(term) || 0) + 1);
}

const commonLimit = Math.max(50, Math.floor(docs.length * 0.2));
const commonTokens = [...df.entries()]
  .filter(([, count]) => count >= commonLimit)
  .map(([term]) => term)
  .sort((a, b) => a.localeCompare(b));
const commonSet = new Set(commonTokens);

const groups = new Map();
for (const doc of docs) {
  const year = docYear(doc);
  const type = doc.type || 'unknown';
  const key = `${year}-${type}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(doc);
}

fs.mkdirSync(SHARD_DIR, { recursive: true });
for (const file of fs.readdirSync(SHARD_DIR)) {
  if (file.endsWith('.js')) fs.unlinkSync(path.join(SHARD_DIR, file));
}

const manifest = {
  version: 'search-shards-20260527',
  generatedAt: new Date().toISOString(),
  totalDocs: docs.length,
  stopwords: [...new Set([...baseStopWords].map(normalizeSearchText).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
  commonTokens,
  shards: {}
};

for (const [key, groupDocs] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  const tokens = {};
  const snippets = {};
  const docIds = groupDocs.map(doc => Number(doc.id)).sort((a, b) => a - b);

  for (const doc of groupDocs) {
    const id = Number(doc.id);
    snippets[id] = sectionSnippets(doc.body || [doc.title, doc.appeal, doc.excerpt].join('\n'));
    for (const term of docTermSets.get(id) || []) {
      if (commonSet.has(term)) continue;
      if (!tokens[term]) tokens[term] = [];
      tokens[term].push(id);
    }
  }

  for (const ids of Object.values(tokens)) ids.sort((a, b) => a - b);
  const shard = {
    key,
    docIds,
    tokens: stableObject(tokens),
    snippets: stableObject(snippets)
  };
  const shardPath = `data/search/shards/${key}.js`;
  manifest.shards[key] = `./${shardPath}`;
  writeJs(shardPath, `window.SANAD_DATA=window.SANAD_DATA||{};\nwindow.SANAD_DATA.searchShards=window.SANAD_DATA.searchShards||{};\nwindow.SANAD_DATA.searchShards[${JSON.stringify(key)}]=${JSON.stringify(shard)};\n`);
}

writeJs('data/search/manifest.js', `window.SANAD_DATA=window.SANAD_DATA||{};\nwindow.SANAD_DATA.searchManifest=${JSON.stringify(manifest, null, 2)};\n`);

const totalShardBytes = fs.readdirSync(SHARD_DIR)
  .filter(file => file.endsWith('.js'))
  .reduce((sum, file) => sum + fs.statSync(path.join(SHARD_DIR, file)).size, 0);

console.log(JSON.stringify({
  docs: docs.length,
  shards: Object.keys(manifest.shards).length,
  commonTokens: commonTokens.length,
  manifest: 'data/search/manifest.js',
  shardBytes: totalShardBytes
}, null, 2));
