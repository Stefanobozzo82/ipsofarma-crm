const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { database, migrate, seedTenants, asRole } = require('./helpers/database.cjs');

let db, users, companies;
before(async () => {
  db = await database(16);
  ({ users, companies } = await seedTenants(db));
  // Model an upgrade containing both table-level and explicit column grants.
  await db.exec(`
    grant all on public.companies to public;
    grant update(piano, stripe_customer_id), insert(nome), select(nome)
      on public.companies to public, anon, authenticated;
  `);
});
after(async () => { if (db) await db.close(); });

test('companies: baseline exploit, then real migration 0017 privilege boundaries', async t => {
  await t.test('baseline company admin can improperly upgrade its plan', async () => {
    const result = await asRole(db, 'authenticated', users.admin, tx => tx.query(
      "update companies set piano = 'pro' where id = $1 returning piano", [companies.A]));
    assert.equal(result.rows[0].piano, 'pro');
    await db.query("update companies set piano = 'trial' where id = $1", [companies.A]);
  });

  await migrate(db, 17, 17);
  const protectedFields = {
    id: "'00000000-0000-4000-8000-000000000099'::uuid",
    slug: "'unauthorized-slug'",
    created_at: "'2040-01-01'::timestamptz",
    updated_at: "'2040-01-01'::timestamptz",
    piano: "'pro'",
    stripe_customer_id: "'cus_forbidden'",
    stripe_subscription_id: "'sub_forbidden'",
    subscription_status: "'active'",
    current_period_end: "'2040-01-01'::timestamptz",
  };
  for (const [field, expression] of Object.entries(protectedFields)) {
    await t.test(`authenticated admin cannot update ${field}, including same value`, async () => {
      for (const value of [expression, field]) {
        await assert.rejects(asRole(db, 'authenticated', users.admin, tx => tx.query(
          `update companies set ${field} = ${value} where id = $1`, [companies.A])),
        error => error.code === '42501');
      }
    });
  }
  await t.test('mixed business and protected patch fails atomically', async () => {
    const old = (await db.query('select nome,piano from companies where id=$1', [companies.A])).rows[0];
    await assert.rejects(asRole(db, 'authenticated', users.admin, tx => tx.query(
      "update companies set nome='MUST NOT SAVE', piano='pro' where id=$1", [companies.A])), e => e.code === '42501');
    assert.deepEqual((await db.query('select nome,piano from companies where id=$1', [companies.A])).rows[0], old);
  });
  await t.test('admin can save every business field with RETURNING *', async () => {
    const result = await asRole(db, 'authenticated', users.admin, tx => tx.query(`
      update companies set nome='Saved Company', piva='12345678901', cf='CFTEST',
        sdi_codice='ABC1234', pec='pec@example.test', indirizzo='{"via":"Via Roma"}',
        settings='{"email":"reply@example.test"}', regime_fiscale='RF01'
      where id=$1 returning *`, [companies.A]));
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].nome, 'Saved Company');
    assert.deepEqual(result.rows[0].settings, { email: 'reply@example.test' });
    assert.equal(result.rows[0].piano, 'trial');
    assert.ok(result.rows[0].updated_at);
  });
  for (const role of ['operator', 'viewer', 'otherAdmin']) {
    await t.test(`${role} cannot edit company A business fields via RLS`, async () => {
      const result = await asRole(db, 'authenticated', users[role], tx => tx.query(
        "update companies set nome='SHOULD NOT SAVE' where id=$1 returning *", [companies.A]));
      assert.equal(result.rows.length, 0);
    });
  }
  await t.test('anonymous writes and direct authenticated creation/deletion are denied', async () => {
    for (const [role, uid, sql] of [
      ['anon', null, "update companies set nome='no'"],
      ['anon', null, "update companies set piano='pro'"],
      ['authenticated', users.admin, "insert into companies(nome,slug) values('No','not-allowed')"],
      ['authenticated', users.admin, 'delete from companies'],
      ['authenticated', users.admin, 'truncate companies cascade'],
    ]) await assert.rejects(asRole(db, role, uid, tx => tx.exec(sql)), e => e.code === '42501');
  });
  await t.test('service role can synchronize Stripe and subscription state', async () => {
    const result = await asRole(db, 'service_role', null, tx => tx.query(`
      update companies set piano='base', stripe_customer_id='cus_test',
        stripe_subscription_id='sub_test', subscription_status='active', current_period_end='2040-01-01'
      where id=$1 returning *`, [companies.A]));
    assert.equal(result.rows[0].piano, 'base');
    assert.equal(result.rows[0].stripe_customer_id, 'cus_test');
  });
  await t.test('SECURITY DEFINER registration still creates company and admin membership', async () => {
    const result = await asRole(db, 'authenticated', users.admin, tx => tx.query(
      "select * from register_company('New company','new-company-after-hardening')"));
    assert.equal(result.rows.length, 1);
    const created = result.rows[0].company_id;
    const membership = await db.query('select role from memberships where company_id=$1 and user_id=$2', [created, users.admin]);
    assert.equal(membership.rows[0].role, 'admin');
    assert.equal((await db.query('select piano from companies where id=$1', [created])).rows[0].piano, 'trial');
  });
  await t.test('reapplying migration is idempotent', async () => {
    await migrate(db, 17, 17);
    const result = await db.query("select has_column_privilege('authenticated','companies','piano','UPDATE') as protected, has_column_privilege('authenticated','companies','nome','UPDATE') as business");
    assert.deepEqual(result.rows[0], { protected: false, business: true });
  });
  await t.test('unexpected inherited protected grant fails migration and transaction rolls back', async () => {
    await assert.rejects(db.transaction(async tx => {
      await tx.exec('create role unexpected_company_writer nologin; grant update(piano) on companies to unexpected_company_writer; grant unexpected_company_writer to authenticated;');
      await migrate(tx, 17, 17);
    }), /unexpected inherited privilege/);
    const result = await db.query("select has_column_privilege('authenticated','companies','piano','UPDATE') as allowed");
    assert.equal(result.rows[0].allowed, false);
    assert.equal((await db.query("select 1 from pg_roles where rolname='unexpected_company_writer'")).rows.length, 0);
  });
});
