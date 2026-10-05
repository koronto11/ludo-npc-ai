"""A world independent of the prototype's built-in character and event IDs."""

from .domain.models import Project


def outpost_project() -> Project:
    return Project.model_validate(
        {
            "project_id": "sample-wasteland-outpost",
            "name": "荒原驿站",
            "content": {
                "world": {
                    "name": "赤沙边境",
                    "premise": "补给稀缺的荒原中，驿站等待一支失约的商队。",
                    "rules": ["人物只能谈论自己已知的事实。", "商队抵达前，补给不会自行增加。"],
                },
                "characters": [
                    {
                        "id": "keeper",
                        "name": "夏岚",
                        "role": "驿站守门人",
                        "goals": ["保护驿站并找回失踪的商队"],
                        "voice": "简短谨慎",
                        "confirmed_fields": ["name", "role"],
                    }
                ],
                "locations": [
                    {"id": "outpost", "name": "红砂驿站"},
                    {"id": "gate", "name": "东门", "parent_id": "outpost"},
                ],
                "factions": [
                    {
                        "id": "caravan-guild",
                        "name": "行路人商会",
                        "policies": ["优先向驿站供应饮水"],
                    }
                ],
                "facts": [
                    {
                        "id": "caravan-arrival",
                        "name": "商队抵达",
                        "available_at": 3,
                        "description": "商队在第三天带来饮水。",
                    }
                ],
                "variables": [
                    {"id": "supplies", "name": "剩余饮水", "value_type": "number", "default": 2}
                ],
                "events": [
                    {
                        "id": "arrival",
                        "name": "商队抵达驿站",
                        "scheduled_at": 3,
                        "affected_character_ids": ["keeper"],
                        "effects": [
                            {"op": "increment_variable", "variable_id": "supplies", "amount": 5},
                            {
                                "op": "grant_knowledge",
                                "character_id": "keeper",
                                "fact_id": "caravan-arrival",
                            },
                        ],
                    }
                ],
                "rules": [
                    {
                        "id": "water-alert",
                        "name": "缺水警戒",
                        "condition": {
                            "op": "variable",
                            "variable_id": "supplies",
                            "comparison": "lte",
                            "value": 1,
                        },
                        "effects": [
                            {
                                "op": "set_behavior",
                                "character_id": "keeper",
                                "behavior": "限制访客进入储水间",
                            }
                        ],
                    }
                ],
                "dialogues": [
                    {
                        "id": "gate-conversation",
                        "name": "东门询问",
                        "character_id": "keeper",
                        "entry_node_id": "greeting",
                        "nodes": [
                            {
                                "id": "greeting",
                                "speaker_id": "keeper",
                                "text": "带了水吗？没有的话，先别走太远。",
                                "options": [
                                    {
                                        "id": "ask-arrival",
                                        "text": "商队到了吗？",
                                        "condition": {
                                            "op": "knows",
                                            "character_id": "keeper",
                                            "fact_id": "caravan-arrival",
                                        },
                                        "target_node_id": "arrival-answer",
                                    },
                                    {"id": "leave", "text": "我稍后再来。"},
                                ],
                            },
                            {
                                "id": "arrival-answer",
                                "speaker_id": "keeper",
                                "text": "第三天清晨来的，水囊已经入库。",
                                "condition": {
                                    "op": "knows",
                                    "character_id": "keeper",
                                    "fact_id": "caravan-arrival",
                                },
                            },
                        ],
                    }
                ],
                "texts": [
                    {
                        "id": "water-notice",
                        "name": "饮水告示",
                        "text_type": "quest",
                        "body": "每位旅人只领取一壶饮水。",
                        "author_id": "keeper",
                        "condition": {
                            "op": "variable",
                            "variable_id": "supplies",
                            "comparison": "lte",
                            "value": 1,
                        },
                    }
                ],
                "relations": [
                    {
                        "id": "keeper-guild",
                        "source": {"kind": "character", "id": "keeper"},
                        "target": {"kind": "faction", "id": "caravan-guild"},
                        "label": "等待商会补给",
                    }
                ],
                "initial_state": {
                    "tick": 0,
                    "characters": {"keeper": {"location_id": "gate", "behavior": "守候商队"}},
                },
                "simulation_cases": [
                    {"id": "case-before", "name": "商队抵达之前", "at_tick": 2},
                    {
                        "id": "case-after",
                        "name": "商队抵达之后",
                        "at_tick": 3,
                        "choices": [
                            {
                                "tick": 3,
                                "dialogue_id": "gate-conversation",
                                "option_id": "ask-arrival",
                            }
                        ],
                    },
                ],
                "drafts": [
                    {
                        "id": "keeper-story-draft",
                        "name": "守门人的往事草稿",
                        "target": {"kind": "character", "id": "keeper"},
                        "base_content_revision": 1,
                        "patch": {"story": "夏岚曾在荒原救下一位迷路的商队领队。"},
                        "source_refs": [{"kind": "faction", "id": "caravan-guild"}],
                    }
                ],
            },
            "editor": {
                "canvases": [
                    {
                        "id": "outpost-board",
                        "name": "驿站人物与补给",
                        "nodes": [
                            {
                                "entity": {"kind": "character", "id": "keeper"},
                                "position": {"x": 100, "y": 180},
                            },
                            {
                                "entity": {"kind": "event", "id": "arrival"},
                                "position": {"x": 450, "y": 180},
                            },
                        ],
                    }
                ]
            },
        }
    )
