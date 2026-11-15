function setAuthMode(mode){
 authMode=mode;
 const reset=mode==="reset",forgot=mode==="forgot",signup=mode==="signup";
 $("tabLogin").classList.toggle("active",mode==="login");$("tabSignup").classList.toggle("active",signup);
 $("tabLogin").classList.toggle("hidden",reset||forgot);$("tabSignup").classList.toggle("hidden",reset||forgot);
 $("nameField").classList.toggle("hidden",!signup);
 $("rotaNameField").classList.toggle("hidden",!signup);
 $("organisationField").classList.toggle("hidden",!signup);
 $("authName").required=signup;
 $("authRotaName").required=signup;
 $("authOrganisation").required=signup;
 $("authEmail").required=true;
 $("authPassword").required=!forgot;
 $("authPassword").minLength=(signup||reset)?8:0;
 $("authPasswordConfirm").required=reset;
 $("authOrganisation").setAttribute("aria-required",signup?"true":"false");
 $("authName").setAttribute("aria-required",signup?"true":"false");
 $("authRotaName").setAttribute("aria-required",signup?"true":"false");
 $("authEmail").setAttribute("aria-required","true");
 $("authPassword").setAttribute("aria-required",forgot?"false":"true");
 $("passwordField").classList.toggle("hidden",forgot);
 $("confirmPasswordField").classList.toggle("hidden",!reset);
 $("forgotWrap").classList.toggle("hidden",signup||forgot||reset);
 $("authTitle").textContent=signup?"Create your ShiftMate account":forgot?"Reset your password":reset?"Choose a new password":"Your rota, organised.";
 $("authSub").textContent=signup?"Start with a personal rota that stays yours.":forgot?"We'll email you a secure password-reset link.":reset?"Choose a new password for your ShiftMate account.":"Sign in to manage your rotations and shifts.";
 $("authSubmit").textContent=signup?"Create account":forgot?"Send reset link":reset?"Save new password":"Sign in";
 $("authMessage").classList.add("hidden");
}
async function submitAuth(){
 const email=$("authEmail").value.trim().toLowerCase(),password=$("authPassword").value;
 if(!email)return msg("authMessage","Enter your email address.",true);
 const emailPattern=/^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;
 if(!emailPattern.test(email)||!$("authEmail").checkValidity())return msg("authMessage","Enter a valid email address, for example name@gmail.com or name@nhs.net.",true);
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
  if(authMode==="signup"&&password.length<8)throw Error("Your password must be at least 8 characters.");
  if(authMode==="signup"){
   const full_name=$("authName").value.trim();
   const rota_matching_name=$("authRotaName").value.trim();
   const organisation_name=$("authOrganisation").value.trim();
   if(!full_name)throw Error("Enter your full name.");
   if(full_name.length<2)throw Error("Enter your full name.");
   if(!rota_matching_name)throw Error("Enter your name exactly as it appears on your rota.");
   if(!organisation_name)throw Error("Enter the NHS Trust or healthcare organisation you work for.");
   r=await sb.auth.signUp({email,password,options:{data:{full_name,rota_matching_name,organisation_name},emailRedirectTo:"https://shiftmate-preview.onrender.com/"}});
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
