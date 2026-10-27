// The judging app. Runs on one event (window.TALLY_EVENT, loaded by landing.js):
// its sections and entries, categories, scoring criteria, wording, and judge minimum.
// Shared helpers ($, esc, store, toast) come from landing.js.
const EVENT=window.TALLY_EVENT;
const CATS_LIST=EVENT.categories;
const CATS=Object.fromEntries(CATS_LIST.map(c=>[c.key,c.label]));
const CRITERIA=EVENT.criteria;
const STREETS=EVENT.sections;                       // sections: streets for Bellevue
const DATA=Object.fromEntries(STREETS.map(s=>[s.name,s.entries||[]]));
const STREET_LAYOUT=EVENT.layout==='streets';       // house numbers by block and side
const N=Object.assign({entry:'entry',entries:'entries',section:'section',sections:'sections',skip:'Skip'},EVENT.nouns||{});
const cap=s=>s.charAt(0).toUpperCase()+s.slice(1);
const an=w=>/^[aeiou]/i.test(w)?'an':'a';
const ICON=STREET_LAYOUT?'&#127968;':'&#127941;';
const K=name=>'tally_'+name+'_'+EVENT.id;          // phone storage, kept per event
const numSort=(a,b)=>parseInt(a,10)-parseInt(b,10)||String(a).localeCompare(String(b));
const CLOUD=Cloud.enabled;
const getVotes=()=>CLOUD?Cloud.votes:store.get(K('votes'),[]);
// Save or remove this judge's vote. Cloud mode keeps photos in their own documents.
function writeVote(vote,photo){
  if(CLOUD){Cloud.putVote(vote,photo);return true;}
  const votes=getVotes();const i=votes.findIndex(v=>v.address===vote.address&&v.judgeId===judgeId);
  vote.photo=photo||null;
  if(i>=0)votes[i]=vote;else votes.push(vote);
  return store.set(K('votes'),votes);
}
function deleteVote(address){
  if(CLOUD){Cloud.removeVote(address);return;}
  store.set(K('votes'),getVotes().filter(v=>!(v.address===address&&v.judgeId===judgeId)));
}
function myVote(address){return getVotes().find(v=>v.address===address&&v.judgeId===judgeId);}
// Photo markup; cloud photos load after render (see fillPhotos).
function thumb(v){
  const view=v?` data-view-house="${esc(v.address)}"`:'';
  if(v&&v.photo)return `<img class="thumb" src="${v.photo}"${view} alt="">`;
  if(v&&v.hasPhoto&&CLOUD)return `<img class="thumb" data-photo-id="${esc(v.id)}"${view} alt="">`;
  return `<div class="thumb">${ICON}</div>`;
}
function fillPhotos(root){
  root.querySelectorAll('img[data-photo-id]:not([src])').forEach(img=>{
    Cloud.photo(img.dataset.photoId).then(src=>{if(src)img.src=src;}).catch(()=>{});
  });
}
function judgeName(){
  let n=store.get('tally_judge_name','');
  while(!n){n=(prompt('Your name (shown to the other judges)')||'').trim();if(!n)return null;}
  store.set('tally_judge_name',n);return n;
}
const getSkips=()=>store.get(K('skips'),{});        // {address:true}
const getExtras=()=>store.get(K('extra'),{}); // {street:[num]}

function getJudgeId(){
  let id=store.get('tally_judge_id',null);
  if(!id){id='J'+Math.random().toString(36).slice(2,8).toUpperCase();store.set('tally_judge_id',id);}
  return id;
}
let judgeId=CLOUD?null:getJudgeId(); // Cloud mode: set to the Firebase user id once signed in.
// An entry's label: "1205 Greycourt Avenue" for streets, the entry's own name otherwise.
const addrOf=(num,street)=>STREET_LAYOUT?num+' '+street:String(num);
const applies=c=>!c.cats||(!!sheet.cat&&c.cats.includes(sheet.cat));

// ---------- Houses on a street ----------
function housesOn(street){
  const listed=DATA[street]||[];
  const extra=(getExtras()[street]||[]).filter(n=>!listed.includes(n));
  return {listed,extra,all:STREET_LAYOUT?[...listed,...extra].sort(numSort):[...listed,...extra]};
}
function houseState(num,street,votes,skips){
  const a=addrOf(num,street);
  const v=votes.find(v=>v.address===a&&v.judgeId===judgeId);
  if(v)return{state:'scored',vote:v};
  if(skips[a])return{state:'skipped'};
  return{state:'open'};
}
function streetProgress(street,votes=getVotes(),skips=getSkips()){
  const {all}=housesOn(street);
  let scored=0,skipped=0;
  all.forEach(n=>{const s=houseState(n,street,votes,skips).state;if(s==='scored')scored++;else if(s==='skipped')skipped++;});
  return{total:all.length,scored,skipped,done:scored+skipped};
}

// ---------- Streets screen ----------
function ring(pct,done){
  const r=15,c=2*Math.PI*r;
  return `<svg class="ring${done?' done':''}" viewBox="0 0 38 38"><circle class="ring-bg" cx="19" cy="19" r="${r}" fill="none" stroke-width="4"/>
  <circle class="ring-fg" cx="19" cy="19" r="${r}" fill="none" stroke-width="4" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c*(1-pct)}" transform="rotate(-90 19 19)"/></svg>`;
}
function renderStreets(){
  const votes=getVotes(),skips=getSkips();
  let tot=0,done=0,scored=0,streetsDone=0;
  const row=s=>{
    const p=streetProgress(s.name,votes,skips);
    tot+=p.total;done+=p.done;scored+=p.scored;
    const complete=p.total>0&&p.done===p.total;if(complete)streetsDone++;
    const meta=p.total?`${p.scored} scored &middot; ${p.done}/${p.total} ${N.entries} reviewed`:STREET_LAYOUT?'No address list yet':`No ${N.entries}`;
    return `<button class="street-row" data-street="${esc(s.name)}">${ring(p.total?p.done/p.total:0,complete)}
      <div style="flex:1;min-width:0"><div class="street-name">${esc(s.name)}</div><div class="street-meta">${meta}</div></div><span class="chev">&#8250;</span></button>`;
  };
  const interior=STREETS.filter(s=>!s.boundary).map(row).join('');
  const boundary=STREETS.filter(s=>s.boundary).map(row).join('');
  $('street-groups').innerHTML=boundary
    ?`<div class="section-label">Interior ${N.sections}</div><div class="street-list">${interior}</div>
     <div class="section-label">Boundary ${N.sections}</div><div class="street-list">${boundary}</div>`
    :`<div class="section-label">${cap(N.sections)}</div><div class="street-list">${interior}</div>`;
  $('overall-bar').style.width=(tot?done/tot*100:0)+'%';
  $('overall-text').textContent=`${streetsDone} of ${STREETS.length} ${N.sections} done · ${scored} ${scored===1?N.entry:N.entries} scored`;
  const loaded=Object.values(DATA).some(l=>l.length);
  $('data-warning').style.display=loaded||!STREET_LAYOUT?'none':'block';
  $('data-warning').textContent='No address list loaded yet. Run scripts/build-addresses.mjs to import real house numbers. Until then, add houses by hand on each street.';
}

