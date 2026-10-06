import test from 'node:test';
import assert from 'node:assert/strict';
import {projectDirectoryName} from '../src/projectPaths.js';

test('project folder previews match portable names without escaping the selected parent',()=>{
  for(const [name,expected] of [['营地故事','营地故事'],['../城镇/故事 ','-城镇-故事'],['CON','CON-项目'],['NUL.world','NUL.world-项目'],['...','未命名项目']])assert.equal(projectDirectoryName(name),expected);
  assert.equal(Array.from(projectDirectoryName('🎭'.repeat(100))).length,90);
});
