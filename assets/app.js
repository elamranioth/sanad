const judgmentCatalog=window.SANAD_DATA?.judgmentCatalog||{chunks:{}};
const searchTokens=window.SANAD_DATA?.searchTokens||{};
const baseDocs=(window.SANAD_DATA?.judgmentIndex||window.SANAD_DATA?.judgments||[]).map(doc=>({...doc,isIndexed:!doc.body}));
const laws=window.SANAD_DATA?.laws||[];
const legalForms=window.SANAD_DATA?.legalForms||[];
const localJudgmentsStorageKey='sanadLocalJudgments';
const workbenchStorageKey='sanadJudgmentWorkbench';
const defaultCatalog={
  title:'أحكام قضائية',
  subtitle:'تصفح وابحث في مجموعة الأحكام الصادرة عن المحاكم — تجارية، مدنية، عمالية، جنائية، إدارية وأسرية',
  icon:'ti-gavel'
};
const icons={tijari:'ti-briefcase',madani:'ti-scale',omali:'ti-hammer',jinai:'ti-shield-lock',idari:'ti-building-bank',osri:'ti-heart'};
const labels={tijari:'تجاري',madani:'مدني',omali:'عمالي',jinai:'جنائي',idari:'إداري',osri:'أسري'};
const typeKeys=['tijari','madani','omali','jinai','idari','osri'];
let localJudgments=loadLocalJudgments();
let docs=[...localJudgments,...baseDocs];
const standaloneViews=new Set(['dashboard','laws','decrees','regulations','contracts','aiAnalysis','clients','fees','settings','import']);
const collections={
  decrees:{
    title:'مراسيم',
    subtitle:'مكتبة مخصصة للمراسيم والقرارات ذات الصيغة التشريعية عند رفعها إلى سند.',
    icon:'ti-stamp',
    label:'مرسوم',
    empty:'لم يتم رفع مراسيم بعد.'
  },
  regulations:{
    title:'لوائح',
    subtitle:'قسم مستقل للوائح التنفيذية والتنظيمية، جاهز لاستقبال الملفات عند إضافتها.',
    icon:'ti-clipboard-list',
    label:'لائحة',
    empty:'لم يتم رفع لوائح بعد.'
  },
  contracts:{
    title:'عقود نموذجية',
    subtitle:'نماذج العقود والصيغ القانونية ستظهر هنا للبحث والقراءة عند رفعها.',
    icon:'ti-writing',
    label:'نموذج',
    empty:'لم يتم رفع عقود نموذجية بعد.'
  }
};
let counts=calculateCounts();

