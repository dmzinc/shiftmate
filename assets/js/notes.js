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
