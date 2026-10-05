import test from 'node:test';
import assert from 'node:assert/strict';
import {enabledModels, defaultModel, generationModel} from '../src/modelRouting.js';

const info={model_profiles:[{id:'general'},{id:'dialogue'},{id:'off',enabled:false},{id:'trash',archived:true}],active_profile_id:'general',purpose_defaults:{dialogue:'dialogue',story:'off'}};
test('old configurations stay enabled and disabled or archived ones cannot be selected',()=>{
  assert.deepEqual(enabledModels(info).map(p=>p.id),['general','dialogue']);
  assert.equal(defaultModel(info,'dialogue').id,'dialogue');
  assert.equal(defaultModel(info,'story').id,'general');
});
test('manual override stays selected across purposes and refuses silent fallback',()=>{
  assert.equal(generationModel(info,'dialogue','general').id,'general');
  assert.equal(generationModel(info,'text','dialogue').id,'dialogue');
  for(const value of ['off','trash','removed']) assert.equal(generationModel(info,'dialogue',value),null);
});
test('automatic purpose choice follows saved defaults and handles no enabled models',()=>{
  assert.equal(generationModel(info,'dialogue','').id,'dialogue');
  assert.equal(defaultModel({...info,active_profile_id:'off'},'text').id,'general');
  assert.equal(generationModel({model_profiles:[{id:'off',enabled:false}]},'story',''),null);
  assert.equal(defaultModel(undefined,'text'),null);
});
