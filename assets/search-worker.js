self.window = self;
self.SANAD_DATA = self.SANAD_DATA || {};
self.SANAD_DATA.searchShards = self.SANAD_DATA.searchShards || {};

let manifestLoaded = false;
const loadedShardKeys = new Set();

function normalizeDigits(value) {
  return String(value || '')
    .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
}

function normalizeSearchText(value) {
  return normalizeDigits(value).toLowerCase()
    .replace(/[إأآا]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[^\u0600-\u06FFa-z0-9\s/.-]/g, ' ');
}

function extractYear(value) {
  const match = normalizeDigits(value).match(/(?:^|[^\d])((?:19|20)\d{2})(?=$|[^\d])/);
  return match ? match[1] : '';
}

function docYear(doc) {
  return extractYear(doc.year) || extractYear(doc.num) || extractYear(doc.title) || extractYear(doc.date) || '';
}

function searchWords(value, stopSet, commonSet, keepCommon = false) {
  return [...new Set(normalizeSearchText(value).split(/\s+/)
    .map(word => word.trim())
    .filter(word => {
      if (!word) return false;
      if (/^\d+$/.test(word)) return true;
      if (word.length < 2) return false;
      if (stopSet.has(word)) return false;
      if (!keepCommon && commonSet.has(word)) return false;
      return true;
    }))];
}

function textMatchesWords(text, words, mode = 'all') {
  if (!words.length) return true;
  const normalized = normalizeSearchText(text);
  return mode === 'any'
    ? words.some(word => normalized.includes(word))
    : words.every(word => normalized.includes(word));
}

function trimSnippet(value) {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  return clean.length > 460 ? `${clean.slice(0, 460).trim()}...` : clean;
}

function setUnion(sets) {
  const out = new Set();
  sets.forEach(set => set.forEach(id => out.add(id)));
  return out;
}

function setIntersection(sets) {
  if (!sets.length) return new Set();
  const [first, ...rest] = sets.sort((a, b) => a.size - b.size);
  const out = new Set();
  first.forEach(id => {
    if (rest.every(set => set.has(id))) out.add(id);
  });
  return out;
}

function ensureManifest(baseUrl) {
  if (manifestLoaded) return;
  importScripts(new URL('./data/search/manifest.js', baseUrl).href);
  manifestLoaded = true;
}

function ensureShard(key, baseUrl) {
  if (loadedShardKeys.has(key)) return;
  const src = self.SANAD_DATA.searchManifest?.shards?.[key];
  if (!src) return;
  importScripts(new URL(src, baseUrl).href);
  loadedShardKeys.add(key);
}

function shardKeysForFilters(filters) {
  const manifest = self.SANAD_DATA.searchManifest || { shards: {} };
  return Object.keys(manifest.shards || {}).filter(key => {
    const [year, ...typeParts] = key.split('-');
    const type = typeParts.join('-');
    if (filters.year && filters.year !== 'all' && year !== filters.year) return false;
    if (filters.type && filters.type !== 'all' && type !== filters.type) return false;
    return true;
  });
}

function shardTokenSets(shards, words) {
  return words.map(word => {
    const ids = new Set();
    shards.forEach(shard => (shard.tokens?.[word] || []).forEach(id => ids.add(Number(id))));
    return ids;
  });
}

function allShardSnippets(shards, id) {
  for (const shard of shards) {
    const snippet = shard.snippets?.[id];
    if (snippet) return snippet;
  }
  return {};
}