let currentType='all';
let currentView='documents';
let currentDocId=null;
let currentLawId=null;
let readerMode='judgment';
let deferredInstallPrompt=null;
const savedStorageKey='sanadSavedJudgments';
const feeStorageKey='sanadFeeItems';
const clientStorageKey='sanadClientProfiles';
const settingsStorageKey='sanadSettings';
const protectionStorageKey='sanadProtection';
let savedJudgmentIds=loadSavedJudgments();
let judgmentWorkbench=loadJudgmentWorkbench();
let feeItems=loadFeeItems();
let clientProfiles=loadClientProfiles();
let expandedClientIds=new Set();
let clientEditContext=null;
let sanadSettings=loadSanadSettings();
let protectionSettings=loadProtectionSettings();
let loadedJudgmentChunks=new Set();
let pendingChunkLoads={};
let currentDocResults=[];
let currentPage=1;
let currentReaderDoc=null;
let currentJudgmentSearchQuery='';
let currentJudgmentMatchIndex=0;
let clientQuery='';
let clientStatusFilter='all';
const docPageSize=24;
function ar(n){return n.toString().replace(/\d/g,d=>'٠١٢٣٤٥٦٧٨٩'[d])}
function calculateCounts(){
  return docs.reduce((acc,d)=>{
    acc.all++;
    if(acc[d.type]!==undefined)acc[d.type]++;
    return acc;
  },{all:0,tijari:0,madani:0,omali:0,jinai:0,idari:0,osri:0});
}
function refreshJudgmentData(){
  docs=[...localJudgments,...baseDocs];
  counts=calculateCounts();
}
function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}
function currentListSearchQuery(){return document.getElementById('searchInput')?.value.trim()||''}
function matchesLaw(law,q){return [law.title,law.subtitle,law.legislation,law.category,law.status,law.updated,law.body].some(v=>String(v||'').includes(q))}
function normalizeDigits(value){
  return String(value||'')
    .replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
}
function normalizeSearchText(value){
  return normalizeDigits(value).toLowerCase()
    .replace(/[إأآا]/g,'ا')
    .replace(/ى/g,'ي')
    .replace(/ة/g,'ه')
    .replace(/[\u064B-\u065F\u0670]/g,'')
    .replace(/[^\u0600-\u06FFa-z0-9\s/.-]/g,' ');
}
function searchWords(value){
  return [...new Set(normalizeSearchText(value).split(/\s+/).map(word=>word.trim()).filter(word=>/^\d+$/.test(word)?word.length>0:word.length>2))];
}
function splitSentenceSegments(text){
  const source=String(text||'');
  if(!source.trim())return [];
  const segments=[];
  const sentenceEnd=/[.!?؟؛;]/;
  let start=0;
  for(let i=0;i<source.length;i++){
    if(sentenceEnd.test(source[i])){
      let end=i+1;
      while(end<source.length&&/\s/.test(source[end]))end++;
      const part=source.slice(start,end);
      if(part.trim())segments.push(part);
      start=end;
    }
  }
  const tail=source.slice(start);
  if(tail.trim())segments.push(tail);
  return segments.length?segments:[source];
}
function sentenceMatchesSearch(sentence,query){
  const needle=normalizeSearchText(query).trim();
  if(!needle)return false;
  const haystack=normalizeSearchText(sentence);
  if(haystack.includes(needle))return true;
  const words=searchWords(query);
  return words.length>0&&words.every(word=>haystack.includes(word));
}
function renderSearchMatchedSentence(sentence,query){
  if(!sentenceMatchesSearch(sentence,query))return escapeHtml(sentence);
  return `<mark class="judgment-search-hit">${escapeHtml(sentence)}</mark>`;
}
function countJudgmentSentenceMatches(body,query){
  const q=String(query||'').trim();
  if(!q)return 0;
  const lines=String(body||'').replace(/\r/g,'').split(/\n+/).map(line=>line.trim()).filter(Boolean);
  const introEnd=lines.findIndex(line=>line.includes('أصـدرت')||line.includes('أصدرت'));
  const mainLines=introEnd>=0?lines.slice(introEnd+1):lines;
  return mainLines.reduce((sum,line)=>sum+splitSentenceSegments(line).filter(sentence=>sentenceMatchesSearch(sentence,q)).length,0);
}
function renderJudgmentSearchPanel(query='',body=''){
  const count=countJudgmentSentenceMatches(body,query);
  return `<section class="judgment-search-panel" id="judgmentSearchPanel">
    <div class="judgment-search-field">
      <i class="ti ti-search"></i>
      <input id="judgmentSearchInput" type="text" value="${escapeHtml(query)}" placeholder="ابحث داخل نص الحكم..." oninput="updateJudgmentSearchFromInput()">
    </div>
    <div class="judgment-search-tools">
      <span id="judgmentSearchCount">${query?`${ar(count)} نتيجة`:'اكتب للبحث داخل الحكم'}</span>
      <button type="button" onclick="jumpJudgmentSearchMatch(-1)" ${count?'':'disabled'}><i class="ti ti-chevron-right"></i>السابق</button>
      <button type="button" onclick="jumpJudgmentSearchMatch(1)" ${count?'':'disabled'}>التالي<i class="ti ti-chevron-left"></i></button>
    </div>
  </section>`;
}
function getWorkbenchEntry(id){
  const key=String(id);
  if(!judgmentWorkbench[key])judgmentWorkbench[key]={tags:[],note:'',highlights:[]};
  return judgmentWorkbench[key];
}
function workbenchSearchText(id){
  const entry=judgmentWorkbench[String(id)];
  if(!entry)return '';
  return [entry.note,...(entry.tags||[]),...(entry.highlights||[]).map(item=>item.text||'')].join(' ');
}
function matchesDoc(d,q){
  const needle=normalizeSearchText(q).trim();
  if(!needle)return true;
  return [d.title,d.court,d.date,d.num,d.appeal,d.source,d.excerpt,d.body,workbenchSearchText(d.id)]
    .some(v=>normalizeSearchText(v).includes(needle));
}
function scoreDocSearch(doc,query){
  const words=searchWords(query);
  if(!words.length)return 1;
  let score=0;
  const id=Number(doc.id);
  const localText=normalizeSearchText([doc.title,doc.court,doc.date,doc.num,doc.appeal,doc.source,doc.excerpt,workbenchSearchText(id)].join(' '));
  for(const word of words){
    if(searchTokens[word]?.includes(id))score+=5;
    if(localText.includes(word))score+=3;
  }
  return score;
}
function filterDocsBySearchIndex(list,query){
  const q=String(query||'').trim();
  if(!q)return list;
  return list
    .map(doc=>({doc,score:scoreDocSearch(doc,q)}))
    .filter(item=>item.score>0||matchesDoc(item.doc,q))
    .sort((a,b)=>b.score-a.score||sortableDateValue(b.doc)-sortableDateValue(a.doc))
    .map(item=>item.doc);
}
function sortableDateValue(doc){
  const raw=normalizeDigits(doc.date||doc.createdAt||'');
  const iso=raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if(iso)return new Date(Number(iso[1]),Number(iso[2])-1,Number(iso[3])).getTime();
  const dashed=raw.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if(dashed)return new Date(Number(dashed[3]),Number(dashed[2])-1,Number(dashed[1])).getTime();
  const months={يناير:0,فبراير:1,مارس:2,أبريل:3,ابريل:3,مايو:4,يونيو:5,يوليو:6,أغسطس:7,اغسطس:7,سبتمبر:8,أكتوبر:9,اكتوبر:9,نوفمبر:10,ديسمبر:11};
  const words=raw.match(/(\d{1,2})\s+([^\s]+)\s+(\d{4})/);
  if(words&&months[words[2]]!==undefined)return new Date(Number(words[3]),months[words[2]],Number(words[1])).getTime();
  return Number(doc.id)||0;
}
function sortDocuments(list,mode=document.getElementById('sortSelect')?.value||'newest'){
  const sorted=[...list];
  if(mode==='oldest')return sorted.sort((a,b)=>sortableDateValue(a)-sortableDateValue(b));
  if(mode==='court')return sorted.sort((a,b)=>String(a.court||'').localeCompare(String(b.court||''),'ar')||sortableDateValue(b)-sortableDateValue(a));
  return sorted.sort((a,b)=>sortableDateValue(b)-sortableDateValue(a));
}
function lawStat(value,label,icon){return `<span class="law-stat"><i class="ti ${icon}"></i><strong>${escapeHtml(value)}</strong><small>${escapeHtml(label)}</small></span>`}
function formatInlineMarkdown(text){
  return escapeHtml(text)
    .replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>')
    .replace(/`([^`]+)`/g,'<code>$1</code>');
}
function displayDocTitle(d){
  const title=String(d.title||'').trim();
  const separator=' - ';
  const index=title.indexOf(separator);
  return index>0?title.slice(0,index).trim():title;
}
function introLineClass(line){
  if(line.includes('بِسْمِ'))return 'intro-bismillah';
  if(line.startsWith('باسم صاحب'))return 'intro-ruler';
  if(line.includes('محكمة التمييز'))return 'intro-court';
  if(line.startsWith('بالجلسة'))return 'intro-session';
  if(line.startsWith('في الطع'))return 'intro-case';
  return '';
}
function renderJudgmentIntro(lines){
  const info=[];
  const top=[];
  let issued='';
  for(let i=0;i<lines.length;i++){
    const line=lines[i];
    if(line.includes('أصـدرت')||line.includes('أصدرت')){
      issued=line;
      continue;
    }
    if(line.endsWith(':')){
      const value=lines[i+1]&&!lines[i+1].endsWith(':')?lines[++i]:'';
      info.push(`<div class="intro-item"><div class="intro-label">${escapeHtml(line.replace(':',''))}</div><div class="intro-value">${escapeHtml(value)}</div></div>`);
      continue;
    }
    const cls=introLineClass(line);
    top.push(cls?`<div class="${cls}">${escapeHtml(line)}</div>`:`<div class="intro-value">${escapeHtml(line)}</div>`);
  }
  return `<section class="judgment-intro">${top.join('')}${info.length?`<div class="intro-grid">${info.join('')}</div>`:''}${issued?`<div class="intro-issued">${escapeHtml(issued)}</div>`:''}</section>`;
}
function splitJudgmentParagraphs(text){
  return String(text||'').replace(/\r/g,'').split(/\n+/).map(part=>part.trim()).filter(Boolean);
}
function renderJudgmentParagraph(text,query=''){
  const segments=splitSentenceSegments(text);
  const html=segments.map(sentence=>renderSearchMatchedSentence(sentence,query)).join('');
  const matched=query&&segments.some(sentence=>sentenceMatchesSearch(sentence,query));
  return `<p class="judgment-para${matched?' has-search-match':''}">${html}</p>`;
}
function formatJudgmentBody(body,doc=null,query=''){
  const lines=String(body||'').replace(/\r/g,'').split(/\n+/).map(line=>line.trim()).filter(Boolean);
  if(!lines.length)return '<div class="judgment-reader"><p class="judgment-para facts">لا يتوفر نص الحكم الكامل لهذا السجل.</p></div>';
  const introEnd=lines.findIndex(line=>line.includes('أصـدرت')||line.includes('أصدرت'));
  const introLines=introEnd>=0?lines.slice(0,introEnd+1):[];
  const mainText=(introEnd>=0?lines.slice(introEnd+1):lines).join('\n');
  const introHtml=introLines.length?renderJudgmentIntro(introLines):'';
  const paragraphs=splitJudgmentParagraphs(mainText).map(part=>renderJudgmentParagraph(part,query)).join('');
  return `<div class="judgment-reader" id="judgmentReaderShell">${introHtml}<section class="judgment-content">${paragraphs}</section></div>`;
}
function updateJudgmentSearchPanelState(){
  const body=currentReaderDoc?.body||'';
  const count=countJudgmentSentenceMatches(body,currentJudgmentSearchQuery);
  const countEl=document.getElementById('judgmentSearchCount');
  if(countEl)countEl.textContent=currentJudgmentSearchQuery?`${ar(count)} نتيجة`:'اكتب للبحث داخل الحكم';
  document.querySelectorAll('#judgmentSearchPanel button').forEach(button=>{button.disabled=!count;});
  return count;
}
function focusJudgmentSearchMatch(index=0){
  const matches=[...document.querySelectorAll('.judgment-search-hit')];
  matches.forEach(item=>item.classList.remove('active'));
  if(!matches.length)return;
  currentJudgmentMatchIndex=((index%matches.length)+matches.length)%matches.length;
  const active=matches[currentJudgmentMatchIndex];
  active.classList.add('active');
  active.scrollIntoView({block:'center',behavior:'smooth'});
}
function renderCurrentJudgmentReader(){
  const shell=document.getElementById('judgmentReaderShell');
  if(!shell||!currentReaderDoc)return;
  shell.outerHTML=formatJudgmentBody(currentReaderDoc.body,currentReaderDoc,currentJudgmentSearchQuery);
  const count=updateJudgmentSearchPanelState();
  if(count)focusJudgmentSearchMatch(currentJudgmentMatchIndex);
}
function updateJudgmentSearchFromInput(){
  currentJudgmentSearchQuery=document.getElementById('judgmentSearchInput')?.value.trim()||'';
  currentJudgmentMatchIndex=0;
  renderCurrentJudgmentReader();
}
function jumpJudgmentSearchMatch(step=1){
  const matches=[...document.querySelectorAll('.judgment-search-hit')];
  if(!matches.length)return;
  focusJudgmentSearchMatch(currentJudgmentMatchIndex+Number(step||1));
}
function renderWorkbenchPanel(id){
  const entry=getWorkbenchEntry(id);
  const tags=(entry.tags||[]).join(', ');
  const highlights=entry.highlights?.length?entry.highlights.map((item,index)=>`
    <div class="highlight-item">
      <p>${escapeHtml(item.text)}</p>
      <button class="workbench-icon danger" type="button" data-highlight-delete="${index}" aria-label="حذف الاقتباس"><i class="ti ti-trash"></i></button>
    </div>`).join(''):'<div class="highlight-empty">لا توجد اقتباسات محفوظة لهذا الحكم بعد.</div>';
  return `<section class="judgment-workbench" id="judgmentWorkbenchPanel">
    <div class="workbench-head">
      <div><strong>ملف العمل على الحكم</strong><span>وسوم، ملاحظات، واقتباسات محفوظة محليًا على هذا الجهاز.</span></div>
      <button class="tool-secondary" type="button" onclick="saveWorkbenchFromModal()"><i class="ti ti-device-floppy"></i>حفظ</button>
    </div>
    <div class="workbench-grid">
      <label class="field"><span>وسوم البحث</span><input id="workbenchTagsInput" type="text" value="${escapeHtml(tags)}" placeholder="مثال: تعويض، عقد، إثبات"></label>
      <label class="field wide"><span>ملاحظة داخلية</span><textarea id="workbenchNoteInput" rows="4" placeholder="اكتب ملاحظتك القانونية أو سبب أهمية الحكم...">${escapeHtml(entry.note||'')}</textarea></label>
      <label class="field wide"><span>اقتباس أو مبدأ مهم</span><input id="highlightTextInput" type="text" placeholder="الصق فقرة مهمة من الحكم ثم اضغط إضافة اقتباس"></label>
    </div>
    <div class="workbench-actions">
      <button class="tool-secondary" type="button" onclick="addHighlightFromModal()"><i class="ti ti-quote"></i>إضافة اقتباس</button>
      <button class="tool-primary" type="button" onclick="saveWorkbenchFromModal()"><i class="ti ti-tags"></i>حفظ الوسوم والملاحظة</button>
    </div>
    <div class="highlight-list">${highlights}</div>
  </section>`;
}
function refreshWorkbenchPanel(){
  const panel=document.getElementById('judgmentWorkbenchPanel');
  if(panel&&currentDocId!==null)panel.outerHTML=renderWorkbenchPanel(currentDocId);
}
function renderLawMarkdown(markdown){
  const lines=String(markdown||'').replace(/\r/g,'').split('\n');
  let html='';
  let paragraph=[];
  let openArticle=false;
  let skippingComment=false;
  const flushParagraph=()=>{
    const text=paragraph.join(' ').replace(/\s+/g,' ').trim();
    if(text)html+=`<p>${formatInlineMarkdown(text)}</p>`;
    paragraph=[];
  };
  const closeArticle=()=>{
    flushParagraph();
    if(openArticle){
      html+='</article>';
      openArticle=false;
    }
  };
  for(const rawLine of lines){
    const line=rawLine.trim();
    if(skippingComment){
      if(line.includes('-->'))skippingComment=false;
      continue;
    }
    if(line.startsWith('<!--')){
      const page=line.match(/صفحة\s+(\d+)/);
      flushParagraph();
      if(page)html+=`<div class="law-page-marker">صفحة ${ar(Number(page[1]))}</div>`;
      if(!line.includes('-->'))skippingComment=true;
      continue;
    }
    if(!line){
      flushParagraph();
      continue;
    }
    if(line.startsWith('>')){
      flushParagraph();
      html+=`<div class="law-source-note">${formatInlineMarkdown(line.replace(/^>\s?/,''))}</div>`;
      continue;
    }
    const heading=line.match(/^(#{1,4})\s+(.+)$/);
    if(heading){
      const level=heading[1].length;
      const text=heading[2].trim();
      if(level===4&&text.startsWith('المادة')){
        closeArticle();
        openArticle=true;
        html+=`<article class="law-article"><div class="law-article-head"><span>${escapeHtml(text)}</span></div>`;
      }else{
        closeArticle();
        const cls=level===1?'law-title-main':level===2?'law-heading-two':'law-heading-three';
        html+=`<h${Math.min(level+1,4)} class="${cls}">${escapeHtml(text)}</h${Math.min(level+1,4)}>`;
      }
      continue;
    }
    if(line.startsWith('- ')){
      flushParagraph();
      html+=`<p class="law-bullet"><span></span>${formatInlineMarkdown(line.slice(2).trim())}</p>`;
      continue;
    }
    paragraph.push(line);
  }
  closeArticle();
  return html;
}
function renderLawReader(law){
  return `<div class="law-reader">
    <section class="law-reader-cover">
      <div class="law-reader-mark"><i class="ti ti-file-certificate"></i></div>
      <div>
        <div class="law-reader-label">${escapeHtml(law.legislation||law.category||'تشريع')}</div>
        <h1>${escapeHtml(law.title)}</h1>
        <p>${escapeHtml(law.subtitle||'')}</p>
      </div>
    </section>
    <section class="law-reader-meta">
      ${lawStat(law.status||'ساري','الحالة','ti-circle-check')}
      ${lawStat(law.updated||'غير محدد','آخر تحديث','ti-calendar-event')}
      ${lawStat(ar(law.articleCount||0),'مادة','ti-list-numbers')}
      ${lawStat(ar(law.pageCount||0),'صفحة','ti-file-text')}
    </section>
    <section class="law-reader-body">${renderLawMarkdown(law.body)}</section>
  </div>`;
}
function loadSavedJudgments(){
  try{
    const saved=JSON.parse(localStorage.getItem(savedStorageKey)||'[]');
    return new Set(Array.isArray(saved)?saved.map(Number).filter(Number.isFinite):[]);
  }catch(_){
    return new Set();
  }
}
function saveSavedJudgments(){
  try{
    localStorage.setItem(savedStorageKey,JSON.stringify([...savedJudgmentIds]));
    return true;
  }catch(_){
    return false;
  }
}
function isSaved(id){return savedJudgmentIds.has(Number(id))}
function loadJudgmentWorkbench(){
  try{
    const saved=JSON.parse(localStorage.getItem(workbenchStorageKey)||'{}');
    if(!saved||typeof saved!=='object'||Array.isArray(saved))return {};
    return Object.fromEntries(Object.entries(saved).map(([id,entry])=>[String(id),{
      tags:Array.isArray(entry.tags)?entry.tags.map(tag=>String(tag).trim()).filter(Boolean):[],
      note:String(entry.note||''),
      highlights:Array.isArray(entry.highlights)?entry.highlights
        .filter(item=>item&&item.text)
        .map(item=>({text:String(item.text).trim(),createdAt:item.createdAt||new Date().toISOString()})):[],
      updated:entry.updated||''
    }]));
  }catch(_){
    return {};
  }
}
function saveJudgmentWorkbench(){
  try{
    localStorage.setItem(workbenchStorageKey,JSON.stringify(judgmentWorkbench));
    return true;
  }catch(_){
    return false;
  }
}
function loadLocalJudgments(){
  try{
    const saved=JSON.parse(localStorage.getItem(localJudgmentsStorageKey)||'[]');
    if(!Array.isArray(saved))return [];
    return saved
      .filter(item=>item&&item.id&&item.title)
      .map(item=>({
        ...item,
        id:Number(item.id),
        type:typeKeys.includes(item.type)?item.type:'tijari',
        court:item.court||'غير محدد',
        date:item.date||'غير محدد',
        num:item.num||'',
        body:item.body||''
      }));
  }catch(_){
    return [];
  }
}
function saveLocalJudgmentsToStorage(){
  try{
    localStorage.setItem(localJudgmentsStorageKey,JSON.stringify(localJudgments));
    return true;
  }catch(_){
    return false;
  }
}
function loadFeeItems(){
  try{
    const saved=JSON.parse(localStorage.getItem(feeStorageKey)||'[]');
    return Array.isArray(saved)?saved.filter(item=>item&&item.id&&item.title):[];
  }catch(_){
    return [];
  }
}
function saveFeeItems(){
  try{
    localStorage.setItem(feeStorageKey,JSON.stringify(feeItems));
    return true;
  }catch(_){
    return false;
  }
}
function loadClientProfiles(){
  try{
    const saved=JSON.parse(localStorage.getItem(clientStorageKey)||'[]');
    if(!Array.isArray(saved))return [];
    return saved
      .filter(client=>client&&client.id&&client.name)
      .map(client=>({
        id:String(client.id),
        name:String(client.name||'').trim(),
        email:String(client.email||(String(client.contact||'').includes('@')?client.contact:'')).trim(),
        phone:String(client.phone||(String(client.contact||'').includes('@')?'':client.contact)).trim(),
        contact:String(client.contact||'').trim(),
        createdAt:client.createdAt||new Date().toISOString(),
        services:Array.isArray(client.services)?client.services
          .filter(service=>service&&service.id)
          .map(service=>({
            id:String(service.id),
            type:String(service.type||'General service').trim(),
            title:String(service.title||service.type||'Service').trim(),
            amount:Math.max(0,Number(service.amount)||0),
            paid:Math.max(0,Number(service.paid)||0),
            note:String(service.note||'').trim(),
            updated:service.updated||new Date().toISOString()
          })):[]
      }));
  }catch(_){
    return [];
  }
}
function saveClientProfiles(){
  try{
    localStorage.setItem(clientStorageKey,JSON.stringify(clientProfiles));
    return true;
  }catch(_){
    return false;
  }
}
function loadSanadSettings(){
  const defaults={readerSize:'normal',compactCards:false,inkMode:false};
  try{
    const saved=JSON.parse(localStorage.getItem(settingsStorageKey)||'{}');
    return {...defaults,...saved};
  }catch(_){
    return defaults;
  }
}
function saveSanadSettings(){
  try{
    localStorage.setItem(settingsStorageKey,JSON.stringify(sanadSettings));
    return true;
  }catch(_){
    return false;
  }
}
function loadProtectionSettings(){
  try{
    const saved=JSON.parse(localStorage.getItem(protectionStorageKey)||'{}');
    return saved&&typeof saved==='object'?{enabled:!!saved.enabled,passcodeHash:String(saved.passcodeHash||'')}: {enabled:false,passcodeHash:''};
  }catch(_){
    return {enabled:false,passcodeHash:''};
  }
}
function saveProtectionSettings(){
  try{
    localStorage.setItem(protectionStorageKey,JSON.stringify(protectionSettings));
    return true;
  }catch(_){
    return false;
  }
}
async function hashText(value){
  const text=String(value||'');
  if(window.crypto?.subtle){
    const bytes=new TextEncoder().encode(text);
    const digest=await crypto.subtle.digest('SHA-256',bytes);
    return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
  }
  return btoa(unescape(encodeURIComponent(text)));
}
function setLockVisible(visible){
  const modal=document.getElementById('appLockModal');
  if(!modal)return;
  modal.classList.toggle('hidden',!visible);
  modal.setAttribute('aria-hidden',visible?'false':'true');
  document.body.classList.toggle('locked-app',visible);
  if(visible)setTimeout(()=>document.getElementById('appUnlockInput')?.focus(),100);
}
function enforceProtection(){
  if(protectionSettings.enabled&&protectionSettings.passcodeHash&&sessionStorage.getItem('sanadUnlocked')!=='true'){
    setLockVisible(true);
  }
}
async function unlockProtectedApp(){
  const input=document.getElementById('appUnlockInput');
  const value=input?.value||'';
  if(!value){
    showToast('Enter the passcode first.');
    return;
  }
  const hash=await hashText(value);
  if(hash!==protectionSettings.passcodeHash){
    showToast('Wrong passcode.');
    return;
  }
  sessionStorage.setItem('sanadUnlocked','true');
  if(input)input.value='';
  setLockVisible(false);
  showToast('SANAD unlocked.');
}
async function setProtectionPasscode(){
  const input=document.getElementById('protectionPasscodeInput');
  const value=input?.value||'';
  if(value.length<4){
    showToast('Use at least 4 characters for the passcode.');
    return;
  }
  protectionSettings={enabled:true,passcodeHash:await hashText(value)};
  saveProtectionSettings();
  sessionStorage.setItem('sanadUnlocked','true');
  if(input)input.value='';
  showToast('Local app passcode enabled.');
}
async function clearProtectionPasscode(){
  if(protectionSettings.enabled){
    const ok=await confirmAction({
      title:'Remove app passcode?',
      message:'This will remove the local passcode lock from this device. Your stored data will remain on the device.',
      confirmLabel:'Remove passcode',
      icon:'ti-lock-off'
    });
    if(!ok)return;
  }
  protectionSettings={enabled:false,passcodeHash:''};
  sessionStorage.removeItem('sanadUnlocked');
  saveProtectionSettings();
  showToast('Local app passcode removed.');
}
function money(value){
  const number=Number(value)||0;
  return `${new Intl.NumberFormat('ar-AE',{maximumFractionDigits:2}).format(number)} درهم`;
}
function moneyEn(value){
  const number=Number(value)||0;
  return `${new Intl.NumberFormat('en-AE',{maximumFractionDigits:2}).format(number)} AED`;
}
function scriptLoad(src){
  return new Promise((resolve,reject)=>{
    const existing=document.querySelector(`script[data-dynamic-src="${src}"]`);
    if(existing){
      existing.addEventListener('load',resolve,{once:true});
      existing.addEventListener('error',reject,{once:true});
      if(existing.dataset.loaded==='true')resolve();
      return;
    }
    const script=document.createElement('script');
    script.src=src;
    script.async=true;
    script.dataset.dynamicSrc=src;
    script.onload=()=>{script.dataset.loaded='true';resolve();};
    script.onerror=()=>reject(new Error(`Unable to load ${src}`));
    document.head.appendChild(script);
  });
}
async function loadJudgmentChunk(chunkId){
  if(!chunkId)return false;
  if(loadedJudgmentChunks.has(chunkId)||window.SANAD_DATA?.judgmentChunks?.[chunkId]){
    loadedJudgmentChunks.add(chunkId);
    return true;
  }
  if(!pendingChunkLoads[chunkId]){
    const src=judgmentCatalog.chunks?.[chunkId];
    pendingChunkLoads[chunkId]=src?scriptLoad(new URL(src,location.href).href).then(()=>{
      loadedJudgmentChunks.add(chunkId);
      return true;
    }).catch(error=>{
      console.error(error);
      return false;
    }):Promise.resolve(false);
  }
  return pendingChunkLoads[chunkId];
}
async function getFullJudgment(id){
  const numericId=Number(id);
  const local=localJudgments.find(item=>Number(item.id)===numericId);
  if(local)return local;
  const indexed=baseDocs.find(item=>Number(item.id)===numericId);
  if(!indexed)return docs.find(item=>Number(item.id)===numericId);
  if(indexed.body)return indexed;
  await loadJudgmentChunk(indexed.chunk);
  const chunkDocs=window.SANAD_DATA?.judgmentChunks?.[indexed.chunk]||[];
  return chunkDocs.find(item=>Number(item.id)===numericId)||indexed;
}
function applySettings(){
  document.body.classList.toggle('reader-large',sanadSettings.readerSize==='large');
  document.body.classList.toggle('reader-xlarge',sanadSettings.readerSize==='xlarge');
  document.body.classList.toggle('compact-cards',!!sanadSettings.compactCards);
  document.body.classList.toggle('ink-mode',!!sanadSettings.inkMode);
  document.documentElement.classList.toggle('ink-mode',!!sanadSettings.inkMode);
  syncInkButton();
}
function syncSettingsControls(){
  const reader=document.getElementById('readerSizeSelect');
  const compact=document.getElementById('compactCardsToggle');
  const ink=document.getElementById('inkModeToggle');
  if(reader)reader.value=sanadSettings.readerSize||'normal';
  if(compact)compact.checked=!!sanadSettings.compactCards;
  if(ink)ink.checked=!!sanadSettings.inkMode;
}
function syncInkButton(){
  const btn=document.getElementById('inkModeBtn');
  if(!btn)return;
  const active=!!sanadSettings.inkMode;
  btn.classList.toggle('active',active);
  btn.setAttribute('aria-pressed',active?'true':'false');
}
function toggleInkMode(){
  sanadSettings={...sanadSettings,inkMode:!sanadSettings.inkMode};
  applySettings();
  syncSettingsControls();
  saveSanadSettings();
  showToast(sanadSettings.inkMode?'تم تفعيل وضع Ink.':'تم إيقاف وضع Ink.');
}
function isMobileSidebar(){return window.matchMedia('(max-width: 900px)').matches}
function isStandaloneApp(){return window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true}
function isIOSDevice(){return /iphone|ipad|ipod/i.test(navigator.userAgent)}
function updateInstallButton(){
  const btn=document.getElementById('installAppBtn');
  if(!btn)return;
  const canShow=!isStandaloneApp()&&(deferredInstallPrompt||isIOSDevice()||isMobileSidebar());
  btn.classList.toggle('hidden',!canShow);
}
async function installApp(){
  if(deferredInstallPrompt){
    deferredInstallPrompt.prompt();
    const choice=await deferredInstallPrompt.userChoice;
    deferredInstallPrompt=null;
    updateInstallButton();
    if(choice.outcome==='accepted')showToast('تم تثبيت تطبيق سند.');
    return;
  }
  showToast(isIOSDevice()?'من سفاري: مشاركة ثم إضافة إلى الشاشة الرئيسية.':'من قائمة المتصفح اختر إضافة إلى الشاشة الرئيسية.');
}
function syncSidebarToggle(){
  const btn=document.getElementById('menuToggle');
  if(!btn)return;
  const expanded=isMobileSidebar()?document.body.classList.contains('sidebar-open'):!document.body.classList.contains('sidebar-collapsed');
  btn.setAttribute('aria-expanded',expanded?'true':'false');
  btn.setAttribute('aria-label',expanded?'إغلاق القائمة':'فتح القائمة');
  const icon=btn.querySelector('i');
  if(icon)icon.className=`ti ${expanded?'ti-x':'ti-menu-2'}`;
}
function toggleSidebar(){
  if(isMobileSidebar()){
    document.body.classList.toggle('sidebar-open');
  }else{
    document.body.classList.toggle('sidebar-collapsed');
  }
  syncSidebarToggle();
}
function closeSidebar(){
  document.body.classList.remove('sidebar-open');
  syncSidebarToggle();
}
let toastTimer;
function showToast(message){
  const toast=document.getElementById('toast');
  if(!toast)return;
  toast.textContent=message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>toast.classList.remove('show'),2600);
}
let confirmResolver=null;
function confirmAction({title='Confirm delete',message='Are you sure you want to delete this item?',confirmLabel='Delete',cancelLabel='Cancel',icon='ti-trash'}={}){
  const modal=document.getElementById('confirmModal');
  if(!modal){
    showToast('Confirmation dialog is not available.');
    return Promise.resolve(false);
  }
  const titleEl=document.getElementById('confirmTitle');
  const messageEl=document.getElementById('confirmMessage');
  const accept=document.getElementById('confirmAcceptBtn');
  const cancel=document.getElementById('confirmCancelBtn');
  const iconEl=modal.querySelector('.confirm-icon i');
  if(titleEl)titleEl.textContent=title;
  if(messageEl)messageEl.textContent=message;
  if(accept)accept.innerHTML=`<i class="ti ${escapeHtml(icon)}"></i>${escapeHtml(confirmLabel)}`;
  if(cancel)cancel.innerHTML='<i class="ti ti-x"></i>'+escapeHtml(cancelLabel);
  if(iconEl)iconEl.className=`ti ${icon}`;
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden','false');
  document.body.classList.add('modal-open');
  return new Promise(resolve=>{
    confirmResolver=resolve;
    setTimeout(()=>cancel?.focus(),80);
  });
}
function closeConfirm(result=false){
  const modal=document.getElementById('confirmModal');
  if(modal){
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden','true');
  }
  if(document.getElementById('docModal')?.classList.contains('hidden'))document.body.classList.remove('modal-open');
  const resolver=confirmResolver;
  confirmResolver=null;
  if(resolver)resolver(!!result);
}
function setActiveNav(el){
  document.querySelectorAll('.ni').forEach(item=>item.classList.remove('on'));
  if(el)el.classList.add('on');
  updateDisplayedCounts();
}
function setRouteHash(hash){
  const target=window.location.pathname+window.location.search+hash;
  if(window.location.pathname+window.location.search+window.location.hash!==target){
    history.replaceState(null,'',target);
  }
}
function activateNavByAction(action){
  const link=document.querySelector(`.sidebar a[onclick*="'${action}'"]`);
  setActiveNav(link);
}
function scrollPageTo(selector){
  const page=document.querySelector('.page');
  const target=document.querySelector(selector);
  if(!page||!target)return;
  page.scrollTo({top:Math.max(target.offsetTop-14,0),behavior:'smooth'});
}
function setCatalogHeader(title,subtitle,icon){
  const heroTitle=document.querySelector('.hero-title');
  const heroSub=document.querySelector('.hero-sub');
  const heroIcon=document.querySelector('.hero-icon i');
  const crumb=document.querySelector('.breadcrumb .cur');
  if(heroTitle)heroTitle.textContent=title;
  if(heroSub)heroSub.textContent=subtitle;
  if(heroIcon)heroIcon.className=`ti ${icon}`;
  if(crumb)crumb.textContent=title;
}
function setHeroStats(items){
  document.querySelectorAll('.hero-stats .hstat').forEach((stat,index)=>{
    const item=items[index];
    if(!item)return;
    const num=stat.querySelector('.hstat-num');
    const label=stat.querySelector('.hstat-lbl');
    if(num)num.textContent=item.value;
    if(label)label.textContent=item.label;
  });
}
function setDefaultHeroStats(){
  setHeroStats([
    {value:ar(counts.all),label:'حكم'},
    {value:ar(typeKeys.length),label:'تخصص'},
    {value:ar(18),label:'هذا الشهر'}
  ]);
}
function setAiAnalysisVisible(visible){
  document.getElementById('aiAnalysis')?.classList.toggle('hidden',!visible);
}
function setFeesVisible(visible){
  document.getElementById('feesManager')?.classList.toggle('hidden',!visible);
}
function setClientsVisible(visible){
  document.getElementById('clientsPage')?.classList.toggle('hidden',!visible);
}
function setSettingsVisible(visible){
  document.getElementById('settingsPage')?.classList.toggle('hidden',!visible);
}
function setDashboardVisible(visible){
  document.getElementById('dashboardPage')?.classList.toggle('hidden',!visible);
}
function setCollectionVisible(visible){
  document.getElementById('collectionPage')?.classList.toggle('hidden',!visible);
}
function setImportVisible(visible){
  document.getElementById('importPage')?.classList.toggle('hidden',!visible);
}
function hideStandalonePages(){
  document.getElementById('sectionEmpty')?.classList.add('hidden');
  document.getElementById('lawCatalog')?.classList.add('hidden');
  setDashboardVisible(false);
  setCollectionVisible(false);
  setImportVisible(false);
  setAiAnalysisVisible(false);
  setClientsVisible(false);
  setFeesVisible(false);
  setSettingsVisible(false);
}
function setJudgmentWorkspaceVisible(visible){
  ['.type-cards','.search-bar','.results-bar','#docGrid','#paginationBar'].forEach(selector=>{
    const el=document.querySelector(selector);
    if(el)el.classList.toggle('hidden',!visible);
  });
  if(!visible)document.getElementById('noResults')?.classList.add('hidden');
}
function restoreJudgmentCatalog(hash='#judgments'){
  setRouteHash(hash);
  document.querySelector('.page')?.classList.remove('empty-mode','ai-mode');
  hideStandalonePages();
  setCatalogHeader(defaultCatalog.title,defaultCatalog.subtitle,defaultCatalog.icon);
  setDefaultHeroStats();
  setJudgmentWorkspaceVisible(true);
}
function showEmptyCatalog(title,message,icon){
  const section=document.getElementById('sectionEmpty');
  document.querySelector('.page')?.classList.remove('ai-mode');
  document.querySelector('.page')?.classList.add('empty-mode');
  hideStandalonePages();
  setCatalogHeader(title,message,icon);
  setJudgmentWorkspaceVisible(false);
  if(section){
    section.querySelector('.section-empty-icon i').className=`ti ${icon}`;
    section.querySelector('h2').textContent=title;
    section.querySelector('p').textContent=message;
    section.classList.remove('hidden');
  }
  scrollPageTo('#sectionEmpty');
}
function renderDashboard(){
  const total=document.getElementById('dashboardTotalCount');
  const stats=document.getElementById('dashboardStats');
  const recent=document.getElementById('dashboardRecent');
  if(total)total.textContent=ar(counts.all+laws.length+legalForms.length);
  if(stats){
    const items=[
      ['أحكام قضائية',counts.all,'ti-gavel'],
      ['قوانين',laws.length,'ti-file-certificate'],
      ['مراسيم',0,'ti-stamp'],
      ['لوائح',0,'ti-clipboard-list'],
      ['عقود نموذجية',legalForms.length,'ti-writing'],
      ['محفوظة',savedJudgmentIds.size,'ti-bookmark']
    ];
    stats.innerHTML=items.map(([label,value,icon])=>`
      <div class="dashboard-stat"><i class="ti ${icon}"></i><span>${escapeHtml(label)}</span><strong>${ar(value)}</strong></div>
    `).join('');
  }
  if(recent){
    const recentDocs=sortDocuments(docs,'newest').slice(0,5);
    recent.innerHTML=recentDocs.length?recentDocs.map(doc=>`
      <button class="dashboard-recent-item" type="button" data-doc-id="${Number(doc.id)}">
        <span>${escapeHtml(displayDocTitle(doc))}</span>
        <small>${escapeHtml(doc.court||'غير محدد')}</small>
      </button>
    `).join(''):'<div class="tool-empty"><i class="ti ti-file-off"></i><p>لا توجد أحكام بعد.</p></div>';
  }
}
function showDashboardPage(){
  setRouteHash('#dashboard');
  currentView='dashboard';
  currentType='all';
  document.querySelector('.page')?.classList.remove('empty-mode','ai-mode');
  hideStandalonePages();
  setJudgmentWorkspaceVisible(false);
  setDashboardVisible(true);
  setCatalogHeader('لوحة التحكم','نظرة سريعة على محتوى سند وروابط تشغيل الصفحات والخدمات الأساسية.','ti-layout-dashboard');
  setHeroStats([
    {value:ar(counts.all),label:'حكم'},
    {value:ar(laws.length),label:'قانون'},
    {value:ar(savedJudgmentIds.size),label:'محفوظ'}
  ]);
  renderDashboard();
  scrollPageTo('#dashboardPage');
}
function collectionItems(kind){
  if(kind==='contracts')return legalForms;
  return [];
}
function renderCollectionItems(kind,items){
  const list=document.getElementById('collectionList');
  const empty=document.getElementById('collectionEmpty');
  const emptyText=document.getElementById('collectionEmptyText');
  const config=collections[kind];
  if(!list||!config)return;
  if(!items.length){
    list.innerHTML='';
    if(emptyText)emptyText.textContent=config.empty;
    empty?.classList.remove('hidden');
    return;
  }
  empty?.classList.add('hidden');
  list.innerHTML=items.map(item=>`
    <button class="collection-card" type="button">
      <div class="collection-card-icon"><i class="ti ${config.icon}"></i></div>
      <div>
        <h3>${escapeHtml(item.title||config.label)}</h3>
        <p>${escapeHtml(item.subtitle||item.description||'')}</p>
      </div>
      <i class="ti ti-chevron-left"></i>
    </button>
  `).join('');
}
function showCollectionPage(kind){
  const config=collections[kind];
  if(!config)return;
  const items=collectionItems(kind);
  setRouteHash(`#${kind}`);
  currentView=kind;
  currentType='all';
  document.querySelector('.page')?.classList.remove('empty-mode','ai-mode');
  hideStandalonePages();
  setJudgmentWorkspaceVisible(false);
  setCollectionVisible(true);
  setCatalogHeader(config.title,config.subtitle,config.icon);
  setHeroStats([
    {value:ar(items.length),label:config.label},
    {value:'جاهز',label:'الصفحة'},
    {value:'محلي',label:'البنية'}
  ]);
  const title=document.getElementById('collectionTitle');
  const subtitle=document.getElementById('collectionSubtitle');
  const count=document.getElementById('collectionCount');
  const label=document.getElementById('collectionCountLabel');
  if(title)title.textContent=config.title;
  if(subtitle)subtitle.textContent=config.subtitle;
  if(count)count.textContent=ar(items.length);
  if(label)label.textContent=config.label;
  renderCollectionItems(kind,items);
  scrollPageTo('#collectionPage');
}
function renderLaws(list){
  const lawList=document.getElementById('lawList');
  const lawEmpty=document.getElementById('lawNoResults');
  const lawCount=document.getElementById('lawShownCount');
  if(!lawList)return;
  if(lawCount)lawCount.textContent=ar(list.length);
  if(!list.length){
    lawList.innerHTML='';
    lawEmpty?.classList.remove('hidden');
    return;
  }
  lawEmpty?.classList.add('hidden');
  lawList.innerHTML=list.map(law=>`
    <button class="law-card" type="button" data-law-id="${escapeHtml(law.id)}" aria-label="فتح ${escapeHtml(law.title)}">
      <div class="law-card-mark"><i class="ti ti-file-certificate"></i></div>
      <div class="law-card-body">
        <div class="law-card-top">
          <span>${escapeHtml(law.category||'قانون')}</span>
          <span>${escapeHtml(law.status||'ساري')}</span>
        </div>
        <h3>${escapeHtml(law.title)}</h3>
        <p>${escapeHtml(law.subtitle||law.legislation||'')}</p>
        <div class="law-card-stats">
          ${lawStat(ar(law.articleCount||0),'مادة','ti-list-numbers')}
          ${lawStat(ar(law.pageCount||0),'صفحة','ti-file-text')}
          ${lawStat(law.updated||'غير محدد','آخر تحديث','ti-calendar-event')}
        </div>
      </div>
      <div class="law-card-open"><i class="ti ti-chevron-left"></i></div>
    </button>`).join('');
}
function showLawCatalog(){
  setRouteHash('#laws');
  if(!laws.length){
    showEmptyCatalog('قوانين','لم يتم رفع قوانين بعد.','ti-file-certificate');
    return;
  }
  const articleTotal=laws.reduce((sum,law)=>sum+(law.articleCount||0),0);
  currentView='laws';
  document.querySelector('.page')?.classList.remove('empty-mode','ai-mode');
  hideStandalonePages();
  setJudgmentWorkspaceVisible(false);
  setCatalogHeader('قوانين','تصفح القوانين والتشريعات المحفوظة في سند بنص كامل ومنظم للقراءة والبحث.','ti-file-certificate');
  setHeroStats([
    {value:ar(laws.length),label:'قانون'},
    {value:ar(articleTotal),label:'مادة'},
    {value:laws[0]?.status||'ساري',label:'الحالة'}
  ]);
  document.getElementById('lawCatalog')?.classList.remove('hidden');
  document.getElementById('lawSearchInput').value='';
  renderLaws(laws);
  scrollPageTo('#lawCatalog');
}
function showAiAnalysisPage(){
  setRouteHash('#aiAnalysis');
  currentView='aiAnalysis';
  currentType='all';
  document.querySelector('.page')?.classList.remove('empty-mode');
  document.querySelector('.page')?.classList.add('ai-mode');
  hideStandalonePages();
  setJudgmentWorkspaceVisible(false);
  setAiAnalysisVisible(true);
  setCatalogHeader('المحلل القانوني الذكي','صف وقائع قضيتك ليقترح لك المواد القانونية والسوابق القضائية ونقاط الدفاع المحتملة.','ti-brain');
  setHeroStats([
    {value:ar(laws.length),label:'قانون'},
    {value:ar(counts.all),label:'حكم'},
    {value:'ذكي',label:'تحليل'}
  ]);
  scrollPageTo('#aiAnalysis');
  setTimeout(()=>document.getElementById('caseInput')?.focus(),260);
}
function renderFees(){
  const list=document.getElementById('feeList');
  const empty=document.getElementById('feeEmpty');
  const count=document.getElementById('feeItemCount');
  if(count)count.textContent=ar(feeItems.length);
  const navCount=document.querySelector('.fee-ct');
  if(navCount)navCount.textContent=ar(feeItems.length);
  if(!list)return;
  if(!feeItems.length){
    list.innerHTML='';
    empty?.classList.remove('hidden');
    return;
  }
  empty?.classList.add('hidden');
  list.innerHTML=feeItems.map(item=>`
    <div class="fee-item" data-fee-id="${escapeHtml(item.id)}">
      <div class="fee-item-main">
        <div class="fee-item-top">
          <span>${escapeHtml(item.category||'عام')}</span>
          <strong>${money(item.amount)}</strong>
        </div>
        <h3>${escapeHtml(item.title)}</h3>
        ${item.note?`<p>${escapeHtml(item.note)}</p>`:''}
      </div>
      <button class="fee-delete" type="button" data-fee-delete="${escapeHtml(item.id)}" aria-label="حذف الرسم"><i class="ti ti-trash"></i></button>
    </div>`).join('');
}
function newLocalId(prefix){
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
}
function readNumberInput(id){
  const value=Number(document.getElementById(id)?.value||0);
  return Math.max(0,Number.isFinite(value)?value:0);
}
function clientBalanceValue(amount,paid){
  return Math.max((Number(amount)||0)-(Number(paid)||0),0);
}
function syncClientBalanceInputs(scope=document){
  const mainAmount=document.getElementById('clientServiceAmountInput');
  const mainPaid=document.getElementById('clientServicePaidInput');
  const mainBalance=document.getElementById('clientServiceBalanceInput');
  if(mainBalance)mainBalance.value=moneyEn(clientBalanceValue(mainAmount?.value,mainPaid?.value));
  const serviceForms=[
    ...(scope.matches?.('.client-add-service')?[scope]:[]),
    ...(scope.querySelectorAll?.('.client-add-service')||[])
  ];
  serviceForms.forEach(details=>{
    const amount=details.querySelector('[data-service-field="amount"]')?.value||0;
    const paid=details.querySelector('[data-service-field="paid"]')?.value||0;
    const balance=details.querySelector('[data-service-field="balance"]');
    if(balance)balance.value=moneyEn(clientBalanceValue(amount,paid));
  });
}
function clientEditField({id,label,value='',type='text',wide=false,readonly=false,textarea=false,placeholder=''}) {
  const attrs=[
    `id="${escapeHtml(id)}"`,
    `placeholder="${escapeHtml(placeholder)}"`,
    readonly?'readonly':'',
    type==='number'?'min="0" step="0.01"':''
  ].filter(Boolean).join(' ');
  const control=textarea
    ?`<textarea ${attrs}>${escapeHtml(value)}</textarea>`
    :`<input type="${escapeHtml(type)}" value="${escapeHtml(value)}" ${attrs}>`;
  return `<label class="client-edit-field ${wide?'wide':''}"><span>${escapeHtml(label)}</span>${control}</label>`;
}
function setClientEditModalOpen(open){
  const modal=document.getElementById('clientEditModal');
  if(!modal)return;
  modal.classList.toggle('hidden',!open);
  modal.setAttribute('aria-hidden',open?'false':'true');
  document.body.classList.toggle('modal-open',open);
}
function syncClientEditBalance(){
  const balance=document.getElementById('clientEditServiceBalanceInput');
  if(!balance)return;
  const amount=document.getElementById('clientEditServiceAmountInput')?.value||0;
  const paid=document.getElementById('clientEditServicePaidInput')?.value||0;
  balance.value=moneyEn(clientBalanceValue(amount,paid));
}
function openClientEdit(clientId){
  const client=clientProfiles.find(item=>String(item.id)===String(clientId));
  const form=document.getElementById('clientEditForm');
  if(!client||!form)return;
  clientEditContext={type:'client',clientId:String(client.id)};
  const kicker=document.getElementById('clientEditKicker');
  const title=document.getElementById('clientEditTitle');
  if(kicker)kicker.textContent='Client profile';
  if(title)title.textContent='Edit client profile';
  form.innerHTML=[
    clientEditField({id:'clientEditNameInput',label:'Name',value:client.name,placeholder:'Client or company name',wide:true}),
    clientEditField({id:'clientEditEmailInput',label:'Email',type:'email',value:client.email,placeholder:'client@example.com'}),
    clientEditField({id:'clientEditPhoneInput',label:'Phone',type:'tel',value:client.phone,placeholder:'0525720490'})
  ].join('');
  setClientEditModalOpen(true);
  setTimeout(()=>document.getElementById('clientEditNameInput')?.focus(),80);
}
function openClientServiceEdit(clientId,serviceId){
  const client=clientProfiles.find(item=>String(item.id)===String(clientId));
  const service=client?.services?.find(item=>String(item.id)===String(serviceId));
  const form=document.getElementById('clientEditForm');
  if(!client||!service||!form)return;
  const balance=serviceBalance(service);
  clientEditContext={type:'service',clientId:String(client.id),serviceId:String(service.id)};
  const kicker=document.getElementById('clientEditKicker');
  const title=document.getElementById('clientEditTitle');
  if(kicker)kicker.textContent=client.name;
  if(title)title.textContent='Edit service details';
  form.innerHTML=[
    clientEditField({id:'clientEditServiceTypeInput',label:'Service type',value:service.type||service.title||'',placeholder:'Civil case, consultation, drafting...',wide:true}),
    clientEditField({id:'clientEditServiceAmountInput',label:'Total amount',type:'number',value:balance.amount}),
    clientEditField({id:'clientEditServicePaidInput',label:'Amount paid',type:'number',value:balance.paid}),
    clientEditField({id:'clientEditServiceBalanceInput',label:'Balance',value:moneyEn(balance.remaining),readonly:true}),
    clientEditField({id:'clientEditServiceNoteInput',label:'Notes',value:service.note||'',placeholder:'Internal service note',wide:true,textarea:true})
  ].join('');
  syncClientEditBalance();
  setClientEditModalOpen(true);
  setTimeout(()=>document.getElementById('clientEditServiceTypeInput')?.focus(),80);
}
function closeClientEdit(){
  clientEditContext=null;
  setClientEditModalOpen(false);
}
function saveClientEdit(){
  if(!clientEditContext)return;
  const client=clientProfiles.find(item=>String(item.id)===String(clientEditContext.clientId));
  if(!client)return;
  if(clientEditContext.type==='client'){
    const name=document.getElementById('clientEditNameInput')?.value.trim()||'';
    const email=document.getElementById('clientEditEmailInput')?.value.trim()||'';
    const phone=document.getElementById('clientEditPhoneInput')?.value.trim()||'';
    if(!name){
      showToast('Enter the client name first.');
      return;
    }
    client.name=name;
    client.email=email;
    client.phone=phone;
    client.contact=[email,phone].filter(Boolean).join(' | ');
    client.updated=new Date().toISOString();
    const persisted=saveClientProfiles();
    renderClientProfiles();
    updateSettingsStats();
    closeClientEdit();
    showToast(persisted?'Client profile updated.':'Client profile updated for this session only.');
    return;
  }
  const service=client.services?.find(item=>String(item.id)===String(clientEditContext.serviceId));
  if(!service)return;
  const type=document.getElementById('clientEditServiceTypeInput')?.value.trim()||'';
  const amount=Number(document.getElementById('clientEditServiceAmountInput')?.value||0);
  const paid=Number(document.getElementById('clientEditServicePaidInput')?.value||0);
  const note=document.getElementById('clientEditServiceNoteInput')?.value.trim()||'';
  if(!type&&!amount&&!paid&&!note){
    showToast('Enter service details first.');
    return;
  }
  const serviceType=type||'General service';
  service.type=serviceType;
  service.title=serviceType;
  service.amount=Math.max(0,Number.isFinite(amount)?amount:0);
  service.paid=Math.max(0,Number.isFinite(paid)?paid:0);
  service.note=note;
  service.updated=new Date().toISOString();
  expandedClientIds.add(String(client.id));
  const persisted=saveClientProfiles();
  renderClientProfiles();
  updateSettingsStats();
  closeClientEdit();
  showToast(persisted?'Service details updated.':'Service details updated for this session only.');
}
function createClientService({type,title,amount,paid,note}){
  const serviceType=String(type||'General service').trim()||'General service';
  const serviceTitle=String(title||serviceType).trim()||serviceType;
  return {
    id:newLocalId('service'),
    type:serviceType,
    title:serviceTitle,
    amount:Math.max(0,Number(amount)||0),
    paid:Math.max(0,Number(paid)||0),
    note:String(note||'').trim(),
    updated:new Date().toISOString()
  };
}
function serviceBalance(service){
  const amount=Math.max(0,Number(service?.amount)||0);
  const paid=Math.max(0,Number(service?.paid)||0);
  return {
    amount,
    paid,
    remaining:Math.max(amount-paid,0),
    overpaid:Math.max(paid-amount,0)
  };
}
function clientFinancialSummary(client){
  const services=Array.isArray(client?.services)?client.services:[];
  const totals=services.reduce((acc,service)=>{
    const balance=serviceBalance(service);
    acc.amount+=balance.amount;
    acc.paid+=balance.paid;
    acc.remaining+=balance.remaining;
    acc.overpaid+=balance.overpaid;
    return acc;
  },{amount:0,paid:0,remaining:0,overpaid:0});
  const status=!services.length?'empty':totals.remaining>0?'outstanding':totals.overpaid>0?'overpaid':'paid';
  return {...totals,status,serviceCount:services.length};
}
function clientStatusLabel(status){
  return {empty:'No services',outstanding:'Outstanding',overpaid:'Overpaid',paid:'Paid'}[status]||'Active';
}
function clientSearchText(client){
  return normalizeSearchText([
    client.name,client.email,client.phone,client.contact,
    ...(client.services||[]).flatMap(service=>[service.type,service.title,service.note,service.amount,service.paid])
  ].join(' '));
}
function filteredClientProfiles(){
  const query=normalizeSearchText(clientQuery).trim();
  return clientProfiles.filter(client=>{
    const summary=clientFinancialSummary(client);
    const matchesStatus=clientStatusFilter==='all'||summary.status===clientStatusFilter;
    const matchesQuery=!query||clientSearchText(client).includes(query);
    return matchesStatus&&matchesQuery;
  });
}
function filterClients(){
  clientQuery=document.getElementById('clientSearchInput')?.value||'';
  clientStatusFilter=document.getElementById('clientStatusFilter')?.value||'all';
  renderClientProfiles();
}
function clientContactHtml(client){
  const email=String(client.email||'').trim();
  const phone=String(client.phone||'').trim();
  const contact=String(client.contact||'').trim();
  const fallbackEmail=!email&&contact.includes('@')?contact:'';
  const fallbackPhone=!phone&&contact&&!contact.includes('@')?contact:'';
  const shownEmail=email||fallbackEmail||'No email saved';
  const shownPhone=phone||fallbackPhone||'No phone saved';
  return `<div class="client-contact-row">
    <span><i class="ti ti-mail"></i>${escapeHtml(shownEmail)}</span>
    <b></b>
    <span><i class="ti ti-phone"></i>${escapeHtml(shownPhone)}</span>
  </div>`;
}
function serviceIcon(type){
  const value=String(type||'').toLowerCase();
  if(/criminal|جنائي|crime|penal/.test(value))return 'ti-gavel';
  if(/civil|مدني|memorandum|court/.test(value))return 'ti-building-bank';
  if(/trade|commercial|corporate|company|تجاري/.test(value))return 'ti-briefcase';
  if(/trademark|brand|ip|intellectual/.test(value))return 'ti-certificate';
  return 'ti-scale';
}
function renderClientProfiles(){
  const list=document.getElementById('clientProfileList');
  const empty=document.getElementById('clientProfileEmpty');
  const count=document.getElementById('clientProfileCount');
  const pageCount=document.getElementById('clientPageCount');
  if(count)count.textContent=String(clientProfiles.length);
  if(pageCount)pageCount.textContent=String(clientProfiles.length);
  const navCount=document.querySelector('.client-ct');
  if(navCount)navCount.textContent=ar(clientProfiles.length);
  if(!list)return;
  const visibleClients=filteredClientProfiles();
  if(count)count.textContent=`${visibleClients.length}/${clientProfiles.length}`;
  if(!visibleClients.length){
    list.innerHTML='';
    empty?.classList.remove('hidden');
    if(empty)empty.querySelector('p').textContent=clientProfiles.length?'No clients match the current filter.':'No client profiles saved yet.';
    return;
  }
  empty?.classList.add('hidden');
  list.innerHTML=visibleClients.map(client=>{
    const services=Array.isArray(client.services)?client.services:[];
    const serviceTotal=services.length;
    const summary=clientFinancialSummary(client);
    const isOpen=expandedClientIds.has(String(client.id));
    const servicesHtml=services.length?services.map(service=>{
      const balance=serviceBalance(service);
      const balanceLabel=balance.overpaid>0?'Overpaid':'Balance';
      const balanceValue=balance.overpaid>0?balance.overpaid:balance.remaining;
      return `<div class="client-service" data-service-id="${escapeHtml(service.id)}">
        <div class="client-service-symbol"><i class="ti ${serviceIcon(service.type||service.title)}"></i></div>
        <div class="client-service-main">
          <span class="client-service-type"><em></em>${escapeHtml(service.type||'Service')}</span>
          <strong>${escapeHtml(service.title||service.type||'Service')}</strong>
          ${service.note?`<p>${escapeHtml(service.note)}</p>`:''}
        </div>
        <div class="client-service-money">
          <span><i class="ti ti-file-invoice"></i><small>Total</small><strong>${moneyEn(balance.amount)}</strong></span>
          <span><i class="ti ti-credit-card"></i><small>Paid</small><strong>${moneyEn(balance.paid)}</strong></span>
          <span><i class="ti ti-scale"></i><small>${balanceLabel}</small><strong>${moneyEn(balanceValue)}</strong></span>
        </div>
        <div class="client-service-actions">
          <button class="client-action" type="button" data-client-invoice="${escapeHtml(service.id)}"><i class="ti ti-file-invoice"></i>Use Invoice</button>
          <button class="client-action edit" type="button" data-client-service-edit="${escapeHtml(service.id)}"><i class="ti ti-pencil"></i>Edit</button>
          <button class="client-action danger" type="button" data-client-service-delete="${escapeHtml(service.id)}" aria-label="Delete service"><i class="ti ti-trash"></i></button>
        </div>
      </div>`;
    }).join(''):'<div class="client-service-empty">No services saved for this client yet.</div>';
    return `<article class="client-card ${isOpen?'open':'collapsed'}" data-client-id="${escapeHtml(client.id)}">
      <div class="client-card-head" data-client-toggle="${escapeHtml(client.id)}" role="button" tabindex="0" aria-expanded="${isOpen?'true':'false'}">
        <div class="client-avatar"><i class="ti ti-user"></i><small><i class="ti ti-scale"></i></small></div>
        <div class="client-identity">
          <span class="client-eyebrow">Client profile</span>
          <h3>${escapeHtml(client.name)}</h3>
          <div class="client-name-rule"></div>
          ${clientContactHtml(client)}
        </div>
        <div class="client-card-meta">
          <span><i class="ti ti-briefcase"></i>${serviceTotal} ${serviceTotal===1?'service':'services'}</span>
          <span class="client-status ${summary.status}"><i class="ti ti-circle-filled"></i>${clientStatusLabel(summary.status)}</span>
          <span><i class="ti ti-wallet"></i>${moneyEn(summary.remaining)}</span>
        </div>
        <button class="client-expand-toggle" type="button" data-client-toggle="${escapeHtml(client.id)}" aria-label="${isOpen?'Close client profile':'Open client profile'}"><i class="ti ${isOpen?'ti-chevron-up':'ti-chevron-down'}"></i></button>
        <button class="client-profile-edit" type="button" data-client-edit="${escapeHtml(client.id)}" aria-label="Edit client profile"><i class="ti ti-pencil"></i></button>
        <button class="client-profile-delete" type="button" data-client-delete="${escapeHtml(client.id)}" aria-label="Delete client"><i class="ti ti-trash"></i></button>
      </div>
      <div class="client-card-body">
        <div class="client-service-list">${servicesHtml}</div>
        <details class="client-add-service">
          <summary><span><i class="ti ti-plus"></i></span><strong>Add new service</strong></summary>
          <div class="client-service-form">
            <label><span>Service type</span><input data-service-field="type" type="text" placeholder="Case or service type"></label>
            <label><span>Total amount</span><input data-service-field="amount" type="number" min="0" step="0.01" placeholder="0"></label>
            <label><span>Amount paid</span><input data-service-field="paid" type="number" min="0" step="0.01" placeholder="0"></label>
            <label><span>Balance</span><input data-service-field="balance" type="text" value="0 AED" readonly></label>
            <label class="wide"><span>Notes</span><input data-service-field="note" type="text" placeholder="Internal service note"></label>
          </div>
          <button class="tool-secondary" type="button" data-client-add-service="${escapeHtml(client.id)}"><i class="ti ti-device-floppy"></i>Save service</button>
        </details>
      </div>
    </article>`;
  }).join('');
  syncClientBalanceInputs(list);
}
function toggleClientCard(clientId,force){
  const id=String(clientId);
  const shouldOpen=typeof force==='boolean'?force:!expandedClientIds.has(id);
  if(shouldOpen)expandedClientIds.add(id);
  else expandedClientIds.delete(id);
  renderClientProfiles();
}
function toggleClientForm(force){
  const composer=document.getElementById('clientProfileComposer');
  if(!composer)return;
  const shouldOpen=typeof force==='boolean'?force:composer.classList.contains('hidden');
  composer.classList.toggle('hidden',!shouldOpen);
  if(shouldOpen){
    syncClientBalanceInputs();
    setTimeout(()=>document.getElementById('clientNameInput')?.focus(),120);
  }
}
function clearClientProfileInputs(){
  ['clientNameInput','clientEmailInput','clientPhoneInput','clientContactInput','clientServiceTypeInput','clientServiceTitleInput','clientServiceAmountInput','clientServicePaidInput','clientServiceNoteInput'].forEach(id=>{
    const el=document.getElementById(id);
    if(el)el.value='';
  });
  syncClientBalanceInputs();
}
function addClientProfile(){
  const name=document.getElementById('clientNameInput')?.value.trim()||'';
  const email=document.getElementById('clientEmailInput')?.value.trim()||'';
  const phone=document.getElementById('clientPhoneInput')?.value.trim()||'';
  const contact=[email,phone].filter(Boolean).join(' | ')||document.getElementById('clientContactInput')?.value.trim()||'';
  const type=document.getElementById('clientServiceTypeInput')?.value.trim()||'';
  const title=document.getElementById('clientServiceTitleInput')?.value.trim()||'';
  const amount=readNumberInput('clientServiceAmountInput');
  const paid=readNumberInput('clientServicePaidInput');
  const note=document.getElementById('clientServiceNoteInput')?.value.trim()||'';
  if(!name){
    showToast('Enter the client name first.');
    return;
  }
  const hasService=!!(type||title||amount||paid||note);
  const newClient={
    id:newLocalId('client'),
    name,
    email,
    phone,
    contact,
    createdAt:new Date().toISOString(),
    services:hasService?[createClientService({type,title,amount,paid,note})]:[]
  };
  clientProfiles.unshift(newClient);
  expandedClientIds.add(String(newClient.id));
  const persisted=saveClientProfiles();
  clearClientProfileInputs();
  renderClientProfiles();
  updateSettingsStats();
  updateDisplayedCounts();
  toggleClientForm(false);
  showClientsPage();
  showToast(persisted?'Client profile saved.':'Client profile added for this session only.');
}
function findClientCard(clientId){
  return [...document.querySelectorAll('.client-card')].find(card=>card.dataset.clientId===String(clientId));
}
function addServiceToClient(clientId){
  const client=clientProfiles.find(item=>String(item.id)===String(clientId));
  const card=findClientCard(clientId);
  if(!client||!card)return;
  const fieldValue=name=>card.querySelector(`[data-service-field="${name}"]`)?.value.trim()||'';
  const amount=Number(card.querySelector('[data-service-field="amount"]')?.value||0);
  const paid=Number(card.querySelector('[data-service-field="paid"]')?.value||0);
  if(!fieldValue('type')&&!fieldValue('title')&&!amount&&!paid&&!fieldValue('note')){
    showToast('Add a service type, title, amount, or note first.');
    return;
  }
  const service=createClientService({
    type:fieldValue('type'),
    title:fieldValue('title'),
    amount:Number.isFinite(amount)?amount:0,
    paid:Number.isFinite(paid)?paid:0,
    note:fieldValue('note')
  });
  client.services=[service,...(Array.isArray(client.services)?client.services:[])];
  expandedClientIds.add(String(clientId));
  saveClientProfiles();
  renderClientProfiles();
  updateSettingsStats();
  showToast('Service added to client profile.');
}
async function deleteClientProfile(clientId){
  const ok=await confirmAction({
    title:'Delete client profile?',
    message:'Are you sure you want to delete this client profile and all services saved inside it? This cannot be undone.',
    confirmLabel:'Delete client'
  });
  if(!ok)return;
  expandedClientIds.delete(String(clientId));
  clientProfiles=clientProfiles.filter(client=>String(client.id)!==String(clientId));
  saveClientProfiles();
  renderClientProfiles();
  updateSettingsStats();
  updateDisplayedCounts();
  showClientsPage();
  showToast('Client profile deleted.');
}
async function deleteClientService(clientId,serviceId){
  const client=clientProfiles.find(item=>String(item.id)===String(clientId));
  if(!client)return;
  const ok=await confirmAction({
    title:'Delete service?',
    message:'Are you sure you want to delete this service and its financial details from the client profile?',
    confirmLabel:'Delete service'
  });
  if(!ok)return;
  client.services=(client.services||[]).filter(service=>String(service.id)!==String(serviceId));
  saveClientProfiles();
  renderClientProfiles();
  updateSettingsStats();
  showToast('Service deleted.');
}
function useClientServiceForInvoice(clientId,serviceId){
  const client=clientProfiles.find(item=>String(item.id)===String(clientId));
  const service=client?.services?.find(item=>String(item.id)===String(serviceId));
  if(!client||!service)return;
  const balance=serviceBalance(service);
  const clientInput=document.getElementById('receiptClientInput');
  const matterInput=document.getElementById('receiptMatterInput');
  const totalInput=document.getElementById('receiptTotalInput');
  const paidInput=document.getElementById('receiptPaidInput');
  const noteInput=document.getElementById('receiptNoteInput');
  const methodInput=document.getElementById('receiptMethodInput');
  const dateInput=document.getElementById('receiptDateInput');
  if(clientInput)clientInput.value=client.name;
  if(matterInput)matterInput.value=service.title||service.type||'Service';
  if(totalInput)totalInput.value=balance.amount?String(balance.amount):'';
  if(paidInput)paidInput.value=balance.paid?String(balance.paid):'';
  if(noteInput)noteInput.value=service.note||'';
  if(methodInput&&!methodInput.value)methodInput.value='Bank transfer';
  if(dateInput&&!dateInput.value)dateInput.value=todayIsoDate();
  syncReceiptPreview();
  generateFeeReceipt();
  showToast('Invoice prepared from the selected service.');
}
function updateSettingsStats(){
  const saved=document.getElementById('settingsSavedCount');
  const local=document.getElementById('settingsLocalJudgmentCount');
  const fee=document.getElementById('settingsFeeCount');
  const client=document.getElementById('settingsClientCount');
  const judgment=document.getElementById('settingsJudgmentCount');
  const law=document.getElementById('settingsLawCount');
  if(saved)saved.textContent=ar(savedJudgmentIds.size);
  if(local)local.textContent=ar(localJudgments.length);
  if(fee)fee.textContent=ar(feeItems.length);
  if(client)client.textContent=ar(clientProfiles.length);
  if(judgment)judgment.textContent=ar(counts.all);
  if(law)law.textContent=ar(laws.length);
}
function showFeesManagerPage(){
  setRouteHash('#fees');
  currentView='fees';
  currentType='all';
  document.querySelector('.page')?.classList.remove('empty-mode','ai-mode');
  hideStandalonePages();
  setJudgmentWorkspaceVisible(false);
  setFeesVisible(true);
  setCatalogHeader('إدارة الرسوم','أضف بنود الرسوم واحسب التقديرات الإدارية من صفحة واحدة محفوظة على جهازك.','ti-receipt');
  setHeroStats([
    {value:ar(clientProfiles.length),label:'عميل'},
    {value:ar(feeItems.length),label:'بند رسوم'},
    {value:'محلي',label:'الحفظ'}
  ]);
  renderFees();
  renderClientProfiles();
  syncReceiptPreview();
  scrollPageTo('#feesManager');
}
function showClientsPage(){
  setRouteHash('#clients');
  currentView='clients';
  currentType='all';
  document.querySelector('.page')?.classList.remove('empty-mode','ai-mode');
  hideStandalonePages();
  setJudgmentWorkspaceVisible(false);
  setClientsVisible(true);
  setCatalogHeader('الموكلين','Client profiles, services, balances, and invoice actions in one dedicated page.','ti-users');
  setHeroStats([
    {value:ar(clientProfiles.length),label:'موكل'},
    {value:ar(clientProfiles.reduce((sum,client)=>sum+(client.services?.length||0),0)),label:'خدمة'},
    {value:'Invoice',label:'Use'}
  ]);
  renderClientProfiles();
  syncClientBalanceInputs();
  scrollPageTo('#clientsPage');
}
function showSettingsPage(){
  setRouteHash('#settings');
  currentView='settings';
  currentType='all';
  document.querySelector('.page')?.classList.remove('empty-mode','ai-mode');
  hideStandalonePages();
  setJudgmentWorkspaceVisible(false);
  setSettingsVisible(true);
  setCatalogHeader('الإعدادات','اضبط تجربة القراءة والبيانات المحلية لتطبيق سند على هذا الجهاز.','ti-adjustments-horizontal');
  setHeroStats([
    {value:ar(savedJudgmentIds.size),label:'محفوظ'},
    {value:ar(feeItems.length),label:'رسوم'},
    {value:'v21',label:'الكاش'}
  ]);
  syncSettingsControls();
  updateSettingsStats();
  scrollPageTo('#settingsPage');
}
function renderLocalJudgments(){
  const count=document.getElementById('localJudgmentCount');
  const list=document.getElementById('localJudgmentList');
  const empty=document.getElementById('localJudgmentEmpty');
  if(count)count.textContent=ar(localJudgments.length);
  if(!list)return;
  if(!localJudgments.length){
    list.innerHTML='';
    empty?.classList.remove('hidden');
    return;
  }
  empty?.classList.add('hidden');
  list.innerHTML=localJudgments.map(doc=>`
    <div class="local-judgment-item" data-local-id="${Number(doc.id)}">
      <div>
        <h3>${escapeHtml(displayDocTitle(doc))}</h3>
        <p>${escapeHtml(doc.court||'غير محدد')} · ${escapeHtml(doc.date||'غير محدد')}</p>
      </div>
      <button class="fee-delete" type="button" data-local-delete="${Number(doc.id)}" aria-label="حذف الحكم المحلي"><i class="ti ti-trash"></i></button>
    </div>
  `).join('');
}
function showImportPage(){
  setRouteHash('#add-judgment');
  currentView='import';
  currentType='all';
  document.querySelector('.page')?.classList.remove('empty-mode','ai-mode');
  hideStandalonePages();
  setJudgmentWorkspaceVisible(false);
  setImportVisible(true);
  setCatalogHeader('إضافة حكم جديد','أضف حكمًا محليًا إلى مكتبتك ليظهر في البحث والقراءة والمحفظة على هذا الجهاز.','ti-file-plus');
  setHeroStats([
    {value:ar(localJudgments.length),label:'محلي'},
    {value:ar(counts.all),label:'حكم'},
    {value:'خاص',label:'الحفظ'}
  ]);
  renderLocalJudgments();
  scrollPageTo('#importPage');
  setTimeout(()=>document.getElementById('newJudgmentTitle')?.focus(),220);
}
function resetLocalJudgmentForm(){
  ['newJudgmentTitle','newJudgmentCourt','newJudgmentNumber','newJudgmentDate','newJudgmentBody'].forEach(id=>{
    const el=document.getElementById(id);
    if(el)el.value='';
  });
  const type=document.getElementById('newJudgmentType');
  if(type)type.value='tijari';
}
function saveLocalJudgment(){
  const title=document.getElementById('newJudgmentTitle')?.value.trim()||'';
  const court=document.getElementById('newJudgmentCourt')?.value.trim()||'غير محدد';
  const type=document.getElementById('newJudgmentType')?.value||'tijari';
  const num=document.getElementById('newJudgmentNumber')?.value.trim()||'';
  const date=document.getElementById('newJudgmentDate')?.value||new Date().toISOString().slice(0,10);
  const body=document.getElementById('newJudgmentBody')?.value.trim()||'';
  if(!title){
    showToast('اكتب عنوان الحكم أولاً.');
    return;
  }
  if(!body){
    showToast('ألصق نص الحكم الكامل قبل الحفظ.');
    return;
  }
  localJudgments.unshift({
    id:Date.now(),
    type:typeKeys.includes(type)?type:'tijari',
    title,
    court,
    date,
    num,
    att:0,
    source:'local',
    body,
    createdAt:new Date().toISOString()
  });
  const persisted=saveLocalJudgmentsToStorage();
  refreshJudgmentData();
  resetLocalJudgmentForm();
  renderLocalJudgments();
  updateDisplayedCounts();
  updateSettingsStats();
  showImportPage();
  showToast(persisted?'تم حفظ الحكم محليًا.':'تمت الإضافة لهذه الجلسة فقط.');
}
async function deleteLocalJudgment(id){
  const ok=await confirmAction({
    title:'Delete local judgment?',
    message:'Are you sure you want to delete this locally added judgment from this device?',
    confirmLabel:'Delete judgment',
    icon:'ti-file-x'
  });
  if(!ok)return;
  localJudgments=localJudgments.filter(doc=>Number(doc.id)!==Number(id));
  saveLocalJudgmentsToStorage();
  savedJudgmentIds.delete(Number(id));
  saveSavedJudgments();
  refreshJudgmentData();
  renderLocalJudgments();
  updateDisplayedCounts();
  updateSettingsStats();
  showImportPage();
  showToast('تم حذف الحكم المحلي.');
}
function filterLaws(){
  const q=document.getElementById('lawSearchInput')?.value.trim()||'';
  const list=q?laws.filter(law=>matchesLaw(law,q)):laws;
  renderLaws(list);
}
function addFeeItem(){
  const title=document.getElementById('feeTitleInput')?.value.trim()||'';
  const category=document.getElementById('feeCategoryInput')?.value.trim()||'عام';
  const amount=Number(document.getElementById('feeAmountInput')?.value||0);
  const note=document.getElementById('feeNoteInput')?.value.trim()||'';
  if(!title){
    showToast('اكتب اسم الرسم أولاً.');
    return;
  }
  feeItems.unshift({
    id:String(Date.now()),
    title,
    category,
    amount:Number.isFinite(amount)?amount:0,
    note,
    updated:new Date().toISOString()
  });
  const persisted=saveFeeItems();
  ['feeTitleInput','feeCategoryInput','feeAmountInput','feeNoteInput'].forEach(id=>{
    const el=document.getElementById(id);
    if(el)el.value='';
  });
  renderFees();
  updateDisplayedCounts();
  updateSettingsStats();
  showFeesManagerPage();
  showToast(persisted?'تمت إضافة الرسم.':'تمت الإضافة لهذه الجلسة فقط.');
}
async function deleteFeeItem(id){
  const ok=await confirmAction({
    title:'Delete fee item?',
    message:'Are you sure you want to delete this saved fee item?',
    confirmLabel:'Delete fee'
  });
  if(!ok)return;
  feeItems=feeItems.filter(item=>String(item.id)!==String(id));
  saveFeeItems();
  renderFees();
  updateDisplayedCounts();
  updateSettingsStats();
  showFeesManagerPage();
  showToast('تم حذف بند الرسوم.');
}
function calculateFeeEstimate(){
  const claim=Number(document.getElementById('feeClaimInput')?.value||0);
  const rate=Number(document.getElementById('feeRateInput')?.value||0);
  const min=Number(document.getElementById('feeMinInput')?.value||0);
  const max=Number(document.getElementById('feeMaxInput')?.value||0);
  const result=document.getElementById('feeCalcResult');
  if(!result)return;
  let fee=(Number.isFinite(claim)?claim:0)*(Number.isFinite(rate)?rate:0)/100;
  if(min>0)fee=Math.max(fee,min);
  if(max>0)fee=Math.min(fee,max);
  result.innerHTML=`<strong>${money(fee)}</strong><span>تقدير إداري حسب القيم المدخلة.</span>`;
}
function todayIsoDate(){
  const date=new Date();
  const offset=date.getTimezoneOffset()*60000;
  return new Date(date.getTime()-offset).toISOString().slice(0,10);
}
function receiptDateDisplay(value){
  const raw=String(value||todayIsoDate());
  if(/^\d{4}-\d{2}-\d{2}$/.test(raw)){
    return new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(`${raw}T00:00:00`));
  }
  return raw;
}
function readReceiptData(){
  const dateInput=document.getElementById('receiptDateInput');
  if(dateInput&&!dateInput.value)dateInput.value=todayIsoDate();
  const total=Math.max(0,Number(document.getElementById('receiptTotalInput')?.value||0)||0);
  const paid=Math.max(0,Number(document.getElementById('receiptPaidInput')?.value||0)||0);
  return {
    client:document.getElementById('receiptClientInput')?.value.trim()||'Not specified',
    matter:document.getElementById('receiptMatterInput')?.value.trim()||'Consultancy services',
    total,
    paid,
    remaining:Math.max(total-paid,0),
    overpaid:Math.max(paid-total,0),
    method:document.getElementById('receiptMethodInput')?.value.trim()||'Not specified',
    date:dateInput?.value||todayIsoDate(),
    note:document.getElementById('receiptNoteInput')?.value.trim()||''
  };
}
function syncReceiptPreview(){
  const data=readReceiptData();
  const total=document.getElementById('receiptTotalDisplay');
  const paid=document.getElementById('receiptPaidDisplay');
  const remaining=document.getElementById('receiptRemainingDisplay');
  const label=document.getElementById('receiptRemainingLabel');
  if(total)total.textContent=moneyEn(data.total);
  if(paid)paid.textContent=moneyEn(data.paid);
  if(remaining)remaining.textContent=moneyEn(data.overpaid>0?data.overpaid:data.remaining);
  if(label)label.textContent=data.overpaid>0?'Overpayment':'Remaining balance';
}
function receiptRow(label,value){
  return `<div class="receipt-print-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}
function generateFeeReceipt(){
  const data=readReceiptData();
  syncReceiptPreview();
  if(data.total<=0){
    showToast('Enter the total agreed amount first.');
    return;
  }
  const receiptNo=`INV-${Date.now().toString().slice(-6)}`;
  const logoUrl=new URL('assets/el-amrani-logo.png',location.href).href;
  const remainingLabel=data.overpaid>0?'Overpayment':'Remaining balance';
  const remainingValue=data.overpaid>0?data.overpaid:data.remaining;
  const note=data.note?`<div class="receipt-print-note">${escapeHtml(data.note)}</div>`:'';
  const html=`<!doctype html>
<html lang="en" dir="ltr">
<head>
<meta charset="utf-8">
<title>Invoice ${escapeHtml(receiptNo)}</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f4f1e8;color:#151515;font-family:'Brookley','Georgia','Times New Roman',serif}.receipt{width:min(860px,100%);margin:0 auto;padding:34px}.paper{background:#fff;border:1px solid #d7cda8;padding:34px;min-height:920px;box-shadow:0 18px 50px #00000018}.brand{display:flex;align-items:center;justify-content:space-between;gap:18px;border-bottom:2px solid #c8a84b;padding-bottom:18px}.brand img{width:108px;height:108px;object-fit:contain}.brand h1{font-size:30px;letter-spacing:1.4px;margin:0;color:#141414}.brand p{margin:8px 0 0;color:#8a6a24;font-size:14px;letter-spacing:2.4px;text-transform:uppercase}.receipt-title{display:flex;align-items:end;justify-content:space-between;gap:16px;margin:28px 0 18px}.receipt-title h2{margin:0;font-size:38px;color:#141414}.receipt-title span{display:block;color:#777;font-size:14px}.total{background:#111;color:#fff;border-left:7px solid #c8a84b;padding:20px 24px;margin:18px 0 22px}.total span{display:block;color:#d7cda8;font-size:14px;margin-bottom:8px;text-transform:uppercase;letter-spacing:1px}.total strong{font-size:38px;color:#fff}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:18px}.receipt-print-row{border:1px solid #ded6bb;padding:14px 16px;min-height:72px;background:#fff}.receipt-print-row span{display:block;color:#777;font-size:12px;margin-bottom:8px;text-transform:uppercase;letter-spacing:.8px}.receipt-print-row strong{font-size:19px;color:#111;line-height:1.35}.amounts{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-top:12px}.amounts .receipt-print-row{background:#fbf8ef}.receipt-print-note{border:1px dashed #c8a84b;background:#fffaf0;padding:14px 16px;margin-top:18px;color:#333;line-height:1.65}.footer{display:flex;justify-content:space-between;gap:24px;margin-top:64px}.signature{width:44%;border-top:1px solid #111;padding-top:10px;text-align:center;color:#555}.print-actions{display:flex;justify-content:center;gap:10px;margin:16px}.print-actions button{border:0;background:#111;color:#fff;padding:10px 18px;border-radius:6px;cursor:pointer;font-family:inherit}.print-actions button.secondary{background:#8a6a24}@media(max-width:640px){.receipt{padding:12px}.paper{padding:20px}.brand,.receipt-title,.footer{flex-direction:column;align-items:flex-start}.grid,.amounts{grid-template-columns:1fr}.signature{width:100%;margin-top:24px}}@media print{body{background:#fff}.receipt{padding:0}.paper{border:0;min-height:auto;box-shadow:none}.print-actions{display:none}}
</style>
</head>
<body>
<div class="receipt">
  <div class="paper">
    <div class="brand">
      <div>
        <h1>EL AMRANI CONSULTANCIES</h1>
        <p>العمراني للاستشارات</p>
      </div>
      <img src="${escapeHtml(logoUrl)}" alt="El Amrani Consultancies">
    </div>
    <div class="receipt-title"><h2>Invoice</h2><span>Invoice No. ${escapeHtml(receiptNo)}<br>${escapeHtml(receiptDateDisplay(data.date))}</span></div>
    <div class="total"><span>Total agreed amount</span><strong>${moneyEn(data.total)}</strong></div>
    <div class="grid">
      ${receiptRow('Client name',data.client)}
      ${receiptRow('Service / case',data.matter)}
      ${receiptRow('Invoice date',receiptDateDisplay(data.date))}
      ${receiptRow('Payment method',data.method)}
    </div>
    <div class="amounts">
      ${receiptRow('First payment',moneyEn(data.paid))}
      ${receiptRow(remainingLabel,moneyEn(remainingValue))}
    </div>
    ${note}
    <div class="footer"><div class="signature">Authorized signature</div><div class="signature">Company stamp</div></div>
  </div>
</div>
<div class="print-actions"><button onclick="window.print()">Print / Save PDF</button><button class="secondary" onclick="window.close()">Close</button></div>
</body>
</html>`;
  const popup=window.open('','_blank','width=900,height=1000');
  if(!popup){
    showToast('Allow pop-ups to create the invoice.');
    return;
  }
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
  popup.focus();
  setTimeout(()=>popup.print(),500);
}
function updateSettingsFromControls(){
  sanadSettings={
    readerSize:document.getElementById('readerSizeSelect')?.value||'normal',
    compactCards:!!document.getElementById('compactCardsToggle')?.checked,
    inkMode:!!document.getElementById('inkModeToggle')?.checked
  };
  applySettings();
  saveSanadSettings();
  showToast('تم حفظ الإعدادات.');
}
function backupPayload(){
  return {
    app:'SANAD',
    version:1,
    exportedAt:new Date().toISOString(),
    savedJudgmentIds:[...savedJudgmentIds],
    judgmentWorkbench,
    localJudgments,
    feeItems,
    clientProfiles,
    sanadSettings
  };
}
function exportSanadBackup(){
  const blob=new Blob([JSON.stringify(backupPayload(),null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const link=document.createElement('a');
  link.href=url;
  link.download=`sanad-backup-${todayIsoDate()}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast('Backup exported.');
}
async function importSanadBackup(file){
  if(!file)return;
  try{
    const payload=JSON.parse(await file.text());
    if(payload.app!=='SANAD')throw new Error('Invalid backup');
    const ok=await confirmAction({
      title:'Import SANAD backup?',
      message:'This will replace local saved judgments, notes, clients, fees, and settings on this device.',
      confirmLabel:'Import backup',
      icon:'ti-upload'
    });
    if(!ok)return;
    savedJudgmentIds=new Set(Array.isArray(payload.savedJudgmentIds)?payload.savedJudgmentIds.map(Number).filter(Number.isFinite):[]);
    judgmentWorkbench=payload.judgmentWorkbench&&typeof payload.judgmentWorkbench==='object'?payload.judgmentWorkbench:{};
    localJudgments=Array.isArray(payload.localJudgments)?payload.localJudgments:[];
    feeItems=Array.isArray(payload.feeItems)?payload.feeItems:[];
    clientProfiles=Array.isArray(payload.clientProfiles)?payload.clientProfiles:[];
    sanadSettings={...sanadSettings,...(payload.sanadSettings||{})};
    saveSavedJudgments();
    saveJudgmentWorkbench();
    saveLocalJudgmentsToStorage();
    saveFeeItems();
    saveClientProfiles();
    saveSanadSettings();
    refreshJudgmentData();
    applySettings();
    syncSettingsControls();
    updateDisplayedCounts();
    updateSettingsStats();
    renderDocs(sortDocuments(docs));
    renderFees();
    renderClientProfiles();
    renderLocalJudgments();
    showToast('Backup imported.');
  }catch(error){
    console.error(error);
    showToast('Could not import this backup file.');
  }
}
async function clearSavedJudgments(){
  const ok=await confirmAction({
    title:'Clear saved judgments?',
    message:'Are you sure you want to remove all saved judgment bookmarks from this device?',
    confirmLabel:'Clear saved',
    icon:'ti-bookmark-off'
  });
  if(!ok)return;
  savedJudgmentIds.clear();
  saveSavedJudgments();
  updateDisplayedCounts();
  updateSettingsStats();
  filterDocs();
  showToast('تم مسح الأحكام المحفوظة.');
}
async function clearLocalJudgments(){
  if(localJudgments.length){
    const ok=await confirmAction({
      title:'Clear local judgments?',
      message:'Are you sure you want to delete all locally added judgments from this device?',
      confirmLabel:'Clear judgments',
      icon:'ti-file-x'
    });
    if(!ok)return;
  }
  localJudgments=[];
  localStorage.removeItem(localJudgmentsStorageKey);
  savedJudgmentIds=new Set([...savedJudgmentIds].filter(id=>baseDocs.some(doc=>Number(doc.id)===Number(id))));
  saveSavedJudgments();
  refreshJudgmentData();
  updateDisplayedCounts();
  updateSettingsStats();
  renderLocalJudgments();
  showSettingsPage();
  showToast('تم مسح الأحكام المحلية.');
}
async function clearFeeItems(){
  if(feeItems.length){
    const ok=await confirmAction({
      title:'Clear saved fees?',
      message:'Are you sure you want to delete all saved fee items from this device?',
      confirmLabel:'Clear fees'
    });
    if(!ok)return;
  }
  feeItems=[];
  saveFeeItems();
  renderFees();
  updateDisplayedCounts();
  updateSettingsStats();
  showSettingsPage();
  showToast('تم مسح الرسوم المحفوظة.');
}
async function clearClientProfiles(){
  if(clientProfiles.length){
    const ok=await confirmAction({
      title:'Clear client profiles?',
      message:'Are you sure you want to delete all client profiles and their services from this device?',
      confirmLabel:'Clear clients',
      icon:'ti-users-off'
    });
    if(!ok)return;
  }
  clientProfiles=[];
  expandedClientIds.clear();
  saveClientProfiles();
  renderClientProfiles();
  updateSettingsStats();
  showSettingsPage();
  showToast('Client profiles cleared.');
}
function showAllJudgments(){
  restoreJudgmentCatalog('#judgments');
  currentView='documents';
  currentType='all';
  document.getElementById('typeSelect').value='all';
  document.getElementById('searchInput').value='';
  syncCards('all');
  filterDocs();
}
function showSavedJudgments(){
  restoreJudgmentCatalog('#saved');
  currentView='saved';
  currentType='all';
  document.getElementById('typeSelect').value='all';
  document.getElementById('searchInput').value='';
  syncCards('all');
  filterDocs();
  scrollPageTo('.results-bar');
}
function showRecentJudgments(){
  restoreJudgmentCatalog('#recent');
  currentView='documents';
  currentType='all';
  document.getElementById('typeSelect').value='all';
  document.getElementById('searchInput').value='';
  syncCards('all');
  const recentList=sortDocuments(docs,'newest').slice(0,30);
  renderDocs(recentList);
  scrollPageTo('.results-bar');
}
function showSearchPage(){
  restoreJudgmentCatalog('#search');
  currentView='documents';
  currentType='all';
  document.getElementById('typeSelect').value='all';
  syncCards('all');
  filterDocs();
  scrollPageTo('.search-bar');
  setTimeout(()=>document.getElementById('searchInput')?.focus(),220);
}
function handleNav(event,action,el){
  event.preventDefault();
  const search=document.getElementById('searchInput');
  closeSidebar();
  setActiveNav(el);
  if(collections[action]){
    showCollectionPage(action);
    showToast(`تم فتح قسم ${collections[action].title}.`);
    return;
  }
  if(action==='laws'){
    currentView='laws';
    currentType='all';
    document.getElementById('typeSelect').value='all';
    search.value='';
    syncCards('all');
    showLawCatalog();
    showToast(laws.length?'تم عرض قسم القوانين.':'لا توجد قوانين مرفوعة بعد.');
    return;
  }
  if(action==='dashboard'){
    showDashboardPage();
    showToast('تم فتح لوحة التحكم.');
    return;
  }
  if(action==='documents'||action==='judgments'){
    showAllJudgments();
    scrollPageTo('.results-bar');
    showToast('تم عرض جميع الأحكام المتاحة.');
    return;
  }
  if(action==='saved'){
    showSavedJudgments();
    showToast(savedJudgmentIds.size?'تم عرض الأحكام المحفوظة.':'لا توجد أحكام محفوظة بعد.');
    return;
  }
  if(action==='recent'){
    showRecentJudgments();
    showToast('تم عرض آخر الأحكام المضافة.');
    return;
  }
  if(action==='search'){
    showSearchPage();
    showToast('اكتب كلمات البحث أو رقم الطعن.');
    return;
  }
  if(action==='aiAnalysis'){
    showAiAnalysisPage();
    showToast('تم فتح المحلل القانوني الذكي.');
    return;
  }
  if(action==='clients'){
    showClientsPage();
    showToast('تم فتح قسم الموكلين.');
    return;
  }
  if(action==='fees'){
    showFeesManagerPage();
    showToast('تم فتح إدارة الرسوم.');
    return;
  }
  if(action==='settings'){
    showSettingsPage();
    showToast('تم فتح الإعدادات.');
  }
}
window.addEventListener('resize',()=>{
  if(!isMobileSidebar())document.body.classList.remove('sidebar-open');
  syncSidebarToggle();
  updateInstallButton();
});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeSidebar();});

