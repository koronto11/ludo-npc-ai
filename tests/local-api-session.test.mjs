import test from 'node:test';
import assert from 'node:assert/strict';
import { api } from '../src/localApi.js';

const response = (status, body) => ({status,ok:status>=200&&status<300,json:async()=>body});
const expired = () => response(401,{error:'session_required',message:'请先访问 /start 建立本机会话'});

test('a locally rejected submission renews the session and preserves the request', async t => {
  const calls=[];
  t.mock.method(globalThis,'fetch',async (path,options)=>{
    calls.push({path,options});
    if(path==='/api/session')return response(200,{ready:true});
    return calls.length===1?expired():response(200,{submitted:true});
  });
  const body={request_id:'same-id',api_key:'fixture-only-key',items:[]};
  assert.deepEqual(await api('/api/v2/projects/fixture/generate',{method:'POST',body}),{submitted:true});
  assert.deepEqual(calls.map(c=>c.path),['/api/v2/projects/fixture/generate','/api/session','/api/v2/projects/fixture/generate']);
  assert.equal(calls[0].options.body,calls[2].options.body);
  assert.equal(calls[1].options.body,undefined);
  assert.equal(calls[1].options.credentials,'same-origin');
});

test('concurrent stale requests share one session bootstrap', async t => {
  let bootstraps=0,ready=false,release;
  t.mock.method(globalThis,'fetch',async path=>{
    if(path==='/api/session'){
      bootstraps++;
      await new Promise(resolve=>{release=resolve;});ready=true;
      return response(200,{ready:true});
    }
    return ready?response(200,{ok:true}):expired();
  });
  const first=api('/api/workspace'),second=api('/api/v2/projects');
  while(!release)await new Promise(resolve=>setImmediate(resolve));
  release();
  assert.deepEqual(await Promise.all([first,second]),[{ok:true},{ok:true}]);
  assert.equal(bootstraps,1);
});

test('provider authentication failures never repeat model requests', async t => {
  let calls=0;
  t.mock.method(globalThis,'fetch',async()=>{calls++;return response(502,{error:'http_401',message:'认证失败'});});
  await assert.rejects(api('/api/models/test',{method:'POST',body:{}}),e=>e.code==='http_401');
  assert.equal(calls,1);
});

test('failed session renewal retains edits and does not resubmit', async t => {
  const calls=[];
  t.mock.method(globalThis,'fetch',async path=>{calls.push(path);return path==='/api/session'?response(503,{}):expired();});
  await assert.rejects(api('/api/workspace'),/当前页面的编辑仍保留/);
  assert.deepEqual(calls,['/api/workspace','/api/session']);
});

test('repeated guard rejection is bounded to one retry', async t => {
  const calls=[];
  t.mock.method(globalThis,'fetch',async path=>{calls.push(path);return path==='/api/session'?response(200,{ready:true}):expired();});
  await assert.rejects(api('/api/workspace'),e=>e.code==='session_required');
  assert.equal(calls.length,3);
});

test('cancellation during renewal prevents resubmission', async t => {
  const controller=new AbortController(),calls=[];
  t.mock.method(globalThis,'fetch',async path=>{
    calls.push(path);
    if(path==='/api/session'){controller.abort();return response(200,{ready:true});}
    return expired();
  });
  await assert.rejects(api('/api/workspace',{signal:controller.signal}),e=>e.name==='AbortError');
  assert.deepEqual(calls,['/api/workspace','/api/session']);
});
