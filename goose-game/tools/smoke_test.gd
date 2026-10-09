extends Node
## Test automatico (senza finestra):
##   godot --headless --path goose-game res://tools/smoke_test.tscn
## 1) valida i JSON in data/ (riferimenti, flag, oggetti, navigazione)
## 2) verifica la logica dei minigiochi
## 3) gioca l'intera avventura risolvendo i puzzle e controllando i flag.
## Esce con codice 0 se tutto va bene, 1 altrimenti.

var errors: Array[String] = []
var checks := 0


func _ready() -> void:
	GameState.test_mode = true
	await get_tree().process_frame
	_validate_data()
	_test_minigames()
	await _playthrough()
	await _test_real_walk()
	_test_save_load()
	await _test_ui_scenes()
	print("")
	print("Controlli eseguiti: %d" % checks)
	if errors.is_empty():
		print("TUTTO OK")
		get_tree().quit(0)
	else:
		print("ERRORI (%d):" % errors.size())
		for e in errors:
			print("  - " + e)
		get_tree().quit(1)


func check(cond: bool, msg: String) -> void:
	checks += 1
	if not cond:
		errors.append(msg)


# ------------------------------------------------------------------ 1) dati

func _validate_data() -> void:
	var cfg: Dictionary = GameState.config
	var scene_ids: Array = cfg.get("scenes", [])
	var items: Dictionary = GameState.items_db
	check(not scene_ids.is_empty(), "game.json: nessuna scena")
	var all_data: Dictionary = {}
	for sid in scene_ids:
		var d := LevelData.load_scene(str(sid))
		check(not d.is_empty(), "scena non caricabile: " + str(sid))
		all_data[str(sid)] = d
	var set_flags: Dictionary = {}
	var read_flags: Array = []
	for sid in all_data:
		var d: Dictionary = all_data[sid]
		_collect(d, set_flags, read_flags)
		var ids: Dictionary = {}
		var spawns: Dictionary = d.get("spawns", {})
		var nav_polys: Array = d.get("nav", {}).get("polygons", [])
		check(not nav_polys.is_empty(), "%s: manca la navigazione" % sid)
		for raw in d.get("objects", []):
			var o: Dictionary = raw
			var oid: String = str(o.get("id", ""))
			check(oid != "", "%s: oggetto senza id" % sid)
			check(not ids.has(oid), "%s: id duplicato '%s'" % [sid, oid])
			ids[oid] = true
			if o.has("walk_to") and bool(o.get("clickable", true)) and not nav_polys.is_empty():
				var wt := DataUtil.vec(o["walk_to"])
				var inside := false
				for np in nav_polys:
					if Geometry2D.is_point_in_polygon(wt, DataUtil.poly(np)):
						inside = true
				check(inside, "%s/%s: walk_to %s fuori dall'area di navigazione" % [sid, oid, wt])
			if str(o.get("type", "")) == "pickup":
				check(items.has(str(o.get("item", oid))), "%s/%s: oggetto '%s' non definito in items.json" % [sid, oid, o.get("item", oid)])
		for sp in spawns:
			var p := DataUtil.vec(spawns[sp])
			var ok := false
			for np in nav_polys:
				if Geometry2D.is_point_in_polygon(p, DataUtil.poly(np)):
					ok = true
			check(ok, "%s: spawn '%s' fuori dalla navigazione" % [sid, sp])
		# Riferimenti nelle azioni.
		for act in _all_actions(d):
			var a: String = str(act.get("a", ""))
			match a:
				"give", "take":
					check(items.has(str(act.get("item", ""))), "%s: azione %s con oggetto sconosciuto '%s'" % [sid, a, act.get("item", "")])
				"bubble", "honk", "move", "look":
					var who: String = str(act.get("who", "goose"))
					check(who == "goose" or ids.has(who), "%s: azione %s verso '%s' inesistente" % [sid, a, who])
				"minigame":
					check(d.get("minigames", {}).has(str(act.get("id", ""))), "%s: minigioco '%s' non definito" % [sid, act.get("id", "")])
				"goto":
					var tgt: String = str(act.get("scene", ""))
					check(all_data.has(tgt), "%s: goto verso scena inesistente '%s'" % [sid, tgt])
					if all_data.has(tgt):
						check(all_data[tgt].get("spawns", {}).has(str(act.get("spawn", "start"))), "%s: spawn '%s' inesistente in %s" % [sid, act.get("spawn", ""), tgt])
		for raw in d.get("hints", []):
			var h: Dictionary = raw
			var t: String = str(h.get("target", ""))
			check(t == "" or t == "inventory" or ids.has(t), "%s: hint verso '%s' inesistente" % [sid, t])
	for f in read_flags:
		check(set_flags.has(f), "flag letto ma mai impostato: '%s'" % f)
	for it in GameState.combos:
		check(items.has(str(it.get("a", ""))) and items.has(str(it.get("b", ""))) and items.has(str(it.get("result", ""))), "combo con oggetti sconosciuti")


