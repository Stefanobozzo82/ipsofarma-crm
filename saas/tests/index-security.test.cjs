const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../web/index.html'),'utf8');
const functions=html.slice(html.indexOf('  async function showInvitePreview(){'),html.indexOf("  $('company-list').addEventListener"));
function fixture(session,memberships,preview){
 const nodes={};const ctx={inviteToken:preview?'token':null,mode:'signin',$:id=>nodes[id]??= {textContent:'',innerHTML:''},show:()=>{},setMsg:()=>{},sb:{auth:{getSession:async()=>({data:{session}})},from:()=>({select:async()=>({data:memberships})}),rpc:async()=>({data:[preview]})}};
 vm.runInNewContext(functions,ctx);return {ctx,nodes};
}
test('company list escapes markup and attribute delimiters in every external value',async()=>{
 const attack=`\"><svg/onload=alert(1)>&'`,f=fixture({user:{email:attack}},[{company_id:attack,company_nome:attack,role:attack}]);
 await f.ctx.refresh();const rendered=f.nodes['company-list'].innerHTML;
 assert.equal(rendered.includes('<svg'),false);assert.equal(rendered.includes('"<'),false);
 assert.equal((rendered.match(/&lt;svg\/onload=alert\(1\)&gt;/g)||[]).length,4);
 assert.equal(f.nodes['dashboard-email'].textContent,attack);
});
test('unauthenticated invite preview renders company, role and permissive email payload as literal text',async()=>{
 const attack='<svg/onload=alert(1)>@x.y',f=fixture(null,[],{company_nome:attack,role:attack,email:attack});
 await f.ctx.refresh();assert.equal(f.nodes['invite-text'].innerHTML,'');
 assert.equal(f.nodes['invite-text'].textContent.split(attack).length,4);
 assert.equal(f.nodes.email.value,attack);assert.equal(f.nodes.email.readOnly,true);
});
