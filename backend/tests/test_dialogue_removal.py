from ludo_npc.application.commands import CommandBatch
from ludo_npc.application.projects import MemoryProjects
from ludo_npc.camp_sample import campfire_project
from ludo_npc.domain.models import Project
from ludo_npc.drafts import author_hash
from ludo_npc.exports import markdown, dialogue_csv
from ludo_npc.simulation import SimulationInput, rehearse
from ludo_npc.templates import ApplyTemplate, capture, apply_commands as template_commands


def unlinked_project():
    data = campfire_project().model_dump(mode='json')
    actor = data['content']['dialogues'][0]['character_id']
    for level in data['content']['levels']:
        for appearance in level['appearances']:
            if appearance['character_id'] == actor:
                appearance.update(dialogue_ids=[], inherit_dialogues=False)
    return Project.model_validate(data)


def test_old_default_appearance_serialization_and_author_hash_are_unchanged():
    original = campfire_project()
    data = original.model_dump(mode='json')
    for level in data['content']['levels']:
        for appearance in level['appearances']:
            assert 'inherit_dialogues' not in appearance
            appearance['inherit_dialogues'] = True
    assert author_hash(Project.model_validate(data)) == author_hash(original)
    assert Project.model_validate(data).model_dump(mode='json') == original.model_dump(mode='json')


def test_explicitly_unlinked_appearance_cannot_execute_old_dialogue_and_exports_omit_its_binding():
    project = unlinked_project()
    result = rehearse(project, SimulationInput(expected_content_revision=project.content_revision, at_tick=14, location_id='camp-fire', level_id='camp-level', card_trial={'dialogue_id':'camp-fire-dialogue','started':True}))
    active = next(row for row in result['dialogues'] if row['id'] == 'camp-fire-dialogue')
    assert not active['available']
    assert not result['transcript']
    assert project.content.dialogues[0].name not in markdown(project, 'camp-level')
    assert 'camp-fire-dialogue' not in dialogue_csv(project, 'camp-level')


def test_delete_and_undo_restore_links_content_and_layout_atomically():
    store = MemoryProjects()
    original = store.add(campfire_project())
    graph = original.content.dialogues[0]
    level = original.content.levels[0].model_dump(mode='json')
    for appearance in level['appearances']:
        if appearance['character_id'] == graph.character_id:
            appearance.update(dialogue_ids=[], inherit_dialogues=False)
    commands = [{'type':'put_level','level':level},{'type':'delete_entity','target':{'kind':'dialogue','id':graph.id}}]
    changed = store.apply(original.project_id,CommandBatch(expected_revision=original.revision,commands=commands))
    assert graph.id not in [row.id for row in changed.content.dialogues]
    assert any(not a.inherit_dialogues for a in changed.content.levels[0].appearances)
    restored = store.undo_edit(changed.project_id,changed.revision,'undo')
    assert restored.content == original.content
    assert restored.editor.dialogue_layouts == original.editor.dialogue_layouts


def test_template_applied_to_empty_explicit_appearance_links_only_the_new_dialogue():
    project=unlinked_project()
    graph=project.content.dialogues[0]
    level=project.content.levels[0]
    appearance=next(a for a in level.appearances if a.character_id==graph.character_id)
    template=capture(project,'dialogue',graph.id,'对白模板')
    batch,new_id=template_commands(project,template,ApplyTemplate(template_id=template.id,name='新对白',expected_revision=project.revision,character_id=graph.character_id,level_id=level.id,appearance_id=appearance.id))
    changed=next(command.level for command in batch.commands if command.type=='put_level')
    bound=next(a for a in changed.appearances if a.id==appearance.id)
    assert bound.dialogue_ids == [new_id]
    assert not bound.inherit_dialogues


def test_new_candidate_adoption_does_not_resurrect_removed_default_dialogue(tmp_path):
    from tests.test_generation import FixtureProvider, setup_client, start, wait_job
    from tests.test_scene_crowd_workflow import commands, setup_scene, item
    client, identifier, _ = setup_client(tmp_path, FixtureProvider())
    try:
        level=setup_scene(client, identifier)
        level['appearances'][0].update(dialogue_ids=[], inherit_dialogues=False)
        assert commands(client,identifier,[{'type':'put_level','level':level}]).status_code == 200
        assert start(client,identifier,[item()]).status_code == 202
        job=wait_job(client,identifier)
        before=client.get(f'/api/v2/projects/{identifier}').json()
        draft=next(d for d in before['content']['drafts'] if d['id']==job['draft_ids'][0])
        result=commands(client,identifier,[{'type':'review_draft','draft_id':draft['id'],'action':'accept','expected_author_hash':author_hash(before),'values':draft['patch']}])
        assert result.status_code == 200, result.text
        appearance=result.json()['content']['levels'][0]['appearances'][0]
        assert appearance['dialogue_ids'] == [draft['target']['id']]
        assert appearance['inherit_dialogues'] is False
    finally:
        client.__exit__(None,None,None)