func _collect(d: Dictionary, set_flags: Dictionary, read_flags: Array) -> void:
	for act in _all_actions(d):
		if str(act.get("a", "")) == "flag":
			set_flags[str(act.get("flag", ""))] = true
	for raw in d.get("objects", []):
		if str(raw.get("type", "")) == "pickup":
			set_flags["got_" + str(raw.get("id", ""))] = true
	for raw in d.get("on_enter", []):
		if raw.has("once"):
			set_flags[str(raw["once"])] = true
	for cond in _all_conditions(d):
		for key in ["flags", "not_flags"]:
			for f in cond.get(key, []):
				if not read_flags.has(str(f)):
					read_flags.append(str(f))


func _all_conditions(d: Dictionary) -> Array:
	var out: Array = []
	for raw in d.get("objects", []):
		var o: Dictionary = raw
		if o.has("visible_if"):
			out.append(o["visible_if"])
		for alt in o.get("pos_if", []):
			out.append(alt.get("if", {}))
		for r in o.get("interactions", []):
			out.append(r.get("when", {}))
	for raw in d.get("hints", []):
		out.append(raw.get("if", {}))
	for raw in d.get("on_enter", []):
		out.append(raw.get("when", {}))
	for dec in d.get("placeholder", {}).get("decor", []):
		if dec.has("visible_if"):
			out.append(dec["visible_if"])
	for act in _all_actions(d):
		if str(act.get("a", "")) == "if":
			out.append(act.get("when", {}))
	return out


## Tutte le azioni (anche annidate in win/lose/then/else) di una scena.
func _all_actions(d: Dictionary) -> Array:
	var out: Array = []
	for raw in d.get("objects", []):
		for r in raw.get("interactions", []):
			_walk_actions(r.get("do", []), out)
	for raw in d.get("on_enter", []):
		_walk_actions(raw.get("do", []), out)
	return out


func _walk_actions(list: Array, out: Array) -> void:
	for a in list:
		out.append(a)
		for key in ["win", "lose", "then", "else"]:
			if a.has(key):
				_walk_actions(a[key], out)


# ------------------------------------------------------------------ 2) minigiochi

func _test_minigames() -> void:
	var canal := LevelData.load_scene("canal")
	var cfg: Dictionary = canal["minigames"]["pipes"]["config"]
	var kinds: Array = cfg["kinds"]
	var rots: Array = []
	for row in cfg["rot"]:
		rots.append((row as Array).duplicate())
	check(not PipeMaze.flood(kinds, rots, int(cfg["entry_row"]), int(cfg["exit_row"]))["solved"], "pipe_maze: gia' risolto all'inizio")
	# Soluzione progettata a mano: (0,1)(1,1) orizzontali, curve in (2,1) e (2,2), poi (3,2)(4,2) orizzontali.
	var sol := [[0, 1, 1], [1, 1, 1], [2, 1, 2], [2, 2, 0], [3, 2, 1], [4, 2, 1]]
	for s in sol:
		rots[int(s[1])][int(s[0])] = int(s[2])
	check(PipeMaze.flood(kinds, rots, int(cfg["entry_row"]), int(cfg["exit_row"]))["solved"], "pipe_maze: la soluzione non risolve il puzzle")

	var tower := LevelData.load_scene("clock_room")
	var rcfg: Dictionary = tower["minigames"]["rings"]["config"]
	var start := GearRings.scrambled(rcfg["couple"], rcfg["scramble"])
	check(not GearRings.is_solved(start), "gear_rings: gia' risolto all'inizio")
	var state: Array = start
	var moves: Array = rcfg["scramble"]
	for i in range(moves.size() - 1, -1, -1):
		state = GearRings.apply_move(state, rcfg["couple"], int(moves[i][0]), -int(moves[i][1]))
	check(GearRings.is_solved(state), "gear_rings: le mosse inverse non risolvono")

	var dump := LevelData.load_scene("dump")
	var seq: Array = dump["minigames"]["gate_levers"]["config"]["sequence"]
	var nl: int = int(dump["minigames"]["gate_levers"]["config"]["levers"])
	check(seq.size() >= 3, "lever_sequence: sequenza troppo corta")
	for v in seq:
		check(int(v) < nl, "lever_sequence: leva fuori range")
	# Round-trip del serializzatore JSON "carino".
	var again: Variant = JSON.parse_string(LevelData.pretty(dump))
	check(again is Dictionary and again.hash() == dump.hash(), "LevelData.pretty: round-trip diverso")


