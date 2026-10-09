class_name LevelData
extends RefCounted
## Lettura/scrittura dei file JSON in data/ (configurazione, oggetti, scene).

const GAME_PATH := "res://data/game.json"
const ITEMS_PATH := "res://data/items.json"
const SCENE_DIR := "res://data/scenes/"
## Se res:// non e' scrivibile (gioco esportato) i salvataggi del debug vanno qui,
## e hanno la precedenza sui file originali.
const USER_SCENE_DIR := "user://data/scenes/"


static func game_config() -> Dictionary:
	return _read_dict(GAME_PATH)


static func items() -> Dictionary:
	return _read_dict(ITEMS_PATH)


static func scene_path(scene_id: String) -> String:
	return SCENE_DIR + scene_id + ".json"


static func load_scene(scene_id: String) -> Dictionary:
	var user_path := USER_SCENE_DIR + scene_id + ".json"
	if FileAccess.file_exists(user_path):
		return _read_dict(user_path)
	return _read_dict(scene_path(scene_id))


## Salva i dati di una scena (usato dalla modalita' debug F1). Ritorna il percorso scritto o "".
static func save_scene(scene_id: String, data: Dictionary) -> String:
	var text := pretty(data) + "\n"
	var path := scene_path(scene_id)
	var f := FileAccess.open(path, FileAccess.WRITE)
	if f == null:
		DirAccess.make_dir_recursive_absolute(USER_SCENE_DIR)
		path = USER_SCENE_DIR + scene_id + ".json"
		f = FileAccess.open(path, FileAccess.WRITE)
		if f == null:
			return ""
	f.store_string(text)
	f.close()
	return path


static func _read_dict(path: String) -> Dictionary:
	if not FileAccess.file_exists(path):
		push_warning("File dati mancante: " + path)
		return {}
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	if parsed is Dictionary:
		return parsed
	push_error("JSON non valido: " + path)
	return {}


# ---------------------------------------------------------------- JSON "carino"

## Serializza in JSON leggibile: i dizionari vanno a capo, gli array corti di
## numeri/stringhe e le azioni brevi restano su una riga, i float interi senza ".0".
static func pretty(v: Variant, depth: int = 0) -> String:
	var pad := "\t".repeat(depth)
	if v is Dictionary:
		if v.is_empty():
			return "{}"
		var parts: PackedStringArray = []
		for k in v:
			parts.append(pad + "\t" + JSON.stringify(str(k)) + ": " + pretty(v[k], depth + 1))
		return "{\n" + ",\n".join(parts) + "\n" + pad + "}"
	if v is Array:
		var inline := _inline(v)
		if inline.length() <= 110 and not _has_dict(v):
			return inline
		if v.is_empty():
			return "[]"
		var parts: PackedStringArray = []
		for e in v:
			if e is Dictionary and _inline(e).length() <= 110:
				parts.append(pad + "\t" + _inline(e))
			else:
				parts.append(pad + "\t" + pretty(e, depth + 1))
		return "[\n" + ",\n".join(parts) + "\n" + pad + "]"
	return _inline(v)


static func _has_dict(arr: Array) -> bool:
	for e in arr:
		if e is Dictionary:
			return true
		if e is Array and _has_dict(e):
			return true
	return false


static func _inline(v: Variant) -> String:
	if v is Dictionary:
		var parts: PackedStringArray = []
		for k in v:
			parts.append(JSON.stringify(str(k)) + ": " + _inline(v[k]))
		return "{" + ", ".join(parts) + "}"
	if v is Array:
		var parts: PackedStringArray = []
		for e in v:
			parts.append(_inline(e))
		return "[" + ", ".join(parts) + "]"
	if v is float and is_equal_approx(v, roundf(v)) and absf(v) < 1.0e9:
		return str(int(v))
	return JSON.stringify(v)
