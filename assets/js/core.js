const SUPABASE_URL="https://ouohoxmyeqrczwbgncig.supabase.co";
const SUPABASE_KEY="sb_publishable_QVW-P5U2d0EN7R16jFAysQ_1RpWHMMh";
const sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
let user=null,profile=null,rotations=[],shifts=[],page="home",authMode="login",monthCursor=new Date(),selectedFile=null,previewShifts=[];
const $=id=>document.getElementById(id), esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function msg(id,text,error=false){const el=$(id);el.textContent=text;el.classList.remove("hidden","error","success");el.classList.add(error?"error":"success")}