function updateDisplayedCounts(){
  const heroTotal=document.querySelector('.hero-stats .hstat:first-child .hstat-num');
  if(heroTotal) heroTotal.textContent=ar(counts.all);
  document.querySelectorAll('a[href="#documents"] .ct,a[href="#judgments"] .ct').forEach(el=>{el.textContent=ar(counts.all);});
  const lawsCount=document.querySelector('a[href="#laws"] .ct');
  if(lawsCount)lawsCount.textContent=ar(laws.length);
  const decreesCount=document.querySelector('a[href="#decrees"] .ct');
  const regulationsCount=document.querySelector('a[href="#regulations"] .ct');
  const contractsCount=document.querySelector('a[href="#contracts"] .ct');
  if(decreesCount)decreesCount.textContent=ar(0);
  if(regulationsCount)regulationsCount.textContent=ar(0);
  if(contractsCount)contractsCount.textContent=ar(legalForms.length);
  const feeCount=document.querySelector('.fee-ct');
  if(feeCount)feeCount.textContent=ar(feeItems.length);
  const clientCount=document.querySelector('.client-ct');
  if(clientCount)clientCount.textContent=ar(clientProfiles.length);
  const savedCount=document.querySelector('a[href="#saved"] .ct');
  if(savedCount)savedCount.textContent=ar(savedJudgmentIds.size);
  Object.entries(counts).forEach(([type,count])=>{
    const el=document.querySelector(`.tc-${type} .tc-count`);
    if(el) el.textContent=ar(count);
  });
  const total=document.getElementById('totalCount');
  if(total)total.textContent=ar(counts.all);
}

