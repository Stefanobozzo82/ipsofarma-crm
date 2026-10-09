class_name Level
extends Node2D
## Scena di gioco generica: si costruisce da data/scenes/<GameState.current_scene>.json.
## Contiene sfondo, navigazione, oggetti interattivi, protagonista, effetti, HUD e debug.
## Per aggiungere un livello NON serve toccare questo script: basta un nuovo JSON.

## Mai emesso: serve a "parcheggiare" per sempre le coroutine quando la scena sta per essere sostituita.
signal halt
signal setup_done

const OBJECT_SCENES := {
	"hotspot": preload("res://scenes/hotspot.tscn"),
	"pickup": preload("res://scenes/pickup.tscn"),
	"npc": preload("res://scenes/npc.tscn"),
}
const PLAYER_SCENE: PackedScene = preload("res://scenes/goose.tscn")
const MINIGAME_DIR := "res://scenes/minigames/"
const HUD_BAR_Y := 940.0

@onready var backdrop: SceneBackdrop = $Backdrop
@onready var entities: Node2D = $Entities
@onready var nav_region: NavigationRegion2D = $NavRegion
@onready var atmosphere: Atmosphere = $Atmosphere
@onready var debug: DebugOverlay = $DebugOverlay
@onready var hud: Hud = $HudLayer/Hud

var scene_id := ""
var data: Dictionary = {}
var player: GooseActor
var interactables: Array[Interactable] = []
var busy := false                  # true durante interazioni e scene d'intermezzo
var runner: ActionRunner
var world_bubble: ThoughtBubble    # fumetto per oggetti che non sono PNG
var hovered: Interactable = null
var depth_scale := Vector2(0.78, 1.12)
var depth_y := Vector2(560.0, 930.0)


func _ready() -> void:
	scene_id = GameState.current_scene
	data = LevelData.load_scene(scene_id)
	if data.is_empty():
		push_error("Scena non trovata: " + scene_id)
	var depth: Dictionary = data.get("depth", {})
	depth_y = DataUtil.vec(depth.get("y", []), depth_y)
	depth_scale = DataUtil.vec(depth.get("scale", []), depth_scale)
	GameState.set_pose("normal")
	GameState.select_item("")
	runner = ActionRunner.new(self)

	backdrop.build(scene_id, data)
	atmosphere.build(data)
	build_nav()
	_spawn_objects()
	_spawn_player()
	world_bubble = ThoughtBubble.new()
	add_child(world_bubble)
	hud.setup(self)
	debug.setup(self)

	AudioManager.set_mood(str(data.get("mood", "dump")))
	AudioManager.set_ambience(str(data.get("ambience", "")))
	GameState.flags_changed.connect(refresh_all)
	GameState.pose_changed.connect(_on_pose_changed)
	refresh_all()

	# La mappa di navigazione si sincronizza al frame fisico successivo.
	await get_tree().physics_frame
	await get_tree().physics_frame
	SceneManager.level_ready.emit()
	setup_done.emit()
	await _run_on_enter()


# ------------------------------------------------------------------ costruzione

## (Ri)costruisce la NavigationRegion2D dai poligoni in data["nav"].
func build_nav() -> void:
	var nav: Dictionary = data.get("nav", {})
	var np := NavigationPolygon.new()
	np.agent_radius = 0.0
	var src := NavigationMeshSourceGeometryData2D.new()
	for raw in nav.get("polygons", []):
		src.add_traversable_outline(DataUtil.poly(raw))
	for raw in nav.get("holes", []):
		src.add_obstruction_outline(DataUtil.poly(raw))
	NavigationServer2D.bake_from_source_geometry_data(np, src)
	nav_region.navigation_polygon = np


func _spawn_objects() -> void:
	for raw in data.get("objects", []):
		var od: Dictionary = raw
		var kind: String = str(od.get("type", "hotspot"))
		if not OBJECT_SCENES.has(kind):
			push_warning("Tipo oggetto sconosciuto: " + kind)
			continue
		var packed: PackedScene = OBJECT_SCENES[kind]
		var node: Interactable = packed.instantiate()
		entities.add_child(node)
		node.setup(od, self)
		interactables.append(node)