// ---------- Street screen ----------
let currentStreet=null;
function openStreet(street){
  currentStreet=street;
  showScreen('street');
  renderStreet();
  window.scrollTo(0,0);
}
function renderStreet(){
  const street=currentStreet;if(!street)return;
  const votes=getVotes(),skips=getSkips();
  const {listed,extra,all}=housesOn(street);
  const p=streetProgress(street,votes,skips);
  $('street-title').textContent=street;
  $('street-sub').textContent=p.total?`${p.scored} scored · ${p.skipped} skipped · ${p.total-p.done} to go`:`No ${N.entries} yet`;
  $('street-bar').style.width=(p.total?p.done/p.total*100:0)+'%';
  $('street-nodata').style.display=listed.length||!STREET_LAYOUT?'none':'block';
  const chip=n=>{
    const s=houseState(n,street,votes,skips);
    const label=s.state==='scored'?'&#11088; '+s.vote.total:s.state==='skipped'?'skip':'';
    return `<button class="house ${s.state}${extra.includes(n)?' extra':''}" data-house="${esc(n)}"><span>${esc(n)}</span><span class="st">${label}</span></button>`;
  };
  if(!STREET_LAYOUT){
    // Named entries: one column, in the organizer's order.
    $('sides-head').innerHTML='';
    $('blocks').innerHTML=`<div class="houses">${all.map(chip).join('')||`<div class="empty-side">No ${N.entries}</div>`}</div>`;
    return;
  }
  // Group by block (1200s, 1300s...) so both sides of the same block line up.
  const blocks=new Map();
  all.forEach(n=>{const b=Math.floor(parseInt(n,10)/100)*100;if(!blocks.has(b))blocks.set(b,[]);blocks.get(b).push(n);});
  const side=list=>`<div class="houses">${list.map(chip).join('')||'<div class="empty-side">None</div>'}</div>`;
  // Boundary streets are judged on the Bellevue side only, shown as one column.
  const cfg=STREETS.find(s=>s.name===street)||{};
  const one=!!cfg.side;
  $('sides-head').className='sides sides-head'+(one?' one':'');
  $('sides-head').innerHTML=one?`<div class="side-head">${esc(cfg.sideLabel||'Bellevue side')} only</div>`:'<div class="side-head">Odd side</div><div class="side-head">Even side</div>';
  $('blocks').innerHTML=[...blocks].map(([b,list])=>`<div class="block"><div class="block-head">${b} block</div>
    <div class="sides${one?' one':''}">${one?side(list):side(list.filter(n=>parseInt(n,10)%2===1))+side(list.filter(n=>parseInt(n,10)%2===0))}</div></div>`).join('');
}
function addHouse(){
  const input=$('add-house-input');const n=input.value.trim().toUpperCase();
  if(!/^\d+[A-Z]?$/.test(n)){toast(`Enter ${an(N.entry)} ${N.entry} number`);return;}
  const extras=getExtras();const list=extras[currentStreet]||[];
  if(!housesOn(currentStreet).all.includes(n)){list.push(n);extras[currentStreet]=list;store.set(K('extra'),extras);}
  input.value='';renderStreet();openSheet(n);
}
function finishStreet(){
  const votes=getVotes(),skips=getSkips();
  const open=housesOn(currentStreet).all.filter(n=>houseState(n,currentStreet,votes,skips).state==='open');
  if(!open.length){toast(`${cap(N.section)} already complete`);return;}
  if(!confirm(`Mark ${open.length} remaining ${open.length>1?N.entries:N.entry} as ${N.skip.toLowerCase()}?`))return;
  open.forEach(n=>skips[addrOf(n,currentStreet)]=true);
  store.set(K('skips'),skips);renderStreet();toast(`${cap(N.section)} done`);
}
function shareStreet(){
  const url=location.href.split(/[?#]/)[0]+'?event='+EVENT.id+'&street='+encodeURIComponent(currentStreet);
  if(navigator.share){navigator.share({title:'Judge '+currentStreet,url}).catch(()=>{});}
  else navigator.clipboard.writeText(url).then(()=>toast('Link copied'),()=>prompt('Copy this link',url));
}

// ---------- Score sheet ----------
let sheet={num:null,cat:null,scores:{},photo:null,dirty:false,open:false};
// Drop scores for criteria that don't apply to the chosen category.
function pruneScores(){for(const c of CRITERIA)if(!applies(c))delete sheet.scores[c.key];}
function openSheet(num,presetCat){
  const a=addrOf(num,currentStreet);
  const existing=myVote(a);
  sheet={num,street:currentStreet,cat:existing?existing.category:(presetCat||null),
    scores:existing&&existing.scores?{...existing.scores}:{},
    photo:existing?existing.photo||null:null,dirty:false,open:true};
  if(existing&&existing.hasPhoto&&CLOUD)Cloud.photo(existing.id).then(p=>{if(sheet.open&&sheet.num===num&&!sheet.photo)setPhoto(p);});
  $('sheet-addr').textContent=a;
  $('sheet-back').innerHTML='&#8249; Back to '+esc(currentStreet);
  const callNow=CLOUD&&Cloud.session&&Cloud.session.current;
  const redo=existing&&callNow&&callNow.street===currentStreet&&callNow.num===String(num)&&existing.callId!==callNow.callId;
  $('sheet-status').textContent=redo?'Your earlier scores are filled in. Save to count them for this round.'
    :existing?'Already scored. Saving updates your vote.':getSkips()[a]?`Marked as ${N.skip.toLowerCase()}`:'';
  $('clear-house-btn').style.display=(existing||getSkips()[a])?'':'none';
  $('notes-input').value=existing?existing.notes:'';
  renderSheet();setPhoto(sheet.photo);renderHostPanel();
  $('sheet').scrollTop=0;
  $('sheet').classList.add('open');$('sheet-backdrop').classList.add('open');
}
function closeSheet(){sheet.open=false;$('sheet').classList.remove('open');$('sheet-backdrop').classList.remove('open');renderCallbar();}
// An official vote is locked once its house's voting closes.
function voteLocked(){
  if(!CLOUD||!sheet.open)return false;
  const v=myVote(addrOf(sheet.num,sheet.street));
  if(!v||!v.callId||isCancelled(v))return false;
  const c=Cloud.session&&Cloud.session.current;
  return !(c&&c.callId===v.callId&&Cloud.sessionCode===v.sessionCode);
}
// In a session, the host picks the category when opening voting; everyone's sheet locks to it.
function lockedCat(){const c=calledHere();return c&&c.cat?c.cat:null;}
function renderSheet(){
  const ro=voteLocked();
  $('sheet-actions').style.display=ro?'none':'';
  $('photo-zone').style.pointerEvents=ro?'none':'';
  $('notes-input').readOnly=ro;
  if(ro)$('sheet-status').textContent=`Voting on this ${N.entry} has closed. Your vote is locked and counts.`;
  const lock=ro?sheet.cat:lockedCat();
  if(lock&&sheet.cat!==lock){sheet.cat=lock;pruneScores();}
  $('cat-chips').innerHTML=lock
    ?`<button class="chip on" disabled>${esc(CATS[lock])}</button><span class="muted" style="align-self:center;font-size:12px">${ro?'Locked':'Set by the host'}</span>`
    :CATS_LIST.map(c=>`<button class="chip${sheet.cat===c.key?' on':''}" data-cat="${c.key}">${esc(c.label)}</button>`).join('');
  const stars=k=>[1,2,3,4,5].map(i=>`<button class="star${(sheet.scores[k]||0)>=i?' on':''}" data-star="${i}"${ro?' disabled':''} aria-label="${i} star">&#9733;</button>`).join('');
  $('criteria').innerHTML=CRITERIA.filter(applies).map(c=>`<div class="score-group">
    <div class="score-label">${esc(c.label)}${c.cats?` <span class="pill">${esc(c.cats.map(k=>CATS[k]).join(', '))} only</span>`:''}</div>
    ${c.desc?`<div class="score-desc">${esc(c.desc)}</div>`:''}<div class="stars" data-key="${esc(c.key)}">${stars(c.key)}</div></div>`).join('');
}
function setPhoto(src){
  sheet.photo=src||null;
  $('photo-preview').style.display=src?'':'none';$('photo-zone').style.display=src?'none':'';
  if(src)$('photo-img').src=src;else $('photo-input').value='';
}
// Synced photos are kept large enough to print or post (1600px, under Firestore's 1 MB
// document limit). Phone-only mode stays small to fit in browser storage.
function shrinkPhoto(img){
  const LIMIT=900000;let max=CLOUD?1600:600,q=CLOUD?0.82:0.7,out;
  for(let tries=0;tries<8;tries++){
    const scale=Math.min(1,max/Math.max(img.width,img.height));
    const cv=document.createElement('canvas');cv.width=Math.round(img.width*scale);cv.height=Math.round(img.height*scale);
    cv.getContext('2d').drawImage(img,0,0,cv.width,cv.height);
    out=cv.toDataURL('image/jpeg',q);
    if(!CLOUD||out.length<=LIMIT)break;
    if(q>0.6)q-=0.1;else max=Math.round(max*0.85);
  }
  return out;
}
function handlePhoto(file){
  if(!file)return;
  const img=new Image();
  img.onload=()=>{
    URL.revokeObjectURL(img.src);setPhoto(shrinkPhoto(img));sheet.dirty=true;
  };
  img.src=URL.createObjectURL(file);
}
// The house the host has called, if this sheet is showing it.
function calledHere(){
  const c=CLOUD&&Cloud.session&&Cloud.session.current;
  return c&&c.street===sheet.street&&c.num===String(sheet.num)?c:null;
}
// After saving or skipping, go back to the street's house list (not every house is decorated,
// so there's no sensible "next house"). The host stays on an open house to watch votes come in;
// only Close voting ends it.
function afterVote(msg){
  renderStreet();
  const called=calledHere();
  if(called&&Cloud.isHost()){sheet.dirty=false;$('sheet-status').textContent='Your vote is saved. Close voting when everyone is done.';renderHostPanel();$('sheet').scrollTo({top:0,behavior:'smooth'});toast(msg);return;}
  if(called){Cloud.markDone(called.callId);closeSheet();toast(msg+' · waiting for the host');return;}
  closeSheet();toast(msg);
}
function cancelHouse(){
  const c=Cloud.session&&Cloud.session.current;if(!c)return;
  if(!confirm(`Cancel voting on ${addrOf(c.num,c.street)}?\n\nUse this if you opened the wrong ${N.entry} or picked the wrong category. Any scores already given for it won't count. You can open it again afterward.`))return;
  Cloud.cancelHouse().then(()=>{closeSheet();toast('Voting cancelled');}).catch(()=>toast('Could not cancel. Try again.'));
}
function closeVoting(){
  const c=calledHere()||(Cloud.session&&Cloud.session.current);if(!c)return;
  const waiting=Cloud.judges.filter(j=>judgeStatus(j,c).cls==='st-wait').map(j=>j.name);
  if(waiting.length&&!confirm(`Still waiting on ${waiting.join(', ')}. Close voting anyway?`))return;
  Cloud.callHouse(null);closeSheet();toast('Voting closed');
}
function saveVote(){
  const {cat,scores:s}=sheet;
  if(CLOUD&&!judgeId){toast('Still connecting. Try again in a moment.');return;}
  if(EVENT.status==='ended'){toast('This event has ended');return;}
  if(!cat){toast('Pick a category');return;}
  const crit=CRITERIA.filter(applies);
  const missing=crit.filter(c=>!s[c.key]);
  if(missing.length){toast('Rate '+missing.map(c=>c.label).join(', '));return;}
  const a=addrOf(sheet.num,currentStreet);
  const scores=Object.fromEntries(crit.map(c=>[c.key,s[c.key]]));
  const total=Math.round(crit.reduce((t,c)=>t+s[c.key],0)/crit.length*10)/10;
  const vote={judgeId,judgeName:store.get('tally_judge_name','')||null,timestamp:new Date().toISOString(),address:a,street:currentStreet,houseNum:String(sheet.num),
    category:cat,categoryName:CATS[cat],scores,notes:$('notes-input').value.trim(),total};
  // Official only when the host has this house open; tagged so the rules and standings can check it.
  const called=calledHere();
  vote.sessionCode=called?Cloud.sessionCode:null;vote.callId=called?called.callId:null;
  if(!writeVote(vote,sheet.photo))return;
  const skips=getSkips();if(skips[a]){delete skips[a];store.set(K('skips'),skips);}
  afterVote('Saved '+a);
}
function skipHouse(){
  const a=addrOf(sheet.num,currentStreet);
  if(myVote(a))deleteVote(a);
  const skips=getSkips();skips[a]=true;store.set(K('skips'),skips);
  afterVote('Skipped '+a);
}
function clearHouse(){
  const a=addrOf(sheet.num,currentStreet);
  if(!confirm('Clear your vote for '+a+'?'))return;
  if(myVote(a))deleteVote(a);
  const skips=getSkips();delete skips[a];store.set(K('skips'),skips);
  closeSheet();renderStreet();
}

// ---------- My votes / results / export ----------
function renderMyVotes(){
  const votes=getVotes().filter(v=>v.judgeId===judgeId).sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp));
  $('my-vote-count').textContent=votes.length;
  $('my-avg-score').textContent=votes.length?(votes.reduce((a,v)=>a+v.total,0)/votes.length).toFixed(1):'—';
  $('my-votes-list').innerHTML=votes.length?votes.map(v=>`
    <div class="vote-item" data-edit-street="${esc(v.street)}" data-edit-num="${esc(v.houseNum)}">
      ${thumb(v)}
      <div style="flex:1;min-width:0"><div class="vote-addr">${esc(v.address)}</div>
        <span class="cat-badge cat-${esc(v.category)}">${esc(v.categoryName)}</span>
        ${v.notes?`<div class="muted" style="font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(v.notes)}</div>`:''}</div>
      <div class="vote-score">&#11088;${v.total}</div></div>`).join('')
    :`<div class="empty-state"><div style="font-size:32px;margin-bottom:8px">${ICON}</div>No votes yet. Pick ${an(N.section)} ${N.section} to start.</div>`;
  if(CLOUD)fillPhotos($('my-votes-list'));
}
// Houses per category, best average first.
// Official = cast on a house the host opened in a group. Phone-only mode has no groups, so every vote counts.
const isCancelled=v=>CLOUD&&!!v.callId&&Cloud.cancelled.has(v.callId);
const isOfficial=v=>!CLOUD||(!!v.callId&&!isCancelled(v));
const MIN_JUDGES=EVENT.minJudges||3;
// Houses per category, best average first. Official votes only unless includeAll.
function rankings(includeAll){
  const groups={};
  getVotes().filter(v=>includeAll||isOfficial(v)).forEach(v=>{
    const g=groups[v.category]=groups[v.category]||{};
    const h=g[v.address]=g[v.address]||{address:v.address,totals:[],photoVote:null};
    h.totals.push(v.total);if((v.photo||v.hasPhoto)&&!h.photoVote)h.photoVote=v;
  });
  const out={};
  for(const k in groups)out[k]=Object.values(groups[k]).map(h=>({...h,avg:Math.round(h.totals.reduce((a,b)=>a+b,0)/h.totals.length*10)/10})).sort((a,b)=>b.avg-a.avg);
  return out;
}
// Houses that qualify to place: official votes from at least MIN_JUDGES judges (phone-only: any).
function placings(){
  const all=rankings(),out={};
  for(const k in all){const q=all[k].filter(h=>!CLOUD||h.totals.length>=MIN_JUDGES);if(q.length)out[k]=q;}
  return out;
}
function renderResults(){
  const groups=placings(),all=rankings();
  const el=$('results-content');
  const short=CLOUD?Object.entries(all).flatMap(([k,hs])=>hs.filter(h=>h.totals.length<MIN_JUDGES).map(h=>({...h,cat:k}))):[];
  const unofficial=CLOUD?getVotes().filter(v=>!isOfficial(v)&&!isCancelled(v)):[];
  const cancelled=CLOUD?getVotes().filter(isCancelled):[];
  if(!Object.keys(groups).length&&!short.length&&!unofficial.length&&!cancelled.length){el.innerHTML='<div class="empty-state"><div style="font-size:32px;margin-bottom:8px">&#127942;</div>No votes yet.</div>';return;}
  const rule=CLOUD?`<p class="muted" style="margin:0 4px 12px;font-size:12px">Only votes cast in a judging group on ${an(N.entry)} ${N.entry} the host opened count. ${cap(an(N.entry))} ${N.entry} places once ${MIN_JUDGES} judge${MIN_JUDGES===1?' has':'s have'} scored it.</p>`:'';
  const voteRow=v=>`<div class="vote-item" style="cursor:default">${thumb(v)}<div style="flex:1"><div class="vote-addr">${esc(v.address)}</div>
        <div class="muted" style="font-size:11px">${[v.judgeName||'Judge',CATS[v.category],v.timestamp&&!isNaN(new Date(v.timestamp))?new Date(v.timestamp).toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):''].filter(Boolean).map(esc).join(' &middot; ')}</div></div><div class="vote-score" style="color:#aaa">${v.total}</div></div>`;
  const audit=CLOUD&&(short.length||unofficial.length||cancelled.length)?`<div class="section-label">Not counted</div>
    ${short.length?`<div class="card" style="padding:0 0 4px"><div class="card-title" style="padding:14px 14px 0;font-size:14px">Needs ${MIN_JUDGES} judges</div>
      ${short.map(h=>`<div class="vote-item" style="cursor:default">${thumb(h.photoVote)}<div style="flex:1"><div class="vote-addr">${esc(h.address)}</div>
        <div class="muted" style="font-size:11px">${esc(CATS[h.cat])} &middot; ${h.totals.length} of ${MIN_JUDGES} judges</div></div><div class="vote-score" style="color:#aaa">${h.avg}</div></div>`).join('')}</div>`:''}
    ${unofficial.length?`<div class="card" style="padding:0 0 4px"><div class="card-title" style="padding:14px 14px 0;font-size:14px">Outside a judging group</div>
      ${unofficial.sort((a,b)=>a.address.localeCompare(b.address)).map(voteRow).join('')}</div>`:''}
    ${cancelled.length?`<div class="card" style="padding:0 0 4px"><div class="card-title" style="padding:14px 14px 0;font-size:14px">Cancelled by the host (wrong ${N.entry})</div>
      ${cancelled.sort((a,b)=>a.address.localeCompare(b.address)).map(voteRow).join('')}</div>`:''}`:'';
  el.innerHTML=rule+(Object.keys(groups).length?'':`<div class="empty-state" style="padding:16px">No ${N.entry} has ${MIN_JUDGES} judges yet.</div>`)+CATS_LIST.filter(c=>groups[c.key]).map(c=>{
    const ranked=groups[c.key];
    return `<div class="card" style="padding:0 0 4px"><div class="card-title" style="padding:14px 14px 0">${esc(c.label)}</div>
      ${ranked.map((h,i)=>`<div class="vote-item" style="cursor:default">
        ${thumb(h.photoVote)}
        <div style="flex:1"><div class="vote-addr">${['&#129351; ','&#129352; ','&#129353; '][i]||''}${esc(h.address)}</div>
        <div class="muted" style="font-size:11px">${h.totals.length} vote${h.totals.length!==1?'s':''}</div></div>
        <div class="vote-score">${h.avg}</div></div>`).join('')}</div>`;
  }).join('')+audit;
  if(CLOUD)fillPhotos(el);
}
function renderExport(){
  const votes=getVotes();
  $('export-count').textContent=votes.length;
  $('export-houses').textContent=new Set(votes.map(v=>v.address)).size;
  const n=Object.values(DATA).reduce((a,l)=>a+l.length,0);
  $('data-card').style.display=EVENT.source?'':'none';
  if(EVENT.source)$('data-source').textContent=`${n} ${N.entries} imported ${EVENT.sourceDate?new Date(EVENT.sourceDate).toLocaleDateString()+' ':''}from ${EVENT.source}.`;
  renderEventCard();
}
// Event code, share link, and (for the organizer) ending the event.
function renderEventCard(){
  const el=$('event-card');
  if(!CLOUD){el.style.display='none';return;}
  const organizer=!!EVENT.createdBy&&EVENT.createdBy===judgeId;
  el.innerHTML=`<div class="card-title">This event</div>
    <p class="muted">Event code <b style="letter-spacing:.08em;color:var(--green)">${esc(EVENT.id)}</b>${EVENT.status==='ended'?' &middot; ended':''}${organizer?' &middot; you organize it':''}</p>
    <button class="btn btn-secondary" data-action="share-event">Share event link</button>
    ${organizer&&EVENT.status!=='ended'?'<button class="btn btn-danger" data-action="end-event">End this event</button>':''}`;
}
function shareEvent(){
  const url=location.href.split(/[?#]/)[0]+'?event='+EVENT.id;
  if(navigator.share)navigator.share({title:EVENT.name,text:'Judge '+EVENT.name+' on Tally (event '+EVENT.id+')',url}).catch(()=>{});
  else navigator.clipboard.writeText(url).then(()=>toast('Event link copied'),()=>prompt('Copy this link',url));
}
async function endEvent(){
  if(!confirm(`End ${EVENT.name} for everyone?\n\nNo more votes can be cast. Standings, photos, and exports stay available.`))return;
  try{await Cloud.endEvent();toast('Event ended');}catch(e){toast('Could not end the event. Try again.');}
}
function renderEventBanner(){$('event-ended').style.display=EVENT.status==='ended'?'block':'none';}
function exportCSV(){
  const votes=getVotes();if(!votes.length){toast('No votes to export');return;}
  const cols=[['judgeId'],['judgeName'],['timestamp'],['entry',v=>v.address],[N.section,v=>v.street],['category'],['categoryName'],
    ...CRITERIA.map(c=>[c.label,v=>v.scores&&v.scores[c.key]]),['total'],['notes'],['hasPhoto',v=>v.photo||v.hasPhoto?'yes':'no'],
    ['official',v=>isOfficial(v)?'yes':'no'],['sessionCode'],['callId']];
  const headers=cols.map(c=>c[0]);
  const cell=v=>{v=String(v??'');return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;};
  const rows=votes.map(v=>cols.map(([h,f])=>cell(f?f(v):v[h])).join(','));
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([[headers.join(','),...rows].join('\n')],{type:'text/csv'}));
  a.download=`${fileSafe(EVENT.name).toLowerCase()}-votes-${CLOUD?'all-judges':judgeId}-${new Date().toISOString().slice(0,10)}.csv`;a.click();
}
function clearAll(){
  if(!confirm(`Delete ALL votes, skips, and added ${N.entries} for this event on this device? This cannot be undone.`))return;
  [K('votes'),K('skips'),K('extra')].forEach(k=>localStorage.removeItem(k));
  renderAll();toast('Cleared');
}

// ---------- Judging sessions (cloud only) ----------
function renderSessionCard(){
  const el=$('session-card');
  if(!CLOUD){el.innerHTML='';return;}
  const off=Cloud.online?'':'<span class="offline">Offline · will sync</span>';
  if(!Cloud.sessionCode){
    refreshGroups();
    const last=store.get(K('last_group'),null);
    const groups=activeGroups||[];
    const rejoin=last&&groups.find(g=>g.code===last.code);
    const others=groups.filter(g=>g!==rejoin);
    const row=g=>`<div class="row" style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #F4F0E4">
        <span><b>${esc(g.hostName)}'s group</b><br><span class="muted" style="font-size:12px">${g.judges} judge${g.judges!==1?'s':''} &middot; code ${esc(g.code)}</span></span>
        <button class="btn btn-secondary btn-sm" data-join-group="${esc(g.code)}">Join</button></div>`;
    el.innerHTML=`<div class="card"><div class="card-title">Judging groups${off}</div>
      ${rejoin?`<button class="btn btn-primary" style="margin:0 0 10px" data-join-group="${esc(rejoin.code)}">Rejoin ${esc(rejoin.hostName)}'s group</button>`:''}
      ${others.length?`<div class="muted" style="font-size:12px">Judging now:</div>${others.map(row).join('')}`
        :!rejoin?`<p class="muted">${activeGroups?'No groups are judging right now.':'Looking for groups...'} Only votes cast in a group count.</p>`:''}
      <div class="btn-row" style="margin-top:6px"><button class="btn ${groups.length?'btn-ghost':'btn-primary'}" data-action="start-session">Start a new group</button>
      <button class="btn btn-ghost" data-action="join-session">Join with code</button></div></div>`;
    return;
  }
  const s=Cloud.session;
  const host=Cloud.isHost();
  if(host&&pickingHost){
    const others=Cloud.judges.filter(j=>j.uid!==judgeId);
    el.innerHTML=`<div class="card"><div class="card-title">Who should host?</div>
      <p class="muted" style="margin-bottom:6px">They'll open and close voting. You stay on as a judge.</p>
      ${others.length?others.map(j=>`<button class="btn btn-secondary" data-make-host="${esc(j.uid)}">Make ${esc(j.name)} host</button>`).join(''):'<p class="muted">No other judges have joined yet.</p>'}
      <button class="btn btn-ghost" data-action="cancel-pick-host">Cancel</button></div>`;
    return;
  }
  const pills=Cloud.judges.map(j=>{
    const isH=s&&j.uid===s.hostUid;
    const rm=host&&!isH?` <button class="pill-x" data-remove-judge="${esc(j.uid)}" aria-label="Remove ${esc(j.name)}">&#215;</button>`:'';
    return `<span class="judge-pill${isH?' host':''}">${esc(j.name)}${isH?' · host':''}${rm}</span>`;}).join('');
  el.innerHTML=`<div class="card"><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
      <div><div class="muted">Group code${off}</div><div class="session-code">${esc(Cloud.sessionCode)}</div></div>
      <div class="muted" style="text-align:right">${host?'You are the host':s?'Host: '+esc(s.hostName):'Connecting...'}</div></div>
    <div class="judge-pills">${pills}</div>
    ${host?`<p class="muted" style="margin:6px 0 0">Open ${an(N.section)} ${N.section} and tap ${an(N.entry)} ${N.entry}, then tap <b>Open voting</b>. Tap &#215; to remove a judge who left.</p>`:''}
    <div class="btn-row"><button class="btn btn-secondary" data-action="invite">Invite judges</button>
    <button class="btn btn-ghost" data-action="leave-session">Leave</button></div>
    ${s?(host?'<button class="btn btn-ghost" data-action="pick-host">Hand off hosting</button>'
      :'<button class="btn btn-ghost" data-action="claim-host">Take over hosting</button>'):''}
    ${host?'<button class="btn btn-danger" data-action="end-session">End judging group</button>':''}</div>`;
}
// Active groups, refreshed at most every 15 seconds while this phone isn't in one.
let activeGroups=null,groupsFetchedAt=0,groupsLoading=false;
function refreshGroups(force){
  if(!CLOUD||!Cloud.uid||Cloud.sessionCode||groupsLoading)return;
  if(!force&&Date.now()-groupsFetchedAt<15000)return;
  groupsLoading=true;groupsFetchedAt=Date.now();
  Cloud.listActiveSessions().then(g=>{activeGroups=g;}).catch(()=>{activeGroups=activeGroups||[];})
    .finally(()=>{groupsLoading=false;renderSessionCard();});
}
setInterval(()=>{if(document.visibilityState==='visible')refreshGroups();},20000);
async function endSession(){
  const c=Cloud.session&&Cloud.session.current;
  const msg='End this judging group for everyone?\n\n'+(c?`Voting on ${addrOf(c.num,c.street)} is still open and will close. `:'')
    +'All judges leave the group and it cannot be reopened. Votes already cast are kept.';
  if(!confirm(msg))return;
  try{await Cloud.endSession();}catch(e){toast('Could not end the group. Try again.');}
}
let pickingHost=false;
async function makeHost(uid){
  const j=Cloud.judges.find(j=>j.uid===uid);if(!j)return;
  if(Cloud.session.current&&!confirm(`Voting is open on ${addrOf(Cloud.session.current.num,Cloud.session.current.street)}. ${j.name} will take it over. Continue?`))return;
  if(!Cloud.session.current&&!confirm(`Make ${j.name} the host?`))return;
  pickingHost=false;
  try{await Cloud.makeHost(uid);}catch(e){toast('Could not change host. Try again.');}
  renderAll();
}
async function claimHost(){
  const s=Cloud.session;if(!s)return;
  if(!confirm(`Take over hosting from ${s.hostName}? Do this if they can't run the group. You'll open and close voting for everyone.`))return;
  const name=judgeName();if(!name)return;
  try{await Cloud.claimHost(name);}catch(e){toast('Could not take over. Try again.');}
}
// Only a vote cast during this opening of the house counts as done.
const voteForCall=(uid,c)=>getVotes().find(v=>v.judgeId===uid&&v.callId===c.callId&&v.address===addrOf(c.num,c.street));
function judgeStatus(j,c){
  const v=voteForCall(j.uid,c);
  if(v)return{cls:'st-done',text:'&#10003; '+v.total};
  if(j.doneCallId===c.callId)return{cls:'st-skip',text:'skipped'};
  return{cls:'st-wait',text:'waiting'};
}
function renderHostPanel(){
  const el=$('host-panel');
  if(!CLOUD||!Cloud.session||!sheet.open){el.innerHTML='';return;}
  const called=calledHere();
  if(!Cloud.isHost()){
    el.innerHTML=called?`<div class="alert alert-info" style="margin:0 0 12px">&#128227; The host opened voting on this ${N.entry}.</div>`:'';
    return;
  }
  if(!called){
    const other=Cloud.session.current;
    el.innerHTML=other
      ?`<div class="alert alert-warn" style="margin:0 0 14px">Voting is still open on <b>${esc(addrOf(other.num,other.street))}</b>. Close it before opening another ${N.entry}.
         <button class="btn btn-secondary" style="margin-top:8px" data-action="go-call">Go to ${esc(addrOf(other.num,other.street))}</button></div>`
      :sheet.cat
        ?`<button class="btn btn-gold" style="margin:0 0 14px" data-action="call-house">&#128227; Open voting: ${esc(CATS[sheet.cat])}</button>`
        :`<div class="alert alert-info" style="margin:0 0 14px">&#128227; Pick a category below, then open voting. Every judge scores this ${N.entry} in that category.</div>`;
    return;
  }
  const rows=Cloud.judges.map(j=>{const st=judgeStatus(j,called);
    const rm=st.cls==='st-wait'&&j.uid!==judgeId?` <button class="row-x" data-remove-judge="${esc(j.uid)}">remove</button>`:'';
    return `<div class="row"><span>${esc(j.name)}${j.uid===judgeId?' (you)':''}</span><span class="${st.cls}">${st.text}${rm}</span></div>`;}).join('');
  const done=Cloud.judges.filter(j=>judgeStatus(j,called).cls!=='st-wait').length;
  el.innerHTML=`<div class="host-panel"><div style="display:flex;justify-content:space-between;margin-bottom:6px">
    <b style="color:var(--green)">&#128227; Voting open</b><span class="muted">${done} of ${Cloud.judges.length} done</span></div>${rows}
    <button class="btn btn-secondary" style="margin-top:10px" data-action="close-voting">Close voting${done<Cloud.judges.length?` (${Cloud.judges.length-done} waiting)`:''}</button>
    <button class="btn btn-ghost" style="font-size:14px;padding:10px" data-action="cancel-house">Wrong ${N.entry} or category? Cancel voting</button></div>`;
}
function renderCallbar(){
  const c=CLOUD&&Cloud.session&&Cloud.session.current;
  const bar=$('callbar');
  const here=sheet.open&&calledHere();
  if(!c||here){bar.classList.remove('show');return;}
  const addr=addrOf(c.num,c.street);
  if(Cloud.isHost()){
    const done=Cloud.judges.filter(j=>judgeStatus(j,c).cls!=='st-wait').length;
    $('callbar-text').innerHTML=`<b>Voting open: ${esc(addr)}</b>${done} of ${Cloud.judges.length} judges done`;
    $('callbar-go').textContent='View';
  }else{
    const mine=voteForCall(judgeId,c)||Cloud.judges.find(j=>j.uid===judgeId&&j.doneCallId===c.callId);
    $('callbar-text').innerHTML=`<b>Now judging: ${esc(addr)}</b>${mine?'Done · waiting for the host':c.cat?esc(CATS[c.cat]):'The host opened voting'}`;
    $('callbar-go').textContent=mine?'Edit':'Score it';
  }
  bar.classList.add('show');
}
function goToCall(){
  const c=Cloud.session&&Cloud.session.current;if(!c)return;
  if(!housesOn(c.street).all.includes(c.num)){const ex=getExtras();(ex[c.street]=ex[c.street]||[]).push(c.num);store.set(K('extra'),ex);}
  openStreet(c.street);openSheet(c.num);
}
let lastCallId=null,openCall=null;
// A judge's phone jumps to a newly called house, unless they're mid-way through scoring another.
let lastHostUid=null;
function onSessionUpdate(){
  const c=Cloud.session&&Cloud.session.current;
  // Tell everyone when the host changes.
  const h=Cloud.session&&Cloud.session.hostUid;
  if(h&&lastHostUid&&h!==lastHostUid){
    toast(h===judgeId?"You're now the host":`${Cloud.session.hostName} is now the host`);
    if(h===judgeId&&c){lastCallId=c.callId;} // new host shouldn't be "sent" to the open house
  }
  if(h)lastHostUid=h;
  // Host closed voting: leave that house unless the judge is mid-score (they can still save).
  if(openCall&&(!c||c.callId!==openCall.callId)&&!Cloud.isHost()){
    const was=openCall;openCall=null;
    const wasCancelled=((Cloud.session&&Cloud.session.cancelled)||[]).includes(was.callId);
    if(wasCancelled&&sheet.open&&sheet.street===was.street&&sheet.num===was.num){
      closeSheet();toast(`Host cancelled voting on ${addrOf(was.num,was.street)}`);
    }else if(sheet.open&&sheet.street===was.street&&sheet.num===was.num){
      if(sheet.dirty)toast("Host closed voting before you saved. This vote won't count.");
      else if(!c){closeSheet();toast('Host closed voting');}
    }
  }
  if(c)openCall=c;
  if(!c||Cloud.isHost()||c.callId===lastCallId)return;
  lastCallId=c.callId;
  const addr=addrOf(c.num,c.street);
  const me=Cloud.judges.find(j=>j.uid===judgeId);
  if(voteForCall(judgeId,c)||(me&&me.doneCallId===c.callId))return;
  if(sheet.open&&sheet.dirty&&!calledHere()){toast('Host opened voting: '+addr);return;}
  goToCall();toast('Host opened voting: '+addr);
  if(navigator.vibrate)navigator.vibrate(150);
}
async function startSession(){
  const n=(activeGroups||[]).length;
  if(n&&!confirm(`${n===1?activeGroups[0].hostName+"'s group is":n+' groups are'} already judging. Start a separate group anyway?\n\nTo rejoin a group, tap Join instead.`))return;
  const name=judgeName();if(!name)return;
  showIdentity();
  try{const code=await Cloud.createSession(name);rememberGroup();toast('Group '+code+' started');}
  catch(e){toast(e.message);}
}
async function joinSession(code){
  code=code||(prompt('Session code from the host')||'').trim();if(!code)return;
  const name=judgeName();if(!name)return;
  showIdentity();
  lastCallId=null;openCall=null;lastHostUid=null; // a (re)joining judge should land on any open house
  try{await Cloud.joinSession(code,name);rememberGroup();toast('Joined group '+code.toUpperCase());}
  catch(e){toast(e.message);}
}
function invite(){
  const url=location.href.split(/[?#]/)[0]+'?event='+EVENT.id+'&join='+Cloud.sessionCode;
  if(navigator.share)navigator.share({title:'Judge '+EVENT.name,text:'Join my judging group on Tally (code '+Cloud.sessionCode+')',url}).catch(()=>{});
  else navigator.clipboard.writeText(url).then(()=>toast('Invite link copied'),()=>prompt('Copy this link',url));
}
// Remember the group so a judge who leaves by mistake gets a one-tap Rejoin.
function rememberGroup(){
  setTimeout(()=>{if(Cloud.sessionCode)store.set(K('last_group'),{code:Cloud.sessionCode,hostName:(Cloud.session&&Cloud.session.hostName)||''});},1500);
}
function leaveSession(){
  const msg=Cloud.isHost()
    ?`Leave this group? Any open ${N.entry} closes, and judges stop getting ${N.entries} from you. You can rejoin and stay host.\n\nTo finish judging for everyone, use End judging group instead.`
    :`Leave this judging group? You will stop getting ${N.entries} from the host. You can rejoin from the ${cap(N.sections)} screen.`;
  if(!confirm(msg))return;
  Cloud.leaveSession();activeGroups=null;refreshGroups(true);
}

// ---------- Photo viewer ----------
// Every photo any judge took of a house, as {vote, caption}.
function photosOf(address){
  return getVotes().filter(v=>v.address===address&&(v.photo||v.hasPhoto))
    .map(v=>({vote:v,caption:v.judgeName||'Judge'}));
}
async function photoData(v){return v.photo||(CLOUD&&v.hasPhoto?await Cloud.photo(v.id):null);}
let viewer={items:[],i:0,title:''};
function openViewer(items,i,title){viewer={items,i,title};$('viewer').classList.add('open');showViewerItem();}
async function showViewerItem(){
  const {items,i,title}=viewer,it=items[i];if(!it)return;
  $('viewer-cap').innerHTML=`<b>${esc(title)}</b>${esc(it.caption||'')}`;
  $('viewer-count').textContent=items.length>1?`${i+1} / ${items.length}`:'';
  $('viewer-prev').style.visibility=$('viewer-next').style.visibility=items.length>1?'visible':'hidden';
  const img=$('viewer-img');img.removeAttribute('src');
  const src=it.src||await photoData(it.vote);
  if(viewer.items[viewer.i]===it&&src)img.src=src;
}
function stepViewer(d){const n=viewer.items.length;if(n<2)return;viewer.i=(viewer.i+d+n)%n;showViewerItem();}
function closeViewer(){$('viewer').classList.remove('open');}
const fileSafe=s=>String(s).replace(/[^A-Za-z0-9]+/g,'-').replace(/^-|-$/g,'');
function downloadBlob(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),10000);}
function dataUrlBytes(d){const b=atob(d.split(',')[1]);const u=new Uint8Array(b.length);for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return u;}
async function saveViewerPhoto(){
  const it=viewer.items[viewer.i];if(!it)return;
  const src=it.src||await photoData(it.vote);if(!src)return;
  downloadBlob(new Blob([dataUrlBytes(src)],{type:'image/jpeg'}),fileSafe(viewer.title+' '+(it.caption||''))+'.jpg');
}

