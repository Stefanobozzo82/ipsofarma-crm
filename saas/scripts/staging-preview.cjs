// Local preview of the existing multipage frontend against an isolated backend.
// Only a publishable key is accepted; production source files are not rewritten.
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const root=path.resolve(__dirname,'..');
function validate(config) {
  if(config.environment!=='staging'||!/^[a-z]{20}$/.test(config.projectRef)
    ||config.projectRef===config.productionProjectRef
    ||config.supabaseUrl!==`https://${config.projectRef}.supabase.co`
    ||!/^sb_publishable_[A-Za-z0-9_-]+$/.test(config.publicKey)) throw Error('Configurazione staging non valida: progetto separato e chiave pubblica richiesti.');
  if(!Number.isInteger(config.port)||config.port<1024||config.port>65535) throw Error('Porta staging non valida.');
  return config;
}
function transformHtml(source,config) {
  validate(config);
  const result=source
    .replace(/((?:window\.)?SUPABASE_URL\s*=\s*)['"][^'"]+['"]/g,(_,prefix)=>prefix+JSON.stringify(config.supabaseUrl))
    .replace(/((?:window\.)?SUPABASE_ANON_KEY\s*=\s*)['"][^'"]+['"]/g,(_,prefix)=>prefix+JSON.stringify(config.publicKey));
  if(result.includes(config.productionProjectRef)) throw Error('Riferimento produzione residuo nella pagina: anteprima bloccata.');
  for(const url of result.matchAll(/https:\/\/([a-z]{20})\.supabase\.co/g)) {
    if(url[1]!==config.projectRef) throw Error('Backend diverso dallo staging nella pagina.');
  }
  return result.replace(/<body([^>]*)>/i,'<body$1><div role="status" style="padding:8px;text-align:center;background:#fff3cd;color:#664d03;font:14px system-ui">STAGING — solo dati di prova</div>');
}
function start(config=validate(JSON.parse(fs.readFileSync(path.join(root,'staging.config.json'),'utf8')))) {
  const web=fs.realpathSync(path.join(root,'web'));
  // Validate every entry point before listening, never fall back to production.
  for(const name of fs.readdirSync(web).filter(x=>x.endsWith('.html'))) transformHtml(fs.readFileSync(path.join(web,name),'utf8'),config);
  const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png'};
  const server=http.createServer((req,res)=>{
    try {
      if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);return res.end();}
      const relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
      const file=path.resolve(web,'.'+(relative==='/'?'/index.html':relative));
      if(!file.startsWith(web+path.sep)||relative.split('/').some(x=>x.startsWith('.'))) {res.writeHead(404);return res.end();}
      const real=fs.realpathSync(file);
      if(!real.startsWith(web+path.sep)){res.writeHead(404);return res.end();}
      let data=fs.readFileSync(real); const ext=path.extname(real);
      if(ext==='.html')data=Buffer.from(transformHtml(data.toString('utf8'),config));
      res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
      res.end(req.method==='HEAD'?undefined:data);
    } catch(error){res.writeHead(error.code==='ENOENT'?404:500);res.end('Anteprima non disponibile.');}
  });
  server.listen(config.port,'127.0.0.1',()=>console.log(`Staging locale: http://127.0.0.1:${config.port} — backend ${config.projectRef}`));
  return server;
}
if(require.main===module)start();
module.exports={validate,transformHtml,start};