# ------------------------------------------------------------------ 3) partita completa

func _start_level(scene_id: String, spawn: String = "start") -> Level:
	GameState.current_scene = scene_id
	GameState.current_spawn = spawn
	var level: Level = load("res://scenes/level.tscn").instantiate()
	get_tree().root.add_child(level)
	await level.setup_done
	return level


func _use(level: Level, obj: String, item: String = "") -> void:
	await level.interact_by_id(obj, item)


func _pose(p: String) -> void:
	GameState.pose = p  # il test non anima l'oca, imposta direttamente la posa


func _playthrough() -> void:
	GameState.new_game()
	# ---------------------------------------------------------- discarica
	var lv := await _start_level("dump")
	check(lv.player != null and lv.interactables.size() > 5, "dump: scena non costruita")
	# Navigazione: il percorso deve aggirare il buco al centro.
	var path := lv.nav_path(Vector2(800, 680), Vector2(1100, 680))
	var hole := DataUtil.poly(lv.data["nav"]["holes"][0])
	var shrunk: Array = Geometry2D.offset_polygon(hole, -2.0)
	var crosses := false
	var plen := 0.0
	for i in range(path.size() - 1):
		plen += path[i].distance_to(path[i + 1])
		for k in 21:
			var pt := path[i].lerp(path[i + 1], float(k) / 20.0)
			for sp in shrunk:
				if Geometry2D.is_point_in_polygon(pt, sp):
					crosses = true
	check(path.size() >= 3 and not crosses and plen > 300.0, "dump: il percorso attraversa l'ostacolo (punti=%d, lunghezza=%.0f)" % [path.size(), plen])
	await lv.get_tree().process_frame
	# Posa sbagliata: l'oggetto non si raccoglie.
	_pose("normal")
	await _use(lv, "oilcan")
	check(not GameState.has_item("oilcan"), "dump: oilcan raccolto senza collo allungato")
	_pose("crouch")
	await _use(lv, "cog")
	check(GameState.has_item("cog"), "dump: cog non raccolto")
	_pose("neck")
	await _use(lv, "oilcan")
	check(GameState.has_item("oilcan"), "dump: oilcan non raccolto")
	_pose("normal")
	await _use(lv, "rag")
	await _use(lv, "rod")
	await _use(lv, "nonna", "rag")
	check(GameState.has_item("knob") and GameState.has_flag("nonna_warm"), "dump: nonna non ha dato il pomello")
	check(GameState.try_combine("rod", "knob") == "crank", "dump: rod+knob != crank")
	await _use(lv, "winch", "cog")
	await _use(lv, "winch", "oilcan")
	await _use(lv, "winch", "crank")
	check(GameState.has_flag("winch_crank"), "dump: manovella non montata")
	await _use(lv, "winch")
	check(GameState.has_flag("gate_open"), "dump: cancello non aperto")
	await _use(lv, "gate_open")
	check(SceneManager.last_goto.get("scene", "") == "canal", "dump: il cancello non porta al canale")
	check(GameState.has_item("oilcan"), "dump: l'oliatore deve restare in inventario per la torre")
	lv.queue_free()
	await get_tree().process_frame
	# ---------------------------------------------------------- canale
	lv = await _start_level("canal", "from_dump")
	_pose("crouch")
	await _use(lv, "worm")
	_pose("normal")
	await _use(lv, "berta", "worm")
	check(GameState.has_item("fish"), "canal: Berta non ha dato il pesce")
	await _use(lv, "valve_box")
	check(not GameState.has_flag("lock_open"), "canal: valvola usabile con Otto addormentato")
	await _use(lv, "otto", "fish")
	check(GameState.has_flag("otto_gone"), "canal: Otto non e' andato via")
	_pose("neck")
	await _use(lv, "rope")
	_pose("normal")
	await _use(lv, "valve_box")
	check(GameState.has_flag("lock_open"), "canal: chiusa non aperta")
	await _use(lv, "boat", "rope")
	check(GameState.has_flag("boat_tied"), "canal: barca non legata")
	await _use(lv, "boat")
	check(SceneManager.last_goto.get("scene", "") == "tower", "canal: la barca non porta alla torre")
	lv.queue_free()
	await get_tree().process_frame
	# ---------------------------------------------------------- torre
	lv = await _start_level("tower", "from_canal")
	_pose("neck")
	await _use(lv, "book")
	_pose("normal")
	await _use(lv, "pagina", "book")
	check(GameState.has_item("key"), "tower: la bibliotecaria non ha dato la chiave")
	await _use(lv, "vite", "oilcan")
	check(GameState.has_item("big_gear"), "tower: la meccanica non ha dato l'ingranaggio")
	await _use(lv, "door", "key")
	check(GameState.has_flag("door_open"), "tower: porta non aperta")
	await _use(lv, "door_open")
	check(SceneManager.last_goto.get("scene", "") == "clock_room", "tower: la porta non porta alla sala")
	lv.queue_free()
	await get_tree().process_frame
	# ---------------------------------------------------------- sala dell'orologio
	lv = await _start_level("clock_room", "from_tower")
	await _use(lv, "gear_slot", "big_gear")
	check(GameState.has_flag("gear_in"), "clock_room: ingranaggio non montato")
	_pose("normal")
	await _use(lv, "brake_lever")
	check(not GameState.has_flag("brake_off"), "clock_room: leva usabile senza collo")
	_pose("neck")
	await _use(lv, "brake_lever")
	check(GameState.has_flag("brake_off"), "clock_room: freno non rilasciato")
	_pose("normal")
	await _use(lv, "clock_panel")
	check(GameState.has_flag("clock_fixed"), "clock_room: orologio non riparato")
	# Gli ultimi suggerimenti devono essere quelli di "fine".
	var hint_ok := false
	for h in lv.data["hints"]:
		if GameState.evaluate(h.get("if", {})):
			hint_ok = (h["icons"] == ["home"])
			break
	check(hint_ok, "clock_room: suggerimento finale errato")
	lv.queue_free()
	await get_tree().process_frame


