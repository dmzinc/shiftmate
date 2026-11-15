function navigate(p){page=p;document.querySelectorAll(".nav-btn[data-page]").forEach(b=>b.classList.toggle("active",b.dataset.page===p));$("pageTitle").textContent=({home:"Overview",rota:"My rota",rotations:"Rotations",profile:"Profile"})[p];$("eyebrow").textContent=p==="profile"?"YOUR ACCOUNT":"YOUR WORKSPACE";render()}
function motivationLocalDate(){
 const zone=profile?.timezone||"Europe/London";
 try{return new Intl.DateTimeFormat("en-CA",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date())}catch{return new Date().toISOString().slice(0,10)}
}
function motivationCard(){return '<section class="home-motivation"><div class="home-motivation-head"><div><div class="home-kicker">A LITTLE MOTIVATION FOR TODAY</div><div class="home-motivation-label">Your daily encouragement ✨</div></div><span class="home-ai-pill">SHIFTMATE AI</span></div><div id="dailyMotivationBody" class="home-motivation-body"><span class="home-motivation-loading">Finding a little encouragement for your day…</span></div></section>'}
function renderMotivationQuote(motivation,label){const body=$("dailyMotivationBody");if(!body)return;body.innerHTML='<blockquote>'+esc(motivation.quote)+'</blockquote><div class="home-motivation-foot"><span>'+esc(label||"A fresh thought for today")+'</span><span>Made for your journey</span></div>'}
async function loadDailyMotivation(){
 if(!user)return;
 const today=motivationLocalDate(),key="shiftmate:motivation:"+user.id+":"+today,latestKey="shiftmate:motivation:"+user.id+":latest";
 let cached=null,latest=null;try{cached=JSON.parse(localStorage.getItem(key)||"null");latest=JSON.parse(localStorage.getItem(latestKey)||"null")}catch{}
 if(cached){renderMotivationQuote(cached,"Your motivation for today");return}
 if(!navigator.onLine){if(latest)renderMotivationQuote(latest,"Saved inspiration · connect to refresh");else renderMotivationQuote({quote:"Take today one step at a time. Your effort matters, even when progress feels quiet."},"A little encouragement while offline");return}
 const body=$("dailyMotivationBody");if(body)body.innerHTML='<span class="home-motivation-loading">Creating a fresh message for you…</span>';
 try{const {data,error}=await sb.functions.invoke("daily-motivation",{body:{}});if(error)throw error;if(!data?.motivation?.quote)throw new Error(data?.error||"No motivation was returned");const record={quote:data.motivation.quote,theme:data.motivation.theme,local_date:data.motivation.local_date};localStorage.setItem(key,JSON.stringify(record));localStorage.setItem(latestKey,JSON.stringify(record));renderMotivationQuote(record,"Your motivation for today")}catch(e){if(latest)renderMotivationQuote(latest,"Saved inspiration · today’s message is unavailable");else renderMotivationQuote({quote:"You don’t have to do everything today. Just take the next good step."},"A little encouragement");console.warn("Daily motivation unavailable:",e?.message||e)}
}

const MOMENT_IDS_KEY="shiftmate:moment-notification-ids:";
function momentId(shiftId,kind){let n=0;for(const c of (shiftId+":"+kind))n=(n*31+c.charCodeAt(0))>>>0;return (n%2000000000)+1}
function momentDateTime(date,time){if(!date||!time)return null;const d=new Date(date+"T"+String(time).slice(0,8));return Number.isNaN(d.getTime())?null:d}
async function scheduleShiftMoments(){
 if(!user||!profile)return;
 const prefs={enabled:true,before:true,mid:true,after:true,advance_minutes:60,...(profile.shift_moments_settings||{})};
 const storeKey=MOMENT_IDS_KEY+user.id;let old=[];try{old=JSON.parse(localStorage.getItem(storeKey)||"[]")}catch{}
 const native=window.Capacitor?.Plugins?.LocalNotifications;
 if(native&&old.length){try{await native.cancel({notifications:old.map(id=>({id}))})}catch(e){console.warn("Could not cancel old ShiftMate Moments",e)}}
 const now=Date.now(),items=[];
 if(prefs.enabled){
  for(const shift of shifts){
   const start=momentDateTime(shift.shift_date,shift.start_time),end=momentDateTime(shift.shift_date,shift.end_time);
   if(!start||!end)continue;
   if(end<=start)end.setDate(end.getDate()+1);
   const candidates=[
    {kind:"before",enabled:prefs.before,at:new Date(start.getTime()-Number(prefs.advance_minutes||60)*60000),title:"Your shift is coming up",body:"Take a breath, trust your preparation and step into today one moment at a time."},
    {kind:"mid",enabled:prefs.mid,at:new Date(start.getTime()+(end.getTime()-start.getTime())/2),title:"A little encouragement",body:"One task at a time. The care and effort you give today matter."},
    {kind:"after",enabled:prefs.after,at:new Date(end.getTime()),title:"You've made it through",body:"Whatever today brought, you showed up. Give yourself permission to rest."}
   ];
   for(const c of candidates){if(c.enabled&&c.at.getTime()>now+30000)items.push({id:momentId(shift.id,c.kind),title:c.title,body:c.body,at:c.at})}
  }
 }
 const upcoming=items.slice(0,60);
 if(native){
  try{
   const perm=await native.requestPermissions();
   if(perm.display==="granted"||perm.granted===true){
    if(upcoming.length)await native.schedule({notifications:upcoming.map(n=>({id:n.id,title:n.title,body:n.body,schedule:{at:n.at},extra:{kind:"shiftmate-moment"}}))});
    localStorage.setItem(storeKey,JSON.stringify(upcoming.map(n=>n.id)));return;
   }
  }catch(e){console.warn("Native notification scheduling unavailable",e)}
 }
 localStorage.setItem(storeKey,JSON.stringify([]));
 if("Notification"in window&&Notification.permission==="default"&&upcoming.length){try{await Notification.requestPermission()}catch{}}
 if("Notification"in window&&Notification.permission==="granted"){
  // Web fallback: timers work while this tab is active; native builds use persistent OS scheduling.
  for(const n of upcoming){const delay=n.at.getTime()-Date.now();if(delay>0&&delay<2147480000)setTimeout(()=>{try{new Notification(n.title,{body:n.body,tag:"shiftmate-"+n.id})}catch{}},delay)}
 }
}
