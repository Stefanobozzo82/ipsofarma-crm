// Real GoTrue + PostgREST smoke. Hard-locked to the authorized staging project.
// No service key. Passwords/JWTs remain in memory; CLI SQL file is removed finally.
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {randomUUID,randomBytes}=require('node:crypto');const {execFileSync}=require('node:child_process');
const config=JSON.parse(fs.readFileSync(path.join(__dirname,'../../staging.config.json'),'utf8'));
const REF='ffjzhtzavkuwysmabmds';
if(config.environment!=='staging'||config.projectRef!==REF||config.supabaseUrl!==`https://${REF}.supabase.co`||!config.publicKey?.startsWith('sb_publishable_'))throw Error('Unexpected staging configuration');
const quote=value=>"'"+String(value).replaceAll("'","''")+"'";
const runId=randomUUID();const companyA=randomUUID(),companyB=randomUUID(),customer=randomUUID(),order=randomUUID();
const slugA='http-smoke-a-'+runId,slugB='http-smoke-b-'+runId;
const users=['a','b','viewer'].map(name=>({id:randomUUID(),email:`http-${name}-${runId}@example.invalid`,password:randomBytes(32).toString('base64url')}));
const sqlFile=path.join(os.tmpdir(),`ipsofarma-http-smoke-${runId}.sql`);
let assertions=0,setupAttempted=false,cleanupPassed=false;
const edgeStatuses=[];
function check(ok,label){if(!ok)throw Error(label);assertions++;}
function sql(text){
 fs.writeFileSync(sqlFile,text,{mode:0o600});
 try{return execFileSync('supabase',['db','query','--linked','--project-ref',REF,'--file',sqlFile,'--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:60000,maxBuffer:2*1024*1024});}
 catch{throw Error('Staging SQL command failed (output suppressed to protect fixture credentials)');}
 finally{if(fs.existsSync(sqlFile))fs.unlinkSync(sqlFile);}
}
async function http(endpoint,token,body,method=body===undefined?'GET':'POST',extraHeaders={}){
 const response=await fetch(config.supabaseUrl+endpoint,{method,headers:{apikey:config.publicKey,...(token?{Authorization:`Bearer ${token}`} :{}),'Content-Type':'application/json',...extraHeaders},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(20000)});
 let data;try{data=await response.json();}catch{data=null;}return {ok:response.ok,status:response.status,data};
}
async function main(){
 try{
  const userSql=users.map(u=>`insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change_token_new,email_change) values(${quote(u.id)},'00000000-0000-0000-0000-000000000000','authenticated','authenticated',${quote(u.email)},extensions.crypt(${quote(u.password)},extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now(),'','','','');
insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at) values(${quote(u.id)},${quote(u.id)},jsonb_build_object('sub',${quote(u.id)},'email',${quote(u.email)},'email_verified',true),'email',now(),now());`).join('\n');
  setupAttempted=true;
  sql(`begin;${userSql}
insert into public.companies(id,slug,nome,piano) values(${quote(companyA)},${quote(slugA)},'HTTP fixture A','pro'),(${quote(companyB)},${quote(slugB)},'HTTP fixture B','pro');
insert into public.memberships(company_id,user_id,role) values(${quote(companyA)},${quote(users[0].id)},'admin'),(${quote(companyB)},${quote(users[1].id)},'admin'),(${quote(companyA)},${quote(users[2].id)},'viewer');
insert into public.clienti(id,company_id,nome) values(${quote(customer)},${quote(companyA)},'HTTP synthetic customer');
insert into public.ordini_cliente(id,company_id,num,data,cliente_id,righe) values(${quote(order)},${quote(companyA)},'HTTP-SMOKE',current_date,${quote(customer)},'[{"cod":"A","qty":10}]');commit;`);
  for(const u of users){const result=await http('/auth/v1/token?grant_type=password',null,{email:u.email,password:u.password});check(result.ok&&typeof result.data?.access_token==='string','Password login failed');u.token=result.data.access_token;}
  for(const [i,expected] of [[0,companyA],[1,companyB],[2,companyA]]){
   const r=await http(`/rest/v1/companies?select=id&id=in.(${companyA},${companyB})`,users[i].token);
   check(r.ok&&r.data.length===1&&r.data[0].id===expected,'Tenant read isolation failed');
  }
  const req={p_company_id:companyA,p_order_id:order,p_request_id:randomUUID(),p_expected_rows:[{cod:'A',qty:10}],p_document:{cliente_id:customer,data:new Date().toISOString().slice(0,10),righe:[{cod:'A',qty:3,source_order_index:0}]}};
  const anon=await http('/rest/v1/rpc/create_customer_ddt',null,req);check(!anon.ok&&[401,403].includes(anon.status),'Anonymous DDT was not rejected');
  for(const user of [users[1],users[2]]){const denied=await http('/rest/v1/rpc/create_customer_ddt',user.token,req);check(!denied.ok&&[400,401,403].includes(denied.status),'Cross-tenant/viewer DDT was not rejected');}
  const first=await http('/rest/v1/rpc/create_customer_ddt',users[0].token,req);check(first.ok&&first.data?.ordine?.righe?.[0]?.qtyEv===3,'Authenticated DDT creation failed');
  const retry=await http('/rest/v1/rpc/create_customer_ddt',users[0].token,req);check(retry.ok&&retry.data.replayed===true&&retry.data.ddt.id===first.data.ddt.id,'HTTP replay failed');
  const stale=await http('/rest/v1/rpc/create_customer_ddt',users[0].token,{...req,p_request_id:randomUUID()});check(!stale.ok&&stale.status===400,'Stale snapshot was not rejected');
  const visible=await http(`/rest/v1/ddt?select=id&oc_id=eq.${order}`,users[0].token);check(visible.ok&&visible.data.length===1,'Expected exactly one persisted DDT');
  const hidden=await http(`/rest/v1/ddt?select=id&oc_id=eq.${order}`,users[1].token);check(hidden.ok&&hidden.data.length===0,'DDT leaked across tenants');
  const deniedPlan=await http(`/rest/v1/companies?id=eq.${companyA}`,users[0].token,{piano:'base'},'PATCH');check(!deniedPlan.ok,'Subscription column write accepted');
  // Provider secrets are intentionally absent on this staging deployment.
  // These payloads must stop at configuration checks; never configure keys for this test.
  const origin='http://127.0.0.1:8080';
  const payloads={
   'ai-proxy':{companyId:companyA,request_id:randomUUID(),model:'gemini-2.5-flash',messages:[{role:'user',content:'Synthetic staging smoke; no provider call expected.'}],max_tokens:16},
   'send-email':{company_id:companyA,to:'smoke-recipient@example.invalid',subject:'Synthetic staging smoke',html:'<p>No provider call expected.</p>'},
   'stripe-checkout':{company_id:companyA,plan_id:'base',success_url:origin+'/abbonamento.html?success=1',cancel_url:origin+'/abbonamento.html?cancel=1'},
  };
  for(const [endpoint,payload] of Object.entries(payloads)){
   const allowed=await http('/functions/v1/'+endpoint,null,undefined,'OPTIONS',{Origin:origin});
   const denied=await http('/functions/v1/'+endpoint,null,undefined,'OPTIONS',{Origin:'https://evil.example.invalid'});
   const post=await http('/functions/v1/'+endpoint,users[0].token,payload,'POST',{Origin:origin});
   const missingConfiguration=[500,503].includes(post.status)&&/configurat/i.test(post.data?.error||'');
   // A plan without a configured Stripe price stops before the secret check.
   const missingPrice=endpoint==='stripe-checkout'&&post.status===400&&/prezzo Stripe configurato/i.test(post.data?.error||'');
   edgeStatuses.push({endpoint,allowedOptions:allowed.status,deniedOptions:denied.status,authenticatedPost:post.status,invalidJwt:post.status===401&&/invalid jwt/i.test(post.data?.message||post.data?.error||''),configurationRejected:missingConfiguration||missingPrice});
  }
  const webhook=await http('/functions/v1/stripe-webhook',null,{id:'evt_smoke_invalid',type:'test',created:0,data:{object:{}}},'POST',{'Stripe-Signature':'t=0,v1=invalid'});
  edgeStatuses.push({endpoint:'stripe-webhook',invalidSignature:webhook.status});
  for(const item of edgeStatuses){
   if(item.endpoint==='stripe-webhook'){check([400,503].includes(item.invalidSignature),'Webhook did not reach signature/configuration rejection');continue;}
   check(item.allowedOptions===204,`${item.endpoint}: allowed preflight failed`);
   check(item.deniedOptions===403,`${item.endpoint}: forbidden origin preflight failed`);
   check(item.configurationRejected,`${item.endpoint}: valid JWT did not reach missing configuration check`);
  }
 }finally{
  if(setupAttempted){
   sql(`begin;
delete from public.companies where (id=${quote(companyA)} and slug=${quote(slugA)}) or (id=${quote(companyB)} and slug=${quote(slugB)});
${users.map(u=>`delete from auth.users where id=${quote(u.id)} and email=${quote(u.email)};`).join('\n')}
do $$ begin if exists(select 1 from public.companies where id in (${quote(companyA)},${quote(companyB)})) or exists(select 1 from auth.users where id in (${users.map(u=>quote(u.id)).join(',')})) then raise exception 'HTTP fixture cleanup incomplete';end if;end $$;commit;`);
   cleanupPassed=true;
  }
  if(fs.existsSync(sqlFile))fs.unlinkSync(sqlFile);
  for(const u of users){delete u.token;delete u.password;}
 }
 console.log(JSON.stringify({projectRef:REF,assertions,cleanupPassed,edgeStatuses,outcome:'passed'}));
}
main().catch(error=>{console.error(JSON.stringify({projectRef:REF,assertions,cleanupPassed,edgeStatuses,outcome:'failed',error:error.message}));process.exitCode=1;});
