import {YEARS,normalizeDataset,countTopic,papersFor,relationships,topicAncestors,visibleTopics} from './model.mjs?v=20261030-public1';

const $=id=>document.getElementById(id);
const fmt=n=>new Intl.NumberFormat('en-US').format(n);
const short=n=>n>=10000?(n/1000).toFixed(1)+'k':fmt(n);
const NS='http://www.w3.org/2000/svg';
const palettes={language:['#153746','#e3bd79'],vision:['#282a48','#b8afe4'],learning:['#353127','#d9bd7b'],systems:['#193647','#8dc5d5'],generative:['#342a43','#cea4dc'],embodied:['#1a3b39','#81c9bb'],structured:['#3b2c30','#dda795']};
let dataset,selected,expanded=new Set(),year='all',query='',positions=new Map(),visible=[],edges=[],zoom=1,pan={x:0,y:0},drag=null;
let nodeGroups=new Map(),edgeElements=[],messageTimer;
const filters=()=>({years:year==='all'?YEARS:[Number(year)],sources:['arXiv'],countBasis:'corpus',evidenceMode:'supported'});
const topic=id=>dataset.topics.find(t=>t.id===id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const el=(tag,attrs={},text='')=>{const n=document.createElementNS(NS,tag);Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,v));if(text)n.textContent=text;return n};
const toast=text=>{$('toast').textContent=text;$('toast').hidden=false;clearTimeout(messageTimer);messageTimer=setTimeout(()=>$('toast').hidden=true,4200)};
const color=t=>palettes[t.group]||palettes[t.parent?'language':'systems'];
const kindName=t=>({topic:'研究主題',technique:'技術',method:'方法',architecture:'架構'}[t.kind]||'研究主題');
const isRefinement=t=>!!t&&t.kind&&t.kind!=='topic';
const childrenOf=id=>dataset.topics.filter(t=>t.parent===id);
function count(id){return countTopic(dataset,id,filters())}
function annualCounts(id){return YEARS.map(y=>({year:y,count:countTopic(dataset,id,{...filters(),years:[y]})}))}
function sampleLabel(){return '內容支持樣本'}
function countUnit(){return '篇'}
function snapshotText(){return `arXiv ${dataset.meta.sourceThroughDates?.arXiv||dataset.meta.throughDate||'擷取日'}`}
function scopeText(){return sampleLabel()}
function reachableTopics(){return visibleTopics(dataset,expanded,{search:query,filters:filters()})}
function getVisible(){
 return reachableTopics();
}
function radius(t){const max=Math.max(1,...visible.map(t=>count(t.id)));return count(t.id)?94*Math.sqrt(count(t.id)/max):8}
function layout(){
 const rootTopics=visible.filter(t=>!t.parent);const newPositions=new Map();
 visible.forEach((t,i)=>{
  let p=positions.get(t.id);
  if(!p){if(t.id==='llm'){p={x:455,y:355}}else if(t.parent){const siblings=visible.filter(s=>s.parent===t.parent);const parent=newPositions.get(t.parent)||positions.get(t.parent)||{x:455,y:355,r:80};const depth=topicAncestors(dataset,t.id).length;const a=siblings.indexOf(t)/Math.max(1,siblings.length)*Math.PI*2-1.6+depth*.65;const distance=parent.r+85+radius(t);p={x:parent.x+distance*Math.cos(a),y:parent.y+distance*Math.sin(a)}}else{const a=rootTopics.indexOf(t)/Math.max(1,rootTopics.length)*Math.PI*2-.8;p={x:500+350*Math.cos(a),y:360+245*Math.sin(a)}}}
  newPositions.set(t.id,{...p,r:radius(t)});
 });
 positions=newPositions;
 for(let step=0;step<160;step++){
  for(let i=0;i<visible.length;i++)for(let j=i+1;j<visible.length;j++){
   const a=positions.get(visible[i].id),b=positions.get(visible[j].id);let dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);if(d<.1){dx=1;dy=.3;d=1}
   const minimum=Math.max(a.r,35)+Math.max(b.r,35)+42;if(d<minimum){const push=(minimum-d)*.3;a.x-=dx/d*push;a.y-=dy/d*push;b.x+=dx/d*push;b.y+=dy/d*push}
  }
  for(const t of visible){const p=positions.get(t.id);p.x=Math.max(p.r+45,Math.min(955-p.r,p.x));p.y=Math.max(p.r+60,Math.min(665-p.r,p.y))}
 }
}
function graphTransform(){$('graphScene').setAttribute('transform',`translate(${500+pan.x} ${360+pan.y}) scale(${zoom}) translate(-500 -360)`);$('zoomReset').textContent=Math.round(zoom*100)+'%'}
function draw(){
 visible=getVisible();edges=relationships(dataset,visible.map(t=>t.id),filters());layout();nodeGroups=new Map();edgeElements=[];
 const scene=$('graphScene');scene.replaceChildren();
 const linkLayer=el('g',{'class':'links'}),nodes=el('g',{'class':'nodes'});scene.append(linkLayer,nodes);
 edges.forEach(edge=>{
  const hierarchy=edge.kind==='hierarchy';
  const line=el('line',{'class':`graph-link ${edge.kind}`,'stroke':hierarchy?'#c6aa76':'#7098ad','stroke-width':hierarchy?1.5:Math.min(3,.6+Math.sqrt(edge.count)*.15),'stroke-dasharray':hierarchy?'5 5':'','opacity':.6});
  line.append(el('title',{},hierarchy?'整理的主題分類':`${edge.count} 篇作品的內容同時提及這兩個主題；點擊查看證據`));
  linkLayer.append(line);edgeElements.push({line,edge});
  if(!hierarchy){
   const hit=el('line',{'class':'relationship-hit',stroke:'transparent','stroke-width':14,tabindex:'0',role:'button','aria-label':`${topic(edge.source).label} 與 ${topic(edge.target).label}：${edge.count} 篇作品，查看關聯證據`});
   hit.addEventListener('pointerdown',e=>e.stopPropagation());
   hit.addEventListener('click',e=>{e.stopPropagation();showRelationship(edge)});
   hit.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();showRelationship(edge)}});
   linkLayer.append(hit);edgeElements.push({line:hit,edge});
  }
 });
 visible.forEach(t=>{
  const p=positions.get(t.id),c=color(t),children=childrenOf(t.id),refined=isRefinement(t),empty=count(t.id)===0;
  const g=el('g',{'class':`topic-node${refined?' refinement':''}${empty?' empty':''}`,'data-id':t.id,'data-kind':t.kind,'data-depth':topicAncestors(dataset,t.id).length,tabindex:'0',role:'button','aria-label':`${t.label}，${kindName(t)}，${fmt(count(t.id))} ${countUnit()}${scopeText(t.id)}。Enter 選取，空白鍵展開，Shift F10 年度統計。`,...(children.length?{'aria-expanded':String(expanded.has(t.id))}:{})});
  const hit=el('circle',{r:Math.max(p.r,18),fill:'transparent','class':'node-hit-area'});
  const halo=el('circle',{r:p.r+7,fill:'none',stroke:c[1],'stroke-width':'1.3','stroke-dasharray':refined?'5 4':'none','class':'selection-ring'});
  const circle=el('circle',{r:p.r,fill:empty?'none':c[0],stroke:c[1],'stroke-width':refined?'2':'1.15','stroke-dasharray':refined?'5 3':'none','class':'topic-circle'});g.append(hit,halo,circle);
  const inside=p.r>=35;const words=t.label.split(' ');const lines=t.label.length>15&&words.length>1?[words.slice(0,Math.ceil(words.length/2)).join(' '),words.slice(Math.ceil(words.length/2)).join(' ')]:[t.label];
  const fs=t.id==='llm'&&p.r>70?25:p.r>55?18:15;const label=el('text',{'text-anchor':'middle',y:inside?(lines.length>1?-12:-3):p.r+18,'class':'topic-label','font-size':fs});lines.forEach((line,i)=>label.append(el('tspan',{x:0,dy:i?fs+3:0},line)));g.append(label);
  const val=el('text',{'text-anchor':'middle',y:inside?(lines.length>1?26:18):p.r+18+lines.length*15,'class':'topic-count','font-size':p.r>70?15:13},empty?'尚無內容支持':`${short(count(t.id))} ${countUnit()}${refined?' · '+kindName(t):''}`);g.append(val);
  if(children.length){g.append(el('text',{'text-anchor':'middle',y:p.r>30?-p.r+20:-p.r-8,'class':'node-expander','font-size':16},expanded.has(t.id)?'−':'+'))}
  g.addEventListener('click',e=>{e.stopPropagation();if(drag?.moved)return;select(t.id)});
  g.addEventListener('dblclick',e=>{e.preventDefault();e.stopPropagation();toggleExpand(t.id)});
  g.addEventListener('contextmenu',e=>{e.preventDefault();e.stopPropagation();select(t.id);showTooltip(t,e.clientX,e.clientY)});
  g.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();select(t.id)}if(e.key===' '){e.preventDefault();toggleExpand(t.id)}if((e.key==='F10'&&e.shiftKey)||e.key==='ContextMenu'){e.preventDefault();const b=g.getBoundingClientRect();showTooltip(t,b.x+b.width/2,b.y+b.height/2)}});
  g.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.stopPropagation();const q=svgPoint(e);drag={id:t.id,start:q,original:{...p},moved:false};g.setPointerCapture(e.pointerId)});
  nodes.append(g);nodeGroups.set(t.id,g);
 });
 updateGeometry();updateSelection();graphTransform();
 $('emptyState').hidden=visible.length>0;
 if(!visible.length)$('emptyState').textContent='沒有符合條件的主題，試著調整年份或搜尋詞。';
 $('graphBreadcrumb').textContent=query?`探索 / 搜尋「${$('searchInput').value}」`:`探索 / ${year==='all'?'2023–2026':year} / arXiv · ${sampleLabel()}`;
 $('topicStats').textContent=`${visible.length} 個可見主題`;
}
function updateGeometry(){
 for(const [id,g]of nodeGroups){const p=positions.get(id);g.setAttribute('transform',`translate(${p.x} ${p.y})`)}
 for(const {line,edge}of edgeElements){const a=positions.get(edge.source),b=positions.get(edge.target);line.setAttribute('x1',a.x);line.setAttribute('y1',a.y);line.setAttribute('x2',b.x);line.setAttribute('y2',b.y)}
}
function updateSelection(){for(const [id,g]of nodeGroups)g.classList.toggle('selected',id===selected);for(const {line,edge}of edgeElements){const active=edge.source===selected||edge.target===selected;line.style.opacity=active?'.95':'.32';}}
function svgPoint(e){const pt=$('graph').createSVGPoint();pt.x=e.clientX;pt.y=e.clientY;return pt.matrixTransform($('graphScene').getScreenCTM().inverse())}
function select(id){selected=id;updateSelection();renderDetails()}
function toggleExpand(id){
 const t=topic(id);const children=childrenOf(id);selected=id;
 if(!children.length){renderDetails();toast(`${t.label} 已到目前分類的最末層，可查看已收錄論文。`);return}
 if(query){query='';$('searchInput').value='';topicAncestors(dataset,id).forEach(t=>expanded.add(t.id))}
 if(expanded.has(id))expanded.delete(id);else expanded.add(id);
 refresh();
}
function renderFilters(){
 $('yearFilters').innerHTML=['all',...YEARS].map(y=>`<button class="filter-btn year-btn ${String(year)===String(y)?'active':''}" data-year="${y}" aria-pressed="${String(year)===String(y)}">${y==='all'?'全部':y}</button>`).join('');
 $('yearFilters').querySelectorAll('button').forEach(b=>b.onclick=()=>{year=b.dataset.year;refresh()});
}
function evidenceHTML(p,id){
 const evidence=p.topicEvidence?.[id],status=evidence?.status||'unreviewed';
 const label={supported:'內容支持',inherited:'分類歸屬',uncertain:'待確認',comparison:'比較提及',rejected:'已排除',unreviewed:'未審查'}[status]||'待確認';
 const field={title:'標題',abstract:'摘要',category:'來源分類'}[evidence?.field];
 return `<div class="paper-evidence" data-evidence-status="${esc(status)}"><span class="evidence-badge ${esc(status)}">${esc(topic(id)?.label||id)} · ${label}</span><details><summary>查看判定依據</summary>${evidence?.excerpt?`<blockquote>${esc(evidence.excerpt)}</blockquote>`:''}<p>${field?field+'：':''}${esc(evidence?.reason||'此標籤未附內容證據，不能據此建立共現關聯。')}</p>${evidence?.via?.length?`<p>分類來自：${evidence.via.map(t=>esc(topic(t)?.label||t)).join('、')}</p>`:''}</details></div>`;
}
function paperCard(p,ids){
 return `<article class="paper-card" data-paper-id="${esc(p.id)}"><div class="paper-meta"><span>${esc(p.source)}</span><span>${p.year}</span></div>${p.url?`<a class="paper-title" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">${esc(p.title)} <span aria-hidden="true">↗</span></a>`:`<span class="paper-title">${esc(p.title)}</span>`}<p class="paper-authors">${esc(p.authors||'作者資訊請見論文頁面')}</p>${ids.map(id=>evidenceHTML(p,id)).join('')}</article>`;
}
function showRelationship(edge){
 hideTooltip();
 const sourceTopic=topic(edge.source),targetTopic=topic(edge.target),ids=new Set(edge.paperIds||[]);
 const papers=dataset.papers.filter(p=>ids.has(p.id)).sort((a,b)=>b.year-a.year||a.id.localeCompare(b.id));
 $('relationshipTitle').textContent=`${sourceTopic.label} ↔ ${targetTopic.label}`;
 $('relationshipSummary').textContent=`${fmt(edge.count)} 篇不重複作品 · ${fmt(papers.length)} 筆來源紀錄。以下每筆紀錄的內容都同時支持兩個主題。作品以 DOI 或一致的標題及完整作者去重；各筆紀錄的標籤不會拼接成新關聯。這是內容共現，不代表引用關係、論文的主要貢獻或確實採用該方法。`;
 let shown=0;
 $('relationshipPapers').replaceChildren();
 const more=()=>{const batch=papers.slice(shown,shown+20);$('relationshipPapers').insertAdjacentHTML('beforeend',batch.map(p=>paperCard(p,[edge.source,edge.target])).join(''));shown+=batch.length;$('moreEvidence').hidden=shown>=papers.length;$('moreEvidence').textContent=`繼續查看（${shown} / ${papers.length}）`};
 $('moreEvidence').onclick=more;more();$('relationshipDialog').showModal();$('relationshipDialog').scrollTop=0;
}
function renderChildren(t){
 const children=childrenOf(t.id),path=[...topicAncestors(dataset,t.id),t];
 $('topicKind').textContent=kindName(t);
 $('topicKind').className=`kind-badge ${isRefinement(t)?'refinement':''}`;
 $('topicPath').innerHTML=path.map((p,i)=>`${i?'<span class="path-separator" aria-hidden="true">/</span>':''}<button class="path-button" data-path-topic="${esc(p.id)}" ${p.id===t.id?'aria-current="location"':''}>${esc(p.label)}</button>`).join('');
 $('topicPath').querySelectorAll('button').forEach(b=>b.onclick=()=>focusTopic(b.dataset.pathTopic));
 $('childrenSummary').textContent=children.length?`${children.length} 個下一層節點`:'目前最末層';
 $('childrenList').innerHTML=children.length?['topic','technique','method','architecture'].map(kind=>{
  const items=children.filter(c=>(c.kind||'topic')===kind);
  if(!items.length)return '';
  return `<div class="child-group"><p class="child-group-title">${kindName({kind})}</p>${items.map(c=>{
   const n=count(c.id);
   return `<button class="child-topic-btn" data-child-topic="${esc(c.id)}"><span class="child-topic-name">${esc(c.label)}${childrenOf(c.id).length?' <span aria-hidden="true">›</span>':''}</span><span class="child-topic-kind">${kindName(c)}</span><span class="child-topic-count">${fmt(n)} ${countUnit()}樣本</span></button>`;
  }).join('')}</div>`;
 }).join(''):'<p class="muted">目前分類到此層。可從下方論文繼續研究，或沿上方路徑返回。</p>';
 $('childrenList').querySelectorAll('button').forEach(b=>b.onclick=()=>{
  const id=b.dataset.childTopic;
  if(childrenOf(id).length)expanded.add(id);
  focusTopic(id);
 });
}
function renderDetails(){
 const t=topic(selected);if(!t)return;
 renderChildren(t);
 $('topicTitle').textContent=t.label;$('topicName').textContent=t.name;$('topicDescription').textContent=t.description||'探索這個研究主題的年度分布與相關論文。';
 $('topicCount').textContent=fmt(count(t.id));$('countLabel').textContent=`${year==='all'?'2023–2026':year} · ${scopeText()}`;
 const ys=annualCounts(t.id),max=Math.max(1,...ys.map(x=>x.count));
 $('yearChart').innerHTML=ys.map(y=>`<div class="year-row ${String(year)===String(y.year)?'highlight':''}"><span class="year-label">${y.year}${y.year===2026?'<i>*</i>':''}</span><div class="year-track"><div class="year-fill" style="width:${y.count/max*100}%"></div></div><span class="year-value">${fmt(y.count)}</span></div>`).join('');
 const related=relationships(dataset,dataset.topics.map(t=>t.id),filters()).filter(e=>e.source===t.id||e.target===t.id).sort((a,b)=>b.count-a.count).slice(0,6);
 $('relatedTopics').innerHTML=related.length?related.map((e,i)=>{const id=e.source===t.id?e.target:e.source;return `<span class="related-pair"><button class="related-chip" data-topic="${esc(id)}" title="${e.kind==='hierarchy'?'主題分類':`${e.count} 篇作品內容共現`}">${esc(topic(id).label)} <span>${e.kind==='hierarchy'?'↳':e.count}</span></button>${e.kind==='hierarchy'?'':`<button class="evidence-button" data-edge="${i}" aria-label="查看與 ${esc(topic(id).label)} 的關聯證據">證據 ↗</button>`}</span>`}).join(''):'<span class="muted">目前沒有具內容支持的共現關聯</span>';
 $('relatedTopics').querySelectorAll('[data-topic]').forEach(b=>b.onclick=()=>focusTopic(b.dataset.topic));
 $('relatedTopics').querySelectorAll('[data-edge]').forEach(b=>b.onclick=()=>showRelationship(related[Number(b.dataset.edge)]));
 const ps=papersFor(dataset,t.id,filters()).sort((a,b)=>b.year-a.year||String(b.published||'').localeCompare(String(a.published||'')));
 $('paperCount').textContent=`${fmt(ps.length)} ${countUnit()}樣本`;
 $('paperReviewNote').textContent=`${sampleLabel()}；內容支持指標題、摘要或分類證據，不等於全文驗證。${ps.length>12?'目前顯示最新 12 筆。':''}`;
 $('paperList').innerHTML=ps.slice(0,12).map(p=>paperCard(p,[t.id])).join('')||'<p class="empty-papers">此篩選條件下尚無符合證據範圍的樣本。</p>';
 const children=childrenOf(t.id);$('expandBtn').disabled=!children.length;$('expandText').textContent=children.length?(expanded.has(t.id)?'收合下一層':`展開 ${children.length} 個細分節點`):'目前已到最末層';
 $('sourceNote').textContent=`公開快照：${snapshotText()}。2026 為部分年度；僅涵蓋已收錄且具內容支持的樣本，0 不代表全站無論文。`;
}
function focusTopic(id){let p=topic(id)?.parent;while(p){expanded.add(p);p=topic(p)?.parent}query='';$('searchInput').value='';selected=id;refresh();}
function refresh(){hideTooltip();renderFilters();draw();renderDetails();$('clearSearch').hidden=!query;$('statusText').textContent=`${snapshotText()} · 2026 為部分年度`;}
function showTooltip(t,x,y){
 const ys=annualCounts(t.id),total=ys.reduce((s,y)=>s+y.count,0);
 $('tooltip').innerHTML=`<div class="tip-heading"><div><span class="eyebrow">YEARLY PAPERS</span><h3>${esc(t.label)}</h3><span class="tip-kind">${kindName(t)}</span></div><button id="closeTip" aria-label="關閉年度統計">×</button></div><div class="tip-total">${fmt(total)} <span>${countUnit()} · ${scopeText(t.id)}</span></div>${ys.map(y=>`<div class="tip-row"><span>${y.year}${y.year===2026?'*':''}</span><b>${fmt(y.count)}</b></div>`).join('')}<p>* 2026 為部分年度<br>快照：${esc(snapshotText())}<br>2023–2026 年度樣本分布<br>0 不代表全站無論文。</p>`;
 const wrap=$('graphWrap').getBoundingClientRect();$('tooltip').hidden=false;const tip=$('tooltip').getBoundingClientRect();$('tooltip').style.left=Math.max(8,Math.min(x-wrap.left+16,wrap.width-tip.width-12))+'px';$('tooltip').style.top=Math.max(8,Math.min(y-wrap.top+16,wrap.height-tip.height-12))+'px';$('closeTip').onclick=hideTooltip;
}
function hideTooltip(){$('tooltip').hidden=true}
function init(data){
 if(data.meta?.publicSnapshot!==true||data.papers?.some(p=>p.source!=='arXiv'))throw new Error('展示資料必須是公開 arXiv 快照');
 dataset=normalizeDataset(data);positions=new Map();expanded=new Set();selected=dataset.topics.find(t=>t.id==='llm')?.id||dataset.topics[0].id;
 expanded.add(selected);year='all';query='';$('searchInput').value='';
 $('datasetBadge').textContent='唯讀展示 · arXiv';
 $('statusText').textContent=`資料截至 ${dataset.meta.throughDate||String(dataset.meta.updatedAt||'').slice(0,10)} · 2026 為部分年度`;
 $('paperStats').textContent=`${fmt(dataset.papers.length)} 篇公開樣本 · ${dataset.topics.length} 個主題`;
 refresh();
}
function methodology(){
 $('methodContent').innerHTML=`<p>這是 Orion Weave 的唯讀互動展示版，以 arXiv 真實中繼資料快照探索研究主題。快照：${esc(snapshotText())}，共 ${fmt(dataset.papers.length)} 篇樣本與 ${dataset.topics.length} 個主題。</p>
 <h3>數量與圓圈大小</h3><p>所有圓圈與年度統計都依「內容支持樣本」計算，不是 arXiv 全站論文總量。母主題可包含受支持子主題的分類歸屬；一篇論文可能同時屬於多個主題，因此不能將所有圓圈相加作為唯一論文總數。空心小圈表示目前樣本缺少支持，僅供分類導航。</p>
 <h3>多層分類與關聯</h3><p>雙擊節點可逐層展開研究主題、技術、方法與架構；後三者使用虛線圓框。虛線連線表示整理的母子分類，實線表示同一筆論文的兩個主題都有直接內容支持。點擊實線或右側「證據」，可查看支持論文與判定依據。</p>
 <p>實線依不重複作品數計算，以 DOI 或一致標題與完整作者保守去重。分類繼承不會獨立產生實線。內容支持只來自標題、摘要或來源分類，不代表全文驗證、主要貢獻、方法採用、引用或因果關係。</p>
 <h3>年度範圍</h3><p>arXiv 依初次提交年份計算。2026 只涵蓋快照日期以前，不能直接與完整年度比較增長率。清單來自有界收錄樣本，不能當作領域普查。</p>
 <h3>資料來源與授權</h3><p>此展示只提供 arXiv 的描述性中繼資料、原文連結與本專案整理的主題分類，不包含論文 PDF 或全文。arXiv 描述性中繼資料依 CC0 1.0 提供；論文全文各有自己的授權，請前往原始頁面閱讀。</p>
 <p><a href="https://info.arxiv.org/help/api/tou.html" target="_blank" rel="noopener noreferrer">arXiv 資料使用說明 ↗</a> · <a href="https://creativecommons.org/publicdomain/zero/1.0/" target="_blank" rel="noopener noreferrer">CC0 1.0 ↗</a> · <a href="../">關於 Orion Weave ↗</a></p>
 <p>Thank you to arXiv for use of its open access interoperability. Orion Weave 為獨立研究專案，未經 arXiv 背書。</p>`;
 $('methodDialog').showModal();$('methodDialog').scrollTop=0;
}
$('expandBtn').onclick=()=>toggleExpand(selected);
$('searchInput').addEventListener('input',e=>{query=e.target.value.trim().toLowerCase();if(query){const match=dataset.topics.find(t=>[t.label,t.name].some(s=>s.toLowerCase()===query))||dataset.topics.find(t=>`${t.label} ${t.name}`.toLowerCase().includes(query));if(match)selected=match.id}refresh()});
$('clearSearch').onclick=()=>{query='';$('searchInput').value='';refresh();$('searchInput').focus()};
$('resetBtn').onclick=()=>{year='all';query='';$('searchInput').value='';zoom=1;pan={x:0,y:0};positions.clear();expanded=new Set([dataset.topics.find(t=>t.id==='llm')?.id||dataset.topics[0].id]);selected=dataset.topics.find(t=>t.id==='llm')?.id||dataset.topics[0].id;refresh();toast('已重設探索視角')};
$('zoomIn').onclick=()=>{zoom=Math.min(2.4,zoom+.15);graphTransform()};$('zoomOut').onclick=()=>{zoom=Math.max(.45,zoom-.15);graphTransform()};$('zoomReset').onclick=()=>{zoom=1;pan={x:0,y:0};graphTransform()};
$('graph').addEventListener('wheel',e=>{e.preventDefault();zoom=Math.max(.45,Math.min(2.4,zoom-e.deltaY*.001));graphTransform()},{passive:false});
$('graph').addEventListener('pointerdown',e=>{if(e.button!==0)return;hideTooltip();drag={id:null,start:{x:e.clientX,y:e.clientY},original:{...pan},moved:false};$('graph').setPointerCapture(e.pointerId)});
$('graph').addEventListener('pointermove',e=>{if(!drag)return;if(drag.id){const q=svgPoint(e);const dx=q.x-drag.start.x,dy=q.y-drag.start.y;if(Math.hypot(dx,dy)>4)drag.moved=true;const p=positions.get(drag.id);p.x=Math.max(p.r,Math.min(1000-p.r,drag.original.x+dx));p.y=Math.max(p.r,Math.min(720-p.r,drag.original.y+dy));updateGeometry()}else{const scale=1000/$('graph').getBoundingClientRect().width;pan={x:drag.original.x+(e.clientX-drag.start.x)*scale,y:drag.original.y+(e.clientY-drag.start.y)*scale};drag.moved=true;graphTransform()}});
function endDrag(){setTimeout(()=>drag=null,0)}$('graph').addEventListener('pointerup',endDrag);$('graph').addEventListener('pointercancel',endDrag);
$('graph').addEventListener('click',e=>{if(e.target===$('graph'))hideTooltip()});
document.addEventListener('keydown',e=>{if(e.key==='Escape')hideTooltip();if(e.key==='/'&&!/INPUT|TEXTAREA/.test(document.activeElement.tagName)&&!$('methodDialog').open&&!$('relationshipDialog').open){e.preventDefault();$('searchInput').focus()}});
$('closeRelationship').onclick=()=>$('relationshipDialog').close();
$('relationshipDialog').addEventListener('click',e=>{if(e.target===$('relationshipDialog'))$('relationshipDialog').close()});
$('methodBtn').onclick=methodology;$('closeMethod').onclick=()=>$('methodDialog').close();
$('methodDialog').addEventListener('click',e=>{if(e.target===$('methodDialog'))$('methodDialog').close()});
try{const r=await fetch('./dataset.json');if(!r.ok)throw new Error(`HTTP ${r.status}`);init(await r.json())}catch(err){$('emptyState').hidden=false;$('emptyState').textContent=`資料載入失敗：${err.message}。請重新整理或檢查 dataset.json。`;$('statusText').textContent='資料載入失敗';console.error(err)}
