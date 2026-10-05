import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { projectView, commandsFromView } from '../src/projectBridge.js';

const read = name => JSON.parse(fs.readFileSync(new URL(`../docs/examples/${name}-v2.ludo.json`, import.meta.url), 'utf8'));
const apply = (document, view) => {
  const commands = commandsFromView(document, view);
  const result = spawnSync('backend/.venv/Scripts/python.exe', ['-c', "import json,sys; from ludo_npc.domain.models import Project; from ludo_npc.application.commands import CommandBatch,apply_commands; data=json.load(sys.stdin); print(apply_commands(Project.model_validate(data['document']),CommandBatch.model_validate(data['batch'])).model_dump_json())"], { input: JSON.stringify({ document, batch: { expected_revision: document.revision, commands } }), encoding: 'utf8', env: { ...process.env, PYTHONUTF8: '1' } });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
};

test('opening all v2 samples creates no implicit edits', () => {
  for (const name of ['blank', 'lighthouse', 'outpost']) {
    const doc = read(name);
    assert.deepEqual(commandsFromView(doc, projectView(doc)), [], name);
  }
});

test('editing a custom character preserves branches, facts, rules and other canvases', () => {
  const doc = read('outpost');
  doc.editor.canvases.push({ id: 'other-board', name: '另一个画布', description: '', tags: [], nodes: [], edges: [] });
  const view = projectView(doc);
  view.entities.find(e => e.id === 'keeper').goal = '等待救援';
  const result = apply(doc, view);
  assert.deepEqual(result.content.characters[0].goals, ['等待救援']);
  assert.deepEqual(result.content.dialogues, doc.content.dialogues);
  assert.deepEqual(result.content.rules, doc.content.rules);
  assert.deepEqual(result.content.facts, doc.content.facts);
  assert.deepEqual(result.editor.canvases[1], doc.editor.canvases[1]);
  assert.equal(result.content_revision, 2);
});

test('moving a card changes layout only', () => {
  const doc = read('outpost'), view = projectView(doc);
  view.entities.find(e => e.id === 'keeper').position = { x: 1234, y: 456 };
  const result = apply(doc, view);
  assert.equal(result.layout_revision, 2);
  assert.equal(result.content_revision, 1);
  assert.deepEqual(result.content, doc.content);
});

test('new manual NPC and its initial knowledge validate as one transaction', () => {
  const doc = read('blank'), view = projectView(doc);
  view.entities.push({ id: 'custom-npc', kind: 'character', name: '旅人', role: '向导', goal: '回家', knows: '北方道路已经封锁', position: { x: 10, y: 30 }, hidden: false });
  const result = apply(doc, view);
  const knowledge = result.content.initial_state.characters['custom-npc'].known_fact_ids[0];
  assert.equal(result.content.facts.find(f => f.id === knowledge).description, '北方道路已经封锁');
  assert.equal(result.content.characters.length, 1);
});

test('generic dialogue text edits retain options, effects and conditions', () => {
  const doc = read('outpost'), view = projectView(doc);
  const graph = view.entities.find(e => e.id === 'gate-conversation');
  graph.graphNodes[1].text = '新对白。';
  const result = apply(doc, view);
  assert.equal(result.content.dialogues[0].nodes[1].text, '新对白。');
  assert.deepEqual(result.content.dialogues[0].nodes[0].options, doc.content.dialogues[0].nodes[0].options);
  assert.deepEqual(result.content.dialogues[0].nodes[1].condition, doc.content.dialogues[0].nodes[1].condition);
});

test('connection handles persist in editor and example preview remains layout data', () => {
  const doc = read('lighthouse'), view = projectView(doc);
  view.relations[0].sourceHandle = 'top';
  view.scenario.day = 4;
  const result = apply(doc, view);
  assert.equal(result.content_revision, 1);
  assert.equal(result.editor.legacy_preview.day, 4);
  assert.equal(result.editor.canvases[0].edges[0].source_handle, 'top');
});

test('model settings and session key are outside all project commands', () => {
  const doc = read('outpost'), view = projectView(doc);
  view.modelProfile = { endpoint: 'https://example.com/v1', model: 'my-model', apiKey: 'not-in-project' };
  assert.deepEqual(commandsFromView(doc, view), []);
});
