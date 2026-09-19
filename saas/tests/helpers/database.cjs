const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const { pgcrypto } = require('@electric-sql/pglite/contrib/pgcrypto');

const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const migrationDirectory = path.join(__dirname, '../../supabase/migrations');
async function migrate(db, minimum, maximum) {
  for (const file of fs.readdirSync(migrationDirectory).filter(f => /^\d+.*\.sql$/.test(f)).sort()) {
    const number = Number(file.split('_')[0]);
    if (number >= minimum && number <= maximum) {
      await db.exec(fs.readFileSync(path.join(migrationDirectory, file), 'utf8'));
    }
  }
}

async function database(maximum = 16) {
  // Real PostgreSQL engine in memory. Auth API and its roles are a local fixture,
  // not a claim about the privileges/configuration of any deployed Supabase project.
  const db = new PGlite({ extensions: { pgcrypto } });
  try {
    await db.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin bypassrls;
      create schema auth;
      create table auth.users (id uuid primary key, email varchar(255));
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      grant usage on schema public, auth to anon, authenticated, service_role;
      alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
      alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
    `);
    await migrate(db, 1, maximum);
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}

async function asRole(db, role, userId, action) {
  if (!['anon', 'authenticated', 'service_role'].includes(role)) throw Error('Unknown test role');
  return db.transaction(async tx => {
    await tx.exec(`set local role ${role}`);
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [userId || '']);
    return action(tx);
  });
}

async function seedTenants(db) {
  const users = { admin: uuid(11), operator: uuid(12), viewer: uuid(13), otherAdmin: uuid(14) };
  for (const [name, id] of Object.entries(users)) {
    await db.query('insert into auth.users(id,email) values($1,$2)', [id, `${name}@example.test`]);
  }
  const companies = { A: uuid(1), B: uuid(2) };
  for (const [name, id] of Object.entries(companies)) {
    await db.query('insert into companies(id,nome,slug) values($1,$2,$3)', [id, `Company ${name}`, `company-${name.toLowerCase()}`]);
  }
  for (const [company, user, role] of [
    [companies.A, users.admin, 'admin'], [companies.A, users.operator, 'operatore'],
    [companies.A, users.viewer, 'viewer'], [companies.B, users.otherAdmin, 'admin'],
  ]) {
    await db.query('insert into memberships(company_id,user_id,role) values($1,$2,$3)', [company,user,role]);
  }
  return { users, companies };
}
module.exports = { database, migrate, asRole, seedTenants, uuid };
