const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {database,seedTenants,asRole,uuid}=require('./helpers/database.cjs');
let db,users,companies;
const product=uuid(410),depot=uuid(411),movement=uuid(412),unused=uuid(413);
before(async()=>{
  db=await database(26);({users,companies}=await seedTenants(db));
  await db.query("insert into prodotti(id,company_id,cod,descr) values($1,$2,'P','Product'),($3,$2,'EMPTY','Unused')",[product,companies.A,unused]);
  await db.query("insert into depositi(id,company_id,nome) values($1,$2,'Test depot')",[depot,companies.A]);
});
after(async()=>{if(db)await db.close();});
test('movement actor and time are assigned server side despite forged input',async()=>{
  const result=await asRole(db,'authenticated',users.operator,async tx=>(await tx.query(
    "insert into movimenti_magazzino(id,company_id,prodotto_id,deposito_id,tipo,quantita,created_by,created_at) values($1,$2,$3,$4,'carico',5,$5,'2099-01-01') returning created_by,created_at",
    [movement,companies.A,product,depot,users.otherAdmin])).rows[0]);
  assert.equal(result.created_by,users.operator);
  assert.ok(new Date(result.created_at).getUTCFullYear()<2099);
});
test('admin cannot erase movements through product deletion',async()=>{
  await assert.rejects(asRole(db,'authenticated',users.admin,tx=>tx.query('delete from prodotti where id=$1',[product])),/storico/);
  assert.equal((await db.query('select quantita from movimenti_magazzino where id=$1',[movement])).rows[0].quantita,'5.000');
});
test('unused product deletion remains available to admin',async()=>{
  const r=await asRole(db,'authenticated',users.admin,tx=>tx.query('delete from prodotti where id=$1 returning id',[unused]));
  assert.equal(r.rows.length,1);
});
test('movement corrections use new rows; direct update/delete still affect zero rows',async()=>{
  for(const sql of ['update movimenti_magazzino set quantita=99 where id=$1 returning id','delete from movimenti_magazzino where id=$1 returning id']) {
    assert.equal((await asRole(db,'authenticated',users.admin,tx=>tx.query(sql,[movement]))).rows.length,0);
  }
  await asRole(db,'authenticated',users.operator,tx=>tx.query("insert into movimenti_magazzino(company_id,prodotto_id,deposito_id,tipo,quantita) values($1,$2,$3,'rettifica',-2)",[companies.A,product,depot]));
  assert.equal((await db.query('select giacenza from giacenze where prodotto_id=$1',[product])).rows[0].giacenza,'3.000');
});
test('other tenant and viewer cannot append a movement',async()=>{
  for(const user of [users.otherAdmin,users.viewer]) await assert.rejects(asRole(db,'authenticated',user,tx=>tx.query("insert into movimenti_magazzino(company_id,prodotto_id,deposito_id,tipo,quantita) values($1,$2,$3,'carico',1)",[companies.A,product,depot])));
});
