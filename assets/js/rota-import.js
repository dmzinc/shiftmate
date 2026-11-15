function norm(v){return String(v??"").toLowerCase().replace(/\s+/g," ").trim()}
function cellDate(v){if(v instanceof Date)return v.toISOString().slice(0,10);if(typeof v==="number"){const d=XLSX.SSF.parse_date_code(v);if(d)return d.y+"-"+String(d.m).padStart(2,"0")+"-"+String(d.d).padStart(2,"0")}const s=String(v??"").trim();if(/^\d{4}-\d{2}-\d{2}/.test(s))return s.slice(0,10);const m=s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);if(m){let y=+m[3];if(y<100)y+=2000;return y+"-"+String(+m[2]).padStart(2,"0")+"-"+String(+m[1]).padStart(2,"0")}return ""}
function timeVal(v){if(typeof v==="number"){if(!Number.isFinite(v)||v<0||v>=1)return "";const mins=Math.round(v*1440)%1440;return String(Math.floor(mins/60)).padStart(2,"0")+":"+String(mins%60).padStart(2,"0")+":00"}let s=String(v??"").trim();const m=s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);if(!m)return "";const hours=Number(m[1]),minutes=Number(m[2]);if(hours>23||minutes>59)return "";return String(hours).padStart(2,"0")+":"+m[2]+":00"}
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
async function matchRotaName(){
 const state=rotaImportState;if(!state)return;
 const sheet=state.sheets.find(x=>x.name===$("rotaSheetChoice")?.value);
 const entered=String($("rotaSheetName")?.value||"").trim();
 const feedback=$("importFeedback");
 if(!sheet)return;
 if(!entered){feedback.classList.remove("hidden","success");feedback.classList.add("error");feedback.textContent="Enter your name exactly as it appears on the selected rota worksheet.";return}
 const exact=sheet.people.filter(([name])=>normalName(name)===normalName(entered));
 let matches=exact;
 if(!matches.length){
  const scored=sheet.people.map(([name])=>({name,score:rotaNameScore(name,entered)})).filter(x=>x.score>0);
  const best=Math.max(0,...scored.map(x=>x.score));
  matches=scored.filter(x=>x.score===best).map(x=>[x.name]);
 }
 if(matches.length!==1){
  feedback.classList.remove("hidden","success");feedback.classList.add("error");
  feedback.textContent=matches.length?"More than one possible match was found. Please enter the full name exactly as it appears on the rota.":"No matching staff name was found on this worksheet. Check the spelling or select another worksheet.";
  return;
 }
 feedback.classList.remove("error","hidden");feedback.classList.add("success");
 feedback.textContent="Matched your entered name to "+matches[0][0]+". Review the shifts below before importing.";
 buildSelectedRotaPreviewFor(sheet.name,matches[0][0]);
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
  rotaImportState={sheets,file,rotationId};selectedFile=file;
  const first=sheets.find(x=>x.people.length)||sheets[0];
  feedback.classList.add("success");feedback.textContent="File scanned. Select the worksheet and enter your name exactly as it appears on that rota.";
  $("previewArea").innerHTML='<div class="field"><label>Worksheet</label><select id="rotaSheetChoice">'+sheets.map(x=>'<option value="'+esc(x.name)+'" '+(x.name===first.name?'selected':'')+'>'+esc(x.name)+' · '+x.people.length+' possible names</option>').join("")+'</select></div><div class="field"><label for="rotaSheetName">Your name as it appears on this rota</label><input id="rotaSheetName" autocomplete="off" placeholder="e.g. A.O Oguntuase or Afolabi Olubukola Oguntuase" maxlength="180"><small>This can be different from your ShiftMate profile name. Enter the version used on this specific rota.</small></div><button type="button" class="btn secondary" onclick="matchRotaName()">Find my shifts</button>';
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
  closeModal();await loadData();await scheduleShiftMoments();navigate("rota");alert("Import complete: "+(data.imported_count||0)+" added/updated, "+(data.duplicate_count||0)+" duplicates skipped.");
 }catch(e){alert("Import failed: "+e.message);btn.disabled=false;btn.textContent="Confirm import"}
}
