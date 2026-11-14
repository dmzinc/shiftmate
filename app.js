
const SUPABASE_URL="https://ouohoxmyeqrczwbgncig.supabase.co";
const SUPABASE_KEY="sb_publishable_QVW-P5U2d0EN7R16jFAysQ_1RpWHMMh";
const sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
let user=null,profile=null,rotations=[],shifts=[],page="home",authMode="login",monthCursor=new Date(),selectedFile=null,previewShifts=[];
const $=id=>document.getElementById(id), esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function msg(id,text,error=false){const el=$(id);el.textContent=text;el.classList.remove("hidden","error","success");el.classList.add(error?"error":"success")}
function setAuthMode(mode){
 authMode=mode;
 const reset=mode==="reset",forgot=mode==="forgot",signup=mode==="signup";
 $("tabLogin").classList.toggle("active",mode==="login");$("tabSignup").classList.toggle("active",signup);
 $("tabLogin").classList.toggle("hidden",reset||forgot);$("tabSignup").classList.toggle("hidden",reset||forgot);
 $("nameField").classList.toggle("hidden",!signup);
 $("rotaNameField").classList.toggle("hidden",!signup);
 $("passwordField").classList.toggle("hidden",forgot);
 $("confirmPasswordField").classList.toggle("hidden",!reset);
 $("forgotWrap").classList.toggle("hidden",signup||forgot||reset);
 $("authTitle").textContent=signup?"Create your ShiftMate account":forgot?"Reset your password":reset?"Choose a new password":"Your rota, organised.";
 $("authSub").textContent=signup?"Start with a personal rota that stays yours.":forgot?"We'll email you a secure password-reset link.":reset?"Choose a new password for your ShiftMate account.":"Sign in to manage your rotations and shifts.";
 $("authSubmit").textContent=signup?"Create account":forgot?"Send reset link":reset?"Save new password":"Sign in";
 $("authMessage").classList.add("hidden");
}
async function submitAuth(){
 const email=$("authEmail").value.trim(),password=$("authPassword").value;
 if(!email)return msg("authMessage","Enter your email address.",true);
 $("authSubmit").disabled=true;
 try{
  let r;
  if(authMode==="forgot"){
   r=await sb.auth.resetPasswordForEmail(email,{redirectTo:"https://shiftmate-preview.onrender.com/"});
   if(r.error)throw r.error;
   msg("authMessage","If an account exists for this address, a password-reset email has been sent. Check your inbox and spam folder.");
   return;
  }
  if(authMode==="reset"){
   const confirm=$("authPasswordConfirm").value;
   if(!password||password.length<8)throw Error("Your new password must be at least 8 characters.");
   if(password!==confirm)throw Error("The passwords do not match.");
   r=await sb.auth.updateUser({password});
   if(r.error)throw r.error;
   $("authPassword").value="";$("authPasswordConfirm").value="";
   setAuthMode("login");msg("authMessage","Your password has been updated. You can now sign in.");
   return;
  }
  if(!password)return msg("authMessage","Enter your password.",true);
  if(authMode==="signup"){
   const full_name=$("authName").value.trim();
   const rota_matching_name=$("authRotaName").value.trim();
   if(!full_name)throw Error("Enter your full name.");
   if(!rota_matching_name)throw Error("Enter your name exactly as it appears on your rota.");
   r=await sb.auth.signUp({email,password,options:{data:{full_name,rota_matching_name},emailRedirectTo:"https://shiftmate-preview.onrender.com/"}});
   if(r.error)throw r.error;
   if(!r.data.session){msg("authMessage","Account created. Check your email to verify your address, then sign in.");return}
  }else{
   r=await sb.auth.signInWithPassword({email,password});
   if(r.error)throw r.error;
  }
  await boot();
 }catch(e){msg("authMessage",e.message||"Unable to complete the request.",true)}
 finally{$("authSubmit").disabled=false}
}
async function signOut(){await sb.auth.signOut();user=null;$("app").classList.add("hidden");$("auth").classList.remove("hidden")}
async function boot(){const {data:{user:u}}=await sb.auth.getUser();if(!u)return;user=u;$("auth").classList.add("hidden");$("app").classList.remove("hidden");$("userPill").textContent=u.email;await loadData();navigate(rotations.length?"home":"rotations")}
async function loadData(){const [p,r,s]=await Promise.all([sb.from("profiles").select("*").eq("id",user.id).maybeSingle(),sb.from("rotations").select("*").eq("user_id",user.id).eq("archived",false).order("start_date",{ascending:false}),sb.from("shifts").select("*").eq("user_id",user.id).eq("archived",false).order("shift_date")]);if(p.error)throw p.error;if(r.error)throw r.error;if(s.error)throw s.error;profile=p.data;rotations=r.data||[];shifts=s.data||[];if(!profile){const x=await sb.from("profiles").insert({id:user.id,email:user.email,full_name:user.user_metadata?.full_name||"",rota_matching_name:user.user_metadata?.rota_matching_name||user.user_metadata?.full_name||""});if(x.error)throw x.error;const q=await sb.from("profiles").select("*").eq("id",user.id).single();profile=q.data}}
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
function render(){if(page==="home")renderHome();if(page==="rotations")renderRotations();if(page==="rota")renderRota();if(page==="profile")renderProfile()}
function fmtDate(d,opts={day:"numeric",month:"short",year:"numeric"}){return new Date(d+"T12:00:00").toLocaleDateString("en-GB",opts)}
function futureShifts(){const today=new Date().toISOString().slice(0,10);return shifts.filter(s=>s.shift_date>=today).sort((a,b)=>a.shift_date.localeCompare(b.shift_date)||(a.start_time||"").localeCompare(b.start_time||""))}
function renderHome(){
 const firstName=(profile?.full_name||user?.user_metadata?.full_name||user?.email||"there").trim().split(/\s+/)[0];
 const upcoming=futureShifts(),next=upcoming[0],today=new Date().toISOString().slice(0,10);
 const current=rotations.find(r=>r.start_date<=today&&r.end_date>=today)
  ||rotations.filter(r=>r.start_date<=today).sort((a,b)=>b.start_date.localeCompare(a.start_date))[0]
  ||rotations.slice().sort((a,b)=>a.start_date.localeCompare(b.start_date))[0];
 const rotationCount=shifts.filter(s=>s.rotation_id===current?.id).length;
 const onboarding=!rotations.length?'<section class="home-onboarding"><div class="home-kicker">LET\'S GET STARTED</div><h2>Create your first rotation</h2><p>Start by adding your current specialty, grade or band, trust and rotation dates. You\'ll then be able to upload a rota and associate it with that rotation.</p><div class="home-callout">Your rota and shifts will be empty until you create a rotation and import your personal assignments.</div><button class="btn home-primary" onclick="openRotation()">Create my first rotation →</button></section>':"";
 const currentContent=current?'<h2>'+esc(current.specialty)+'</h2><p>'+(esc(current.grade||"Rotation"))+' · '+fmtDate(current.start_date)+' – '+fmtDate(current.end_date)+'</p><div class="home-current-meta">'+rotationCount+' shifts in this rotation</div><button class="btn home-light-btn" onclick="navigate(\'rotations\')">Manage rotation →</button>':'<h2>No rotation created</h2><p>Create a rotation to get started.</p>';
 const nextContent=next?'<div class="home-next-shift">'+shiftCard(next)+'</div><button class="btn home-secondary-btn" onclick="navigate(\'rota\')">View my rota →</button>':'<div class="home-next-empty"><span class="home-next-icon">☷</span><p>Your rota will appear here after you create a rotation and import it.</p></div><button class="btn home-secondary-btn" onclick="navigate(\'rotations\')">Create rotation →</button>';
 $("content").innerHTML='<div class="home-dashboard"><header class="home-welcome"><div class="home-kicker">YOUR PERSONAL WORKSPACE</div><h1>Hello, '+esc(firstName)+' 👋</h1><p>Everything you need to stay organised through your next rotation.</p></header>'+onboarding+motivationCard()+'<div class="home-feature-grid"><section class="home-current"><div class="home-kicker">CURRENT ROTATION</div>'+currentContent+'</section><section class="home-next"><div class="home-kicker">NEXT ASSIGNMENT</div>'+nextContent+'</section></div>'+(rotations.length?'<section class="home-lower"><div class="section-head"><h2>Upcoming shifts</h2><span class="small muted">Next 5 assignments</span></div><div class="shift-list">'+(upcoming.slice(0,5).map(shiftCard).join("")||'<div class="card muted">Nothing scheduled yet.</div>')+'</div><div class="section-head"><h2>Your rotations</h2><button class="btn secondary" onclick="navigate(\'rotations\')">Manage rotations</button></div><div class="rotation-list">'+rotations.slice(0,4).map(rotationCard).join("")+'</div></section>':'')+'</div>';loadDailyMotivation();
}
function shiftCard(s){const date=new Date(s.shift_date+"T12:00:00");const time=(s.start_time?esc(s.start_time.slice(0,5)):"Time not set")+"–"+(s.end_time?esc(s.end_time.slice(0,5)):"Time not set");const specialty=rotations.find(r=>r.id===s.rotation_id)?.specialty||"Shift";return `<div class="shift-row" onclick="openShift('${s.id}')"><div class="datebox"><b>${date.getDate()}</b><span>${date.toLocaleDateString("en-GB",{month:"short"})}</span></div><div class="shift-info"><b>${esc(s.shift_type)}</b><span>${esc(s.ward||"Not specified")} · ${time}</span></div><span class="tag">${esc(specialty)}</span></div>`}
function rotationCard(r){return '<div class="rotation"><h3>'+esc(r.specialty)+'</h3><div class="small muted">'+esc(r.grade||"")+' · '+fmtDate(r.start_date,{month:"short",year:"numeric"})+' – '+fmtDate(r.end_date,{month:"short",year:"numeric"})+'</div><div class="small muted" style="margin-top:8px">'+shifts.filter(s=>s.rotation_id===r.id).length+' shifts</div><div class="rotation-actions"><button class="btn secondary" onclick="openImport(\''+r.id+'\')">Upload rota</button><button class="btn ghost" onclick="editRotation(\''+r.id+'\')">Edit</button><button class="btn ghost" onclick="deleteRotation(\''+r.id+'\')">Delete</button></div></div>'}
function renderRotations(){$("content").innerHTML='<div class="section-head" style="margin-top:0"><div><h2>Manage your rotations</h2><div class="small muted">Each rota import belongs to one rotation.</div></div><button class="btn" onclick="openRotation()">+ New rotation</button></div>'+(rotations.length?'<div class="rotation-list">'+rotations.map(rotationCard).join("")+'</div>':'<div class="empty"><div class="emoji">◫</div><h2>No rotations yet</h2><p class="muted">Create a rotation to begin. You can add your rota afterwards.</p><button class="btn" onclick="openRotation()">Create rotation</button></div>')}
function renderRota(){if(!rotations.length){$("content").innerHTML='<div class="empty"><h2>Create a rotation first</h2><p class="muted">Your shifts will appear here after you create a rotation and import a rota.</p><button class="btn" onclick="navigate(\'rotations\')">Create rotation</button></div>';return}const y=monthCursor.getFullYear(),m=monthCursor.getMonth(),first=new Date(y,m,1),days=new Date(y,m+1,0).getDate(),offset=(first.getDay()+6)%7;let cells="";for(let i=0;i<offset;i++)cells+='<div></div>';for(let d=1;d<=days;d++){const date=y+"-"+String(m+1).padStart(2,"0")+"-"+String(d).padStart(2,"0"),ss=shifts.filter(s=>s.shift_date===date);cells+='<div class="cal-day '+(date===new Date().toISOString().slice(0,10)?"today":"")+'"><b>'+d+'</b>'+ss.map(s=>'<span class="cal-shift" title="'+esc(s.shift_type)+'" onclick="openShift(\''+s.id+'\')">'+esc(s.shift_type)+'</span>').join("")+'</div>'}$("content").innerHTML='<div class="toolbar"><button class="btn secondary" onclick="monthMove(-1)">←</button><b>'+monthCursor.toLocaleDateString("en-GB",{month:"long",year:"numeric"})+'</b><button class="btn secondary" onclick="monthMove(1)">→</button><span class="muted small">'+shifts.length+' shifts</span><span style="flex:1"></span><button class="btn secondary" onclick="openShiftForm(\'\')">+ Add shift</button><button class="btn" onclick="openImport(\''+rotations[0].id+'\')">Upload rota</button></div><div class="card" style="margin-top:15px"><div class="calendar">'+["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(d=>'<div class="cal-head">'+d+'</div>').join("")+cells+'</div></div><div class="section-head"><h2>All shifts</h2><span class="small muted">Select a shift to view notes</span></div><div class="shift-list">'+(shifts.map(shiftCard).join("")||'<div class="card muted">No shifts imported yet.</div>')+'</div>'}
function monthMove(n){monthCursor.setMonth(monthCursor.getMonth()+n);renderRota()}
function renderProfile(){$("content").innerHTML='<div class="card profile-grid"><h2 style="margin-top:0">Your profile</h2><p class="muted small">Your rota matching name is used to identify your assignments in a team rota. Use the exact name shown on your rota.</p><div class="field"><label>Full name</label><input id="profileName" value="'+esc(profile?.full_name)+'"></div><div class="field"><label>Name as shown on your rota</label><input id="matchingName" value="'+esc(profile?.rota_matching_name)+'" placeholder="e.g. Jane Smith Doe"><small>Enter the name your hospital uses on the rota. This helps ShiftMate identify your shifts, even if your profile uses a shorter name.</small></div><div class="field"><label>Email address</label><input disabled value="'+esc(user.email)+'"></div><div class="field"><label>Time zone</label><select id="timezone"><option value="Europe/London">Europe/London</option><option value="Europe/Malta">Europe/Malta</option><option value="Europe/Dublin">Europe/Dublin</option></select></div><button class="btn" onclick="saveProfile()">Save profile</button><div id="profileMessage" class="notice hidden"></div></div>';$("timezone").value=profile?.timezone||"Europe/London"}
async function saveProfile(){const x=await sb.from("profiles").update({full_name:$("profileName").value.trim(),rota_matching_name:$("matchingName").value.trim(),timezone:$("timezone").value,updated_at:new Date().toISOString()}).eq("id",user.id);if(x.error)return alert(x.error.message);await loadData();msg("profileMessage","Profile saved.")}
function modal(title,body,actions){$("modalRoot").innerHTML='<div class="modal-back" onclick="if(event.target===this)closeModal()"><div class="modal"><div class="modal-head"><h2>'+title+'</h2><button class="close" onclick="closeModal()">×</button></div>'+body+'<div class="modal-actions">'+actions+'</div></div></div>'}
function closeModal(){$("modalRoot").innerHTML=""}
function openRotation(r){const edit=!!r;modal(edit?"Edit rotation":"Create a rotation",'<div class="field"><label>Specialty / department</label><input id="rotSpecialty" placeholder="e.g. General Surgery" value="'+esc(r?.specialty||"")+'"></div><div class="field"><label>Grade (optional)</label><input id="rotGrade" placeholder="e.g. FY1" value="'+esc(r?.grade||"")+'"></div><div class="field"><label>Start date</label><input id="rotStart" type="date" value="'+(r?.start_date||"")+'"></div><div class="field"><label>End date</label><input id="rotEnd" type="date" value="'+(r?.end_date||"")+'"></div><div class="small muted">You can upload a rota after saving this rotation.</div>','<button class="btn secondary" onclick="closeModal()">Cancel</button><button class="btn" onclick="saveRotation(\''+(r?.id||"")+'\')">Save rotation</button>')}
function editRotation(id){openRotation(rotations.find(r=>r.id===id))}
async function saveRotation(id){const specialty=$("rotSpecialty").value.trim(),start_date=$("rotStart").value,end_date=$("rotEnd").value;if(!specialty||!start_date||!end_date)return alert("Complete the specialty and date fields.");if(end_date<start_date)return alert("End date must be after start date.");const payload={specialty,grade:$("rotGrade").value.trim()||null,organisation:"Not specified",start_date,end_date,updated_at:new Date().toISOString()};const q=id?await sb.from("rotations").update(payload).eq("id",id).eq("user_id",user.id):await sb.from("rotations").insert({...payload,user_id:user.id});if(q.error)return alert(q.error.message);closeModal();await loadData();render()}
async function deleteRotation(id){if(!confirm("Delete this rotation and its shifts and notes? This cannot be undone."))return;const q=await sb.from("rotations").delete().eq("id",id).eq("user_id",user.id);if(q.error)return alert(q.error.message);await loadData();render()}
function openImport(id){const r=rotations.find(x=>x.id===id);selectedFile=null;previewShifts=[];modal("Upload a team rota",'<p class="muted small">Rotation: <b>'+esc(r.specialty)+'</b>. Select a CSV or Excel file. The file is processed in your browser; only your confirmed shifts are sent to ShiftMate.</p><div class="field"><label>Rota file</label><input id="rotaFile" type="file" accept=".csv,.xlsx,.xls" onchange="readRotaFile(\''+id+'\',this.files[0])"></div><div id="importFeedback" class="notice hidden"></div><div id="previewArea"></div>','<button class="btn secondary" onclick="closeModal()">Cancel</button><button id="confirmImport" class="btn" disabled onclick="confirmImport(\''+id+'\')">Confirm import</button>')}
function norm(v){return String(v??"").toLowerCase().replace(/\s+/g," ").trim()}
function cellDate(v){if(v instanceof Date)return v.toISOString().slice(0,10);if(typeof v==="number"){const d=XLSX.SSF.parse_date_code(v);if(d)return d.y+"-"+String(d.m).padStart(2,"0")+"-"+String(d.d).padStart(2,"0")}const s=String(v??"").trim();if(/^\d{4}-\d{2}-\d{2}/.test(s))return s.slice(0,10);const m=s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);if(m){let y=+m[3];if(y<100)y+=2000;return y+"-"+String(+m[2]).padStart(2,"0")+"-"+String(+m[1]).padStart(2,"0")}return ""}
function timeVal(v){if(typeof v==="number"){const mins=Math.round(v*1440)%1440;return String(Math.floor(mins/60)).padStart(2,"0")+":"+String(mins%60).padStart(2,"0")+":00"}let s=String(v??"").trim();const m=s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);if(!m)return "";return String(+m[1]).padStart(2,"0")+":"+m[2]+":00"}
function parseClockRange(value){
 const text=String(value??"").replace(/\s+/g," ").trim();
 const m=text.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*[-–to]+\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
 if(!m)return null;
 const cv=v=>{const z=v.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);if(!z)return null;let h=+z[1],mi=+(z[2]||0),ap=(z[3]||"").toLowerCase();if(ap==="pm"&&h<12)h+=12;if(ap==="am"&&h===12)h=0;if(h>23||mi>59)return null;return String(h).padStart(2,"0")+":"+String(mi).padStart(2,"0")+":00"};
 const a=cv(m[1]),b=cv(m[2]);return a&&b?{start:a,end:b}:null;
}
function dateFromCell(v){
 if(v instanceof Date&&!isNaN(v))return v.getFullYear()+"-"+String(v.getMonth()+1).padStart(2,"0")+"-"+String(v.getDate()).padStart(2,"0");
 return cellDate(v);
}
function normalName(v){return norm(v).replace(/[^a-z0-9]+/g," ").trim()}
let rotaImportState=null;
function validRotaDate(value){
 if(typeof value==="number"&&(value<36526||value>73050))return "";
 const date=dateFromCell(value);
 if(!/^20\d{2}-\d{2}-\d{2}$/.test(date))return "";
 const parsed=new Date(date+"T12:00:00Z");
 return !isNaN(parsed)&&parsed.toISOString().slice(0,10)===date?date:"";
}
function rotaNameScore(sheetName,profileName){
 const sheetTokens=normalName(sheetName).split(" ").filter(Boolean);
 const profileTokens=normalName(profileName).split(" ").filter(Boolean);
 if(!sheetTokens.length||profileTokens.length<2)return 0;
 // Treat the profile name as the identifying core: every profile token
 // must appear in the sheet name, while additional middle names are allowed.
 if(!profileTokens.every(token=>sheetTokens.includes(token)))return 0;
 return sheetTokens.length===profileTokens.length?100:90;
}
function rotaPersonMatch(sheetName,profileName){
 return rotaNameScore(sheetName,profileName)>0;
}
function inspectRotaWorkbook(wb){
 const sheets=[];
 const ignored=new Set(["off","0ff","a l","s l","annual leave","study leave","sick leave","day","night","oncall","theatre","sdt","nwd","b h","bank holiday","rest","nil","none","weekday","weekdays","weekend","weekends","monday","tuesday","wednesday","thursday","friday","saturday","sunday","mon","tue","wed","thu","fri","sat","sun"]);
 for(const name of wb.SheetNames){
  const grid=XLSX.utils.sheet_to_json(wb.Sheets[name],{header:1,defval:"",raw:true});
  const width=Math.max(0,...grid.map(r=>r.length));
  if(grid.length>30000||width>300)continue;
  let dateCol=-1,best=0;
  for(let c=0;c<width;c++){
   const count=grid.reduce((n,row)=>n+(validRotaDate(row[c])?1:0),0);
   if(count>best){best=count;dateCol=c}
  }
  if(dateCol<0||best<2)continue;
  const dateRows=[];
  for(let r=0;r<grid.length;r++){const date=validRotaDate(grid[r][dateCol]);if(date)dateRows.push({r,date})}
  const people=new Map();
  for(const {r} of dateRows)for(let c=0;c<width;c++){
   if(c===dateCol)continue;
   const raw=String(grid[r][c]??"").replace(/\s+/g," ").trim();
   const key=normalName(raw);
   if(!raw||ignored.has(key)||raw.length<4||/^\d/.test(raw)||parseClockRange(raw))continue;
   if(!/[a-z]/i.test(raw))continue;
   people.set(raw,(people.get(raw)||0)+1);
  }
  // Also support staff names in column headings, with short shift codes under each name.
  const staffColumns=new Map();
  const firstDateRow=dateRows[0]?.r||0;
  for(let c=0;c<width;c++){
   if(c===dateCol)continue;
   const sample=dateRows.slice(0,Math.min(40,dateRows.length)).map(x=>String(grid[x.r]?.[c]??"").trim()).filter(Boolean);
   const coded=sample.filter(x=>x.length<=16&&/^[A-Za-z0-9/ -]+$/.test(x)).length;
   if(sample.length<3||coded/sample.length<0.7)continue;
   for(let hr=Math.max(0,firstDateRow-4);hr<firstDateRow;hr++){
    const raw=String(grid[hr]?.[c]??"").replace(/\s+/g," ").trim();
    const key=normalName(raw);
    if(raw.length<6||ignored.has(key)||!/[a-z]{2,}.*[a-z]{2,}/i.test(raw))continue;
    if(/^(FY|SHO|ST\d|GI |UGI|LGI|NHS|GENERAL|AUG|DEC|APR|FEB|MON|TUE|WED|THU|FRI)/i.test(raw))continue;
    if(/\b(?:on.call|ward cover|clerking|roster|rota|weekends?|week.days?|staff|name|date|days?|working|theatre|bank.hol)\b/i.test(raw))continue;
    staffColumns.set(raw,c);people.set(raw,(people.get(raw)||0)+sample.length);
    break;
   }
  }
  sheets.push({name,grid,width,dateCol,dateRows,staffColumns,people:[...people].sort((a,b)=>a[0].localeCompare(b[0]))});
 }
 return sheets;
}
function buildSelectedRotaPreview(){
 const state=rotaImportState;if(!state)return;
 const sheet=state.sheets.find(x=>x.name===$("rotaSheetChoice")?.value);
 const person=$("rotaPersonChoice")?.value;
 if(!sheet||!person)return;
 const rows=[];
 const ignored=new Set(["off","0ff","a l","s l","annual leave","study leave","sick leave","day","night","oncall","theatre","sdt","nwd","b h","bank holiday","rest","nil","none"]);
 for(const {r,date} of sheet.dateRows){
  for(let c=0;c<sheet.width;c++){
   if(c===sheet.dateCol)continue;
   const raw=String(sheet.grid[r][c]??"").replace(/\s+/g," ").trim();
   if(!rotaPersonMatch(raw,person)||ignored.has(normalName(raw)))continue;
   const duty=String(sheet.grid[0]?.[c]??"").trim()||"Assigned duty";
   let range=null;
   const dayOfWeek=new Date(date+"T12:00:00Z").getUTCDay();
   const weekend=dayOfWeek===0||dayOfWeek===6;
   // The same role may have different weekday and weekend hours.
   const headerRows=[];
   for(let hr=1;hr<=Math.min(5,sheet.grid.length-1);hr++){
    const label=String(sheet.grid[hr]?.[0]??"").toLowerCase();
    const candidate=parseClockRange(sheet.grid[hr]?.[c]);
    if(candidate)headerRows.push({label,range:candidate});
   }
   const suitable=headerRows.find(x=>weekend?/weekend|bank hol/.test(x.label):/week ?days?/.test(x.label));
   range=suitable?.range||headerRows.find(x=>!/weekend|bank hol/.test(x.label))?.range||headerRows[0]?.range||null;
   rows.push({date,code:duty,range,ward:sheet.name});
  }
 }
 // Date rows can also contain shift codes under a named staff column.
 for(const [staffName,col] of sheet.staffColumns||[]){
  if(!rotaPersonMatch(staffName,person))continue;
  for(const {r,date} of sheet.dateRows){
   const code=String(sheet.grid[r]?.[col]??"").replace(/\s+/g," ").trim();
   if(!code||ignored.has(normalName(code))||code.length>60)continue;
   rows.push({date,code,range:parseClockRange(code),ward:sheet.name});
  }
 }
 const unique=[...new Map(rows.map(x=>[x.date+"|"+x.code,x])).values()];
 previewShifts=unique.map(x=>({shift_date:x.date,shift_type:x.code,start_time:x.range?.start||"",end_time:x.range?.end||"",ward:x.ward}));
 const feedback=$("importFeedback");
 if(!previewShifts.length){
  feedback.classList.remove("success");feedback.classList.add("error");
  feedback.textContent="No dated assignments were found for "+person+" on worksheet '"+sheet.name+"'. Try another worksheet or staff name.";
  $("confirmImport").disabled=true;return;
 }
 const unresolved=[...new Set(previewShifts.filter(x=>!x.start_time||!x.end_time).map(x=>x.shift_type))];
 feedback.classList.remove("error");feedback.classList.add("success");
 feedback.textContent="Found "+previewShifts.length+" assignment(s) for "+person+" in '"+sheet.name+"'. Review and add any missing shift times.";
 const codeFields=unresolved.map((code,i)=>'<div class="card" style="padding:12px;margin:8px 0"><b>'+esc(code)+'</b><div class="grid" style="grid-template-columns:1fr 1fr;gap:8px"><div class="field"><label>Start time</label><input type="time" id="codeStart'+i+'"></div><div class="field"><label>End time</label><input type="time" id="codeEnd'+i+'"></div></div></div>').join("");
 $("previewArea").innerHTML='<div class="field"><label>Worksheet</label><select id="rotaSheetChoice" onchange="onRotaChoiceChange()">'+state.sheets.map(x=>'<option value="'+esc(x.name)+'" '+(x.name===sheet.name?'selected':'')+'>'+esc(x.name)+'</option>').join("")+'</select></div><div class="field"><label>Doctor / staff member</label><select id="rotaPersonChoice" onchange="onRotaChoiceChange()"><option value="" disabled '+(person?'':'selected')+'>Select staff member</option>'+sheet.people.map(x=>'<option value="'+esc(x[0])+'" '+(x[0]===person?'selected':'')+'>'+esc(x[0])+'</option>').join("")+'</select></div>'+(unresolved.length?'<div class="small muted">Add times for duties where the workbook does not provide them. You can leave both blank and edit the shift later.</div>'+codeFields:"")+'<div class="small muted" style="margin:10px 0">Preview · '+esc(sheet.name)+' · '+esc(person)+'</div>'+previewShifts.slice(0,15).map(x=>'<div class="note small"><b>'+fmtDate(x.shift_date)+'</b> · '+esc(x.shift_type)+' · '+(x.start_time?esc(x.start_time.slice(0,5))+'–'+esc(x.end_time.slice(0,5)):'<i>Time not set</i>')+'</div>').join("")+(previewShifts.length>15?'<div class="small muted">and '+(previewShifts.length-15)+' more…</div>':"");
 $("confirmImport").disabled=false;
}
function onRotaChoiceChange(){
 const state=rotaImportState;if(!state)return;
 const oldSheet=$("rotaSheetChoice")?.value;
 const sheet=state.sheets.find(x=>x.name===oldSheet)||state.sheets[0];
 const personSelect=$("rotaPersonChoice");
 const current=personSelect?.value;
 if(!personSelect||!sheet.people.length){
  const p=sheet.people[0]?.[0]||"";
  $("previewArea").innerHTML='<div class="field"><label>Worksheet</label><select id="rotaSheetChoice" onchange="onRotaChoiceChange()">'+state.sheets.map(x=>'<option value="'+esc(x.name)+'">'+esc(x.name)+'</option>').join("")+'</select></div><p>No staff names detected on this worksheet.</p>';
  $("confirmImport").disabled=true;return;
 }
 const person=sheet.people.some(x=>x[0]===current)?current:(sheet.people.find(x=>rotaPersonMatch(x[0],profile.rota_matching_name||profile.full_name))?.[0]||"");
 buildSelectedRotaPreviewFor(sheet.name,person);
}
function buildSelectedRotaPreviewFor(sheetName,person){
 const state=rotaImportState;if(!state)return;
 const sheet=state.sheets.find(x=>x.name===sheetName);if(!sheet)return;
 $("previewArea").innerHTML='<div class="field"><label>Worksheet</label><select id="rotaSheetChoice" onchange="onRotaChoiceChange()">'+state.sheets.map(x=>'<option value="'+esc(x.name)+'" '+(x.name===sheetName?'selected':'')+'>'+esc(x.name)+'</option>').join("")+'</select></div><div class="field"><label>Doctor / staff member</label><select id="rotaPersonChoice" onchange="onRotaChoiceChange()"><option value="" disabled '+(person?'':'selected')+'>Select staff member</option>'+sheet.people.map(x=>'<option value="'+esc(x[0])+'" '+(x[0]===person?'selected':'')+'>'+esc(x[0])+'</option>').join("")+'</select></div>';
 buildSelectedRotaPreview();
}
async function readRotaFile(rotationId,file){
 if(!file)return;
 const feedback=$("importFeedback");feedback.classList.remove("hidden","error","success");feedback.textContent="Inspecting worksheets and staff assignments…";
 $("confirmImport").disabled=true;previewShifts=[];rotaImportState=null;
 try{
  if(file.size>20*1024*1024)throw Error("Rota exceeds the 20 MB file-size limit.");
  const buf=await file.arrayBuffer();
  const wb=file.name.toLowerCase().endsWith(".csv")?XLSX.read(new TextDecoder().decode(buf),{type:"string",cellDates:true}):XLSX.read(buf,{type:"array",cellDates:true});
  const sheets=inspectRotaWorkbook(wb);
  if(!sheets.length)throw Error("No worksheets with dated rows were detected. Please check that the workbook contains real Excel dates.");
  const target=normalName(profile.rota_matching_name||profile.full_name||"");
  rotaImportState={sheets,file,rotationId};
  let selectedSheet=null,selectedPerson=null,bestScore=0,bestMatches=[];
  for(const sh of sheets)for(const [person] of sh.people){
   const score=rotaNameScore(person,target);
   if(score>bestScore){bestScore=score;bestMatches=[{sheet:sh,person}]}
   else if(score&&score===bestScore)bestMatches.push({sheet:sh,person});
  }
  // Only preselect a name when the best match is unambiguous.
  if(bestMatches.length===1){selectedSheet=bestMatches[0].sheet;selectedPerson=bestMatches[0].person}
  if(!selectedSheet)selectedSheet=sheets.find(x=>x.people.length)||sheets[0];
  if(!selectedPerson)selectedPerson="";
  if(!selectedPerson){
   feedback.classList.add("error");feedback.textContent="We found dated worksheets but could not identify staff names. Choose a worksheet with staff assignments or add shifts manually.";
   $("previewArea").innerHTML=sheets.map(x=>'<div class="note small">'+esc(x.name)+' · '+x.dateRows.length+' dated rows · '+x.people.length+' possible names</div>').join("");
   return;
  }
  selectedFile=file;
  feedback.classList.add("success");feedback.textContent=selectedPerson?"Matched the profile name. Verify the worksheet and doctor below.":"Detected "+sheets.length+" dated worksheet(s). Choose the correct staff member before importing.";
  buildSelectedRotaPreviewFor(selectedSheet.name,selectedPerson);
 }catch(e){
  feedback.classList.remove("success");feedback.classList.add("error");feedback.textContent=e.message||"Unable to read this rota file.";
  previewShifts=[];$("confirmImport").disabled=true;
 }
}
async function confirmImport(id){
 if(!previewShifts.length)return;
 const btn=$("confirmImport");btn.disabled=true;btn.textContent="Importing…";
 try{
  const unresolved=[...new Set(previewShifts.filter(x=>!x.start_time||!x.end_time).map(x=>x.shift_type))];
  const mappings={};
  unresolved.forEach((code,i)=>{const start=$("codeStart"+i)?.value||"",end=$("codeEnd"+i)?.value||"";if(Boolean(start)!==Boolean(end))throw Error("Enter both start and end times for "+code+", or leave both blank.");mappings[code]={start_time:start?start+":00":null,end_time:end?end+":00":null}});
  const payload=previewShifts.map(x=>({...x,...(mappings[x.shift_type]||{}),start_time:x.start_time||mappings[x.shift_type]?.start_time||null,end_time:x.end_time||mappings[x.shift_type]?.end_time||null}));
  const {data,error}=await sb.rpc("confirm_rota_import",{p_rotation_id:id,p_filename:selectedFile.name,p_shifts:payload});
  if(error)throw error;
  closeModal();await loadData();navigate("rota");alert("Import complete: "+(data.imported_count||0)+" added/updated, "+(data.duplicate_count||0)+" duplicates skipped.");
 }catch(e){alert("Import failed: "+e.message);btn.disabled=false;btn.textContent="Confirm import"}
}
async function openShift(id){const s=shifts.find(x=>x.id===id);if(!s)return;const rot=rotations.find(r=>r.id===s.rotation_id);modal("Shift details",'<div class="notice">'+esc(rot?.specialty||"Rotation")+'</div><h3 style="margin:12px 0 4px">'+esc(s.shift_type)+'</h3><div class="muted">'+fmtDate(s.shift_date)+' · '+(s.start_time?esc(s.start_time.slice(0,5)):"Time not set")+'–'+(s.end_time?esc(s.end_time.slice(0,5)):"Time not set")+'</div><p>'+esc(s.ward||"")+'</p><div class="section-head"><h2>Private notes</h2><span class="small muted">Only you can see these</span></div><div id="notesList">Loading notes…</div><div class="field"><label>Add a note</label><input id="newNote" placeholder="Write a reminder or handover note…"></div><button class="btn" onclick="addNote(\''+id+'\')">Add note</button>','<button class="btn secondary" onclick="closeModal()">Close</button><button class="btn secondary" onclick="openShiftForm(\''+id+'\')">Edit shift</button><button class="btn danger" onclick="deleteShift(\''+id+'\')">Delete shift</button>');await loadNotes(id)}
function openShiftForm(id){
 const x=shifts.find(s=>s.id===id),rotationId=x?.rotation_id||rotations[0]?.id;
 if(!rotationId)return alert("Create a rotation first.");
 modal(x?"Edit shift":"Add a shift",'<div class="field"><label>Rotation</label><select id="shiftRotation">'+rotations.map(r=>'<option value="'+r.id+'" '+(r.id===rotationId?'selected':'')+'>'+esc(r.specialty)+'</option>').join("")+'</select></div><div class="field"><label>Date</label><input id="shiftDate" type="date" value="'+(x?.shift_date||"")+'"></div><div class="field"><label>Shift / duty</label><input id="shiftType" placeholder="e.g. Long Day, Night, SDT" value="'+esc(x?.shift_type||"")+'"></div><div class="grid" style="grid-template-columns:1fr 1fr;gap:10px"><div class="field"><label>Start time</label><input id="shiftStart" type="time" value="'+(x?.start_time?.slice(0,5)||"")+'"></div><div class="field"><label>End time</label><input id="shiftEnd" type="time" value="'+(x?.end_time?.slice(0,5)||"")+'"></div></div><div class="field"><label>Ward / location (optional)</label><input id="shiftWard" value="'+esc(x?.ward||"")+'" placeholder="Ward or location"></div><div class="small muted">You can leave times blank while recording a shift code, then edit them later.</div>','<button class="btn secondary" onclick="closeModal()">Cancel</button><button class="btn" onclick="saveShift(\''+(id||"")+'\')">Save shift</button>');
}
async function saveShift(id){
 const date=$("shiftDate").value,type=$("shiftType").value.trim(),start=$("shiftStart").value,end=$("shiftEnd").value,rotation_id=$("shiftRotation").value;
 if(!date||!type)return alert("Enter a date and shift/duty name.");
 if((start&&!end)||(!start&&end))return alert("Enter both times, or leave both blank.");
 const payload={user_id:user.id,rotation_id,shift_date:date,shift_type:type,start_time:start?start+":00":null,end_time:end?end+":00":null,ward:$("shiftWard").value.trim()||"Not specified"};
 let q=id?await sb.from("shifts").update(payload).eq("id",id).eq("user_id",user.id):await sb.from("shifts").insert(payload);
 if(q.error)return alert("Could not save shift: "+q.error.message);
 closeModal();await loadData();navigate("rota");
}
async function deleteShift(id){
 if(!confirm("Delete this shift? Its private notes may also be affected."))return;
 const q=await sb.from("shifts").delete().eq("id",id).eq("user_id",user.id);
 if(q.error)return alert("Could not delete shift: "+q.error.message);
 closeModal();await loadData();render();
}
async function loadNotes(id){const q=await sb.from("shift_notes").select("*").eq("shift_id",id).eq("user_id",user.id).order("created_at");if(q.error){$("notesList").textContent=q.error.message;return}$("notesList").innerHTML=q.data.length?q.data.map(n=>'<div class="note"><div id="noteText'+n.id+'">'+esc(n.body)+'</div><div class="note-actions"><button class="btn ghost small" onclick="editNote(\''+n.id+'\',\''+id+'\')">Edit</button><button class="btn ghost small" onclick="deleteNote(\''+n.id+'\',\''+id+'\')">Delete</button></div></div>').join(""):'<div class="small muted">No notes yet. Add your first note below.</div>'}
async function addNote(id){const body=$("newNote").value.trim();if(!body)return;const q=await sb.from("shift_notes").insert({user_id:user.id,shift_id:id,body});if(q.error)return alert(q.error.message);$("newNote").value="";await loadNotes(id)}
async function editNote(noteId,shiftId){const q=await sb.from("shift_notes").select("body").eq("id",noteId).single();if(q.error)return alert(q.error.message);const body=prompt("Edit note",q.data.body);if(body===null)return;if(!body.trim())return alert("A note cannot be empty.");const u=await sb.from("shift_notes").update({body:body.trim(),updated_at:new Date().toISOString()}).eq("id",noteId).eq("user_id",user.id);if(u.error)return alert(u.error.message);await loadNotes(shiftId)}
async function deleteNote(noteId,shiftId){if(!confirm("Delete this note?"))return;const q=await sb.from("shift_notes").delete().eq("id",noteId).eq("user_id",user.id);if(q.error)return alert(q.error.message);await loadNotes(shiftId)}
let recoverySessionReady=false;
function showPasswordReset(){
 setAuthMode("reset");
 $("auth").classList.remove("hidden");
 $("app").classList.add("hidden");
}
sb.auth.onAuthStateChange((event,session)=>{
 if(event==="PASSWORD_RECOVERY"){recoverySessionReady=!!session;showPasswordReset()}
 else if(event==="SIGNED_IN"&&session?.user&&!recoverySessionReady)boot().catch(e=>alert(e.message));
});
(async()=>{
 try{
  const params=new URLSearchParams(location.hash.startsWith("#")?location.hash.slice(1):location.hash);
  const isRecovery=params.get("type")==="recovery";
  const accessToken=params.get("access_token");
  const refreshToken=params.get("refresh_token");
  let session=null;
  if(isRecovery&&accessToken&&refreshToken){
   const {data,error}=await sb.auth.setSession({access_token:accessToken,refresh_token:refreshToken});
   if(error)throw error;
   session=data.session;
   recoverySessionReady=!!session;
   history.replaceState(null,"",location.pathname+location.search);
  }else{
   const {data,error}=await sb.auth.getSession();
   if(error)throw error;
   session=data.session;
  }
  if(isRecovery){
   if(session){recoverySessionReady=true;showPasswordReset()}
   else{showPasswordReset();msg("authMessage","This password-reset link is invalid or has expired. Please request a new link.",true)}
  }else if(session){await boot()}
 }catch(e){
  showPasswordReset();
  msg("authMessage",e.message||"Unable to validate the password-reset link. Please request a new one.",true);
 }
})();