function metaText(doc) {
  return [doc.title, doc.court, doc.date, doc.num, doc.appeal, doc.source, doc.workbenchText].join(' ');
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function numberFilterMatches(text, needle) {
  const cleanNeedle = normalizeSearchText(needle).trim();
  if (!cleanNeedle) return true;
  const cleanText = normalizeSearchText(text);
  if (/\d/.test(cleanNeedle)) {
    return new RegExp(`(^|[^\\d])${escapeRegExp(cleanNeedle)}($|[^\\d])`).test(cleanText);
  }
  return cleanText.includes(cleanNeedle);
}

function snippetText(snippet) {
  return [snippet.facts, snippet.principle, snippet.reasoning, snippet.operative, snippet.preview].join(' ');
}

function pickSnippet(snippet, words, phrase, section) {
  const order = section && section !== 'all'
    ? [section]
    : ['principle', 'operative', 'reasoning', 'facts', 'preview'];
  const phraseNeedle = normalizeSearchText(phrase).trim();
  if (!words.length && !phraseNeedle && (!section || section === 'all')) {
    return { section: 'meta', text: '', reason: 'metadata' };
  }
  for (const key of order) {
    const value = snippet[key] || '';
    if (!value) continue;
    const normalized = normalizeSearchText(value);
    if (phraseNeedle && normalized.includes(phraseNeedle)) {
      return { section: key, text: trimSnippet(value), reason: 'phrase' };
    }
  }
  for (const key of order) {
    const value = snippet[key] || '';
    if (!value) continue;
    if (textMatchesWords(value, words, 'all')) {
      return { section: key, text: trimSnippet(value), reason: 'section' };
    }
  }
  for (const key of order) {
    const value = snippet[key] || '';
    if (!value) continue;
    if (textMatchesWords(value, words, 'any')) {
      return { section: key, text: trimSnippet(value), reason: 'partial' };
    }
  }
  return { section: 'body', text: '', reason: 'indexed' };
}

function scoreDoc(doc, snippet, words, phrase, tokenHits, filters, docCount) {
  let score = 0;
  const meta = normalizeSearchText(metaText(doc));
  const title = normalizeSearchText(doc.title || '');
  const number = normalizeSearchText([doc.num, doc.appeal].join(' '));
  const phraseNeedle = normalizeSearchText(phrase).trim();

  words.forEach(word => {
    if (tokenHits.has(word)) score += Math.log(1 + docCount / Math.max(1, tokenHits.get(word))) * 6;
    if (title.includes(word)) score += 12;
    if (number.includes(word)) score += 14;
    if (meta.includes(word)) score += 5;
  });

  if (phraseNeedle) {
    if (title.includes(phraseNeedle)) score += 45;
    if (number.includes(phraseNeedle)) score += 40;
    if (meta.includes(phraseNeedle)) score += 20;
  }

  const sectionWeights = { principle: 18, operative: 15, reasoning: 12, facts: 8, preview: 4 };
  for (const [section, weight] of Object.entries(sectionWeights)) {
    const value = normalizeSearchText(snippet[section] || '');
    if (!value) continue;
    if (phraseNeedle && value.includes(phraseNeedle)) score += weight + 18;
    else if (words.length && words.every(word => value.includes(word))) score += weight;
    else if (words.some(word => value.includes(word))) score += Math.max(2, weight / 3);
  }

  if (filters.section && filters.section !== 'all' && snippet[filters.section]) score += 5;
  if (filters.number && numberFilterMatches([doc.num, doc.title, doc.appeal].join(' '), filters.number)) score += 35;
  if (filters.court && normalizeSearchText(doc.court).includes(normalizeSearchText(filters.court))) score += 12;
  return score;
}

function search(payload) {
  const { docs = [], filters = {}, baseUrl } = payload;
  ensureManifest(baseUrl);
  const manifest = self.SANAD_DATA.searchManifest || {};
  const stopSet = new Set(manifest.stopwords || []);
  const commonSet = new Set(manifest.commonTokens || []);
  const query = String(filters.query || '').trim();
  const exactPhrase = String(filters.exactPhrase || '').trim();
  const phrase = exactPhrase || query;
  const wordSource = query || exactPhrase;
  let words = searchWords(wordSource, stopSet, commonSet);
  if (!words.length) words = searchWords(wordSource, stopSet, commonSet, true);
  const excludeWords = searchWords(filters.exclude || '', stopSet, commonSet, true);
  const mode = filters.mode === 'any' ? 'any' : 'all';
  const shardKeys = shardKeysForFilters(filters);
  shardKeys.forEach(key => ensureShard(key, baseUrl));
  const shards = shardKeys.map(key => self.SANAD_DATA.searchShards?.[key]).filter(Boolean);
  const shardDocCount = shards.reduce((sum, shard) => sum + (shard.docIds?.length || 0), 0) || docs.length || 1;
  const docById = new Map(docs.map(doc => [Number(doc.id), doc]));

  const allowedDocs = docs.filter(doc => {
    if (filters.type && filters.type !== 'all' && doc.type !== filters.type) return false;
    if (filters.year && filters.year !== 'all' && docYear(doc) !== filters.year) return false;
    if (filters.court && !normalizeSearchText(doc.court).includes(normalizeSearchText(filters.court))) return false;
    if (filters.number) {
      if (!numberFilterMatches([doc.num, doc.title, doc.appeal].join(' '), filters.number)) return false;
    }
    return true;
  });
  const allowedIds = new Set(allowedDocs.map(doc => Number(doc.id)));

  let candidates = new Set(allowedIds);
  const tokenSets = shardTokenSets(shards, words);
  if (words.length && tokenSets.length) {
    candidates = mode === 'any' ? setUnion(tokenSets) : setIntersection(tokenSets);
    candidates = new Set([...candidates].filter(id => allowedIds.has(Number(id))));
  }

  const tokenHits = new Map();
  words.forEach((word, index) => tokenHits.set(word, tokenSets[index]?.size || 0));

  const metadataCandidates = allowedDocs.filter(doc => {
    const haystack = normalizeSearchText(metaText(doc));
    const phraseNeedle = normalizeSearchText(phrase).trim();
    return (phraseNeedle && haystack.includes(phraseNeedle)) || textMatchesWords(haystack, words, mode);
  });
  metadataCandidates.forEach(doc => candidates.add(Number(doc.id)));

  const results = [];
  const phraseNeedle = normalizeSearchText(phrase).trim();
  for (const id of candidates) {
    const doc = docById.get(Number(id));
    if (!doc) continue;
    const snippet = allShardSnippets(shards, String(id));
    const combined = normalizeSearchText([metaText(doc), snippetText(snippet), doc.body].join(' '));
    if (query && !textMatchesWords(combined, words, mode) && !(phraseNeedle && combined.includes(phraseNeedle))) continue;
    if (exactPhrase && !combined.includes(normalizeSearchText(exactPhrase).trim()) && !textMatchesWords(combined, words, 'all')) continue;
    if (excludeWords.length && excludeWords.some(word => combined.includes(word))) continue;
    if (filters.section && filters.section !== 'all') {
      const sectionText = normalizeSearchText(snippet[filters.section] || '');
      if (!sectionText || (!textMatchesWords(sectionText, words, mode) && !(phraseNeedle && sectionText.includes(phraseNeedle)))) continue;
    }
    const picked = pickSnippet(snippet, words, phrase, filters.section);
    const score = scoreDoc(doc, snippet, words, phrase, tokenHits, filters, shardDocCount);
    results.push({ id: Number(id), score, snippet: picked.text, section: picked.section, reason: picked.reason });
  }

  results.sort((a, b) => b.score - a.score || b.id - a.id);
  return {
    results,
    loadedShards: shardKeys,
    ignoredCommon: searchWords(query, stopSet, new Set(), true).filter(word => commonSet.has(word))
  };
}

self.onmessage = event => {
  const payload = event.data || {};
  if (payload.type !== 'search') return;
  try {
    const result = search(payload);
    self.postMessage({ type: 'search-result', token: payload.token, ...result });
  } catch (error) {
    self.postMessage({ type: 'search-error', token: payload.token, message: error.message || String(error) });
  }
};