// ---------- Photo zips ----------
// Minimal .zip writer (stored, no compression: JPEGs don't shrink further).
const CRC_T=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
function crc32(u){let c=0xFFFFFFFF;for(let i=0;i<u.length;i++)c=CRC_T[(c^u[i])&255]^(c>>>8);return (c^0xFFFFFFFF)>>>0;}
function makeZip(files){
  const enc=new TextEncoder(),parts=[],central=[];let offset=0;
  for(const f of files){
    const name=enc.encode(f.name),crc=crc32(f.data),size=f.data.length;
    const h=new DataView(new ArrayBuffer(30));
    [[0,0x04034b50,4],[4,20,2],[8,0,2],[14,crc,4],[18,size,4],[22,size,4],[26,name.length,2]].forEach(([o,v,n])=>n===4?h.setUint32(o,v,true):h.setUint16(o,v,true));
    parts.push(new Uint8Array(h.buffer),name,f.data);
    const c=new DataView(new ArrayBuffer(46));
    [[0,0x02014b50,4],[4,20,2],[6,20,2],[16,crc,4],[20,size,4],[24,size,4],[28,name.length,2],[42,offset,4]].forEach(([o,v,n])=>n===4?c.setUint32(o,v,true):c.setUint16(o,v,true));
    central.push(new Uint8Array(c.buffer),name);
    offset+=30+name.length+size;
  }
  const csize=central.reduce((a,p)=>a+p.length,0),e=new DataView(new ArrayBuffer(22));
  [[0,0x06054b50,4],[8,files.length,2],[10,files.length,2],[12,csize,4],[16,offset,4]].forEach(([o,v,n])=>n===4?e.setUint32(o,v,true):e.setUint16(o,v,true));
  return new Blob([...parts,...central,new Uint8Array(e.buffer)],{type:'application/zip'});
}
async function zipPhotos(winnersOnly){
  // Each entry: {vote, name}. Winners = top 3 per category, every judge's photo of each.
  // Winners: houses that placed. All photos: every house, counted or not.
  const list=[],ranks=winnersOnly?placings():rankings(true),medal=['1st','2nd','3rd'];
  for(const c of CATS_LIST){
    (ranks[c.key]||[]).forEach((h,i)=>{
      if(winnersOnly&&i>2)return;
      photosOf(h.address).forEach(p=>{
        const base=`${fileSafe(c.label)}/${winnersOnly?medal[i]+'-':String(i+1).padStart(3,'0')+'-'}${fileSafe(h.address)}-${fileSafe(p.caption)}`;
        let name=base+'.jpg',n=2;while(list.some(x=>x.name===name))name=`${base}-${n++}.jpg`;
        list.push({vote:p.vote,name});
      });
    });
  }
  if(!list.length){toast(winnersOnly?`No photos of the top ${N.entries} yet`:'No photos yet');return;}
  toast(`Preparing ${list.length} photo${list.length>1?'s':''}...`);
  const files=[];
  for(const it of list){const d=await photoData(it.vote).catch(()=>null);if(d)files.push({name:it.name,data:dataUrlBytes(d)});}
  downloadBlob(makeZip(files),`${fileSafe(EVENT.name+' '+(EVENT.year||'')).toLowerCase()}-${winnersOnly?'winners':'all'}-photos.zip`);
}

