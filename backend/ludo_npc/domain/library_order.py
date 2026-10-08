"""Display-only library siblings; never moves objects between collections."""


def field(row, key, default=None):
    return row.get(key, default) if isinstance(row, dict) else getattr(row, key, default)


def library_ids(content, editor, scope):
    if scope in {"characters", "residents"}:
        boards = field(editor, "canvases", [])
        visible = {
            field(field(node, "entity"), "id")
            for node in (field(boards[0], "nodes", []) if boards else [])
            if field(node, "visible", True)
        }
        return {
            field(row, "id")
            for row in field(content, "characters", [])
            if (field(row, "id") in visible and field(row, "importance") != "background")
            == (scope == "characters")
        }
    collections = {
        "levels": ["levels"],
        "world": ["locations", "factions"],
        "events": ["events"],
        "texts": ["dialogues", "texts"],
    }
    return {
        field(row, "id")
        for collection in collections[scope]
        for row in field(content, collection, [])
    }
