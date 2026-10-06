"""Hand-authored campfire example. No model calls or special engine behavior."""

from .domain.models import Project


def campfire_project():
    roles = [
        ("xialan", "夏岚", "药师", "key", "克制温和", "寻找失散的商队同伴"),
        ("duan", "老段", "炊事员", "background", "爽朗，喜欢聊饭菜", "让营地的人吃上热饭"),
        ("aluo", "阿洛", "旅人", "supporting", "好奇，话语轻快", "打听明日的道路"),
        ("lintang", "林棠", "守夜人", "supporting", "简短警觉", "守住营地入口"),
        ("shenhe", "沈禾", "医帐助手", "background", "耐心，说明清楚", "照看受伤的旅人"),
        ("muyi", "木衣", "修补匠", "background", "慢条斯理", "修好旅人的背包"),
    ]
    characters = [
        {
            "id": f"camp-{key}",
            "name": name,
            "role": role,
            "importance": importance,
            "voice": voice,
            "goals": [goal],
            "tags": ["营地居民"],
            "story": f"{name}在这处临时营地中负责{role}的工作。",
        }
        for key, name, role, importance, voice, goal in roles
    ]
    dialogue = {
        "id": "camp-fire-dialogue",
        "kind": "dialogue",
        "name": "篝火旁的问候",
        "character_id": "camp-xialan",
        "entry_node_id": "greeting",
        "entry_routes": [
            {
                "node_id": "injury",
                "condition": {"op": "variable", "variable_id": "camp-injured", "value": True},
            }
        ],
        "nodes": [
            {
                "id": "greeting",
                "label": "篝火问候",
                "speaker_id": "camp-xialan",
                "text": "靠近些吧。夜里的风，比白天的沙更难熬。",
                "options": [
                    {"id": "camp-ask-road", "text": "明天的路好走吗？", "target_node_id": "road"},
                    {
                        "id": "camp-ask-help",
                        "text": "我受了点伤，能帮忙看看吗？",
                        "condition": {
                            "op": "variable",
                            "variable_id": "camp-injured",
                            "value": True,
                        },
                        "target_node_id": "injury",
                    },
                    {"id": "camp-goodbye", "text": "谢谢，我坐一会儿就走。"},
                ],
            },
            {
                "id": "road",
                "label": "旅途闲谈",
                "speaker_id": "camp-xialan",
                "text": "沿着路标往东走。至于路上会遇到什么，我也还不知道。",
                "options": [{"id": "camp-road-end", "text": "那就明早再决定吧。"}],
            },
            {
                "id": "injury",
                "label": "处理伤口",
                "speaker_id": "camp-xialan",
                "text": "先别急着赶路。去医帐，我给你换一条干净的绷带。",
                "effects": [{"op": "increment_variable", "variable_id": "camp-trust", "amount": 1}],
                "options": [{"id": "camp-thanks", "text": "谢谢你。"}],
            },
        ],
    }
    clinic = {
        "id": "camp-clinic-dialogue",
        "kind": "dialogue",
        "name": "医帐里的叮嘱",
        "character_id": "camp-xialan",
        "entry_node_id": "rest",
        "nodes": [
            {
                "id": "rest",
                "label": "医帐叮嘱",
                "speaker_id": "camp-xialan",
                "text": "绷带别沾水。今晚安心睡一觉，天亮后再说。",
                "options": [{"id": "camp-rest-end", "text": "我记住了。"}],
            }
        ],
    }
    anchors = [
        {"id": "camp-arrival", "name": "进入营地", "tick": 0},
        {"id": "camp-talk", "name": "篝火交谈", "tick": 10},
        {"id": "camp-return", "name": "返回医帐", "tick": 25},
        {"id": "camp-end", "name": "夜间休息", "tick": 40},
    ]
    appearances = []
    for key, start, end, track, dialogues in [
        ("xialan", 10, 24, "fire", [dialogue["id"]]),
        ("duan", 0, 40, "fire", []),
        ("aluo", 10, 25, "fire", []),
        ("lintang", 0, 40, "entry", []),
        ("shenhe", 0, 40, "clinic", []),
        ("muyi", 0, 25, "entry", []),
    ]:
        appearances.append(
            {
                "id": f"camp-appearance-{key}",
                "character_id": f"camp-{key}",
                "track_id": f"camp-track-{track}",
                "start_tick": start,
                "end_tick": end,
                "start_anchor_id": next((a["id"] for a in anchors if a["tick"] == start), None),
                "end_anchor_id": next((a["id"] for a in anchors if a["tick"] == end), None),
                "dialogue_ids": dialogues,
                "behavior": {"fire": "围坐篝火", "entry": "在营地入口活动", "clinic": "照看医帐"}[
                    track
                ],
            }
        )
    appearances.append(
        {
            "id": "camp-appearance-xialan-clinic",
            "character_id": "camp-xialan",
            "track_id": "camp-track-clinic",
            "start_tick": 25,
            "end_tick": 40,
            "start_anchor_id": "camp-return",
            "end_anchor_id": "camp-end",
            "dialogue_ids": [clinic["id"]],
            "behavior": "整理药材，照看伤员",
        }
    )
    content = {
        "world": {
            "name": "赤沙边境",
            "district": "",
            "clock_unit": "minute",
            "premise": "沙暴将旅人困在一处临时营地，大家围着篝火等待天亮。",
            "rules": ["人物只能说出自己已经知道的事情。", "本示例中的剧情阶段与故事分钟对应。"],
            "tone": "生活化、温暖、克制",
        },
        "characters": characters,
        "locations": [
            {"id": "camp-fire", "name": "营地篝火"},
            {"id": "camp-entry", "name": "营地入口"},
            {"id": "camp-clinic", "name": "医帐"},
        ],
        "variables": [
            {"id": "camp-injured", "name": "玩家受伤", "value_type": "boolean", "default": False},
            {"id": "camp-trust", "name": "信任", "value_type": "number", "default": 0},
        ],
        "dialogues": [dialogue, clinic],
        "relations": [
            {
                "id": "camp-relation-clinic",
                "source": {"kind": "character", "id": "camp-xialan"},
                "target": {"kind": "character", "id": "camp-shenhe"},
                "label": "医帐同伴",
            },
            {
                "id": "camp-relation-food",
                "source": {"kind": "character", "id": "camp-aluo"},
                "target": {"kind": "character", "id": "camp-duan"},
                "label": "借了一碗热汤",
            },
        ],
        "texts": [
            {
                "id": "camp-chatter-example",
                "name": "炊事员的闲聊 · 手工示例",
                "text_type": "rumor",
                "body": "今晚这锅汤，多煮了一把豆子。\n谁的木勺落在火边了？再不拿走，可要烤焦了。",
                "condition": {"op": "scene", "location_id": "camp-fire"},
            }
        ],
        "levels": [
            {
                "id": "camp-level",
                "region": "临时营地",
                "name": "第一关 · 营地之夜",
                "description": "手工示例：同一人物在篝火与医帐有两次独立出场。",
                "axis_mode": "phase",
                "anchors": anchors,
                "tracks": [
                    {"id": f"camp-track-{key}", "name": name, "location_id": f"camp-{key}"}
                    for key, name in [
                        ("fire", "营地篝火"),
                        ("entry", "营地入口"),
                        ("clinic", "医帐"),
                    ]
                ],
                "appearances": appearances,
            }
        ],
    }
    nodes = [
        {
            "entity": {"kind": "character", "id": row["id"]},
            "position": {"x": 80 + i % 3 * 350, "y": 80 + i // 3 * 260},
        }
        for i, row in enumerate(characters)
    ]
    return Project.model_validate(
        {
            "project_id": "sample-campfire",
            "name": "营地关卡示例",
            "content": content,
            "editor": {"canvases": [{"id": "camp-relations", "name": "营地人物", "nodes": nodes}]},
        }
    )
