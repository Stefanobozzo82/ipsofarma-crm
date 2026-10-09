class_name DebugOverlay
extends Node2D
## Modalita' debug (F1): mostra hotspot, area di navigazione e punti di spawn sopra lo sfondo.
## - Trascina i pallini per spostare vertici, punti di arrivo (verde), spawn (viola) e PNG (giallo).
## - Il pallino bianco al centro di un hotspot sposta tutto l'oggetto.
## - Maiusc + clic vicino a un bordo: aggiunge un vertice.  Canc: rimuove il vertice sotto il mouse.
## - F2 oppure Ctrl+S: salva le coordinate in data/scenes/<scena>.json.  F1: esci.

const PICK_RADIUS := 22.0
const HUD_BAR_Y := 940.0

var level: Level
var active := false
var handles: Array[Dictionary] = []

var _drag := -1
var _hover := -1
var _last_mouse := Vector2.ZERO
var _message := ""
var _message_time := 0.0


func setup(p_level: Level) -> void:
	level = p_level
	visible = false


func toggle() -> void:
	active = not active
	visible = active
	_drag = -1
	if active:
		_ensure_walk_points()
		rebuild()
	level.on_debug_changed(active)
	queue_redraw()


func _process(delta: float) -> void:
	if _message_time > 0.0:
		_message_time -= delta
		queue_redraw()


# ------------------------------------------------------------------ maniglie

## Garantisce che ogni oggetto abbia un walk_to esplicito nei dati (cosi' si puo' trascinare).
func _ensure_walk_points() -> void:
	for raw in level.data.get("objects", []):
		var o: Dictionary = raw
		if not o.has("walk_to"):
			var it := level.find_object(str(o.get("id", "")))
			if it != null:
				o["walk_to"] = DataUtil.to_arr(it.walk_to)


func rebuild() -> void:
	handles.clear()
	var nav: Dictionary = level.data.get("nav", {})
	for arr in nav.get("polygons", []):
		_poly_handles(arr, "nav", Color(0.3, 0.9, 1.0), "")
	for arr in nav.get("holes", []):
		_poly_handles(arr, "hole", Color(1.0, 0.35, 0.3), "")
	var spawns: Dictionary = level.data.get("spawns", {})
	for k in spawns:
		handles.append({"kind": "spawn", "c": spawns, "k": k, "col": Color(0.9, 0.4, 1.0), "label": "spawn: " + str(k)})
	for raw in level.data.get("objects", []):
		var o: Dictionary = raw
		var oid: String = str(o.get("id", ""))
		if o.has("poly"):
			_poly_handles(o["poly"], "poly", Color(1.0, 0.7, 0.2), oid)
			handles.append({"kind": "move", "c": o, "k": "poly", "col": Color.WHITE, "label": ""})
		if o.has("pos"):
			handles.append({"kind": "pos", "c": o, "k": "pos", "col": Color(1.0, 0.95, 0.3), "label": oid})
		if o.has("walk_to"):
			handles.append({"kind": "walk", "c": o, "k": "walk_to", "col": Color(0.4, 1.0, 0.45), "label": ""})


func _poly_handles(arr: Array, kind: String, col: Color, label: String) -> void:
	for i in arr.size():
		handles.append({"kind": kind, "c": arr, "k": i, "col": col, "label": label if i == 0 else ""})


func _hpos(h: Dictionary) -> Vector2:
	if str(h["kind"]) == "move":
		var o: Dictionary = h["c"]
		return DataUtil.centroid(DataUtil.poly(o.get("poly", [])))
	var c: Variant = h["c"]
	return DataUtil.vec(c[h["k"]])


func _hset(h: Dictionary, p: Vector2, delta: Vector2) -> void:
	match str(h["kind"]):
		"move":
			var o: Dictionary = h["c"]
			for v in o["poly"]:
				v[0] = int(round(float(v[0]) + delta.x))
				v[1] = int(round(float(v[1]) + delta.y))
			if o.has("walk_to"):
				o["walk_to"] = DataUtil.to_arr(DataUtil.vec(o["walk_to"]) + delta)
		"pos":
			var o2: Dictionary = h["c"]
			o2["pos"] = DataUtil.to_arr(p)
			if o2.has("walk_to"):
				o2["walk_to"] = DataUtil.to_arr(DataUtil.vec(o2["walk_to"]) + delta)
		_:
			var c: Variant = h["c"]
			c[h["k"]] = DataUtil.to_arr(p)


func _pick(p: Vector2) -> int:
	var best := -1
	var best_d := PICK_RADIUS
	for i in handles.size():
		var d := _hpos(handles[i]).distance_to(p)
		if d <= best_d:
			best_d = d
			best = i
	return best


# ------------------------------------------------------------------ modifica poligoni

func _all_polys() -> Array:
	var out: Array = []
	var nav: Dictionary = level.data.get("nav", {})
	out.append_array(nav.get("polygons", []))
	out.append_array(nav.get("holes", []))
	for raw in level.data.get("objects", []):
		if raw.has("poly"):
			out.append(raw["poly"])
	return out


func _insert_vertex(p: Vector2) -> void:
	var best_arr: Array = []
	var best_i := -1
	var best_d := 26.0
	var best_pt := Vector2.ZERO
	for arr in _all_polys():
		for i in arr.size():
			var a := DataUtil.vec(arr[i])
			var b := DataUtil.vec(arr[(i + 1) % arr.size()])
			var q := Geometry2D.get_closest_point_to_segment(p, a, b)
			if q.distance_to(p) < best_d:
				best_d = q.distance_to(p)
				best_arr = arr
				best_i = i
				best_pt = q
	if best_i >= 0:
		best_arr.insert(best_i + 1, DataUtil.to_arr(best_pt))
		rebuild()
		level.refresh_geometry(true)


