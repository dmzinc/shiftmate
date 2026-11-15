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
 closeModal();await loadData();await scheduleShiftMoments();render();
}
