/** Pure, read-only helpers for the public arXiv metadata snapshot. */
export const YEARS = Object.freeze([2023, 2024, 2025, 2026]);
const SOURCES = Object.freeze(['arXiv']);
const KIND_LABELS = Object.freeze({ topic: '主題', technique: '技術', method: '方法', architecture: '架構' });
const EVIDENCE_STATUSES = new Set(['supported', 'uncertain', 'inherited', 'comparison', 'rejected']);
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const copyJSON = value => JSON.parse(JSON.stringify(value));

function fail(message) { throw new Error(message); }
function record(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function string(value) { return typeof value === 'string' ? value.trim() : ''; }
function requiredString(value, field) {
  const text = string(value);
  if (!text) fail(`${field} 必須是非空白文字。`);
  return text;
}
function safeURL(value) {
  if (!string(value)) return '';
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}
function normalizeDOI(value) {
  return string(value).replace(/^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*)/i, '').toLowerCase().replace(/[.,;]+$/, '');
}
function doiIdentity(paper) {
  const candidate = normalizeDOI(paper.doi || (/^https?:\/\/(?:dx\.)?doi\.org\//i.test(paper.url) ? paper.url : ''));
  return /^10\.\d{4,9}\/\S+$/i.test(candidate) ? candidate : '';
}
function arxivIdentity(paper) {
  const candidates = [paper.arxivId, paper.id];
  if (/^https?:\/\/(?:www\.)?arxiv\.org\/(?:abs|pdf)\//i.test(paper.url)) {
    candidates.unshift(paper.url.replace(/^https?:\/\/(?:www\.)?arxiv\.org\/(?:abs|pdf)\//i, '').split(/[?#]/)[0]);
  }
  for (const value of candidates) {
    const candidate = string(value).replace(/^arxiv:\s*/i, '').replace(/\.pdf$/i, '').replace(/v\d+$/i, '');
    if (/^(?:\d{4}\.\d{4,5}|[a-z-]+(?:\.[a-z]{2})?\/\d{7})$/i.test(candidate)) return candidate.toLowerCase();
  }
  return '';
}
function canonicalURL(value) {
  if (!value) return '';
  const url = new URL(value);
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    if (/^(?:utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  return url.href.replace(/\/$/, '');
}
function normalizedTitle(value) {
  return value.normalize('NFKC').toLowerCase().replace(/[\p{P}\p{S}]+/gu, ' ').replace(/\s+/g, ' ').trim();
}
function identityKeys(paper) {
  const doi = doiIdentity(paper);
  const arxiv = arxivIdentity(paper);
  const url = canonicalURL(paper.url);
  // The same work can have a preprint and a publication record. Keep both
  // source identities remain stable during normalization.
  return [doi && `doi:${doi}`, arxiv && `arxiv:${arxiv}`, url && `url:${url}`].filter(Boolean).map(key => `${paper.source}:${key}`);
}
function compatibleTitles(a, b) {
  const title = normalizedTitle(a.title);
  if (title.length < 20 || title.split(' ').length < 3) return false;
  if (a.authors && b.authors && normalizedTitle(a.authors) !== normalizedTitle(b.authors)) return false;
  return title === normalizedTitle(b.title) && a.year === b.year;
}
function canDeduplicate(a, b) {
  if (a.source !== b.source) return false;
  const doiA = doiIdentity(a), doiB = doiIdentity(b);
  const arxivA = arxivIdentity(a), arxivB = arxivIdentity(b);
  if (doiA && doiA === doiB) return true;
  // Different stable identifiers take precedence over a coincidentally equal title.
  if (doiA && doiB && doiA !== doiB) return false;
  if (arxivA && arxivA === arxivB) return true;
  if (arxivA && arxivB && arxivA !== arxivB) return false;
  if (a.id === b.id && a.year === b.year && normalizedTitle(a.title) === normalizedTitle(b.title)) return true;
  if (a.url && canonicalURL(a.url) === canonicalURL(b.url)) return true;
  return compatibleTitles(a, b);
}

function excludedPaper(paper) {
  return paper.excluded === true || (paper.documentStatus !== undefined && paper.documentStatus !== 'research');
}

function normalizeEvidence(value, topicMap, prefix) {
  if (!record(value)) fail(`${prefix} topicEvidence 必須是依主題分類的物件。`);
  for (const [id, evidence] of Object.entries(value)) {
    if (!topicMap.has(id)) fail(`${prefix} topicEvidence 包含不存在的主題「${id}」。`);
    if (!record(evidence) || !EVIDENCE_STATUSES.has(evidence.status)) fail(`${prefix}「${id}」的證據 status 無效。`);
  }
  return copyJSON(value);
}

function evidenceRecords(paper) {
  return paper.classificationRecords || [{ id: paper.id, topics: paper.topics, ...(paper.topicEvidence ? { topicEvidence: paper.topicEvidence } : {}) }];
}

// Deduplication must retain each record's evidence separately. Combining labels
// from two records must never manufacture a pair absent from both originals.
function mergeClassification(duplicate, paper) {
  if (duplicate.topicEvidence || paper.topicEvidence || duplicate.classificationRecords || paper.classificationRecords) {
    duplicate.classificationRecords = copyJSON([...evidenceRecords(duplicate), ...evidenceRecords(paper)]);
    const rank = { inherited: 0, supported: 1, uncertain: 2, comparison: 3, rejected: 4 };
    const evidence = { ...(duplicate.topicEvidence || {}) };
    for (const [id, item] of Object.entries(paper.topicEvidence || {})) {
      if (!evidence[id] || rank[item.status] > rank[evidence[id].status]) evidence[id] = item;
    }
    duplicate.topicEvidence = evidence;
  }
  for (const key of ['originalTopics', 'queryTopics']) {
    if (Array.isArray(paper[key])) duplicate[key] = [...new Set([...(duplicate[key] || []), ...paper[key]])];
  }
  if (excludedPaper(paper)) {
    duplicate.excluded = true;
    if (paper.documentStatus) duplicate.documentStatus = paper.documentStatus;
    if (paper.exclusionReason) duplicate.exclusionReason = paper.exclusionReason;
  }
}

/** Validate and copy a dataset; deduplicate records within each source only. */
export function normalizeDataset(raw) {
  if (!record(raw)) fail('資料必須是 JSON 物件。');
  if (!Array.isArray(raw.topics) || raw.topics.length === 0) fail('topics 必須至少包含一個主題。');
  if (!Array.isArray(raw.papers)) fail('papers 必須是陣列。');
  const topicMap = new Map();
  const topics = raw.topics.map((item, index) => {
    if (!record(item)) fail(`第 ${index + 1} 個主題格式不正確。`);
    const id = requiredString(item.id, `第 ${index + 1} 個主題 id`);
    if (topicMap.has(id)) fail(`主題 ID「${id}」重複，請使用唯一的 ID。`);
    const kind = item.kind === undefined ? 'topic' : item.kind;
    if (typeof kind !== 'string' || !own(KIND_LABELS, kind)) fail(`主題「${id}」的 kind 無效，只接受 topic、technique、method 或 architecture。`);
    const topic = {
      id,
      label: string(item.label) || string(item.name) || id,
      name: string(item.name) || string(item.label) || id,
      group: string(item.group) || '其他',
      kind,
    };
    for (const key of ['description']) if (string(item[key])) topic[key] = string(item[key]);
    if (item.parent !== undefined && item.parent !== null && item.parent !== '') topic.parent = requiredString(item.parent, `主題「${id}」parent`);
    topicMap.set(id, topic);
    return topic;
  });
  for (const topic of topics) {
    const ancestors = new Set([topic.id]);
    let parent = topic.parent;
    while (parent) {
      if (!topicMap.has(parent)) fail(`主題「${topic.id}」的母主題「${parent}」不存在。`);
      if (ancestors.has(parent)) fail(`主題「${topic.id}」的母子關係存在循環，請移除循環連結。`);
      ancestors.add(parent);
      parent = topicMap.get(parent).parent;
    }
  }
  const papers = [];
  const idMap = new Map();
  const identityMap = new Map();
  const titleMap = new Map();
  let duplicatesRemoved = 0;
  raw.papers.forEach((item, index) => {
    const prefix = `第 ${index + 1} 筆論文`;
    if (!record(item)) fail(`${prefix}格式不正確。`);
    const id = requiredString(item.id, `${prefix} id`);
    const title = requiredString(item.title, `${prefix} title`);
    if (!Number.isInteger(item.year) || !YEARS.includes(item.year)) fail(`${prefix}「${title}」的年度無效，只接受整數 2023–2026。`);
    if (!SOURCES.includes(item.source)) fail(`${prefix}「${title}」的來源無效，只接受 arXiv。`);
    if (item.excluded !== undefined && typeof item.excluded !== 'boolean') fail(`${prefix} excluded 必須是布林值。`);
    if (item.documentStatus !== undefined && !['research', 'notice', 'editorial', 'retracted', 'out-of-scope'].includes(item.documentStatus)) fail(`${prefix} documentStatus 無效。`);
    if (!Array.isArray(item.topics) || (!item.topics.length && !excludedPaper(item))) fail(`${prefix}「${title}」必須指定至少一個 topics 主題 ID；排除的紀錄可留空。`);
    const topicEvidence = item.topicEvidence === undefined ? undefined : normalizeEvidence(item.topicEvidence, topicMap, prefix);
    const memberships = new Set();
    const generatedInherited = new Set();
    for (const value of item.topics) {
      const topicId = requiredString(value, `${prefix} topics`);
      if (!topicMap.has(topicId)) fail(`${prefix}包含不存在的主題「${topicId}」，請確認 topics 欄的主題 ID。`);
      let current = topicId;
      while (current) {
        // A rejected assignment remains in the audit trail, never membership.
        // It also blocks inheritance through this part of the taxonomy.
        if (topicEvidence?.[current]?.status === 'rejected') break;
        memberships.add(current);
        if (topicEvidence && current !== topicId && !topicEvidence[current]) {
          topicEvidence[current] = { status: 'inherited', basis: 'navigation', reason: '由子主題保留的導覽階層，非獨立主題證據。', via: [topicId] };
          generatedInherited.add(current);
        } else if (generatedInherited.has(current) && current !== topicId && topicEvidence[topicId]?.status !== 'inherited') {
          topicEvidence[current].via = [...new Set([...(topicEvidence[current].via || []), topicId])];
        }
        current = topicMap.get(current).parent;
      }
    }
    if (!memberships.size && !excludedPaper(item)) fail(`${prefix}「${title}」沒有可用的主題，請將無關紀錄標記為 excluded。`);
    const paper = { ...copyJSON(item), id, title: item.title, year: item.year, source: item.source, url: safeURL(item.url), topics: [...memberships] };
    if (topicEvidence) paper.topicEvidence = topicEvidence;
    if (item.classificationRecords !== undefined) {
      if (!Array.isArray(item.classificationRecords)) fail(`${prefix} classificationRecords 必須是陣列。`);
      paper.classificationRecords = item.classificationRecords.map(entry => {
        if (!record(entry) || !Array.isArray(entry.topics) || entry.topics.some(id => !topicMap.has(id))) fail(`${prefix} classificationRecords 格式不正確。`);
        return { ...copyJSON(entry), ...(entry.topicEvidence === undefined ? {} : { topicEvidence: normalizeEvidence(entry.topicEvidence, topicMap, prefix) }) };
      });
    }
    // Keep source text byte-for-byte; identity comparisons normalize separately.
    for (const key of ['authors', 'abstract', 'doi', 'arxivId', 'published', 'publication']) if (string(item[key])) paper[key] = item[key];
    if (Array.isArray(item.categories)) paper.categories = [...new Set(item.categories.map(string).filter(Boolean))];
    else if (string(item.categories)) paper.categories = [string(item.categories)];
    const existingID = idMap.get(id);
    if (existingID && !canDeduplicate(existingID, paper)) fail(`論文 ID「${id}」重複但內容不同，請修正為唯一 ID。`);
    const keys = identityKeys(paper);
    const titleKey = `${paper.source}|${normalizedTitle(title)}|${paper.year}`;
    const candidates = [existingID, ...keys.map(key => identityMap.get(key)), ...(titleMap.get(titleKey) || [])].filter(Boolean);
    const duplicate = candidates.find(candidate => canDeduplicate(candidate, paper));
    if (duplicate) {
      mergeClassification(duplicate, paper);
      duplicate.topics = [...new Set([...duplicate.topics, ...paper.topics])];
      duplicate.topics = duplicate.topics.filter(id => duplicate.topicEvidence?.[id]?.status !== 'rejected');
      for (const key of ['url', 'authors', 'abstract', 'doi', 'arxivId', 'published', 'publication']) if (!duplicate[key] && paper[key]) duplicate[key] = paper[key];
      if (paper.categories) duplicate.categories = [...new Set([...(duplicate.categories || []), ...paper.categories])];
      idMap.set(id, duplicate);
      for (const key of keys) identityMap.set(key, duplicate);
      duplicatesRemoved += 1;
    } else {
      papers.push(paper);
      idMap.set(id, paper);
      for (const key of keys) identityMap.set(key, paper);
      if (!titleMap.has(titleKey)) titleMap.set(titleKey, []);
      titleMap.get(titleKey).push(paper);
    }
  });
  const dataset = { meta: { ...(record(raw.meta) ? copyJSON(raw.meta) : {}), duplicatesRemoved: (Number.isSafeInteger(raw.meta?.duplicatesRemoved) && raw.meta.duplicatesRemoved >= 0 ? raw.meta.duplicatesRemoved : 0) + duplicatesRemoved }, topics, papers };
  return dataset;
}

function selectedFilters(filters = {}) {
  return { years: filters.years ?? YEARS, sources: filters.sources ?? SOURCES, countBasis: 'corpus', evidenceMode: 'supported', includeExcluded: false };
}

function supportedEvidence(evidence) {
  return evidence?.status === 'supported' && !['query_only', 'navigation', 'comparison'].includes(evidence.basis);
}

function supportedMembership(paper, topicId, topicMap) {
  const evidence = paper.topicEvidence?.[topicId];
  if (supportedEvidence(evidence)) return true;
  if (evidence?.status !== 'inherited') return false;
  // The stored via list is explanatory only. Validate the current taxonomy and
  // current supported labels so stale or rejected descendants cannot count.
  return paper.topics.some(id => {
    if (!supportedEvidence(paper.topicEvidence?.[id])) return false;
    let parent = topicMap.get(id)?.parent;
    while (parent) {
      if (paper.topicEvidence?.[parent]?.status === 'rejected') return false;
      if (parent === topicId) return true;
      parent = topicMap.get(parent)?.parent;
    }
    return false;
  });
}

export function papersFor(dataset, topicId, filters = {}) {
  const { years, sources, evidenceMode, includeExcluded } = selectedFilters(filters);
  const yearSet = new Set(years), sourceSet = new Set(sources);
  const topicMap = new Map(dataset.topics.map(topic => [topic.id, topic]));
  return dataset.papers.filter(paper => {
    if (!yearSet.has(paper.year) || !sourceSet.has(paper.source) || (!includeExcluded && excludedPaper(paper))) return false;
    const memberships = topicId ? paper.topics.filter(id => id === topicId) : paper.topics;
    return memberships.some(id => {
      if (paper.topicEvidence?.[id]?.status === 'rejected') return false;
      return supportedMembership(paper, id, topicMap);
    });
  });
}

export function countTopic(dataset, topicId, filters = {}) {
  return dataset.topics.some(topic => topic.id === topicId) ? papersFor(dataset, topicId, filters).length : 0;
}

export function yearCounts(dataset, topicId, sources = SOURCES, _countBasis = 'corpus', filters = {}) {
  return YEARS.map(year => ({ year, count: countTopic(dataset, topicId, { ...filters, years: [year], sources }) }));
}

function ancestorsFromMap(topicMap, id) {
  const ancestors = [];
  const visited = new Set([id]);
  let current = topicMap.get(topicMap.get(id)?.parent);
  while (current && !visited.has(current.id)) {
    ancestors.push(current);
    visited.add(current.id);
    current = topicMap.get(current.parent);
  }
  return ancestors.reverse();
}

/** Return the topic's complete root-to-parent path, excluding the topic itself. */
export function topicAncestors(dataset, id) {
  return ancestorsFromMap(new Map(dataset.topics.map(topic => [topic.id, topic])), id);
}

/** Visibility is structural: count/source/year filters never hide reachable nodes. */
export function visibleTopics(dataset, expandedIds, { search = '', filters = {} } = {}) {
  const topicMap = new Map(dataset.topics.map(topic => [topic.id, topic]));
  const expanded = new Set(expandedIds || []);
  const needle = string(search).normalize('NFKC').toLowerCase();
  if (needle) {
    const included = new Set();
    for (const topic of dataset.topics) {
      const kind = topic.kind || 'topic';
      const haystack = `${topic.label} ${topic.name} ${topic.description || ''} ${kind} ${KIND_LABELS[kind] || ''}`.normalize('NFKC').toLowerCase();
      if (!haystack.includes(needle)) continue;
      included.add(topic.id);
      for (const ancestor of ancestorsFromMap(topicMap, topic.id)) included.add(ancestor.id);
    }
    return dataset.topics.filter(topic => included.has(topic.id));
  }
  return dataset.topics.filter(topic => ancestorsFromMap(topicMap, topic.id).every(ancestor => expanded.has(ancestor.id)));
}

function validatedWorkIds(papers) {
  const parents = papers.map((_, index) => index);
  const dois = papers.map(paper => new Set([doiIdentity(paper)].filter(Boolean)));
  const find = index => {
    while (parents[index] !== index) {
      parents[index] = parents[parents[index]];
      index = parents[index];
    }
    return index;
  };
  const join = (a, b) => {
    a = find(a); b = find(b);
    if (a === b) return;
    const combined = new Set([...dois[a], ...dois[b]]);
    if (combined.size > 1) return;
    parents[b] = a;
    dois[a] = combined;
  };
  const byDOI = new Map(), byTitleAuthors = new Map();
  papers.forEach((paper, index) => {
    const doi = doiIdentity(paper);
    if (doi) {
      if (byDOI.has(doi)) join(byDOI.get(doi), index);
      else byDOI.set(doi, index);
    }
    const title = normalizedTitle(paper.title), authors = normalizedTitle(string(paper.authors));
    if (title.length < 20 || title.split(' ').length < 3 || !authors) return;
    const key = JSON.stringify([title, authors]);
    if (!byTitleAuthors.has(key)) byTitleAuthors.set(key, []);
    byTitleAuthors.get(key).push(index);
  });
  for (const indices of byTitleAuthors.values()) {
    // An unidentified record must not bridge two publications with distinct
    // DOIs. In this ambiguous case retain all title-only matches separately.
    const knownDOIs = new Set(indices.flatMap(index => [...dois[find(index)]]));
    if (knownDOIs.size > 1) continue;
    for (const index of indices.slice(1)) join(indices[0], index);
  }
  const groups = new Map();
  papers.forEach((paper, index) => {
    const root = find(index);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(paper.id);
  });
  const groupIds = new Map([...groups].map(([root, ids]) => [root, dois[root].size ? `doi:${[...dois[root]][0]}` : `work:${ids.sort()[0]}`]));
  // Claimed workId fields are preserved for provenance, but are not trusted as
  // grouping instructions for the public snapshot.
  return new Map(papers.map((paper, index) => [paper.id, groupIds.get(find(index))]));
}

export function relationships(dataset, visibleTopicIds, filters = {}) {
  const visible = new Set(visibleTopicIds);
  const counts = new Map();
  const topicMap = new Map(dataset.topics.map(topic => [topic.id, topic]));
  const workIds = validatedWorkIds(dataset.papers);
  const hierarchyPairs = new Set(dataset.topics.flatMap(topic => ancestorsFromMap(topicMap, topic.id).map(ancestor => JSON.stringify([ancestor.id, topic.id].sort()))));
  for (const paper of papersFor(dataset, null, { ...filters, evidenceMode: 'supported', includeExcluded: false })) {
    for (const entry of evidenceRecords(paper)) {
      const memberships = [...new Set(entry.topics.filter(id => visible.has(id) && paper.topics.includes(id) && supportedEvidence(paper.topicEvidence?.[id]) && supportedEvidence(entry.topicEvidence?.[id])))].sort();
      for (let i = 0; i < memberships.length; i += 1) {
        for (let j = i + 1; j < memberships.length; j += 1) {
          const pair = JSON.stringify([memberships[i], memberships[j]]);
          if (hierarchyPairs.has(pair)) continue;
          if (!counts.has(pair)) counts.set(pair, { paperIds: new Set(), workIds: new Set() });
          counts.get(pair).paperIds.add(paper.id);
          counts.get(pair).workIds.add(workIds.get(paper.id));
        }
      }
    }
  }
  const edges = [...counts].map(([pair, support]) => {
    const [source, target] = JSON.parse(pair);
    return { source, target, count: support.workIds.size, kind: 'cooccurrence', paperIds: [...support.paperIds].sort(), workIds: [...support.workIds].sort(), recordCount: support.paperIds.size };
  });
  for (const topic of dataset.topics) {
    if (topic.parent && visible.has(topic.id) && visible.has(topic.parent)) edges.push({ source: topic.parent, target: topic.id, count: 0, kind: 'hierarchy' });
  }
  return edges;
}