func _remove_hovered() -> void:
	if _hover < 0:
		return
	var h := handles[_hover]
	if str(h["kind"]) in ["nav", "hole", "poly"]:
		var arr: Array = h["c"]
		if arr.size() > 3:
			arr.remove_at(int(h["k"]))
			_hover = -1
			rebuild()
			level.refresh_geometry(true)


func save() -> void:
	var path := LevelData.save_scene(level.scene_id, level.data)
	_message = ("Salvato: " + path) if path != "" else "ERRORE: impossibile salvare"
	_message_time = 4.0
	queue_redraw()


# ------------------------------------------------------------------ input

func _input(event: InputEvent) -> void:
	if not active:
		return
	if event is InputEventMouseMotion:
		var p := get_global_mouse_position()
		if _drag >= 0:
			_hset(handles[_drag], p, p - _last_mouse)
			_last_mouse = p
			level.refresh_geometry(false)
		else:
			_hover = _pick(p)
		queue_redraw()
	elif event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		var p2 := get_global_mouse_position()
		if event.pressed:
			var i := _pick(p2)
			if i >= 0:
				_drag = i
				_last_mouse = p2
				get_viewport().set_input_as_handled()
			elif event.shift_pressed:
				_insert_vertex(p2)
				get_viewport().set_input_as_handled()
		elif _drag >= 0:
			_drag = -1
			level.refresh_geometry(true)
			get_viewport().set_input_as_handled()
	elif event is InputEventKey and event.pressed and not event.echo:
		if event.keycode == KEY_F2 or (event.keycode == KEY_S and event.ctrl_pressed):
			save()
			get_viewport().set_input_as_handled()
		elif event.keycode == KEY_DELETE or event.keycode == KEY_BACKSPACE:
			_remove_hovered()


# ------------------------------------------------------------------ disegno

func _draw_poly(pts: PackedVector2Array, fill: Color, line: Color) -> void:
	if pts.size() < 3:
		return
	if fill.a > 0.0:
		draw_colored_polygon(pts, fill)
	var closed := pts.duplicate()
	closed.append(pts[0])
	draw_polyline(closed, line, 3.0, true)


func _draw() -> void:
	if not active or level == null:
		return
	var font: Font = ThemeDB.fallback_font
	var nav: Dictionary = level.data.get("nav", {})
	for arr in nav.get("polygons", []):
		_draw_poly(DataUtil.poly(arr), Color(0.2, 0.8, 1.0, 0.13), Color(0.3, 0.9, 1.0, 0.95))
	for arr in nav.get("holes", []):
		_draw_poly(DataUtil.poly(arr), Color(1.0, 0.2, 0.2, 0.22), Color(1.0, 0.35, 0.3, 0.95))
	for raw in level.data.get("objects", []):
		var o: Dictionary = raw
		if o.has("poly"):
			_draw_poly(DataUtil.poly(o["poly"]), Color(1.0, 0.7, 0.2, 0.18), Color(1.0, 0.7, 0.2, 0.95))
		if o.has("walk_to"):
			var from := DataUtil.vec(o["walk_to"])
			var target := DataUtil.centroid(DataUtil.poly(o["poly"])) if o.has("poly") else DataUtil.vec(o.get("pos", []))
			draw_dashed_line(from, target, Color(0.4, 1.0, 0.45, 0.6), 2.0, 8.0)
	for i in handles.size():
		var h := handles[i]
		var p := _hpos(h)
		var col: Color = h["col"]
		var r := 11.0 if i != _hover and i != _drag else 15.0
		match str(h["kind"]):
			"walk":
				draw_colored_polygon(PackedVector2Array([p + Vector2(0, -r), p + Vector2(r, 0), p + Vector2(0, r), p + Vector2(-r, 0)]), col)
			"pos", "spawn":
				draw_rect(Rect2(p - Vector2(r, r), Vector2(r, r) * 2.0), col)
			"move":
				draw_circle(p, r * 0.8, Color(1, 1, 1, 0.85))
			_:
				draw_circle(p, r, col)
		draw_arc(p, r + 1.0, 0.0, TAU, 20, Color(0, 0, 0, 0.8), 2.0)
		var label: String = str(h.get("label", ""))
		if label != "":
			draw_string_outline(font, p + Vector2(14, -14), label, HORIZONTAL_ALIGNMENT_LEFT, -1, 22, 5, Color.BLACK)
			draw_string(font, p + Vector2(14, -14), label, HORIZONTAL_ALIGNMENT_LEFT, -1, 22, col.lightened(0.4))
	# Barra informativa.
	draw_rect(Rect2(0, 0, 1920, 46), Color(0, 0, 0, 0.75))
	var help := "DEBUG [F1 esci]  trascina i pallini  |  Maiusc+clic su un bordo: aggiungi vertice  |  Canc: rimuovi  |  F2 / Ctrl+S: salva in data/scenes/%s.json" % level.scene_id
	draw_string(font, Vector2(14, 31), help, HORIZONTAL_ALIGNMENT_LEFT, -1, 22, Color(1, 0.95, 0.7))
	var m := get_global_mouse_position()
	draw_string(font, Vector2(1700, 31), "x:%d  y:%d" % [int(m.x), int(m.y)], HORIZONTAL_ALIGNMENT_LEFT, -1, 22, Color(0.7, 1, 0.8))
	if _message_time > 0.0:
		draw_rect(Rect2(0, 50, 1920, 40), Color(0.1, 0.3, 0.1, 0.85))
		draw_string(font, Vector2(14, 79), _message, HORIZONTAL_ALIGNMENT_LEFT, -1, 24, Color.WHITE)
