const docs=window.SANAD_DATA?.judgments||[];
const icons={tijari:'ti-briefcase',madani:'ti-scale',omali:'ti-hammer',jinai:'ti-shield-lock',idari:'ti-building-bank',osri:'ti-heart'};
const labels={tijari:'تجاري',madani:'مدني',omali:'عمالي',jinai:'جنائي',idari:'إداري',osri:'أسري'};
const typeKeys=['tijari','madani','omali','jinai','idari','osri'];
const counts=docs.reduce((acc,d)=>{
  acc.all++;
  if(acc[d.type]!==undefined) acc[d.type]++;
  return acc;
},{all:0,tijari:0,madani:0,omali:0,jinai:0,idari:0,osri:0});

let currentType='all';
let currentView='documents';
let currentDocId=null;
let deferredInstallPrompt=null;
const savedStorageKey='sanadSavedJudgments';
let savedJudgmentIds=loadSavedJudgments();
function ar(n){return n.toString().replace(/\d/g,d=>'٠١٢٣٤٥٦٧٨٩'[d])}
function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}
function matchesDoc(d,q){return [d.title,d.court,d.date,d.num,d.appeal,d.source,d.body].some(v=>String(v||'').includes(q))}
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
  return text
    .replace(/\r/g,'')
    .split(/\n+/)
    .flatMap(line=>line.trim().split(/(?=(?:وحيث\s+(?:إن|أن|إنه)|ومن المقرر|كما أنه من المقرر|لما كان ذلك|أولاً:|أولًا:|ثانياً:|ثانيًا:))/g))
    .map(part=>part.trim())
    .filter(Boolean);
}
function classifyJudgmentParagraph(text){
  if(text.includes('من المقرر في قضاء هذه المحكمة')||text.startsWith('ومن المقرر')||text.startsWith('كما أنه من المقرر'))return 'principle';
  if(text.includes('النص في المادة')||text.includes('نص المادة')||text.includes('وفقاً لنص المادة')||text.includes('وفقًا لنص المادة')||text.includes('المادتين')||text.includes('المواد'))return 'article';
  if(text.startsWith('وحيث')||text.startsWith('لما كان ذلك'))return 'reasoning';
  return 'facts';
}
function paragraphLabel(type){
  return {reasoning:'تسبيب المحكمة',principle:'مبدأ قضائي',article:'نص قانوني'}[type]||'';
}
function renderJudgmentParagraph(text){
  const type=classifyJudgmentParagraph(text);
  const label=paragraphLabel(type);
  return `<p class="judgment-para ${type}">${label?`<span class="judgment-tag ${type}">${label}</span>`:''}${escapeHtml(text)}</p>`;
}
function formatJudgmentBody(body){
  const lines=String(body||'').replace(/\r/g,'').split(/\n+/).map(line=>line.trim()).filter(Boolean);
  if(!lines.length)return '<div class="judgment-reader"><p class="judgment-para facts">لا يتوفر نص الحكم الكامل لهذا السجل.</p></div>';
  const introEnd=lines.findIndex(line=>line.includes('أصـدرت')||line.includes('أصدرت'));
  const introLines=introEnd>=0?lines.slice(0,introEnd+1):[];
  let mainText=(introEnd>=0?lines.slice(introEnd+1):lines).join('\n');
  const rulingMarker='فلهذه الأسباب حكمت المحكمة';
  const rulingIndex=mainText.indexOf(rulingMarker);
  let ruling='';
  if(rulingIndex>=0){
    ruling=mainText.slice(rulingIndex).trim();
    mainText=mainText.slice(0,rulingIndex).trim();
  }
  const introHtml=introLines.length?renderJudgmentIntro(introLines):'';
  const paragraphs=splitJudgmentParagraphs(mainText).map(renderJudgmentParagraph).join('');
  const rulingHtml=ruling?`<section class="judgment-ruling"><div class="judgment-ruling-label">منطوق الحكم</div>${escapeHtml(ruling)}</section>`:'';
  return `<div class="judgment-reader">${introHtml}<section class="judgment-content">${paragraphs}</section>${rulingHtml}</div>`;
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
function setActiveNav(el){
  document.querySelectorAll('.ni').forEach(item=>item.classList.remove('on'));
  if(el)el.classList.add('on');
  updateDisplayedCounts();
}
function scrollPageTo(selector){
  const page=document.querySelector('.page');
  const target=document.querySelector(selector);
  if(!page||!target)return;
  page.scrollTo({top:Math.max(target.offsetTop-14,0),behavior:'smooth'});
}
function showAllJudgments(){
  currentView='documents';
  currentType='all';
  document.getElementById('typeSelect').value='all';
  document.getElementById('searchInput').value='';
  syncCards('all');
  filterDocs();
}
function handleNav(event,action,el){
  event.preventDefault();
  const search=document.getElementById('searchInput');
  const unavailable={
    laws:'قسم القوانين غير مضاف بعد.',
    decrees:'قسم المراسيم غير مضاف بعد.',
    regulations:'قسم اللوائح غير مضاف بعد.',
    contracts:'قسم العقود النموذجية غير مضاف بعد.',
    tags:'إدارة الوسوم غير مفعلة بعد.',
    settings:'الإعدادات غير مفعلة بعد.'
  };
  closeSidebar();
  if(unavailable[action]){
    showToast(unavailable[action]);
    return;
  }
  setActiveNav(el);
  if(action==='dashboard'){
    showAllJudgments();
    scrollPageTo('.hero');
    showToast('تم عرض لوحة الأحكام القضائية.');
    return;
  }
  if(action==='documents'||action==='judgments'){
    showAllJudgments();
    scrollPageTo('.results-bar');
    showToast('تم عرض جميع الأحكام المتاحة.');
    return;
  }
  if(action==='saved'){
    currentView='saved';
    currentType='all';
    document.getElementById('typeSelect').value='all';
    search.value='';
    syncCards('all');
    filterDocs();
    scrollPageTo('.results-bar');
    showToast(savedJudgmentIds.size?'تم عرض الأحكام المحفوظة.':'لا توجد أحكام محفوظة بعد.');
    return;
  }
  if(action==='recent'){
    currentView='documents';
    currentType='all';
    document.getElementById('typeSelect').value='all';
    search.value='';
    syncCards('all');
    const recentList=docs.slice(-30).reverse();
    document.getElementById('totalCount').textContent=ar(recentList.length);
    renderDocs(recentList);
    scrollPageTo('.results-bar');
    showToast('تم عرض آخر الأحكام المضافة.');
    return;
  }
  if(action==='search'){
    scrollPageTo('.search-bar');
    setTimeout(()=>search.focus(),220);
    showToast('اكتب كلمات البحث أو رقم الطعن.');
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
  const navTotal=document.querySelector('.ni.on .ct');
  if(heroTotal) heroTotal.textContent=ar(counts.all);
  if(navTotal) navTotal.textContent=ar(counts.all);
  const savedCount=document.querySelector('a[href="#saved"] .ct');
  if(savedCount)savedCount.textContent=ar(savedJudgmentIds.size);
  Object.entries(counts).forEach(([type,count])=>{
    const el=document.querySelector(`.tc-${type} .tc-count`);
    if(el) el.textContent=ar(count);
  });
  document.getElementById('totalCount').textContent=ar(counts.all);
}

function renderDocs(list){
  const g=document.getElementById('docGrid'),nr=document.getElementById('noResults');
  if(!list.length){g.innerHTML='';nr.classList.remove('hidden');document.getElementById('shownCount').textContent=ar(0);return;}
  nr.classList.add('hidden');
  g.innerHTML=list.map(d=>`
    <div class="doc-card" onclick="openDoc(${d.id})">
      <div class="doc-card-icon dci-${d.type}"><i class="ti ${icons[d.type]||'ti-file-text'}"></i></div>
      <div class="doc-body">
        <div class="doc-title">${escapeHtml(displayDocTitle(d))}</div>
        <div class="doc-meta">
          <span class="meta-chip"><i class="ti ti-calendar-event"></i>${escapeHtml(d.date)}</span>
          <span class="meta-chip"><i class="ti ti-building"></i>${escapeHtml(d.court)}</span>
          <span class="meta-chip"><i class="ti ti-hash"></i>${escapeHtml(d.num)}</span>
          ${isSaved(d.id)?`<span class="meta-chip"><i class="ti ti-bookmark-filled"></i>محفوظ</span>`:''}
          <span class="meta-chip"><i class="ti ti-paperclip"></i>${ar(d.att)} مرفق</span>
        </div>
      </div>
      <div class="doc-badge">
        <span class="type-tag tt-${d.type}">${labels[d.type]}</span>
        <i class="ti ti-chevron-left" style="font-size:14px;color:#2d5060"></i>
      </div>
    </div>`).join('');
  document.getElementById('shownCount').textContent=ar(list.length);
}

function openDoc(id){
  const d=docs.find(item=>item.id===id);
  if(!d)return;
  currentDocId=d.id;
  document.getElementById('modalType').textContent=labels[d.type]||'حكم قضائي';
  document.getElementById('modalTitle').textContent=displayDocTitle(d);
  const meta=[
    ['ti-calendar-event',d.date],
    ['ti-building',d.court],
    ['ti-hash',d.num]
  ].filter(item=>item[1]);
  document.getElementById('modalMeta').innerHTML=meta.map(([icon,text])=>`<span><i class="ti ${icon}"></i>${escapeHtml(text)}</span>`).join('');
  document.getElementById('modalBody').innerHTML=formatJudgmentBody(d.body);
  syncSaveButton();
  document.getElementById('docModal').classList.remove('hidden');
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
  if(currentDocId===null)return;
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

function closeDoc(){
  document.getElementById('docModal').classList.add('hidden');
  document.body.classList.remove('modal-open');
}

document.addEventListener('keydown',e=>{if(e.key==='Escape')closeDoc();});
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
  const q=document.getElementById('searchInput').value.trim();
  const sel=document.getElementById('typeSelect').value;
  if(sel!==currentType){currentType=sel;syncCards(sel);}
  let list=currentView==='saved'?docs.filter(d=>isSaved(d.id)):docs;
  if(currentType!=='all') list=list.filter(d=>d.type===currentType);
  if(q) list=list.filter(d=>matchesDoc(d,q));
  document.getElementById('totalCount').textContent=ar(currentView==='saved'?savedJudgmentIds.size:(counts[currentType]||0));
  renderDocs(list);
}

function syncCards(type){
  document.querySelectorAll('.tc').forEach(c=>c.classList.remove('active'));
  const card=document.querySelector('.tc-'+type);
  if(card) card.classList.add('active');
}

function setType(type,el){
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
  if(!text){alert('يرجى وصف قضيتك أولاً');return;}
  const btn=document.getElementById('analyzeBtn'),res=document.getElementById('aiResult');
  btn.disabled=true;
  res.innerHTML=`<div class="ai-loading"><div class="spinner"></div>جارٍ تحليل القضية وتحديد القوانين والسوابق...</div>`;
  try{
    const r=await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        model:'claude-sonnet-4-20250514',max_tokens:1000,
        system:`أنت محلل قانوني متخصص. حلل القضية المقدمة وأجب بـ JSON فقط بدون أي نص إضافي أو backticks بالبنية:
{"laws":[{"num":"رقم المادة والقانون","text":"نص مختصر"}],"precedents":[{"num":"رقم الحكم","text":"ملخص الحكم وكيفية الاستناد"}],"analysis":"تحليل موجز لفرص القضية ونقاط الدفاع"}`,
        messages:[{role:'user',content:'قضيتي: '+text}]
      })
    });
    const d=await r.json();
    let raw=d.content.filter(b=>b.type==='text').map(b=>b.text).join('').replace(/```json|```/g,'').trim();
    const j=JSON.parse(raw);
    res.innerHTML=`<div class="ai-result">
      <div class="ars-block">
        <div class="ars-head laws"><i class="ti ti-file-certificate"></i>القوانين والمواد ذات الصلة</div>
        <div class="ars-items">${j.laws.map(l=>`<div class="law-item"><span class="law-num">${l.num}</span><div class="item-text">${l.text}</div></div>`).join('')}</div>
      </div>
      <div class="ars-block">
        <div class="ars-head prec"><i class="ti ti-gavel"></i>سوابق قضائية للاستناد</div>
        <div class="ars-items">${j.precedents.map(p=>`<div class="prec-item"><span class="prec-num">${p.num}</span><div class="item-text">${p.text}</div></div>`).join('')}</div>
      </div>
      <div class="ars-block">
        <div class="ars-head analysis"><i class="ti ti-chart-line"></i>تحليل فرص القضية</div>
        <div class="analysis-text">${j.analysis}</div>
      </div>
    </div>`;
  }catch(e){
    res.innerHTML=`<div class="ai-result"><div class="ars-block"><div class="ars-head" style="background:#200808;color:#e07070"><i class="ti ti-alert-circle"></i>خطأ في التحليل</div><div class="analysis-text" style="border-color:#e07070">حدث خطأ أثناء التحليل. يرجى المحاولة مرة أخرى.</div></div></div>`;
  }
  btn.disabled=false;
}

syncSidebarToggle();
updateDisplayedCounts();
updateInstallButton();
renderDocs(docs);
if('serviceWorker' in navigator){
  window.addEventListener('load',()=>{
    navigator.serviceWorker.register('./sw.js').catch(()=>{});
  });
}

