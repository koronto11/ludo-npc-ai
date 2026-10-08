import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parse} from '@babel/parser';
import traverseModule from '@babel/traverse';
const traverse=traverseModule.default;

test('workbench modal routes reference declared or imported JSX components',()=>{
  const missing=[];
  const source=fs.readFileSync('src/App.jsx','utf8');
  traverse(parse(source,{sourceType:'module',plugins:['jsx','importAttributes']}),{
    JSXOpeningElement(path){
      const node=path.node.name;
      if(node.type==='JSXIdentifier' && /^[A-Z]/.test(node.name) && !path.scope.getBinding(node.name))missing.push(node.name);
    },
  });
  assert.deepEqual([...new Set(missing)],[],'Opening a route must not raise a missing-component ReferenceError');
});
