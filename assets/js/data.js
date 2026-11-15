async function resolveOrganisation(name){
 const clean=String(name||"").trim().replace(/\\s+/g," ");
 if(!clean)throw new Error("Enter your NHS Trust or healthcare organisation.");
 if(clean.length<2||clean.length>180)throw new Error("Organisation name must be between 2 and 180 characters.");
 const {data:existing,error:lookupError}=await sb.from("organisations").select("id,name").ilike("name",clean).limit(1);
 if(lookupError)throw lookupError;
 if(existing?.length)return existing[0];
 const {data:created,error}=await sb.from("organisations").insert({name:clean,country_code:"GB",organisation_type:"healthcare"}).select("id,name").single();
 if(!error)return created;
 if(error.code==="23505"){
  const retry=await sb.from("organisations").select("id,name").ilike("name",clean).limit(1).single();
  if(!retry.error)return retry.data;
 }
 throw error;
}
async function boot(){const {data:{user:u}}=await sb.auth.getUser();if(!u)return;user=u;$("auth").classList.add("hidden");$("app").classList.remove("hidden");$("userPill").textContent=u.email;await loadData();await scheduleShiftMoments();navigate("home")}
async function loadData(){const [p,r,s,o]=await Promise.all([sb.from("profiles").select("*").eq("id",user.id).maybeSingle(),sb.from("rotations").select("*").eq("user_id",user.id).eq("archived",false).order("start_date",{ascending:false}),sb.from("shifts").select("*").eq("user_id",user.id).eq("archived",false).order("shift_date"),sb.from("organisations").select("id,name").order("name")]);if(p.error)throw p.error;if(r.error)throw r.error;if(s.error)throw s.error;if(o.error)throw o.error;organisations=o.data||[];profile=p.data;rotations=r.data||[];shifts=s.data||[];if(!profile){const orgName=user.user_metadata?.organisation_name||"";const org=orgName?await resolveOrganisation(orgName):null;const x=await sb.from("profiles").insert({id:user.id,email:user.email,full_name:user.user_metadata?.full_name||"",rota_matching_name:user.user_metadata?.rota_matching_name||user.user_metadata?.full_name||"",organisation:org?.name||"",organisation_id:org?.id||null});if(x.error)throw x.error;const q=await sb.from("profiles").select("*").eq("id",user.id).single();profile=q.data}}
