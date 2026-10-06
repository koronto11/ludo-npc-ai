import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parse} from '@babel/parser';
import traverseModule from '@babel/traverse';
import {translate,translateMessage,translateError,englishCatalog} from '../src/i18nCore.js';
import {setLanguage,t,localizeLabels} from '../src/i18n.js';
import {conditionLabel,appearanceLabel} from '../src/planning.js';
import {shortBlockedReason} from '../src/rolePreviewModel.js';
import {helpSections,searchHelp} from '../src/helpContent.js';
const traverse=traverseModule.default;

test('catalogues preserve interpolation slots and every literal UI key resolves',()=>{
 const slots=s=>[...s.matchAll(/\{(\d+)\}/g)].map(m=>m[1]).sort();
 for(const [key,value] of Object.entries(englishCatalog)){
  assert.equal(typeof value,'string',key);assert.ok(value.trim(),key);
  assert.deepEqual(slots(value),slots(key),key);
 }
 for(const file of fs.readdirSync('src').filter(f=>/\.(jsx|js)$/.test(f))){
  const source=fs.readFileSync(`src/${file}`,'utf8');
  traverse(parse(source,{sourceType:'module',plugins:['jsx','importAttributes']}),{
   CallExpression(p){
    if(['t','localizeLabels'].includes(p.node.callee.name)){
     p.get('arguments.0').traverse({StringLiteral(q){
      if(/[\u3400-\u9fff]/.test(q.node.value))assert.ok(englishCatalog[q.node.value],`${file}: missing computed label ${q.node.value}`);
     }});
    }
    if(p.node.callee.name!=='t')return;
    const binding=p.scope.getBinding('t');
    assert.ok(!binding||binding.path.isImportSpecifier()||file==='i18n.js',`Translation function shadowed in ${file}:${p.node.loc.start.line}`);
    const arg=p.node.arguments[0];
    if(arg?.type==='StringLiteral'&&arg.value)assert.ok(englishCatalog[arg.value],`${file}: ${arg.value}`);
   },
   JSXAttribute(p){
    if(!['key','value','id'].includes(p.node.name.name))return;
    const value=p.node.value?.expression;
    assert.ok(value?.callee?.name!=='t',`Persisted value or key translated in ${file}:${p.node.loc.start.line}`);
   },
  });
 }
});
test('only presentation labels translate; inserted author names, text and enum keys remain exact',()=>{
 assert.equal(translate('角色',[],'en'),'Characters');
 assert.equal(translate('场景：{0}',['角色'],'en'),'Scene: 角色');
 assert.equal(translate('unknown',['原文'],'en'),'unknown');
 assert.equal(translateMessage('作者独有的一段对白','en'),'作者独有的一段对白');
 assert.equal(translateMessage('当前关卡为关卡画布','en'),'Current level: 关卡画布');
 const labels=localizeLabels({character:'角色'});setLanguage('en');
 assert.deepEqual(Object.keys(labels),['character']);assert.equal(labels.character,'Characters');
 setLanguage('zh');assert.equal(labels.character,'角色');
});
test('English scope and blocked-choice helpers retain authored names and do not mutate conditions',()=>{
 setLanguage('en');try{
  const content={variables:[{id:'injured',name:'玩家受伤'}],levels:[]};
  const condition={op:'variable',variable_id:'injured',comparison:'eq',value:true};
  assert.equal(conditionLabel(condition,content),'玩家受伤 = Yes');
  assert.equal(condition.value,true);
  assert.equal(shortBlockedReason({passed:false,reason:'玩家受伤: 否 = 是'}),'Requires “玩家受伤” to be Yes (currently No)');
  assert.match(appearanceLabel({name:'世界底稿',axis_mode:'time',tracks:[],anchors:[]},{start_tick:0,end_tick:5}),/^世界底稿 · /);
  assert.equal(t('角色'),'Characters');
 }finally{setLanguage('zh');}
});
test('service messages translate known patterns while preserving unknown provider details',()=>{
 assert.equal(translateMessage('出场时间 14–28','en'),'Appearance time 14–28');
 assert.equal(translateMessage('Appearance time 14–28','zh'),'出场时间 14–28');
 assert.equal(translateError({error:'project_not_found'},404,'en'),'Project not found. Open it again.');
 const details='供应商自定义错误：账户限制';
 assert.ok(translateError({error:'provider_error',message:details},502,'en').includes(details));
 assert.equal(translateError({message:details},502,'zh'),details);
});
test('help has matching bilingual chapters, searchable full details and generated manuals',()=>{
 assert.equal(helpSections.length,18);
 assert.equal(new Set(helpSections.map(s=>s.id)).size,helpSections.length);
 for(const section of helpSections){
  for(const lang of ['zh','en']){
   const chapter=section[lang];assert.ok(chapter.title&&chapter.intro&&chapter.steps.length&&chapter.notes.length,section.id);
   assert.ok(fs.readFileSync(`docs/user-guide-${lang}.md`,'utf8').includes(chapter.title));
  }
  assert.equal(section.zh.steps.length,section.en.steps.length,section.id);
 }
 assert.ok(searchHelp('API Key','en').some(s=>s.id==='models'));
 assert.ok(searchHelp('密钥','zh').some(s=>s.id==='models'));
 assert.deepEqual(searchHelp('unlikely-search-with-no-result','en'),[]);
});