// ---------- Navigation ----------
let activeTab='streets';
function showScreen(name){
  document.querySelectorAll('.screen').forEach(s=>s.classList.toggle('active',s.id==='screen-'+name));
  if(name!=='street'){activeTab=name;}
  document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t.dataset.tab===(name==='street'?'streets':name)));
  ({streets:renderStreets,'my-votes':renderMyVotes,results:renderResults,export:renderExport})[name]?.();
}
function renderAll(){renderStreets();renderSessionCard();renderStreet();renderMyVotes();renderResults();renderExport();renderHostPanel();renderCallbar();if(sheet.open)renderSheet();}

document.addEventListener('click',e=>{
  const vh=e.target.closest('[data-view-house]');
  if(vh){e.stopPropagation();const items=photosOf(vh.dataset.viewHouse);if(items.length)openViewer(items,0,vh.dataset.viewHouse);return;}
  if(e.target.id==='photo-img'&&sheet.photo){openViewer([{src:sheet.photo,caption:'Your photo'}],0,addrOf(sheet.num,sheet.street));return;}
  const t=e.target.closest('[data-join-group],[data-make-host],[data-remove-judge],[data-action],[data-tab],[data-street],[data-house],[data-cat],[data-star],[data-edit-street]');
  if(!t)return;
  if(t.dataset.tab){showScreen(t.dataset.tab);window.scrollTo(0,0);return;}
  if(t.dataset.street){openStreet(t.dataset.street);return;}
  if(t.dataset.house){openSheet(t.dataset.house);return;}
  if(t.dataset.cat){if(lockedCat())return;sheet.cat=t.dataset.cat;sheet.dirty=true;pruneScores();renderSheet();renderHostPanel();return;}
  if(t.dataset.star){if(voteLocked())return;sheet.scores[t.closest('.stars').dataset.key]=+t.dataset.star;sheet.dirty=true;renderSheet();return;}
  if(t.dataset.joinGroup){joinSession(t.dataset.joinGroup);return;}
  if(t.dataset.makeHost){makeHost(t.dataset.makeHost);return;}
  if(t.dataset.removeJudge){
    const j=Cloud.judges.find(j=>j.uid===t.dataset.removeJudge);
    if(j&&confirm(`Remove ${j.name} from the group? Their votes so far still count. They can rejoin anytime.`))Cloud.removeJudge(j.uid);
    return;
  }
  if(t.dataset.editStreet){openStreet(t.dataset.editStreet);openSheet(t.dataset.editNum);return;}
  ({
    back:()=>showScreen('streets'),'add-house':addHouse,'finish-street':finishStreet,'share-street':shareStreet,
    'close-sheet':closeSheet,'save-next':saveVote,'skip-house':skipHouse,'clear-house':clearHouse,
    'remove-photo':()=>{setPhoto(null);sheet.dirty=true;},export:exportCSV,'clear-all':clearAll,
    'start-session':startSession,'join-session':()=>joinSession(),invite,'leave-session':leaveSession,
    'call-house':()=>{if(!Cloud.session.current&&sheet.cat)Cloud.callHouse(sheet.street,sheet.num,sheet.cat);},
    'close-voting':closeVoting,'cancel-house':cancelHouse,
    'pick-host':()=>{pickingHost=true;renderSessionCard();},'cancel-pick-host':()=>{pickingHost=false;renderSessionCard();},
    'claim-host':claimHost,'end-session':endSession,
    'close-viewer':closeViewer,'viewer-prev':()=>stepViewer(-1),'viewer-next':()=>stepViewer(1),'viewer-save':saveViewerPhoto,
    'zip-winners':()=>zipPhotos(true),'zip-all':()=>zipPhotos(false),'go-call':goToCall,
    'share-event':shareEvent,'end-event':endEvent,
    home:goHome,
  })[t.dataset.action]?.();
});
$('photo-input').addEventListener('change',e=>handlePhoto(e.target.files[0]));
$('add-house-input').addEventListener('keydown',e=>{if(e.key==='Enter')addHouse();});
document.addEventListener('keydown',e=>{
  if($('viewer').classList.contains('open')){if(e.key==='Escape')closeViewer();if(e.key==='ArrowLeft')stepViewer(-1);if(e.key==='ArrowRight')stepViewer(1);return;}
  if(e.key==='Escape')closeSheet();});
