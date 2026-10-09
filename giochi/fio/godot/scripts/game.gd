extends Node
## Stato globale del gioco: comandi, salvataggio, Scintille, monete e vite.

const SAVE_PATH := "user://fio_save.json"
const TOTAL_STARS := 176
const NEED := {"volcano": 3, "snow": 6, "desert": 10, "bay": 15, "ghost": 10, "clock": 20, "rainbow": 24, "shroom": 12,
	"cave": 16, "slide": 1, "mountain": 30, "giant": 38, "flood": 46, "docks": 55, "stone": 62, "toy": 70, "fortress": 50}
## mondi gia' portati nel prototipo Godot
const PORTED := ["island", "castle", "volcano"]

var stars := {}          # "mondo:id" -> true
var lives := 4
var coins := 0
var red := 0
var next_life := 50


func _ready() -> void:
	_setup_input()
	load_game()


func star_count() -> int:
	return stars.size()


func has_star(level: String, id: String) -> bool:
	return stars.has(level + ":" + id)


func add_star(level: String, id: String) -> bool:
	var k := level + ":" + id
	if stars.has(k):
		return false
	stars[k] = true
	save_game()
	return true


func save_game() -> void:
	var f := FileAccess.open(SAVE_PATH, FileAccess.WRITE)
	if f:
		f.store_string(JSON.stringify({"stars": stars, "lives": lives}))


func load_game() -> void:
	if not FileAccess.file_exists(SAVE_PATH):
		return
	var d = JSON.parse_string(FileAccess.get_file_as_string(SAVE_PATH))
	if d is Dictionary:
		stars = d.get("stars", {})
		lives = int(d.get("lives", 4))


func reset_level_counters() -> void:
	coins = 0
	red = 0
	next_life = 50


## La versione web usa i colori cosi' come sono (senza conversione sRGB): il glTF li porta come lineari
## e Godot li schiarirebbe. Qui li riportiamo ai valori originali (una volta per materiale).
var _fixed := {}
func fix_visuals(root: Node) -> void:
	for mi in root.find_children("*", "MeshInstance3D", true, false):
		var m: Mesh = mi.mesh
		if not m:
			continue
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
		for s in m.get_surface_count():
			var mat = m.surface_get_material(s)
			if not (mat is BaseMaterial3D) or _fixed.has(mat):
				continue
			_fixed[mat] = true
			mat.albedo_color = Color(mat.albedo_color.srgb_to_linear(), mat.albedo_color.a)
			if mat.emission_enabled:
				mat.emission = mat.emission.srgb_to_linear()
			if m.surface_get_format(s) & Mesh.ARRAY_FORMAT_COLOR:
				mat.vertex_color_use_as_albedo = true
				mat.vertex_color_is_srgb = true


# ---------- comandi: tastiera, joypad ----------
func _key(action: String, keys: Array) -> void:
	for k in keys:
		var e := InputEventKey.new()
		e.physical_keycode = k
		InputMap.action_add_event(action, e)


func _pad_button(action: String, buttons: Array) -> void:
	for b in buttons:
		var e := InputEventJoypadButton.new()
		e.button_index = b
		InputMap.action_add_event(action, e)


func _pad_axis(action: String, axis: int, dir: float) -> void:
	var e := InputEventJoypadMotion.new()
	e.axis = axis
	e.axis_value = dir
	InputMap.action_add_event(action, e)


func _setup_input() -> void:
	var actions := ["move_left", "move_right", "move_forward", "move_back", "jump", "crouch", "punch",
		"cam_left", "cam_right", "cam_recenter", "pause", "fullscreen"]
	for a in actions:
		if not InputMap.has_action(a):
			InputMap.add_action(a, 0.2)
	_key("move_left", [KEY_A, KEY_LEFT]); _key("move_right", [KEY_D, KEY_RIGHT])
	_key("move_forward", [KEY_W, KEY_UP]); _key("move_back", [KEY_S, KEY_DOWN])
	_key("jump", [KEY_SPACE]); _key("crouch", [KEY_SHIFT, KEY_K]); _key("punch", [KEY_J])
	_key("cam_left", [KEY_Q]); _key("cam_right", [KEY_E]); _key("cam_recenter", [KEY_C])
	_key("pause", [KEY_ESCAPE, KEY_P]); _key("fullscreen", [KEY_F11])
	_pad_axis("move_left", JOY_AXIS_LEFT_X, -1.0); _pad_axis("move_right", JOY_AXIS_LEFT_X, 1.0)
	_pad_axis("move_forward", JOY_AXIS_LEFT_Y, -1.0); _pad_axis("move_back", JOY_AXIS_LEFT_Y, 1.0)
	_pad_axis("cam_left", JOY_AXIS_RIGHT_X, -1.0); _pad_axis("cam_right", JOY_AXIS_RIGHT_X, 1.0)
	_pad_axis("crouch", JOY_AXIS_TRIGGER_LEFT, 1.0); _pad_axis("crouch", JOY_AXIS_TRIGGER_RIGHT, 1.0)
	_pad_button("jump", [JOY_BUTTON_A]); _pad_button("punch", [JOY_BUTTON_X, JOY_BUTTON_B])
	_pad_button("crouch", [JOY_BUTTON_LEFT_SHOULDER]); _pad_button("cam_recenter", [JOY_BUTTON_RIGHT_SHOULDER, JOY_BUTTON_Y])
	_pad_button("pause", [JOY_BUTTON_START])
	_pad_button("move_forward", [JOY_BUTTON_DPAD_UP]); _pad_button("move_back", [JOY_BUTTON_DPAD_DOWN])
	_pad_button("move_left", [JOY_BUTTON_DPAD_LEFT]); _pad_button("move_right", [JOY_BUTTON_DPAD_RIGHT])


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("fullscreen"):
		var full := DisplayServer.window_get_mode() == DisplayServer.WINDOW_MODE_FULLSCREEN
		DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_WINDOWED if full else DisplayServer.WINDOW_MODE_FULLSCREEN)