function docWorkbenchBadges(id){
  const entry=judgmentWorkbench[String(id)];
  if(!entry)return '';
  const tags=(entry.tags||[]).slice(0,3).map(tag=>`<span class="meta-chip workbench-chip"><i class="ti ti-tag"></i>${escapeHtml(tag)}</span>`).join('');
  const note=entry.note?'<span class="meta-chip workbench-chip"><i class="ti ti-note"></i>ملاحظة</span>':'';
  const highlights=entry.highlights?.length?`<span class="meta-chip workbench-chip"><i class="ti ti-quote"></i>${ar(entry.highlights.length)}</span>`:'';
  return tags+note+highlights;
}
function renderDocs(list,page=1){
  currentDocResults=[...list];
  currentPage=Number(page)||1;
  renderDocsPage();
}
function renderDocsPage(){
  const g=document.getElementById('docGrid'),nr=document.getElementById('noResults');
  const pagination=document.getElementById('paginationBar');
  const total=currentDocResults.length;
  const totalPages=Math.max(1,Math.ceil(total/docPageSize));
  currentPage=Math.min(Math.max(1,currentPage),totalPages);
  const start=(currentPage-1)*docPageSize;
  const pageItems=currentDocResults.slice(start,start+docPageSize);
  if(!total){
    g.innerHTML='';
    nr.classList.remove('hidden');
    if(pagination)pagination.classList.add('hidden');
    document.getElementById('shownCount').textContent=ar(0);
    document.getElementById('totalCount').textContent=ar(0);
    return;
  }
  nr.classList.add('hidden');
  g.innerHTML=pageItems.map(d=>`
    <button class="doc-card" type="button" data-doc-id="${Number(d.id)}" aria-label="فتح ${escapeHtml(displayDocTitle(d))}">
      <div class="doc-card-icon dci-${d.type}"><i class="ti ${icons[d.type]||'ti-file-text'}"></i></div>
      <div class="doc-body">
        <div class="doc-title">${escapeHtml(displayDocTitle(d))}</div>
        <div class="doc-meta">
          <span class="meta-chip"><i class="ti ti-calendar-event"></i>${escapeHtml(d.date)}</span>
          <span class="meta-chip"><i class="ti ti-building"></i>${escapeHtml(d.court)}</span>
          <span class="meta-chip"><i class="ti ti-hash"></i>${escapeHtml(d.num)}</span>
          ${isSaved(d.id)?`<span class="meta-chip"><i class="ti ti-bookmark-filled"></i>محفوظ</span>`:''}
          ${docWorkbenchBadges(d.id)}
        </div>
      </div>
      <div class="doc-badge">
        <span class="type-tag tt-${d.type}">${labels[d.type]||'حكم'}</span>
        <i class="ti ti-chevron-left"></i>
      </div>
    </button>`).join('');
  document.getElementById('shownCount').textContent=`${ar(start+1)}-${ar(start+pageItems.length)}`;
  document.getElementById('totalCount').textContent=ar(total);
  if(pagination){
    pagination.classList.toggle('hidden',totalPages<=1);
    pagination.innerHTML=`<button type="button" data-doc-page="${currentPage-1}" ${currentPage===1?'disabled':''}><i class="ti ti-chevron-right"></i>السابق</button>
      <span>صفحة ${ar(currentPage)} من ${ar(totalPages)}</span>
      <button type="button" data-doc-page="${currentPage+1}" ${currentPage===totalPages?'disabled':''}>التالي<i class="ti ti-chevron-left"></i></button>`;
  }
}
function setDocsPage(page){
  currentPage=Number(page)||1;
  renderDocsPage();
  scrollPageTo('#docGrid');
}