# ------------------------------------------------------------------ 4) camminata reale e salvataggio

## Clic veri: l'oca cammina (tempo reale) fino all'oggetto e lo raccoglie.
func _test_real_walk() -> void:
	GameState.test_mode = false
	GameState.new_game()
	var lv := await _start_level("dump")
	var start: Vector2 = lv.player.global_position
	var rag := lv.find_object("rag")
	var click: Vector2 = DataUtil.centroid(rag.poly)
	lv._on_left_click(click)
	var waited := 0.0
	while not GameState.has_item("rag") and waited < 12.0:
		await get_tree().process_frame
		waited += get_process_delta_time()
	check(GameState.has_item("rag"), "camminata reale: l'oca non ha raccolto lo straccio entro 12 s")
	check(lv.player.global_position.distance_to(start) > 50.0, "camminata reale: l'oca non si e' mossa")
	check(lv.player.global_position.distance_to(rag.walk_to) < 8.0, "camminata reale: l'oca non e' arrivata al punto previsto")
	# Clic sul terreno: si sposta senza interagire.
	lv.busy = false
	var target := Vector2(1200, 880)
	lv._on_left_click(target)
	waited = 0.0
	while lv.player.global_position.distance_to(target) > 6.0 and waited < 12.0:
		await get_tree().process_frame
		waited += get_process_delta_time()
	check(lv.player.global_position.distance_to(target) <= 6.0, "camminata reale: clic sul terreno non raggiunto")
	lv.queue_free()
	await get_tree().process_frame
	GameState.test_mode = true


## Salvataggio automatico e caricamento (ripristina l'eventuale salvataggio esistente).
func _test_save_load() -> void:
	var backup := ""
	if FileAccess.file_exists(GameState.SAVE_PATH):
		backup = FileAccess.get_file_as_string(GameState.SAVE_PATH)
	GameState.test_mode = false
	GameState.new_game()
	GameState.current_scene = "canal"
	GameState.set_flag("otto_gone")
	GameState.add_item("rope")
	GameState.save_game()
	check(GameState.has_save(), "salvataggio: file non creato")
	GameState.flags.clear()
	GameState.inventory.clear()
	GameState.current_scene = "dump"
	check(GameState.load_game(), "salvataggio: caricamento fallito")
	check(GameState.has_flag("otto_gone") and GameState.has_item("rope") and GameState.current_scene == "canal", "salvataggio: stato non ripristinato")
	GameState.test_mode = true
	if backup != "":
		var f := FileAccess.open(GameState.SAVE_PATH, FileAccess.WRITE)
		f.store_string(backup)
		f.close()
	else:
		DirAccess.remove_absolute(GameState.SAVE_PATH)


## Menu e schermata finale si istanziano senza errori.
func _test_ui_scenes() -> void:
	for path in [SceneManager.MENU_SCENE, SceneManager.ENDING_SCENE]:
		var inst: Node = load(path).instantiate()
		get_tree().root.add_child(inst)
		for i in 3:
			await get_tree().process_frame
		check(inst.is_inside_tree(), "scena UI non caricata: " + path)
		inst.queue_free()
		await get_tree().process_frame
