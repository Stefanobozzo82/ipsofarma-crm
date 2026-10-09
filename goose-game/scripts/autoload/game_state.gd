extends Node
## Stato globale di gioco: progressi (flag), inventario, posa dell'oca, salvataggio.
## Autoload "GameState".

signal flags_changed
signal inventory_changed
signal selected_item_changed(item_id: String)
signal pose_changed(pose: String)

const SAVE_PATH := "user://save.json"
const SAVE_VERSION := 1
const POSES: Array[String] = ["normal", "neck", "crouch"]

## Flag di progresso: nome -> true. Usati da condizioni, regole e visibilita' nei JSON.
var flags: Dictionary = {}
var inventory: Array[String] = []
var current_scene := ""
var current_spawn := "start"
var selected_item := ""
var pose := "normal"
var hints_used := 0
var play_time := 0.0

## Modalita' test (tools/smoke_test.gd): niente fade, attese o salvataggi.
var test_mode := false

var config: Dictionary = {}
var items_db: Dictionary = {}
var combos: Array = []

var _save_queued := false


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	config = LevelData.game_config()
	var items_file: Dictionary = LevelData.items()
	items_db = items_file.get("items", {})
	combos = items_file.get("combos", [])
	current_scene = str(config.get("start_scene", "dump"))
	current_spawn = str(config.get("start_spawn", "start"))


func _process(delta: float) -> void:
	play_time += delta


# ------------------------------------------------------------------ partita

func new_game() -> void:
	flags.clear()
	inventory.clear()
	selected_item = ""
	pose = "normal"
	hints_used = 0
	play_time = 0.0
	current_scene = str(config.get("start_scene", "dump"))
	current_spawn = str(config.get("start_spawn", "start"))
	inventory_changed.emit()
	flags_changed.emit()
	save_game()


# ------------------------------------------------------------------ flag

func set_flag(flag: String, value: bool = true) -> void:
	if value:
		flags[flag] = true
	else:
		flags.erase(flag)
	flags_changed.emit()
	queue_save()


func has_flag(flag: String) -> bool:
	return flags.has(flag)


## Valuta una condizione JSON: { "flags": [], "not_flags": [], "has": [], "not_has": [], "pose": "" }.
## Una condizione vuota e' sempre vera. (La chiave "item" e' gestita da Level.)
func evaluate(cond: Variant) -> bool:
	if not (cond is Dictionary) or cond.is_empty():
		return true
	for f in cond.get("flags", []):
		if not flags.has(str(f)):
			return false
	for f in cond.get("not_flags", []):
		if flags.has(str(f)):
			return false
	for i in cond.get("has", []):
		if not inventory.has(str(i)):
			return false
	for i in cond.get("not_has", []):
		if inventory.has(str(i)):
			return false
	var p: String = str(cond.get("pose", ""))
	if p != "" and p != pose:
		return false
	return true


# ------------------------------------------------------------------ inventario

func add_item(item_id: String) -> void:
	if inventory.has(item_id):
		return
	inventory.append(item_id)
	inventory_changed.emit()
	queue_save()


func remove_item(item_id: String) -> void:
	if not inventory.has(item_id):
		return
	inventory.erase(item_id)
	if selected_item == item_id:
		select_item("")
	inventory_changed.emit()
	queue_save()


func has_item(item_id: String) -> bool:
	return inventory.has(item_id)


func select_item(item_id: String) -> void:
	if selected_item == item_id:
		return
	selected_item = item_id
	selected_item_changed.emit(item_id)


## Prova a combinare due oggetti. Ritorna l'id dell'oggetto creato o "" se non combinabili.
func try_combine(a: String, b: String) -> String:
	for c in combos:
		var ca: String = str(c.get("a", ""))
		var cb: String = str(c.get("b", ""))
		if (ca == a and cb == b) or (ca == b and cb == a):
			if bool(c.get("consume", true)):
				remove_item(a)
				remove_item(b)
			var result: String = str(c.get("result", ""))
			add_item(result)
			return result
	return ""


# ------------------------------------------------------------------ posa

func set_pose(p: String) -> void:
	if p == pose:
		return
	pose = p
	pose_changed.emit(p)


# ------------------------------------------------------------------ salvataggio

## Salvataggio differito: piu' modifiche nello stesso frame producono una sola scrittura.
func queue_save() -> void:
	if test_mode or _save_queued:
		return
	_save_queued = true
	save_game.call_deferred()


func save_game() -> void:
	_save_queued = false
	if test_mode:
		return
	var d := {
		"version": SAVE_VERSION,
		"scene": current_scene,
		"spawn": current_spawn,
		"flags": flags.keys(),
		"inventory": inventory,
		"hints_used": hints_used,
		"play_time": play_time,
	}
	var f := FileAccess.open(SAVE_PATH, FileAccess.WRITE)
	if f == null:
		push_warning("Impossibile scrivere " + SAVE_PATH)
		return
	f.store_string(JSON.stringify(d, "\t"))
	f.close()


func has_save() -> bool:
	return FileAccess.file_exists(SAVE_PATH)


func load_game() -> bool:
	if not has_save():
		return false
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(SAVE_PATH))
	if not (parsed is Dictionary):
		return false
	flags.clear()
	for fl in parsed.get("flags", []):
		flags[str(fl)] = true
	inventory.clear()
	for i in parsed.get("inventory", []):
		inventory.append(str(i))
	current_scene = str(parsed.get("scene", config.get("start_scene", "dump")))
	current_spawn = str(parsed.get("spawn", "start"))
	hints_used = int(parsed.get("hints_used", 0))
	play_time = float(parsed.get("play_time", 0.0))
	selected_item = ""
	pose = "normal"
	inventory_changed.emit()
	flags_changed.emit()
	return true