async function openDoc(id){
  const d=docs.find(item=>Number(item.id)===Number(id));
  if(!d)return;
  readerMode='judgment';
  currentDocId=d.id;
  currentLawId=null;
  currentReaderDoc=null;
  currentJudgmentSearchQuery=currentListSearchQuery();
  currentJudgmentMatchIndex=0;
  document.getElementById('docModal').classList.remove('law-modal');
  document.getElementById('saveJudgmentBtn')?.classList.remove('hidden');
  document.getElementById('modalType').textContent=labels[d.type]||'حكم قضائي';
  document.getElementById('modalTitle').textContent=displayDocTitle(d);
  document.getElementById('modalBody').innerHTML=`${renderWorkbenchPanel(d.id)}<div class="judgment-loading"><div class="spinner"></div>جارٍ تحميل نص الحكم الكامل...</div>`;
  syncSaveButton();
  document.getElementById('docModal').classList.remove('hidden');
  document.body.classList.add('modal-open');
  const fullDoc=await getFullJudgment(d.id);
  if(currentDocId!==d.id||readerMode!=='judgment')return;
  currentReaderDoc={...d,...(fullDoc||{})};
  document.getElementById('modalBody').innerHTML=renderWorkbenchPanel(d.id)+renderJudgmentSearchPanel(currentJudgmentSearchQuery,currentReaderDoc.body)+formatJudgmentBody(currentReaderDoc.body,currentReaderDoc,currentJudgmentSearchQuery);
  updateJudgmentSearchPanelState();
  if(currentJudgmentSearchQuery)setTimeout(()=>focusJudgmentSearchMatch(0),80);
}
function openLaw(id){
  const law=laws.find(item=>String(item.id)===String(id));
  if(!law)return;
  readerMode='law';
  currentLawId=law.id;
  currentDocId=null;
  currentReaderDoc=null;
  currentJudgmentSearchQuery='';
  currentJudgmentMatchIndex=0;
  const modal=document.getElementById('docModal');
  document.getElementById('saveJudgmentBtn')?.classList.add('hidden');
  document.getElementById('modalType').textContent=law.category||'قانون';
  document.getElementById('modalTitle').textContent=law.title;
  document.getElementById('modalBody').innerHTML=renderLawReader(law);
  modal.classList.add('law-modal');
  modal.classList.remove('hidden');
  document.body.classList.add('modal-open');
}
function syncSaveButton(){
  const btn=document.getElementById('saveJudgmentBtn');
  if(!btn||currentDocId===null)return;
  const saved=isSaved(currentDocId);
  btn.classList.toggle('saved',saved);
  btn.setAttribute('aria-pressed',saved?'true':'false');
  btn.innerHTML=`<i class="ti ${saved?'ti-bookmark-filled':'ti-bookmark'}"></i><span>${saved?'إزالة من المحفوظة':'حفظ الحكم'}</span>`;
}
function toggleSavedFromModal(){
  if(readerMode!=='judgment'||currentDocId===null)return;
  if(isSaved(currentDocId)){
    savedJudgmentIds.delete(Number(currentDocId));
    showToast('تمت إزالة الحكم من المحفوظة.');
  }else{
    savedJudgmentIds.add(Number(currentDocId));
    showToast('تم حفظ الحكم في المحفوظة.');
  }
  const persisted=saveSavedJudgments();
  syncSaveButton();
  updateDisplayedCounts();
  filterDocs();
  if(!persisted)showToast('تم حفظ التغيير لهذه الجلسة فقط.');
}
function saveWorkbenchFromModal(){
  if(readerMode!=='judgment'||currentDocId===null)return;
  const entry=getWorkbenchEntry(currentDocId);
  entry.tags=String(document.getElementById('workbenchTagsInput')?.value||'')
    .split(',')
    .map(tag=>tag.trim())
    .filter(Boolean)
    .slice(0,12);
  entry.note=document.getElementById('workbenchNoteInput')?.value.trim()||'';
  entry.updated=new Date().toISOString();
  const persisted=saveJudgmentWorkbench();
  filterDocs();
  refreshWorkbenchPanel();
  showToast(persisted?'تم حفظ ملف العمل على الحكم.':'تم حفظ ملف العمل لهذه الجلسة فقط.');
}
function addHighlightFromModal(){
  if(readerMode!=='judgment'||currentDocId===null)return;
  const input=document.getElementById('highlightTextInput');
  const text=input?.value.trim()||'';
  if(!text){
    showToast('أضف نص الاقتباس أولًا.');
    return;
  }
  const entry=getWorkbenchEntry(currentDocId);
  entry.highlights=[{text,createdAt:new Date().toISOString()},...(entry.highlights||[])].slice(0,20);
  entry.updated=new Date().toISOString();
  if(input)input.value='';
  saveJudgmentWorkbench();
  refreshWorkbenchPanel();
  filterDocs();
  showToast('تم حفظ الاقتباس داخل الحكم.');
}
function deleteHighlightFromModal(index){
  if(readerMode!=='judgment'||currentDocId===null)return;
  const entry=getWorkbenchEntry(currentDocId);
  entry.highlights=(entry.highlights||[]).filter((_,itemIndex)=>itemIndex!==Number(index));
  entry.updated=new Date().toISOString();
  saveJudgmentWorkbench();
  refreshWorkbenchPanel();
  filterDocs();
  showToast('تم حذف الاقتباس.');
}