$('notes-input').addEventListener('input',()=>{sheet.dirty=true;});
let swipeX=null;
$('viewer').addEventListener('touchstart',e=>{swipeX=e.touches[0].clientX;},{passive:true});
$('viewer').addEventListener('touchend',e=>{if(swipeX==null)return;const dx=e.changedTouches[0].clientX-swipeX;swipeX=null;if(Math.abs(dx)>50)stepViewer(dx<0?1:-1);});

// ---------- Boot ----------
// Event title, look, and wording.
$('event-name').textContent=EVENT.name;document.title=EVENT.name+' · Tally';
$('event-place').textContent=[EVENT.place,EVENT.year].filter(Boolean).join(' · ');
$('lights').style.display=EVENT.theme==='lights'?'':'none';
document.querySelector('[data-tab="streets"]').innerHTML=`<span class="ico">${ICON}</span>${esc(cap(N.sections))}`;
$('skip-btn').innerHTML=N.skip==='Skip'?'Skip':`${esc(N.skip)} &middot; skip`;
$('finish-btn').innerHTML=`Done with ${esc(N.section)} &middot; skip the rest`;
$('share-street-btn').textContent=`Share ${N.section} link with judges`;
$('add-row').style.display=EVENT.allowAdd?'':'none';
$('add-house-input').placeholder=`${cap(N.entry)} not listed? #`;
$('my-count-label').textContent=`${cap(N.entries)} scored`;
$('export-entries-label').textContent=cap(N.entries);
renderEventBanner();
function showIdentity(){
  const name=store.get('tally_judge_name','');
  const label=name||(judgeId?'Judge '+judgeId.slice(0,6).toUpperCase():'Connecting...');
  $('judge-badge').textContent=label;$('judge-id-display').textContent=label;
}
showIdentity();
if(CLOUD){
  $('results-sub').textContent='Live from every judge';
  $('export-desc').textContent='Download a CSV of every judge\'s votes in this event. Votes already sync live, so this is a backup.';
  $('danger-card').style.display='none';
  Cloud.onChange(kind=>{
    if(kind==='error')toast('Sync problem. Votes are saved and will retry.');
    if(kind==='session-missing')toast('That group no longer exists');
    if(kind==='ended'){lastCallId=null;openCall=null;closeSheet();store.set(K('last_group'),null);activeGroups=null;refreshGroups(true);toast('The judging group has ended');}
    if(kind==='removed'){lastCallId=null;openCall=null;closeSheet();toast(`The host removed you from the group. You can rejoin from the ${cap(N.sections)} screen.`);}
    if(kind==='event'&&Cloud.event){EVENT.status=Cloud.event.status;renderEventBanner();}
    if(kind==='session'||kind==='judges')onSessionUpdate();
    renderAll();
  });
  Cloud.ready.then(uid=>{
    judgeId=uid;showIdentity();renderAll();refreshGroups(true);
    if(Cloud.sessionCode)rememberGroup();
    const join=new URLSearchParams(location.search).get('join');
    if(join&&join.toUpperCase()!==Cloud.sessionCode){history.replaceState(null,'',location.pathname);joinSession(join);}
  }).catch(()=>toast('Could not connect to sync. Check your signal.'));
}
renderStreets();renderSessionCard();
(function fromLink(){
  // ?street=Bellevue%20Avenue opens that street. Older links with &num=&cat= also open the score sheet.
  const p=new URLSearchParams(location.search);
  const street=p.get('street');
  if(!street||!STREETS.some(s=>s.name===street))return;
  openStreet(street);
  const num=p.get('num');
  if(num){
    if(!housesOn(street).all.includes(num)){const ex=getExtras();(ex[street]=ex[street]||[]).push(num);store.set(K('extra'),ex);renderStreet();}
    openSheet(num,CATS[p.get('cat')]?p.get('cat'):null);
  }
})();
