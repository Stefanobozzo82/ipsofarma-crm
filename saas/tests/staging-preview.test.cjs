const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {validate,transformHtml}=require('../scripts/staging-preview.cjs');
const config=require('../staging.config.json');
test('all real frontend entry points target only staging in local preview',()=>{
  const web=path.join(__dirname,'../web');
  for(const file of fs.readdirSync(web).filter(x=>x.endsWith('.html'))){
    const source=fs.readFileSync(path.join(web,file),'utf8'),result=transformHtml(source,config);
    assert.ok(result.includes('STAGING — solo dati di prova'),file);
    assert.ok(!result.includes(config.productionProjectRef),file);
    if(source.includes('SUPABASE_URL'))assert.ok(result.includes(config.supabaseUrl),file);
  }
});
test('preview refuses production identity, secret keys and unknown backend references',()=>{
  assert.throws(()=>validate({...config,projectRef:config.productionProjectRef}));
  assert.throws(()=>validate({...config,publicKey:'sb_secret_never_frontend'}));
  assert.throws(()=>transformHtml('<body>https://aaaaaaaaaaaaaaaaaaaa.supabase.co</body>',config));
  assert.throws(()=>transformHtml('<body>'+config.productionProjectRef+'</body>',config));
});