function closeDoc(){
  const modal=document.getElementById('docModal');
  modal.classList.add('hidden');
  modal.classList.remove('law-modal');
  currentReaderDoc=null;
  currentJudgmentSearchQuery='';
  currentJudgmentMatchIndex=0;
  document.body.classList.remove('modal-open');
}

document.getElementById('docGrid')?.addEventListener('click',event=>{
  const card=event.target.closest('.doc-card[data-doc-id]');
  if(!card)return;
  openDoc(Number(card.dataset.docId));
});
document.getElementById('paginationBar')?.addEventListener('click',event=>{
  const button=event.target.closest('[data-doc-page]');
  if(!button||button.disabled)return;
  setDocsPage(button.dataset.docPage);
});
document.getElementById('modalBody')?.addEventListener('click',event=>{
  const button=event.target.closest('[data-highlight-delete]');
  if(!button)return;
  deleteHighlightFromModal(button.dataset.highlightDelete);
});
document.getElementById('lawList')?.addEventListener('click',event=>{
  const card=event.target.closest('.law-card[data-law-id]');
  if(!card)return;
  openLaw(card.dataset.lawId);
});
document.getElementById('dashboardRecent')?.addEventListener('click',event=>{
  const item=event.target.closest('[data-doc-id]');
  if(!item)return;
  openDoc(Number(item.dataset.docId));
});
document.getElementById('localJudgmentList')?.addEventListener('click',event=>{
  const button=event.target.closest('[data-local-delete]');
  if(!button)return;
  deleteLocalJudgment(button.dataset.localDelete);
});
document.getElementById('aiResult')?.addEventListener('click',event=>{
  const item=event.target.closest('.analysis-open-doc[data-doc-id]');
  if(!item)return;
  openDoc(Number(item.dataset.docId));
});
document.getElementById('lawSearchInput')?.addEventListener('input',filterLaws);
document.getElementById('feeList')?.addEventListener('click',event=>{
  const button=event.target.closest('[data-fee-delete]');
  if(!button)return;
  deleteFeeItem(button.dataset.feeDelete);
});
document.getElementById('confirmCancelBtn')?.addEventListener('click',()=>closeConfirm(false));
document.getElementById('confirmAcceptBtn')?.addEventListener('click',()=>closeConfirm(true));
document.getElementById('confirmModal')?.addEventListener('click',event=>{
  if(event.target.id==='confirmModal')closeConfirm(false);
});
document.getElementById('clientEditCloseBtn')?.addEventListener('click',closeClientEdit);
document.getElementById('clientEditCancelBtn')?.addEventListener('click',closeClientEdit);
document.getElementById('clientEditSaveBtn')?.addEventListener('click',saveClientEdit);
document.getElementById('clientEditModal')?.addEventListener('click',event=>{
  if(event.target.id==='clientEditModal')closeClientEdit();
});
document.getElementById('clientEditForm')?.addEventListener('input',event=>{
  if(event.target.matches('#clientEditServiceAmountInput,#clientEditServicePaidInput'))syncClientEditBalance();
});
document.getElementById('clientProfileList')?.addEventListener('click',event=>{
  const card=event.target.closest('.client-card[data-client-id]');
  if(!card)return;
  const clientId=card.dataset.clientId;
  const deleteClient=event.target.closest('[data-client-delete]');
  if(deleteClient){
    deleteClientProfile(clientId);
    return;
  }
  const editClient=event.target.closest('[data-client-edit]');
  if(editClient){
    openClientEdit(clientId);
    return;
  }
  const addService=event.target.closest('[data-client-add-service]');
  if(addService){
    addServiceToClient(clientId);
    return;
  }
  const deleteService=event.target.closest('[data-client-service-delete]');
  if(deleteService){
    deleteClientService(clientId,deleteService.dataset.clientServiceDelete);
    return;
  }
  const editService=event.target.closest('[data-client-service-edit]');
  if(editService){
    openClientServiceEdit(clientId,editService.dataset.clientServiceEdit);
    return;
  }
  const invoice=event.target.closest('[data-client-invoice]');
  if(invoice){
    useClientServiceForInvoice(clientId,invoice.dataset.clientInvoice);
    return;
  }
  const toggle=event.target.closest('[data-client-toggle]');
  if(toggle)toggleClientCard(clientId);
});
document.getElementById('clientProfileList')?.addEventListener('keydown',event=>{
  if(event.key!=='Enter'&&event.key!==' ')return;
  const toggle=event.target.closest('[data-client-toggle]');
  if(!toggle)return;
  event.preventDefault();
  const card=event.target.closest('.client-card[data-client-id]');
  if(card)toggleClientCard(card.dataset.clientId);
});
document.getElementById('clientProfileList')?.addEventListener('input',event=>{
  if(event.target.matches('[data-service-field="amount"],[data-service-field="paid"]')){
    syncClientBalanceInputs(event.target.closest('.client-add-service')||document);
  }
});
document.getElementById('clientSearchInput')?.addEventListener('input',filterClients);
document.getElementById('clientStatusFilter')?.addEventListener('change',filterClients);
['clientServiceAmountInput','clientServicePaidInput'].forEach(id=>{
  document.getElementById(id)?.addEventListener('input',()=>syncClientBalanceInputs());
});
document.getElementById('readerSizeSelect')?.addEventListener('change',updateSettingsFromControls);
document.getElementById('inkModeToggle')?.addEventListener('change',updateSettingsFromControls);
document.getElementById('compactCardsToggle')?.addEventListener('change',updateSettingsFromControls);
document.getElementById('backupImportInput')?.addEventListener('change',event=>{
  importSanadBackup(event.target.files?.[0]);
  event.target.value='';
});
document.getElementById('appUnlockBtn')?.addEventListener('click',unlockProtectedApp);
document.getElementById('appUnlockInput')?.addEventListener('keydown',event=>{
  if(event.key==='Enter')unlockProtectedApp();
});
['receiptClientInput','receiptMatterInput','receiptTotalInput','receiptPaidInput','receiptMethodInput','receiptDateInput','receiptNoteInput'].forEach(id=>{
  const input=document.getElementById(id);
  input?.addEventListener('input',syncReceiptPreview);
  input?.addEventListener('change',syncReceiptPreview);
});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){
    closeConfirm(false);
    closeClientEdit();
    closeDoc();
  }
});
window.addEventListener('hashchange',()=>{
  const route=window.location.hash.replace('#','');
  if(route==='dashboard'){
    activateNavByAction('dashboard');
    showDashboardPage();
  }else if(route==='judgments'||route==='documents'||!route){
    activateNavByAction('judgments');
    showAllJudgments();
  }else if(route==='saved'){
    activateNavByAction('saved');
    showSavedJudgments();
  }else if(route==='recent'){
    activateNavByAction('recent');
    showRecentJudgments();
  }else if(route==='search'){
    activateNavByAction('search');
    showSearchPage();
  }else if(route==='aiAnalysis'){
    activateNavByAction('aiAnalysis');
    showAiAnalysisPage();
  }else if(route==='laws'){
    activateNavByAction('laws');
    showLawCatalog();
  }else if(collections[route]){
    activateNavByAction(route);
    showCollectionPage(route);
  }else if(route==='add-judgment'){
    showImportPage();
  }else if(route==='fees'){
    activateNavByAction('fees');
    showFeesManagerPage();
  }else if(route==='clients'){
    activateNavByAction('clients');
    showClientsPage();
  }else if(route==='settings'){
    activateNavByAction('settings');
    showSettingsPage();
  }
});
window.addEventListener('beforeinstallprompt',event=>{
  event.preventDefault();
  deferredInstallPrompt=event;
  updateInstallButton();
});
window.addEventListener('appinstalled',()=>{
  deferredInstallPrompt=null;
  updateInstallButton();
  showToast('تم تثبيت تطبيق سند.');
});

