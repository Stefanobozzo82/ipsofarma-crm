const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {database,migrate,asRole,uuid}=require('./helpers/database.cjs');
let db,serial=25000;const admin=uuid(25001),outsider=uuid(25002);serial=25002;
const next=()=>uuid(++serial);
before(async()=>{
  db=await database(24);
  await db.exec('alter table auth.users add column email_confirmed_at timestamptz; grant update(role) on memberships to authenticated; grant insert(email) on invites to authenticated;');
  await migrate(db,25,25);
  for(const id of [admin,outsider])await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[id,id+'@test.example']);
});
after(async()=>{if(db)await db.close();});
async function user(verified=true,email) {
  const id=next();email=email||id+'@test.example';
  await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,$3)',[id,email,verified?'2026-01-01':null]);return {id,email};
}
async function company(piano='trial') {
  const id=next();await db.query('insert into companies(id,nome,slug,piano) values($1,$2,$3,$4)',[id,'Test','test-'+serial,piano]);
  await db.query("insert into memberships(company_id,user_id,role) values($1,$2,'admin')",[id,admin]);return id;
}
async function rpc(name,params,uid=admin,role='authenticated') {
  return asRole(db,role,uid,async tx=>(await tx.query(`select * from ${name}(${params.map((_,i)=>'$'+(i+1)).join(',')})`,params)).rows);
}
const invite=async(c,u,role='operatore',actor=admin)=>(await rpc('create_invite',[c,u.email,role],actor))[0];
const accept=async(i,u)=>(await rpc('accept_invite',[i.token],u.id))[0];
async function counts(c) {
  return (await db.query('select (select count(*)::int from memberships where company_id=$1) as members,(select count(*)::int from invites where company_id=$1 and accepted_at is null and coalesce(expires_at,created_at+interval \'7 days\')>now()) as pending',[c])).rows[0];
}

test('pending invitation reserves final trial seat; acceptance replaces reservation and replay adds no member',async()=>{
  const c=await company(),u=await user(),i=await invite(c,u);
  assert.deepEqual(await counts(c),{members:1,pending:1});
  await assert.rejects(invite(c,await user()),/limite utenti/);
  assert.equal((await accept(i,u)).role,'operatore');assert.deepEqual(await counts(c),{members:2,pending:0});
  assert.equal((await accept(i,u)).company_id,c);assert.deepEqual(await counts(c),{members:2,pending:0});
});

test('email normalization prevents duplicate invitations and member re-invitation',async()=>{
  const c=await company('base'),u=await user(),i=await invite(c,{email:' '+u.email.toUpperCase()+' '});
  assert.equal(i.email,u.email);await assert.rejects(invite(c,u),/già in sospeso/);
  await accept(i,u);await assert.rejects(invite(c,u),/già membro/);
});

test('expired explicit and legacy invitations release capacity without deletion and cannot be accepted or previewed',async()=>{
  for(const legacy of [false,true]){
    const c=await company(),u=await user(),i=await invite(c,u);
    await db.query("update invites set expires_at=$1,created_at=now()-interval '8 days' where id=$2",[legacy?null:'2020-01-01',i.id]);
    assert.deepEqual(await counts(c),{members:1,pending:0});
    assert.equal((await rpc('invite_preview',[i.token],null,'anon')).length,0);
    await assert.rejects(accept(i,u),/scaduto/);
    assert.ok((await invite(c,u)).token!==i.token);
    assert.equal((await db.query('select count(*)::int n from invites where company_id=$1',[c])).rows[0].n,2);
  }
});

test('acceptance rechecks downgraded plan and succeeds after excess pending reservation is revoked',async()=>{
  const c=await company('base'),u=await user(),i=await invite(c,u),other=await invite(c,await user());
  await db.query("update companies set piano='trial' where id=$1",[c]);
  await assert.rejects(accept(i,u),/limite utenti/);assert.deepEqual(await counts(c),{members:1,pending:2});
  await rpc('revoke_invite',[other.id]);await accept(i,u);assert.deepEqual(await counts(c),{members:2,pending:0});
});

test('unverified, null email and mismatched accounts cannot accept another account invitation',async()=>{
  const c=await company(),u=await user(false),i=await invite(c,u);
  await assert.rejects(accept(i,u),/conferma/);
  const wrong=await user();await assert.rejects(accept(i,wrong),/altro indirizzo/);
  await db.query('update auth.users set email=null,email_confirmed_at=now() where id=$1',[u.id]);
  await assert.rejects(accept(i,u),/conferma/);assert.deepEqual(await counts(c),{members:1,pending:1});
});

test('old admin invitation never escalates an existing membership; replay returns current role and cannot restore removal',async()=>{
  const c=await company('base'),u=await user(),i=await invite(c,u,'admin');
  await db.query("insert into memberships(company_id,user_id,role) values($1,$2,'viewer')",[c,u.id]);
  assert.equal((await accept(i,u)).role,'viewer');
  await rpc('update_member_role',[c,u.id,'operatore']);assert.equal((await accept(i,u)).role,'operatore');
  await rpc('remove_member',[c,u.id]);await assert.rejects(accept(i,u),/già utilizzato/);
});

