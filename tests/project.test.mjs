import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, getCharacterState, getConversation, applyChoice, eventHasOccurred, validateProject, exportProject } from '../src/project.js';

test('changing event day affects both character state and available conversation', () => {
  const project = createProject();
  project.scenario.day = 3;
  assert.equal(getCharacterState(project, 'eve').location, '废弃灯塔');
  assert.ok(getConversation(project).options.some(option => option.id === 'protect'));
  project.entities.find(item => item.id === 'retaliation').day = 4;
  assert.equal(getCharacterState(project, 'eve').location, '旧港诊所');
  assert.ok(!getConversation(project).options.some(option => option.id === 'protect'));
});
test('hidden evidence prevents retaliation even after its planned day', () => {
  const project = createProject();
  project.scenario = { ...project.scenario, day: 5, evidence: false };
  assert.equal(eventHasOccurred(project.entities.find(item => item.id === 'retaliation'), project.scenario), false);
  assert.equal(getCharacterState(project, 'eve').location, '旧港诊所');
});
test('knowledge is event-dependent, and repeated consequential choices are idempotent', () => {
  let project = createProject();
  project.scenario.day = 1;
  assert.ok(!getCharacterState(project, 'eve').knowledge.includes('遗物已被找到'));
  project.scenario.day = 2;
  project = applyChoice(project, 'origin');
  project = applyChoice(project, 'origin');
  assert.equal(project.scenario.trust, 2);
  assert.equal(getConversation(project).text, project.dialogue.revealed);
  project.scenario.day = 3;
  project = applyChoice(project, 'protect');
  assert.equal(getCharacterState(project, 'eve').phase, '愿意作证');
});
test('save round trip preserves edits, locations and event rules and excludes credentials', () => {
  const project = createProject();
  project.entities[0].name = '伊芙·洛';
  project.entities[0].position.x = 700;
  project.modelProfile.apiKey = 'must-not-be-exported';
  const json = exportProject(project);
  assert.ok(!json.includes('must-not-be-exported'));
  const restored = validateProject(JSON.parse(json));
  assert.equal(restored.entities[0].name, '伊芙·洛');
  assert.equal(restored.entities[0].position.x, 700);
  assert.deepEqual(restored.relations, project.relations.map(edge => ({ ...edge, category: edge.category })));
});
test('choices made on day 4 cannot leak knowledge or protection into earlier days', () => {
  let project = createProject();
  project.scenario.day = 4;
  project = applyChoice(project, 'protect');
  project = applyChoice(project, 'origin');
  project.scenario.day = 3;
  assert.equal(getCharacterState(project, 'eve').phase, '躲避公会');
  assert.equal(getConversation(project).text, project.dialogue.threatened);
  project.scenario.day = 2;
  assert.equal(getConversation(project).text, project.dialogue.relic);
  project.scenario.day = 4;
  assert.equal(getCharacterState(project, 'eve').phase, '愿意作证');
});
test('malformed, incompatible, duplicate and dangling imports are rejected', () => {
  assert.throws(() => validateProject({ version: 999 }));
  const duplicate = createProject(); duplicate.entities.push(duplicate.entities[0]);
  assert.throws(() => validateProject(duplicate), /重复/);
  const dangling = createProject(); dangling.relations[0].target = 'missing';
  assert.throws(() => validateProject(dangling), /关系/);
  const invalidDay = createProject(); invalidDay.scenario.day = 'not-a-day';
  assert.throws(() => validateProject(invalidDay), /时间/);
  const wrongKind = createProject(); wrongKind.entities.find(item => item.id === 'eve').kind = 'location';
  assert.throws(() => validateProject(wrongKind), /类型/);
  const fractionalDay = createProject(); fractionalDay.entities.find(item => item.id === 'relic').day = 2.5;
  assert.throws(() => validateProject(fractionalDay), /1–5/);
});
