const {test}=require('node:test');
const assert=require('node:assert/strict');
const {database,migrate,seedTenants,asRole,uuid}=require('./helpers/database.cjs');
test('explicit grants restore a fresh non-auto-exposed Data API without opening private ledgers',async()=>{
  const db=await database(28);
  try{
    const {companies,users}=await seedTenants(db);
    await db.exec('revoke all on all tables in schema public from anon,authenticated');
    await migrate(db,29,29);
    await asRole(db,'authenticated',users.admin,tx=>tx.query("insert into clienti(id,company_id,nome) values($1,$2,'Synthetic')",[uuid(500),companies.A]));
    assert.equal((await asRole(db,'authenticated',users.otherAdmin,tx=>tx.query('select * from clienti'))).rows.length,0);
    assert.equal((await asRole(db,'anon',null,tx=>tx.query('select * from plans'))).rows.length,3);
    await assert.rejects(asRole(db,'anon',null,tx=>tx.query('select * from clienti')));
    for(const table of ['customer_ddt_operations','customer_ddt_changes','customer_invoice_operations','document_monthly_usage']) {
      await assert.rejects(asRole(db,'authenticated',users.admin,tx=>tx.query(`select * from ${table}`)));
    }
    await assert.rejects(asRole(db,'authenticated',users.admin,tx=>tx.query("update companies set piano='pro' where id=$1",[companies.A])));
    await assert.rejects(asRole(db,'authenticated',users.admin,tx=>tx.query("insert into ai_usage(company_id) values($1)",[companies.A])));
    await assert.rejects(asRole(db,'authenticated',users.admin,tx=>tx.query("delete from memberships where company_id=$1",[companies.A])));
  } finally {await db.close();}
});