func _spawn_player() -> void:
	var spawns: Dictionary = data.get("spawns", {})
	var key := GameState.current_spawn
	if not spawns.has(key):
		key = "start" if spawns.has("start") else (str(spawns.keys()[0]) if not spawns.is_empty() else "")
	var pos := Vector2(300, 800)
	if key != "":
		pos = DataUtil.vec(spawns[key], pos)
	player = PLAYER_SCENE.instantiate()
	entities.add_child(player)
	player.setup(GameState.config.get("player_palette", {}), "scarf", "goose", 0)
	player.depth_scale = depth_scale
	player.depth_y = depth_y
	player.speed = float(GameState.config.get("walk_speed", 420.0))
	player.global_position = pos
	player.update_depth()


## Rivaluta visibilita' e posizioni (dopo ogni cambio di flag).
func refresh_all() -> void:
	for it in interactables:
		it.refresh()


## Dopo un drag in modalita' debug: ricalcola i poligoni degli oggetti (e opzionalmente la navigazione).
func refresh_geometry(rebuild_nav: bool) -> void:
	for it in interactables:
		it.read_geometry()
	if rebuild_nav:
		build_nav()


func on_debug_changed(active: bool) -> void:
	backdrop.enabled = not active
	if active:
		player.stop_walking()


# ------------------------------------------------------------------ navigazione e input

func nav_path(from: Vector2, to: Vector2) -> PackedVector2Array:
	var path := NavigationServer2D.map_get_path(nav_region.get_navigation_map(), from, to, true)
	if path.size() < 2:
		return PackedVector2Array([to])
	return path


func _input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo and event.keycode == KEY_F1:
		debug.toggle()
		get_viewport().set_input_as_handled()


func _unhandled_input(event: InputEvent) -> void:
	if debug.active or get_tree().paused:
		return
	if event is InputEventMouseButton and event.pressed:
		if event.button_index == MOUSE_BUTTON_LEFT:
			_on_left_click(get_global_mouse_position())
		elif event.button_index == MOUSE_BUTTON_RIGHT:
			GameState.select_item("")
	elif event is InputEventKey and event.pressed and not event.echo:
		match event.keycode:
			KEY_1: set_player_pose("normal")
			KEY_2: set_player_pose("neck")
			KEY_3: set_player_pose("crouch")
			KEY_H: show_hint()


func _process(_delta: float) -> void:
	var new_hover: Interactable = null
	if not busy and not debug.active and not get_tree().paused:
		var mouse := get_global_mouse_position()
		if mouse.y < HUD_BAR_Y:
			new_hover = interactable_at(mouse)
	if new_hover != hovered:
		if hovered != null:
			hovered.hovered = false
			hovered.queue_redraw()
		hovered = new_hover
		if hovered != null:
			hovered.hovered = true
	Input.set_default_cursor_shape(Input.CURSOR_POINTING_HAND if hovered != null else Input.CURSOR_ARROW)


## L'oggetto cliccabile piu' "vicino" (y maggiore) sotto il punto dato.
func interactable_at(p: Vector2) -> Interactable:
	var best: Interactable = null
	for it in interactables:
		if it.contains_point(p) and (best == null or it.position.y >= best.position.y):
			best = it
	return best


func find_object(object_id: String) -> Interactable:
	for it in interactables:
		if it.id == object_id:
			return it
	return null


func set_player_pose(pose: String) -> void:
	if busy:
		return
	GameState.set_pose("normal" if GameState.pose == pose else pose)


func _on_pose_changed(pose: String) -> void:
	player.set_pose(pose)
	AudioManager.play_sfx("click")


func _on_left_click(p: Vector2) -> void:
	if busy or p.y >= HUD_BAR_Y:
		return
	var target := interactable_at(p)
	var item := GameState.selected_item
	if target == null:
		if item != "":
			GameState.select_item("")
		player.walk_path(nav_path(player.global_position, p))
		return
	await _interact(target, item)


func _interact(it: Interactable, item: String) -> void:
	var arrived: bool = await player.walk_path(nav_path(player.global_position, it.walk_to))
	if not arrived or not is_inside_tree():
		return
	busy = true
	player.visual.face(it.top_center().x - player.global_position.x)
	it.face_toward(player.global_position.x)
	await _run_interaction(it, item)
	busy = false


func _run_interaction(it: Interactable, item: String) -> void:
	if item != "":
		GameState.select_item("")
	var rule := find_rule(it.get_rules(), item)
	if rule.is_empty():
		AudioManager.play_sfx("buzz" if item != "" else "click")
		await say("goose", ["no"] if item != "" else ["question"])
		return
	await runner.run(rule.get("do", []))