function filterDocs(){
  if(standaloneViews.has(currentView))return;
  const q=document.getElementById('searchInput').value.trim();
  const sel=document.getElementById('typeSelect').value;
  if(sel!==currentType){currentType=sel;syncCards(sel);}
  let list=currentView==='saved'?docs.filter(d=>isSaved(d.id)):docs;
  if(currentType!=='all') list=list.filter(d=>d.type===currentType);
  if(q) list=filterDocsBySearchIndex(list,q);
  renderDocs(sortDocuments(list));
}

function syncCards(type){
  document.querySelectorAll('.tc').forEach(c=>c.classList.remove('active'));
  const card=document.querySelector('.tc-'+type);
  if(card) card.classList.add('active');
}

function setType(type,el){
  if(standaloneViews.has(currentView))currentView='documents';
  restoreJudgmentCatalog();
  currentType=type;
  document.querySelectorAll('.tc').forEach(c=>c.classList.remove('active'));
  if(el) el.classList.add('active');
  document.getElementById('typeSelect').value=type;
  document.getElementById('searchInput').value='';
  document.getElementById('totalCount').textContent=ar(counts[type]||0);
  filterDocs();
}

function setTypeFromSelect(){
  const v=document.getElementById('typeSelect').value;
  setType(v,document.querySelector('.tc-'+v)||document.querySelector('.tc-all'));
}

