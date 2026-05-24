const baseDocs=window.SANAD_DATA?.judgments||[];
const laws=window.SANAD_DATA?.laws||[];
const legalForms=window.SANAD_DATA?.legalForms||[];
const localJudgmentsStorageKey='sanadLocalJudgments';
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
const standaloneViews=new Set(['dashboard','laws','decrees','regulations','contracts','aiAnalysis','fees','settings','import']);
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
const settingsStorageKey='sanadSettings';
let savedJudgmentIds=loadSavedJudgments();
let feeItems=loadFeeItems();
let sanadSettings=loadSanadSettings();
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
function matchesDoc(d,q){return [d.title,d.court,d.date,d.num,d.appeal,d.source,d.body].some(v=>String(v||'').includes(q))}
function matchesLaw(law,q){return [law.title,law.subtitle,law.legislation,law.category,law.status,law.updated,law.body].some(v=>String(v||'').includes(q))}
function normalizeDigits(value){
  return String(value||'')
    .replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
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
  const markers=[
    'وحيث\\s+(?:إن|أن|إنه)',
    'ومن\\s+المقرر',
    'والمقرر\\s+(?:قضاء|قانون(?:ا|اً)?|(?:في|فى)\\s+قضاء\\s+هذه\\s+المحكمة)',
    'المقرر\\s+(?:قضاء|قانون(?:ا|اً)?|(?:في|فى)\\s+قضاء\\s+هذه\\s+المحكمة)',
    'من\\s+المقرر(?:\\s+(?:في|فى)\\s+قضاء\\s+هذه\\s+المحكمة)?',
    'كما\\s+أنه\\s+من\\s+المقرر',
    'ذلك\\s+أن(?:ه)?\\s+من\\s+المقرر',
    'لما كان ذلك',
    'أولاً:',
    'أولًا:',
    'ثانياً:',
    'ثانيًا:'
  ].join('|');
  return text
    .replace(/\r/g,'')
    .split(/\n+/)
    .flatMap(line=>line.trim().split(new RegExp(`(?=(?:${markers}))`,'g')))
    .map(part=>part.trim())
    .filter(Boolean);
}
function classifyJudgmentParagraph(text){
  const value=String(text||'').replace(/\s+/g,' ').trim();
  if(/(?:^|[\s،.؛])(?:ومن\s+المقرر|والمقرر\s+(?:قضاء|قانون(?:ا|اً)?|(?:في|فى)\s+قضاء\s+هذه\s+المحكمة)|المقرر\s+(?:قضاء|قانون(?:ا|اً)?|(?:في|فى)\s+قضاء\s+هذه\s+المحكمة)|من\s+المقرر(?:\s+(?:في|فى)\s+قضاء\s+هذه\s+المحكمة)?|كما\s+أنه\s+من\s+المقرر|ذلك\s+أن(?:ه)?\s+من\s+المقرر)/.test(value))return 'principle';
  return '';
}
function paragraphLabel(type){
  return type==='principle'?'مبدأ قضائي':'';
}
function renderJudgmentParagraph(text){
  const type=classifyJudgmentParagraph(text);
  const label=paragraphLabel(type);
  return `<p class="judgment-para${type?` ${type}`:''}">${label?`<span class="judgment-tag ${type}">${label}</span>`:''}${escapeHtml(text)}</p>`;
}
function formatJudgmentBody(body,doc=null){
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
function money(value){
  const number=Number(value)||0;
  return `${new Intl.NumberFormat('ar-AE',{maximumFractionDigits:2}).format(number)} درهم`;
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
  setFeesVisible(false);
  setSettingsVisible(false);
}
function setJudgmentWorkspaceVisible(visible){
  ['.type-cards','.search-bar','.results-bar','#docGrid'].forEach(selector=>{
    const el=document.querySelector(selector);
    if(el)el.classList.toggle('hidden',!visible);
  });
  if(!visible)document.getElementById('noResults')?.classList.add('hidden');
}
function restoreJudgmentCatalog(){
  setRouteHash('');
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
function updateSettingsStats(){
  const saved=document.getElementById('settingsSavedCount');
  const local=document.getElementById('settingsLocalJudgmentCount');
  const fee=document.getElementById('settingsFeeCount');
  const judgment=document.getElementById('settingsJudgmentCount');
  const law=document.getElementById('settingsLawCount');
  if(saved)saved.textContent=ar(savedJudgmentIds.size);
  if(local)local.textContent=ar(localJudgments.length);
  if(fee)fee.textContent=ar(feeItems.length);
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
    {value:ar(feeItems.length),label:'بند رسوم'},
    {value:ar(new Set(feeItems.map(item=>item.category||'عام')).size),label:'تصنيف'},
    {value:'محلي',label:'الحفظ'}
  ]);
  renderFees();
  scrollPageTo('#feesManager');
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
    {value:'v12',label:'الكاش'}
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
function deleteLocalJudgment(id){
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
function deleteFeeItem(id){
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
function clearSavedJudgments(){
  savedJudgmentIds.clear();
  saveSavedJudgments();
  updateDisplayedCounts();
  updateSettingsStats();
  filterDocs();
  showToast('تم مسح الأحكام المحفوظة.');
}
function clearLocalJudgments(){
  if(localJudgments.length&&!confirm('سيتم حذف الأحكام المضافة محليًا من هذا الجهاز. هل تريد المتابعة؟'))return;
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
function clearFeeItems(){
  feeItems=[];
  saveFeeItems();
  renderFees();
  updateDisplayedCounts();
  updateSettingsStats();
  showSettingsPage();
  showToast('تم مسح الرسوم المحفوظة.');
}
function showAllJudgments(){
  restoreJudgmentCatalog();
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
    restoreJudgmentCatalog();
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
    restoreJudgmentCatalog();
    currentView='documents';
    currentType='all';
    document.getElementById('typeSelect').value='all';
    search.value='';
    syncCards('all');
    const recentList=sortDocuments(docs,'newest').slice(0,30);
    document.getElementById('totalCount').textContent=ar(recentList.length);
    renderDocs(recentList);
    scrollPageTo('.results-bar');
    showToast('تم عرض آخر الأحكام المضافة.');
    return;
  }
  if(action==='search'){
    showAllJudgments();
    scrollPageTo('.search-bar');
    setTimeout(()=>search.focus(),220);
    showToast('اكتب كلمات البحث أو رقم الطعن.');
    return;
  }
  if(action==='aiAnalysis'){
    showAiAnalysisPage();
    showToast('تم فتح المحلل القانوني الذكي.');
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
  const savedCount=document.querySelector('a[href="#saved"] .ct');
  if(savedCount)savedCount.textContent=ar(savedJudgmentIds.size);
  Object.entries(counts).forEach(([type,count])=>{
    const el=document.querySelector(`.tc-${type} .tc-count`);
    if(el) el.textContent=ar(count);
  });
  const total=document.getElementById('totalCount');
  if(total)total.textContent=ar(counts.all);
}

function renderDocs(list){
  const g=document.getElementById('docGrid'),nr=document.getElementById('noResults');
  if(!list.length){g.innerHTML='';nr.classList.remove('hidden');document.getElementById('shownCount').textContent=ar(0);return;}
  nr.classList.add('hidden');
  g.innerHTML=list.map(d=>`
    <button class="doc-card" type="button" data-doc-id="${Number(d.id)}" aria-label="فتح ${escapeHtml(displayDocTitle(d))}">
      <div class="doc-card-icon dci-${d.type}"><i class="ti ${icons[d.type]||'ti-file-text'}"></i></div>
      <div class="doc-body">
        <div class="doc-title">${escapeHtml(displayDocTitle(d))}</div>
        <div class="doc-meta">
          <span class="meta-chip"><i class="ti ti-calendar-event"></i>${escapeHtml(d.date)}</span>
          <span class="meta-chip"><i class="ti ti-building"></i>${escapeHtml(d.court)}</span>
          <span class="meta-chip"><i class="ti ti-hash"></i>${escapeHtml(d.num)}</span>
          ${isSaved(d.id)?`<span class="meta-chip"><i class="ti ti-bookmark-filled"></i>محفوظ</span>`:''}
        </div>
      </div>
      <div class="doc-badge">
        <span class="type-tag tt-${d.type}">${labels[d.type]||'حكم'}</span>
        <i class="ti ti-chevron-left"></i>
      </div>
    </button>`).join('');
  document.getElementById('shownCount').textContent=ar(list.length);
}

function openDoc(id){
  const d=docs.find(item=>item.id===id);
  if(!d)return;
  readerMode='judgment';
  currentDocId=d.id;
  currentLawId=null;
  document.getElementById('docModal').classList.remove('law-modal');
  document.getElementById('saveJudgmentBtn')?.classList.remove('hidden');
  document.getElementById('modalType').textContent=labels[d.type]||'حكم قضائي';
  document.getElementById('modalTitle').textContent=displayDocTitle(d);
  document.getElementById('modalBody').innerHTML=formatJudgmentBody(d.body,d);
  syncSaveButton();
  document.getElementById('docModal').classList.remove('hidden');
  document.body.classList.add('modal-open');
}
function openLaw(id){
  const law=laws.find(item=>String(item.id)===String(id));
  if(!law)return;
  readerMode='law';
  currentLawId=law.id;
  currentDocId=null;
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

function closeDoc(){
  const modal=document.getElementById('docModal');
  modal.classList.add('hidden');
  modal.classList.remove('law-modal');
  document.body.classList.remove('modal-open');
}

document.getElementById('docGrid')?.addEventListener('click',event=>{
  const card=event.target.closest('.doc-card[data-doc-id]');
  if(!card)return;
  openDoc(Number(card.dataset.docId));
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
document.getElementById('readerSizeSelect')?.addEventListener('change',updateSettingsFromControls);
document.getElementById('inkModeToggle')?.addEventListener('change',updateSettingsFromControls);
document.getElementById('compactCardsToggle')?.addEventListener('change',updateSettingsFromControls);
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeDoc();});
window.addEventListener('hashchange',()=>{
  const route=window.location.hash.replace('#','');
  if(route==='dashboard'){
    activateNavByAction('dashboard');
    showDashboardPage();
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
  if(q) list=list.filter(d=>matchesDoc(d,q));
  document.getElementById('totalCount').textContent=ar(currentView==='saved'?savedJudgmentIds.size:(counts[currentType]||0));
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
  if(!text){alert('يرجى وصف قضيتك أولاً');return;}
  const btn=document.getElementById('analyzeBtn'),res=document.getElementById('aiResult');
  btn.disabled=true;
  res.innerHTML=`<div class="ai-loading"><div class="spinner"></div>جارٍ تحليل القضية وتحديد القوانين والسوابق...</div>`;
  await new Promise(resolve=>setTimeout(resolve,350));
  const words=[...new Set(text.replace(/[^\u0600-\u06FFa-zA-Z0-9\s]/g,' ').split(/\s+/).map(w=>w.trim()).filter(w=>w.length>2))];
  const score=(value)=>words.reduce((sum,word)=>sum+(String(value||'').includes(word)?1:0),0);
  const snippet=(value)=>escapeHtml(String(value||'').replace(/\s+/g,' ').slice(0,220));
  const lawMatches=laws
    .map(law=>({law,score:score([law.title,law.subtitle,law.body].join(' '))}))
    .filter(item=>item.score>0)
    .sort((a,b)=>b.score-a.score)
    .slice(0,3);
  const precedentMatches=docs
    .map(doc=>({doc,score:score([doc.title,doc.court,doc.body,doc.num].join(' '))}))
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
      <div class="ars-items">${selectedLaws.length?selectedLaws.map(({law,score})=>`<div class="law-item"><span class="law-num">${escapeHtml(law.number?`قانون ${law.number}`:'قانون')}</span><div class="item-text"><strong>${escapeHtml(law.title)}</strong><br>${score?snippet(law.subtitle||law.body):'لم يظهر تطابق مباشر، وهذا أقرب قانون متاح في المكتبة.'}</div></div>`).join(''):'<div class="law-item"><span class="law-num">لا يوجد</span><div class="item-text">لم يتم رفع قوانين كافية للمقارنة بعد.</div></div>'}</div>
    </div>
    <div class="ars-block">
      <div class="ars-head prec"><i class="ti ti-gavel"></i>سوابق قضائية للاستناد</div>
      <div class="ars-items">${selectedDocs.length?selectedDocs.map(({doc,score})=>`<button class="prec-item analysis-open-doc" type="button" data-doc-id="${Number(doc.id)}"><span class="prec-num">${escapeHtml(doc.num||ar(doc.id))}</span><div class="item-text"><strong>${escapeHtml(displayDocTitle(doc))}</strong><br>${score?snippet(doc.body||doc.title):'لم يظهر تطابق مباشر، وهذا من أحدث الأحكام المتاحة.'}</div></button>`).join(''):'<div class="prec-item"><span class="prec-num">لا يوجد</span><div class="item-text">لم يتم رفع أحكام كافية للمقارنة بعد.</div></div>'}</div>
    </div>
    <div class="ars-block">
      <div class="ars-head analysis"><i class="ti ti-chart-line"></i>تحليل أولي</div>
      <div class="analysis-text">هذا تحليل محلي يعتمد على الكلمات المشتركة بين وصف القضية وقاعدة بيانات سند. راجع النتائج، وافتح السوابق المقترحة، ثم قارن الوقائع والطلبات وأسباب الحكم قبل استخدامها في مذكرة أو دفاع.</div>
    </div>
  </div>`;
  btn.disabled=false;
}

syncSidebarToggle();
updateDisplayedCounts();
updateInstallButton();
applySettings();
syncSettingsControls();
renderDocs(sortDocuments(docs));
renderLaws(laws);
renderFees();
renderLocalJudgments();
updateSettingsStats();
if(window.location.hash==='#dashboard'){
  activateNavByAction('dashboard');
  showDashboardPage();
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
}else if(window.location.hash==='#settings'){
  activateNavByAction('settings');
  showSettingsPage();
}
if('serviceWorker' in navigator){
  window.addEventListener('load',()=>{
    navigator.serviceWorker.register('./sw.js').catch(()=>{});
  });
}

