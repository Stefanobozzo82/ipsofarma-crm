const {test}=require('node:test');const assert=require('node:assert/strict');const {createHmac}=require('node:crypto');
const {createStripeWebhookHandler,validStripeSignature}=require('../supabase/functions/stripe-webhook/handler.ts');
const now=1700000000000,secret='test-secret';const raw=JSON.stringify({id:'evt_test',type:'customer.subscription.updated',created:1700000000,data:{object:{id:'sub_test'}}});
const sign=(body=raw,t=now/1000)=>`t=${t},v1=${createHmac('sha256',secret).update(`${t}.${body}`).digest('hex')}`;
test('Stripe rotation accepts any valid v1 and rejects expired/tampered/duplicate timestamps',async()=>{
 assert.equal(await validStripeSignature(raw,sign()+',v1='+'0'.repeat(64),secret,now),true);
 for(const [body,header] of [[raw,sign(raw,now/1000-301)],[raw+' ',sign()],[raw,sign()+`,t=${now/1000}`]])assert.equal(await validStripeSignature(body,header,secret,now),false);
});
test('actual webhook only acknowledges successful SQL and returns retriable failure for DB errors',async()=>{
 for(const failure of [false,true]){let calls=0;const h=createStripeWebhookHandler({env:()=>secret,now:()=>now,apply:async()=>{calls++;return {error:failure?{message:'missing company'}:null};}});
 const request=()=>new Request('https://edge.test',{method:'POST',headers:{'Stripe-Signature':sign()},body:raw});
 assert.equal((await h(request())).status,failure?503:200);assert.equal(calls,1);
 const bad=new Request('https://edge.test',{method:'POST',body:raw});assert.equal((await h(bad)).status,400);assert.equal(calls,1);
 }
});
