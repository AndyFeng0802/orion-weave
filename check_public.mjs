import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {normalizeDataset,countTopic,relationships,YEARS} from './demo/model.mjs';

const root=fileURLToPath(new URL('.',import.meta.url));
const allowedFiles=new Set(['.gitignore','.nojekyll','README.md','DATA_NOTICE.md','index.html','package.json','check_public.mjs','demo/index.html','demo/styles.css','demo/app.mjs','demo/model.mjs','demo/favicon.svg','demo/dataset.json']);
function inspectFiles(directory=''){
 for(const entry of readdirSync(root+directory,{withFileTypes:true})){
  if(!directory&&entry.name==='.git')continue;
  const path=directory+entry.name;
  assert(!entry.isSymbolicLink(),`Symlink is not a public release asset: ${path}`);
  if(entry.isDirectory()){assert.equal(path,'demo',`Unexpected release directory: ${path}`);inspectFiles(path+'/');}
  else assert(allowedFiles.has(path),`Unexpected release file: ${path}`);
 }
}
function onlyKeys(object,allowed,label){for(const key of Object.keys(object))assert(allowed.includes(key),`${label}: nonpublic field ${key}`);}
inspectFiles();
const raw=JSON.parse(readFileSync(root+'demo/dataset.json','utf8'));
onlyKeys(raw,['meta','topics','papers'],'dataset');
onlyKeys(raw.meta,['title','publicSnapshot','description','scope','sources','years','countMode','throughDate','sourceThroughDates','classificationReviewVersion','classificationStatus','metadataLicense','metadataLicenseURL','metadataTermsURL','licenseCheckedAt','sampleCount','incompleteCurrentYear','attribution'],'meta');
assert.equal(raw.meta.publicSnapshot,true);
assert.equal(raw.meta.classificationReviewVersion,1);
assert.equal(raw.meta.metadataLicense,'CC0-1.0');
assert.equal(raw.meta.countMode,'corpus');
assert.deepEqual(raw.meta.sources,['arXiv']);
assert.deepEqual(Object.keys(raw.meta.sourceThroughDates),['arXiv']);
assert.equal(raw.meta.sampleCount,raw.papers.length);
assert(raw.papers.length>0);
for(const topic of raw.topics)onlyKeys(topic,['id','label','name','group','parent','description','kind'],'topic');
for(const paper of raw.papers){
 onlyKeys(paper,['id','title','year','source','url','topics','authors','doi','published','documentStatus','topicEvidence'],'paper');
 assert.equal(paper.source,'arXiv');
 assert.equal(paper.documentStatus,'research');
 assert.match(paper.id,/^arxiv:\d{4}\.\d{4,5}$/);
 assert.equal(paper.url,`https://arxiv.org/abs/${paper.id.slice(6)}`);
 assert(paper.topics.length>0);
 assert.deepEqual([...paper.topics].sort(),Object.keys(paper.topicEvidence).sort());
 assert(Object.values(paper.topicEvidence).some(e=>e.status==='supported'));
 for(const evidence of Object.values(paper.topicEvidence)){
  onlyKeys(evidence,['status','basis','field','matched','excerpt','reason','via'],'evidence');
  assert(['supported','inherited'].includes(evidence.status));
 }
}
const dataset=normalizeDataset(raw);
assert.equal(dataset.papers.length,raw.papers.length);
const ids=dataset.topics.map(t=>t.id);
const byId=new Map(dataset.papers.map(p=>[p.id,p]));
const edges=relationships(dataset,ids);
for(const edge of edges.filter(e=>e.kind!=='hierarchy')){
 assert(edge.paperIds.length>=edge.count&&edge.count>0);
 for(const id of edge.paperIds){
  const p=byId.get(id);assert(p);
  assert.equal(p.topicEvidence[edge.source]?.status,'supported');
  assert.equal(p.topicEvidence[edge.target]?.status,'supported');
 }
}
for(const id of ids){
 assert.equal(countTopic(dataset,id),YEARS.reduce((sum,year)=>sum+countTopic(dataset,id,{years:[year]}),0));
}
const html=readFileSync(root+'demo/index.html','utf8');
const app=readFileSync(root+'demo/app.mjs','utf8');
assert(!/type\s*=\s*["']file["']|\bdownload(?:\s*=|\s|>)/i.test(html));
assert(!/importFile|importBtn|exportBtn|includeUncertain|sourceFilters/.test(html+app));
assert(!/createObjectURL|new Blob|\.download\s*=|FormData|XMLHttpRequest|WebSocket|sendBeacon|localStorage|sessionStorage/.test(app));
assert.deepEqual([...app.matchAll(/fetch\(([^)]+)\)/g)].map(m=>m[1]),["'./dataset.json'"]);
assert(!/\bimportCSV\b/.test(readFileSync(root+'demo/model.mjs','utf8')));
assert(/href="\.\/demo\/"/.test(readFileSync(root+'index.html','utf8')));
console.log(`Public release verified: ${raw.papers.length} arXiv records, ${ids.length} topics, ${edges.filter(e=>e.kind!=='hierarchy').length} evidence relationships; explicit release allowlist and read-only UI passed.`);