## Prima regola valida: "when.item" assente = click semplice, "*" = qualsiasi oggetto.
func find_rule(rules: Array, item: String) -> Dictionary:
	for raw in rules:
		var r: Dictionary = raw
		var w: Dictionary = r.get("when", {})
		var want: String = str(w.get("item", ""))
		if want == "*":
			if item == "":
				continue
		elif want != item:
			continue
		if GameState.evaluate(w):
			return r
	return {}


## Esegue un'interazione senza camminare (usato dai test automatici).
func interact_by_id(object_id: String, item: String = "") -> void:
	var it := find_object(object_id)
	if it == null:
		push_error("Oggetto inesistente: " + object_id)
		return
	await _run_interaction(it, item)


func _run_on_enter() -> void:
	for raw in data.get("on_enter", []):
		var e: Dictionary = raw
		if not GameState.evaluate(e.get("when", {})):
			continue
		var once: String = str(e.get("once", ""))
		if once != "":
			if GameState.has_flag(once):
				continue
			GameState.set_flag(once)
		busy = true
		await runner.run(e.get("do", []))
		busy = false


# ------------------------------------------------------------------ suggerimenti

## Lampadina: mostra un fumetto con icone sul prossimo passo + evidenzia l'oggetto coinvolto.
func show_hint() -> void:
	if busy:
		return
	for raw in data.get("hints", []):
		var h: Dictionary = raw
		if not GameState.evaluate(h.get("if", {})):
			continue
		GameState.hints_used += 1
		var target: String = str(h.get("target", ""))
		if target == "inventory":
			hud.flash_inventory()
		else:
			var o := find_object(target)
			if o != null:
				o.show_hint()
		AudioManager.play_sfx("click")
		say("goose", h.get("icons", ["question"]), false, 3.4)
		return
	say("goose", ["sun", "heart"], false)


# ------------------------------------------------------------------ API per le azioni

## Fumetto giusto per `who` ("goose", id di un PNG o di un oggetto), gia' posizionato sopra la testa.
func _bubble_for(who: String) -> ThoughtBubble:
	var o := find_object(who)
	if o is Npc:
		var npc := o as Npc
		npc.actor.bubble.position = Vector2(0, -npc.actor.visual.head_height() - 30.0)
		return npc.actor.bubble
	if o != null:
		world_bubble.position = o.top_center()
		return world_bubble
	player.bubble.position = Vector2(0, -player.visual.head_height() - 30.0)
	return player.bubble


func say(who: String, icons: Array, wait_end: bool = true, duration: float = 2.4) -> void:
	var b := _bubble_for(who)
	if wait_end:
		await b.pop(icons, duration)
	else:
		b.pop(icons, duration)


func honk(who: String) -> void:
	if who == "goose" or who == "":
		player.honk()
		return
	var o := find_object(who)
	if o is Npc:
		(o as Npc).actor.honk()
	else:
		AudioManager.honk(1)


func wait(seconds: float) -> void:
	if GameState.test_mode:
		return
	await get_tree().create_timer(seconds).timeout


func move_npc(who: String, target: Vector2) -> void:
	var o := find_object(who)
	if o is Npc:
		await (o as Npc).move_to(target)


func look_at_object(who: String) -> void:
	var o := find_object(who)
	if o != null:
		player.visual.face(o.top_center().x - player.global_position.x)


func shake(amount: float, duration: float) -> void:
	if GameState.test_mode:
		return
	var tw := create_tween()
	var step := duration / 7.0
	for i in 6:
		tw.tween_property(self, "position", Vector2(randf_range(-amount, amount), randf_range(-amount, amount)), step)
	tw.tween_property(self, "position", Vector2.ZERO, step)
	await tw.finished


## Avvia un minigioco definito in data["minigames"][id]. Ritorna true se vinto.
func run_minigame(mg_id: String) -> bool:
	if GameState.test_mode:
		return true
	var minigames: Dictionary = data.get("minigames", {})
	if not minigames.has(mg_id):
		push_error("Minigioco non definito nella scena: " + mg_id)
		return false
	var def: Dictionary = minigames[mg_id]
	var packed: PackedScene = load(MINIGAME_DIR + str(def.get("type", "")) + ".tscn")
	var layer := CanvasLayer.new()
	layer.layer = 60
	add_child(layer)
	var mg: Minigame = packed.instantiate()
	layer.add_child(mg)
	mg.start(def.get("config", {}))
	var won: bool = await mg.finished
	layer.queue_free()
	return won
