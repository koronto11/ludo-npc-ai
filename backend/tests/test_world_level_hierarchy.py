import json

from ludo_npc.application.commands import CommandBatch, apply_commands
from ludo_npc.camp_sample import campfire_project
from ludo_npc.domain.models import Level, Project
from ludo_npc.drafts import author_hash
from ludo_npc.generation import GenerateInput, GenerationItem, context_for
from ludo_npc.simulation import SimulationInput


def test_old_project_region_survives_loading_without_being_assigned_to_levels():
    old = campfire_project().model_dump(mode="json")
    old["content"]["world"]["district"] = "Old region"
    old["content"]["levels"][0].pop("region")
    current = Project.model_validate(old)
    assert current.content.world.district == "Old region"
    assert current.content.levels[0].region == ""
    assert author_hash(old) == author_hash(current)


def test_region_transfer_is_atomic_and_round_trips_without_altering_other_levels():
    project = campfire_project()
    project.content.world.district = "Chosen region"
    project.content.levels.append(Level(id="other-level", name="Other", region="Other region"))
    level = project.content.levels[0].model_dump(mode="json")
    level.update(region="Chosen region", description="Local story phase")
    world = project.content.world.model_dump(mode="json")
    world["district"] = ""
    result = apply_commands(
        project,
        CommandBatch.model_validate(
            {
                "expected_revision": project.revision,
                "commands": [
                    {"type": "put_level", "level": level},
                    {"type": "replace_world", "world": world},
                ],
            }
        ),
    )
    reopened = Project.model_validate(json.loads(result.model_dump_json()))
    assert reopened.content.world.district == ""
    assert reopened.content.levels[0].region == "Chosen region"
    assert reopened.content.levels[0].description == "Local story phase"
    assert reopened.content.levels[1].region == "Other region"
    assert project.content.world.district == "Chosen region"
    assert author_hash(reopened) != author_hash(project)


def test_generation_uses_only_the_selected_level_and_omits_legacy_global_region():
    project = campfire_project()
    level = project.content.levels[0]
    project.content.world.district = "Legacy region must not leak"
    level.description = "A local camp story"
    project.content.levels.append(
        Level(id="other-level", name="Other", region="Other region", description="Other story")
    )
    item = GenerationItem(kind="character", name="Candidate", target_id=project.content.characters[0].id, fields=["story"])
    request = GenerateInput(
        request_id="request-context",
        expected_revision=project.revision,
        profile_id="test-profile",
        instructions="Write a story",
        items=[item],
        scenario=SimulationInput(
            expected_content_revision=project.content_revision, level_id=level.id
        ),
    )
    context, _ = context_for(project, request, item)
    assert "district" not in context["world"]
    assert context["level"] == {
        "id": level.id,
        "name": level.name,
        "region": level.region,
        "description": level.description,
    }
    assert "Other story" not in json.dumps(context)
    unscoped, _ = context_for(project, request.model_copy(update={"scenario": None}), item)
    assert unscoped["level"] is None
