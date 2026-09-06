(function(){
  const IMPROVEMENT_VERSION='sanad-improvements-20260906';
  const OFFLINE_VERSION='sanad-pwa-v40';
  const privateDataEndpoint='./api/private-data';
  const vaultKeys={
    savedJudgmentIds:'sanadSavedJudgments',
    memoryItems:'sanadMemoryItems',
    localJudgments:'sanadLocalJudgments',
    feeItems:'sanadFeeItems',
    clientProfiles:'sanadClientProfiles',
    settings:'sanadSettings',
    protection:'sanadProtection'
  };
  const fallbackSectionLabels={principle:'مبدأ قضائي',reasoning:'تسبيب المحكمة',facts:'وقائع وملخص',operative:'منطوق الحكم',preview:'مقتطف',body:'نص الحكم',meta:'بيانات الحكم'};

  function $(selector,root=document){return root.querySelector(selector)}
  function notify(message){
    if(typeof showToast==='function')showToast(message);
    else console.log(message);
  }
  function escapeLocal(value){
    if(typeof escapeHtml==='function')return escapeHtml(value);
    return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  }
  function normalizeLocal(value){
    if(typeof normalizeSearchText==='function')return normalizeSearchText(value);
    return String(value??'').toLowerCase()
      .replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d))
      .replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
      .replace(/[إأآا]/g,'ا')
      .replace(/ى/g,'ي')
      .replace(/ة/g,'ه')
      .replace(/[\u064B-\u065F\u0670\u0640]/g,'')
      .replace(/[^\u0600-\u06FFa-z0-9\s/.-]/g,' ');
  }
  function comparableLocal(value){
    if(typeof comparableSearchText==='function')return comparableSearchText(value);
    return normalizeLocal(value).replace(/\s+/g,' ').trim();
  }
  function splitSegmentsLocal(text){
    if(typeof splitSentenceSegments==='function')return splitSentenceSegments(text);
    const source=String(text||'');
    const parts=source.split(/(?<=[.!?؟؛;])\s+/).filter(Boolean);
    return parts.length?parts:[source];
  }
  function searchWordsLocal(value){
    if(typeof searchWords==='function')return searchWords(value);
    return [...new Set(comparableLocal(value).split(/\s+/).filter(Boolean))];
  }
  function standaloneSearchWords(value){
    return [...new Set(comparableLocal(value).split(/\s+/).map(word=>word.trim()).filter(word=>word&&(/^\d+$/.test(word)||word.length>=2)))];
  }
  function buildMapLocal(value){
    const source=String(value||'');
    let text='';
    const map=[];
    for(let i=0;i<source.length;i++){
      const normalized=normalizeLocal(source[i]);
      for(const ch of normalized){
        if(/\s/.test(ch)){
          if(text&&text[text.length-1]!==' '){
            text+=' ';
            map.push(i);
          }
        }else{
          text+=ch;
          map.push(i);
        }
      }
    }
    return {text,map};
  }
  function comparableRangesLocal(text,needle){
    const target=comparableLocal(needle);
    if(!target)return [];
    const comparable=buildMapLocal(text);
    const ranges=[];
    let index=comparable.text.indexOf(target);
    while(index!==-1){
      const start=comparable.map[index];
      const end=comparable.map[index+target.length-1]+1;
      if(Number.isFinite(start)&&Number.isFinite(end)&&end>start)ranges.push([start,end]);
      index=comparable.text.indexOf(target,index+Math.max(1,target.length));
    }
    return ranges;
  }
  function mergeRangesLocal(ranges){
    return ranges
      .filter(([start,end])=>Number.isFinite(start)&&Number.isFinite(end)&&end>start)
      .sort((a,b)=>a[0]-b[0]||b[1]-a[1])
      .reduce((merged,range)=>{
        const last=merged[merged.length-1];
        if(!last||range[0]>last[1])merged.push([...range]);
        else last[1]=Math.max(last[1],range[1]);
        return merged;
      },[]);
  }
  function exactHighlightPreferred(query){
    const q=String(query||'').trim();
    const advancedExact=$('#matchModeSelect')?.value==='exact'||!!$('#exactPhraseInput')?.value.trim();
    return advancedExact||comparableLocal(q).split(/\s+/).filter(Boolean).length>1;
  }
  function improvedSearchHighlightRanges(text,query,options={}){
    const q=String(query||'').trim();
    if(!q)return [];
    const exact=comparableRangesLocal(text,q);
    if(exact.length)return mergeRangesLocal(exact);
    const exactOnly=options.exactOnly!==undefined?!!options.exactOnly:exactHighlightPreferred(q);
    if(exactOnly)return [];
    const words=searchWordsLocal(q);
    if(!words.length)return [];
    const haystack=comparableLocal(text);
    const mode=$('#matchModeSelect')?.value==='any'?'any':'all';
    const matched=mode==='any'?words.some(word=>haystack.includes(word)):words.every(word=>haystack.includes(word));
    if(!matched)return [];
    return mergeRangesLocal(words.flatMap(word=>comparableRangesLocal(text,word)));
  }
  function renderImprovedText(text,query){
    const ranges=improvedSearchHighlightRanges(text,query);
    const highlightCues=typeof highlightLegalPrincipleCues==='function'?highlightLegalPrincipleCues:value=>value;
    if(!ranges.length)return highlightCues(escapeLocal(text));
    let html='';
    let cursor=0;
    const source=String(text||'');
    for(const [start,end] of ranges){
      html+=highlightCues(escapeLocal(source.slice(cursor,start)));
      html+=`<mark class="judgment-search-hit">${highlightCues(escapeLocal(source.slice(start,end)))}</mark>`;
      cursor=end;
    }
    html+=highlightCues(escapeLocal(source.slice(cursor)));
    return html;
  }
  function sentenceActuallyMatches(sentence,query){
    const q=String(query||'').trim();
    if(!q)return false;
    if(improvedSearchHighlightRanges(sentence,q).length)return true;
    if(exactHighlightPreferred(q))return false;
    const haystack=comparableLocal(sentence);
    const words=searchWordsLocal(q);
    return words.length>0&&words.every(word=>haystack.includes(word));
  }
  function improvedFindSearchSnippet(text,query){
    const q=String(query||'').trim();
    if(!q)return '';
    const paragraphs=String(text||'').replace(/\r/g,'').split(/\n+/).map(line=>line.trim()).filter(Boolean);
    for(const paragraph of paragraphs){
      const sentence=splitSegmentsLocal(paragraph).find(part=>sentenceActuallyMatches(part,q));
      if(sentence){
        const clean=String(sentence).replace(/\s+/g,' ').trim();
        return clean.length>460?`${clean.slice(0,460).trim()}...`:clean;
      }
    }
    return '';
  }
  function improvedRenderDocSearchSnippetContent(doc,query,loaded=false){
    const q=String(query||'').trim();
    const meta=typeof searchResultMeta!=='undefined'?searchResultMeta.get(Number(doc.id)):null;
    const labels=typeof searchSectionLabels!=='undefined'?searchSectionLabels:fallbackSectionLabels;
    const render=typeof renderTextWithSearchHighlights==='function'?renderTextWithSearchHighlights:renderImprovedText;
    const metaMatches=meta?.snippet&&(!q||improvedSearchHighlightRanges(meta.snippet,q).length>0);
    if(metaMatches){
      const label=labels[meta.section]||'مقتطف مطابق';
      const score=Number(meta.score||0);
      return `<i class="ti ti-quote"></i><span><span class="doc-search-section">${escapeLocal(label)}</span>${score?`<span class="doc-search-score">${escapeLocal(Math.round(score))}</span>`:''}${render(meta.snippet,q)}</span>`;
    }
    const sentence=loaded||!doc.isIndexed
      ? improvedFindSearchSnippet(doc.body||'',q)||improvedFindSearchSnippet(doc.excerpt||'',q)||improvedFindSearchSnippet([doc.title,doc.appeal,doc.num,doc.court].join(' '),q)
      : '';
    if(sentence){
      const label=labels.body||'نص الحكم';
      return `<i class="ti ti-quote"></i><span><span class="doc-search-section">${escapeLocal(label)}</span>${render(sentence,q)}</span>`;
    }
    if(meta&&q){
      return `<i class="ti ti-loader-2"></i><span class="snippet-muted">جارٍ تحميل نص الحكم لإظهار العبارة المطابقة بدقة...</span>`;
    }
    if(!q)return '';
    if(!loaded&&doc.isIndexed)return '<i class="ti ti-loader-2"></i><span class="snippet-muted">جارٍ إظهار موضع النص المطابق...</span>';
    return '<i class="ti ti-file-search"></i><span class="snippet-muted">توجد نتيجة مطابقة في بيانات الحكم أو عنوانه.</span>';
  }
  async function improvedHydrateVisibleSearchSnippets(pageItems,query){
    const q=String(query||'').trim();
    if(!q)return;
    const token=++snippetHydrationToken;
    const needsHydration=pageItems.filter(item=>{
      const meta=searchResultMeta.get(Number(item.id));
      return !meta||!meta.snippet||meta.reason==='indexed'||!improvedSearchHighlightRanges(meta.snippet,q).length;
    });
    if(!needsHydration.length)return;
    const chunkIds=[...new Set(needsHydration.map(item=>item.chunk).filter(Boolean))];
    await Promise.all(chunkIds.map(loadJudgmentChunk));
    if(token!==snippetHydrationToken)return;
    needsHydration.forEach(item=>{
      const el=document.querySelector(`[data-doc-snippet="${Number(item.id)}"]`);
      if(!el)return;
      el.innerHTML=improvedRenderDocSearchSnippetContent(getLoadedJudgmentForSnippet(item),q,true);
    });
  }
  function improvedFullTextSearchShouldRun(result,filters){
    const phrase=comparableLocal(filters.exactPhrase||filters.query||'');
    const words=searchWordsLocal([filters.query,filters.exactPhrase].filter(Boolean).join(' '));
    if(!phrase&&!words.length)return false;
    if(filters.exactPhrase||phrase.includes(' ')||(filters.section&&filters.section!=='all'))return true;
    return !result?.results?.length&&phrase.length>=2;
  }

  try{searchWords=standaloneSearchWords;}catch(_){window.searchWords=standaloneSearchWords;}
  try{searchHighlightRanges=improvedSearchHighlightRanges;}catch(_){window.searchHighlightRanges=improvedSearchHighlightRanges;}
  try{renderTextWithSearchHighlights=renderImprovedText;}catch(_){window.renderTextWithSearchHighlights=renderImprovedText;}
  try{renderSearchMatchedSentence=(sentence,query)=>renderImprovedText(sentence,query);}catch(_){window.renderSearchMatchedSentence=(sentence,query)=>renderImprovedText(sentence,query);}
  try{findSearchSnippet=improvedFindSearchSnippet;}catch(_){window.findSearchSnippet=improvedFindSearchSnippet;}
  try{sentenceMatchesSearch=sentenceActuallyMatches;}catch(_){window.sentenceMatchesSearch=sentenceActuallyMatches;}
  try{renderDocSearchSnippetContent=improvedRenderDocSearchSnippetContent;}catch(_){window.renderDocSearchSnippetContent=improvedRenderDocSearchSnippetContent;}
  try{hydrateVisibleSearchSnippets=improvedHydrateVisibleSearchSnippets;}catch(_){window.hydrateVisibleSearchSnippets=improvedHydrateVisibleSearchSnippets;}
  try{fullTextSearchShouldRun=improvedFullTextSearchShouldRun;}catch(_){window.fullTextSearchShouldRun=improvedFullTextSearchShouldRun;}

  const originalJudgmentSearchPanel=typeof renderJudgmentSearchPanel==='function'?renderJudgmentSearchPanel:null;
  if(originalJudgmentSearchPanel){
    const improvedPanel=function(query='',body=''){
      const html=originalJudgmentSearchPanel(query,body);
      const tools=`<div class="reader-tool-strip" role="toolbar" aria-label="Judgment reader tools">
        <button type="button" onclick="decreaseReaderFont()"><i class="ti ti-text-decrease"></i><span>A-</span></button>
        <button type="button" onclick="increaseReaderFont()"><i class="ti ti-text-increase"></i><span>A+</span></button>
        <button type="button" onclick="copyCurrentJudgmentReference()"><i class="ti ti-link"></i><span>Copy reference</span></button>
        <button type="button" onclick="copySelectedJudgmentText()"><i class="ti ti-copy"></i><span>Copy selected</span></button>
        <button type="button" onclick="toggleReaderFocusMode()"><i class="ti ti-maximize"></i><span>Focus</span></button>
        <button type="button" onclick="window.print()"><i class="ti ti-printer"></i><span>Print</span></button>
      </div>`;
      return html.replace('</section>',`${tools}</section>`);
    };
    try{renderJudgmentSearchPanel=improvedPanel;}catch(_){window.renderJudgmentSearchPanel=improvedPanel;}
  }

  function setReaderSize(size){
    if(typeof sanadSettings==='undefined')return;
    sanadSettings={...sanadSettings,readerSize:size};
    if(typeof applySettings==='function')applySettings();
    if(typeof syncSettingsControls==='function')syncSettingsControls();
    if(typeof saveSanadSettings==='function')saveSanadSettings();
  }
  window.increaseReaderFont=function(){
    const order=['normal','large','xlarge'];
    const current=typeof sanadSettings!=='undefined'?sanadSettings.readerSize||'normal':'normal';
    setReaderSize(order[Math.min(order.indexOf(current)+1,order.length-1)]||'large');
    notify('تم تكبير خط القارئ.');
  };
  window.decreaseReaderFont=function(){
    const order=['normal','large','xlarge'];
    const current=typeof sanadSettings!=='undefined'?sanadSettings.readerSize||'normal':'normal';
    setReaderSize(order[Math.max(order.indexOf(current)-1,0)]||'normal');
    notify('تم تصغير خط القارئ.');
  };
  window.copyCurrentJudgmentReference=function(){
    const doc=typeof currentReaderDoc!=='undefined'&&currentReaderDoc?currentReaderDoc:null;
    if(!doc){notify('افتح الحكم أولا.');return;}
    const ref=typeof memoryReferenceForDoc==='function'?memoryReferenceForDoc(doc):[doc.title,doc.num,doc.court,doc.date].filter(Boolean).join(' | ');
    const href=typeof judgmentPageHref==='function'?new URL(judgmentPageHref(doc.id),location.href).href:location.href;
    navigator.clipboard?.writeText(`${ref}\n${href}`).then(()=>notify('تم نسخ مرجع الحكم.')).catch(()=>notify('تعذر النسخ تلقائيا.'));
  };
  window.copySelectedJudgmentText=function(){
    const text=window.getSelection?.().toString().replace(/\s+/g,' ').trim()||'';
    if(!text){notify('حدد نصا داخل الحكم أولا.');return;}
    navigator.clipboard?.writeText(text).then(()=>notify('تم نسخ النص المحدد.')).catch(()=>notify('تعذر النسخ تلقائيا.'));
  };
  window.toggleReaderFocusMode=function(){
    document.body.classList.toggle('reader-focus-mode');
    notify(document.body.classList.contains('reader-focus-mode')?'تم تفعيل وضع التركيز.':'تم إيقاف وضع التركيز.');
  };

  function setOfflineStatus(message,busy=false){
    const status=$('#sanadOfflineStatus');
    const settings=$('#settingsOfflineStatus');
    if(status)status.textContent=message;
    if(settings)settings.textContent=message;
    document.body.classList.toggle('offline-busy',!!busy);
  }
  async function storageEstimateText(){
    if(!navigator.storage?.estimate)return '';
    try{
      const estimate=await navigator.storage.estimate();
      const used=estimate.usage?Math.round(estimate.usage/1024/1024):0;
      const quota=estimate.quota?Math.round(estimate.quota/1024/1024):0;
      return quota?`${used} MB / ${quota} MB`:`${used} MB`;
    }catch(_){return '';}
  }
  async function refreshOfflineStatus(){
    const ready=localStorage.getItem('sanadOfflineReadyVersion')===OFFLINE_VERSION;
    setOfflineStatus(ready?'جاهز':'غير جاهز',false);
    const size=$('#sanadOfflineStorage');
    if(size)size.textContent=await storageEstimateText()||'غير متاح';
  }
  async function ensureServiceWorker(){
    if(!('serviceWorker' in navigator))throw new Error('Service worker is not available');
    await navigator.serviceWorker.register('./sw.js?v=offline-packs-20260906');
    return navigator.serviceWorker.ready;
  }
  async function prepareOfflineContent(options={}){
    try{
      if(!options.silent)setOfflineStatus('جارٍ التجهيز...',true);
      const registration=await ensureServiceWorker();
      const worker=registration.active||registration.waiting||navigator.serviceWorker.controller;
      if(!worker)throw new Error('Service worker is not active yet');
      worker.postMessage({type:'SANAD_CACHE_ALL',version:OFFLINE_VERSION});
      if(!options.silent)notify('بدأ تجهيز الأحكام والقوانين للعمل بدون إنترنت.');
    }catch(error){
      setOfflineStatus('تعذر التجهيز',false);
      if(!options.silent)notify('تعذر تجهيز المحتوى Offline الآن.');
    }
  }
  window.prepareOfflineContent=prepareOfflineContent;

  function handleOfflineWorkerMessage(event){
    const data=event.data||{};
    if(data.type==='SANAD_OFFLINE_PROGRESS'){
      const done=Number(data.done||0);
      const total=Number(data.total||0);
      setOfflineStatus(total?`${done}/${total}`:'جارٍ التجهيز...',true);
    }
    if(data.type==='SANAD_OFFLINE_READY'){
      localStorage.setItem('sanadOfflineReadyVersion',data.version||OFFLINE_VERSION);
      setOfflineStatus('جاهز',false);
      refreshOfflineStatus();
      notify('المحتوى أصبح جاهزا للعمل بدون إنترنت.');
    }
    if(data.type==='SANAD_OFFLINE_ERROR'){
      setOfflineStatus('تعذر التجهيز',false);
      notify(data.message||'تعذر تجهيز المحتوى Offline.');
    }
  }
  if('serviceWorker' in navigator){
    navigator.serviceWorker.addEventListener('message',handleOfflineWorkerMessage);
    window.addEventListener('online',()=>notify('عاد الاتصال بالإنترنت.'));
    window.addEventListener('offline',()=>notify('أنت الآن بدون إنترنت. سيتم استخدام المحتوى المحفوظ.'));
    window.addEventListener('load',()=>ensureServiceWorker().catch(()=>{}));
  }

  function ensureOfflinePanel(){
    const settingsGrid=$('#settingsPage .settings-grid');
    if(settingsGrid&&!$('#sanadOfflinePanel')){
      settingsGrid.insertAdjacentHTML('beforeend',`<div class="tool-panel wide sanad-offline-panel" id="sanadOfflinePanel">
        <div class="tool-panel-head"><i class="ti ti-cloud-down"></i><span>Offline phone pack</span></div>
        <p class="settings-note">يحفظ التطبيق الأحكام، فهارس البحث، القوانين، الأيقونات، والملفات الأساسية على الهاتف لاستخدامها عند انقطاع الإنترنت.</p>
        <div class="settings-info">
          <span>Offline: <strong id="settingsOfflineStatus">غير جاهز</strong></span>
          <span>Storage: <strong id="sanadOfflineStorage">...</strong></span>
        </div>
        <div class="settings-actions">
          <button class="tool-primary" type="button" onclick="prepareOfflineContent()"><i class="ti ti-download"></i>Prepare offline pack</button>
          <button class="tool-secondary" type="button" onclick="refreshOfflineStatus()"><i class="ti ti-refresh"></i>Check status</button>
        </div>
      </div>`);
    }
    const quick=$('#dashboardPage .quick-actions');
    if(quick&&!$('#dashboardOfflineAction')){
      quick.insertAdjacentHTML('beforeend',`<button class="tool-secondary" id="dashboardOfflineAction" type="button" onclick="prepareOfflineContent()"><i class="ti ti-cloud-down"></i>Offline</button>`);
    }
    refreshOfflineStatus();
  }
  window.refreshOfflineStatus=refreshOfflineStatus;

  function readJsonKey(key,fallback){
    try{return JSON.parse(localStorage.getItem(key)||'');}catch(_){return fallback;}
  }
  function currentPrivatePayload(){
    return {
      version:2,
      updatedAt:new Date().toISOString(),
      savedJudgmentIds:readJsonKey(vaultKeys.savedJudgmentIds,[]),
      memoryItems:readJsonKey(vaultKeys.memoryItems,[]),
      localJudgments:readJsonKey(vaultKeys.localJudgments,[]),
      feeItems:readJsonKey(vaultKeys.feeItems,[]),
      clientProfiles:readJsonKey(vaultKeys.clientProfiles,[]),
      settings:readJsonKey(vaultKeys.settings,{}),
      protection:readJsonKey(vaultKeys.protection,{})
    };
  }
  function setBackendStatus(message,busy=false){
    const el=$('#privateBackendStatus');
    if(el)el.textContent=message;
    document.body.classList.toggle('backend-busy',!!busy);
  }
  async function syncPrivateBackend(){
    const ok=typeof confirmAction==='function'
      ? await confirmAction({title:'Sync private data?',message:'This will upload local clients, invoices, excerpts, saved judgments, and settings to your authenticated private Cloudflare vault.',confirmLabel:'Sync now',icon:'ti-cloud-upload'})
      : confirm('Sync local SANAD data to the private backend?');
    if(!ok)return false;
    try{
      setBackendStatus('Syncing...',true);
      const response=await fetch(privateDataEndpoint,{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({data:currentPrivatePayload()})});
      if(!response.ok)throw new Error(`Backend ${response.status}`);
      const payload=await response.json();
      setBackendStatus(payload.updatedAt?`Synced ${new Date(payload.updatedAt).toLocaleString('en-AE')}`:'Synced',false);
      notify('Private backend sync completed.');
      return true;
    }catch(error){
      setBackendStatus('Local only',false);
      notify('Private backend is not available yet.');
      return false;
    }
  }
  async function restorePrivateBackend(){
    try{
      setBackendStatus('Loading...',true);
      const response=await fetch(privateDataEndpoint,{credentials:'same-origin'});
      if(!response.ok)throw new Error(`Backend ${response.status}`);
      const payload=await response.json();
      const data=payload.data||{};
      const ok=typeof confirmAction==='function'
        ? await confirmAction({title:'Restore private backend data?',message:'This will replace local clients, invoices, excerpts, saved judgments, and settings on this device.',confirmLabel:'Restore data',icon:'ti-cloud-download'})
        : confirm('Restore private backend data on this device?');
      if(!ok){setBackendStatus('Restore cancelled',false);return;}
      const pairs=[
        [vaultKeys.savedJudgmentIds,data.savedJudgmentIds||[]],
        [vaultKeys.memoryItems,data.memoryItems||[]],
        [vaultKeys.localJudgments,data.localJudgments||[]],
        [vaultKeys.feeItems,data.feeItems||[]],
        [vaultKeys.clientProfiles,data.clientProfiles||[]],
        [vaultKeys.settings,data.settings||{}],
        [vaultKeys.protection,data.protection||{}]
      ];
      pairs.forEach(([key,value])=>localStorage.setItem(key,JSON.stringify(value)));
      setBackendStatus('Restored',false);
      notify('Private backend data restored.');
      setTimeout(()=>location.reload(),700);
    }catch(error){
      setBackendStatus('Local only',false);
      notify('Could not restore private backend data.');
    }
  }
  window.syncPrivateBackend=syncPrivateBackend;
  window.restorePrivateBackend=restorePrivateBackend;
  function ensurePrivateBackendPanel(){
    const settingsGrid=$('#settingsPage .settings-grid');
    if(settingsGrid&&!$('#privateBackendPanel')){
      settingsGrid.insertAdjacentHTML('beforeend',`<div class="tool-panel wide private-backend-panel" id="privateBackendPanel" dir="ltr">
        <div class="tool-panel-head"><i class="ti ti-database-lock"></i><span>Private backend vault</span></div>
        <p class="settings-note">Authenticated Cloudflare storage for clients, invoices, important excerpts, local judgments, saved judgments, and settings. Nothing is uploaded automatically; use Sync now when you decide.</p>
        <div class="settings-info"><span>Status: <strong id="privateBackendStatus">Not checked</strong></span></div>
        <div class="settings-actions">
          <button class="tool-primary" type="button" onclick="syncPrivateBackend()"><i class="ti ti-cloud-upload"></i>Sync now</button>
          <button class="tool-secondary" type="button" onclick="restorePrivateBackend()"><i class="ti ti-cloud-download"></i>Restore to this device</button>
        </div>
      </div>`);
    }
  }

  const originalShowSettings=typeof showSettingsPage==='function'?showSettingsPage:null;
  if(originalShowSettings){
    window.showSettingsPage=function(){
      const result=originalShowSettings.apply(this,arguments);
      setTimeout(()=>{ensureOfflinePanel();ensurePrivateBackendPanel();refreshOfflineStatus();},0);
      return result;
    };
    try{showSettingsPage=window.showSettingsPage;}catch(_){}
  }
  const originalShowDashboard=typeof showDashboardPage==='function'?showDashboardPage:null;
  if(originalShowDashboard){
    window.showDashboardPage=function(){
      const result=originalShowDashboard.apply(this,arguments);
      setTimeout(ensureOfflinePanel,0);
      return result;
    };
    try{showDashboardPage=window.showDashboardPage;}catch(_){}
  }

  document.addEventListener('DOMContentLoaded',()=>{
    ensureOfflinePanel();
    ensurePrivateBackendPanel();
    refreshOfflineStatus();
  });
  setTimeout(()=>{
    ensureOfflinePanel();
    ensurePrivateBackendPanel();
    refreshOfflineStatus();
  },700);
})();