async function analyzeCase(){
  const text=document.getElementById('caseInput').value.trim();
  if(!text){showToast('يرجى وصف قضيتك أولاً.');return;}
  const btn=document.getElementById('analyzeBtn'),res=document.getElementById('aiResult');
  btn.disabled=true;
  res.innerHTML=`<div class="ai-loading"><div class="spinner"></div>جارٍ بناء تحليل مستند إلى المصادر...</div>`;
  await new Promise(resolve=>setTimeout(resolve,350));
  const words=[...new Set(text.replace(/[^\u0600-\u06FFa-zA-Z0-9\s]/g,' ').split(/\s+/).map(w=>w.trim()).filter(w=>w.length>2))];
  const score=(value)=>words.reduce((sum,word)=>sum+(String(value||'').includes(word)?1:0),0);
  const snippet=(value)=>escapeHtml(String(value||'').replace(/\s+/g,' ').slice(0,260));
  const matchedWords=value=>words.filter(word=>String(value||'').includes(word)).slice(0,6);
  const sourceQuote=(value)=>{
    const clean=String(value||'').replace(/\s+/g,' ').trim();
    if(!clean)return 'لا يوجد مقتطف نصي متاح في الفهرس.';
    const first=words.find(word=>clean.includes(word));
    if(!first)return clean.slice(0,260);
    const index=Math.max(0,clean.indexOf(first)-90);
    return `${index>0?'...':''}${clean.slice(index,index+280)}${index+280<clean.length?'...':''}`;
  };
  const lawMatches=laws
    .map(law=>({law,score:score([law.title,law.subtitle,law.body].join(' '))}))
    .filter(item=>item.score>0)
    .sort((a,b)=>b.score-a.score)
    .slice(0,3);
  const precedentMatches=filterDocsBySearchIndex(docs,text)
    .map(doc=>({doc,score:scoreDocSearch(doc,text)}))
    .filter(item=>item.score>0)
    .sort((a,b)=>b.score-a.score)
    .slice(0,5);
  const fallbackLaws=laws.slice(0,1).map(law=>({law,score:0}));
  const fallbackDocs=sortDocuments(docs,'newest').slice(0,3).map(doc=>({doc,score:0}));
  const selectedLaws=lawMatches.length?lawMatches:fallbackLaws;
  const selectedDocs=precedentMatches.length?precedentMatches:fallbackDocs;
  res.innerHTML=`<div class="ai-result">
    <div class="ars-block">
      <div class="ars-head laws"><i class="ti ti-file-certificate"></i>القوانين والمواد ذات الصلة</div>
      <div class="ars-items">${selectedLaws.length?selectedLaws.map(({law,score})=>`<div class="law-item sourced"><span class="law-num">${escapeHtml(law.number?`قانون ${law.number}`:'قانون')}</span><div class="item-text"><strong>${escapeHtml(law.title)}</strong><br><small>درجة الصلة: ${ar(score)} | كلمات مطابقة: ${escapeHtml(matchedWords([law.title,law.subtitle,law.body].join(' ')).join('، ')||'غير مباشر')}</small><blockquote>${escapeHtml(sourceQuote(law.subtitle||law.body))}</blockquote></div></div>`).join(''):'<div class="law-item"><span class="law-num">لا يوجد</span><div class="item-text">لم يتم رفع قوانين كافية للمقارنة بعد.</div></div>'}</div>
    </div>
    <div class="ars-block">
      <div class="ars-head prec"><i class="ti ti-gavel"></i>سوابق قضائية للاستناد</div>
      <div class="ars-items">${selectedDocs.length?selectedDocs.map(({doc,score})=>`<button class="prec-item analysis-open-doc sourced" type="button" data-doc-id="${Number(doc.id)}"><span class="prec-num">${escapeHtml(doc.num||ar(doc.id))}</span><div class="item-text"><strong>${escapeHtml(displayDocTitle(doc))}</strong><br><small>درجة الصلة: ${ar(score)} | المصدر: ${escapeHtml(doc.court||'حكم قضائي')} ${escapeHtml(doc.date||'')}</small><blockquote>${escapeHtml(sourceQuote(doc.excerpt||doc.body||doc.title))}</blockquote></div></button>`).join(''):'<div class="prec-item"><span class="prec-num">لا يوجد</span><div class="item-text">لم يتم رفع أحكام كافية للمقارنة بعد.</div></div>'}</div>
    </div>
    <div class="ars-block">
      <div class="ars-head analysis"><i class="ti ti-chart-line"></i>تحليل مستند إلى المصادر</div>
      <div class="analysis-text">النتائج أعلاه مبنية على فهرس كلمات داخل القوانين والأحكام المحملة في سند. ابدأ بالمصادر الأعلى درجة، وافتح الحكم المقترح، ثم احفظ الوسوم أو الاقتباسات المهمة داخل ملف العمل قبل استخدام النتيجة في مذكرة أو دفاع.</div>
    </div>
  </div>`;
  btn.disabled=false;
}

syncSidebarToggle();
updateDisplayedCounts();
updateInstallButton();
applySettings();
syncSettingsControls();
enforceProtection();
renderDocs(sortDocuments(docs));
renderLaws(laws);
renderFees();
renderClientProfiles();
renderLocalJudgments();
updateSettingsStats();
if(window.location.hash==='#dashboard'){
  activateNavByAction('dashboard');
  showDashboardPage();
}else if(window.location.hash==='#judgments'||window.location.hash==='#documents'||!window.location.hash){
  activateNavByAction('judgments');
  showAllJudgments();
}else if(window.location.hash==='#saved'){
  activateNavByAction('saved');
  showSavedJudgments();
}else if(window.location.hash==='#recent'){
  activateNavByAction('recent');
  showRecentJudgments();
}else if(window.location.hash==='#search'){
  activateNavByAction('search');
  showSearchPage();
}else if(window.location.hash==='#aiAnalysis'){
  activateNavByAction('aiAnalysis');
  showAiAnalysisPage();
}else if(window.location.hash==='#laws'){
  activateNavByAction('laws');
  showLawCatalog();
}else if(collections[window.location.hash.replace('#','')]){
  const route=window.location.hash.replace('#','');
  activateNavByAction(route);
  showCollectionPage(route);
}else if(window.location.hash==='#add-judgment'){
  showImportPage();
}else if(window.location.hash==='#fees'){
  activateNavByAction('fees');
  showFeesManagerPage();
}else if(window.location.hash==='#clients'){
  activateNavByAction('clients');
  showClientsPage();
}else if(window.location.hash==='#settings'){
  activateNavByAction('settings');
  showSettingsPage();
}
if('serviceWorker' in navigator){
  window.addEventListener('load',()=>{
    navigator.serviceWorker.register('./sw.js').catch(()=>{});
  });
}