test('last administrator cannot demote or remove self; a second admin permits a controlled transition',async()=>{
  const c=await company(),u=await user();
  await assert.rejects(rpc('update_member_role',[c,admin,'viewer']),/ultimo amministratore/);
  await assert.rejects(rpc('remove_member',[c,admin]),/ultimo amministratore/);
  await accept(await invite(c,u,'admin'),u);
  await rpc('update_member_role',[c,admin,'viewer']);
  await assert.rejects(rpc('update_member_role',[c,admin,'admin']),/solo un amministratore/);
  await assert.rejects(rpc('remove_member',[c,u.id],u.id),/ultimo amministratore/);
  await rpc('remove_member',[c,admin],u.id);
  assert.deepEqual(await counts(c),{members:1,pending:0});
});

test('operator and viewer cannot invite, mutate roles, remove colleagues or revoke; outsider cannot manage tenant',async()=>{
  const c=await company('pro'),pending=await invite(c,await user());
  for(const role of ['operatore','viewer']){
    const u=await user();await accept(await invite(c,u,role),u);
    await assert.rejects(invite(c,await user(),'admin',u.id),/amministratore/);
    await assert.rejects(rpc('update_member_role',[c,u.id,'admin'],u.id),/amministratore/);
    await assert.rejects(rpc('remove_member',[c,admin],u.id),/amministratore/);
    await assert.rejects(rpc('revoke_invite',[pending.id],u.id),/amministratore/);
  }
  await assert.rejects(rpc('update_member_role',[c,admin,'viewer'],outsider),/amministratore/);
  await assert.rejects(rpc('remove_member',[c,admin],outsider),/amministratore/);
  await assert.rejects(rpc('revoke_invite',[pending.id],outsider),/amministratore/);
});

test('direct writes and previous column grants cannot bypass membership or invitation controls',async()=>{
  const c=await company(),u=await user(),i=await invite(c,u);
  const writes=[
    ['insert into memberships(company_id,user_id,role) values($1,$2,\'admin\')',[c,u.id]],
    ['update memberships set role=\'viewer\' where company_id=$1',[c]],
    ['delete from memberships where company_id=$1',[c]],
    ['insert into invites(company_id,email,created_by) values($1,$2,$3)',[c,'bypass@test.example',admin]],
    ['update invites set role=\'admin\' where id=$1',[i.id]],
    ['delete from invites where id=$1',[i.id]],
  ];
  for(const [sql,args] of writes)await assert.rejects(asRole(db,'authenticated',admin,tx=>tx.query(sql,args)),{code:'42501'});
  assert.deepEqual(await counts(c),{members:1,pending:1});
  const hidden=await asRole(db,'authenticated',outsider,tx=>tx.query('select * from memberships where company_id=$1',[c]));assert.equal(hidden.rows.length,0);
});

test('revocation frees capacity, cannot consume accepted invites, and null/unrecognized roles fail',async()=>{
  const c=await company(),u=await user(),i=await invite(c,u);
  await rpc('revoke_invite',[i.id]);await assert.rejects(accept(i,u),/non valido/);
  const second=await invite(c,u);await accept(second,u);
  await assert.rejects(rpc('revoke_invite',[second.id]),/già accettato/);
  for(const value of [null,'owner'])await assert.rejects(rpc('update_member_role',[c,u.id,value]),/ruolo/);
});

test('registration still creates first admin atomically and helper is not publicly callable',async()=>{
  const u=await user();const result=(await rpc('register_company',['New registration','register-'+serial],u.id))[0];
  assert.equal(result.role,'admin');assert.deepEqual(await counts(result.company_id),{members:1,pending:0});
  await assert.rejects(rpc('lock_membership_capacity',[result.company_id]),{code:'42501'});
  for(const name of ['create_invite','accept_invite','update_member_role','remove_member','revoke_invite']){
    const permissions=(await db.query("select has_function_privilege('anon',p.oid,'execute') as allowed from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=$1",[name])).rows;
    assert.ok(permissions.length);assert.ok(permissions.every(p=>p.allowed===false));
  }
});

test('injected membership insert failure rolls back invitation consumption',async()=>{
  const c=await company(),u=await user(),i=await invite(c,u);
  await db.exec("create function fail_member_test() returns trigger language plpgsql as $$begin raise exception 'injected member failure';end;$$; create trigger fail_member_test before insert on memberships for each row execute function fail_member_test();");
  try {await assert.rejects(accept(i,u),/injected member failure/);assert.deepEqual(await counts(c),{members:1,pending:1});}
  finally {await db.exec('drop trigger fail_member_test on memberships;drop function fail_member_test();');}
  await accept(i,u);assert.deepEqual(await counts(c),{members:2,pending:0});
});
