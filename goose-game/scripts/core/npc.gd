class_name Npc
extends Interactable
## Personaggio-oca non giocante. Dati JSON: pos (piedi), walk_to, facing (1/-1), scale,
## palette {body, wing, beak, accent...}, accessory (scarf, hat, goggles, apron, glasses, cap,
## bowler, bandana), voice (0..2, timbro del honk), pos_if (posizioni alternative in base ai flag).
## Sprite sostitutivi: assets/sprites/npc_<id>.png (vedi GooseVisual).

var actor: GooseActor
var _walk_offset := Vector2(-90, 8)
var _moving := false


func setup(p_data: Dictionary, p_level: Node) -> void:
	data = p_data
	level = p_level
	id = str(data.get("id", ""))
	actor = GooseActor.new()
	add_child(actor)
	actor.setup(data.get("palette", {}), str(data.get("accessory", "")), "npc_" + id, int(data.get("voice", 0)))
	actor.base_scale = float(data.get("scale", 1.0))
	actor.depth_scale = level.depth_scale
	actor.depth_y = level.depth_y
	actor.visual.face(float(data.get("facing", 1)))
	read_geometry()
	refresh()


func read_geometry() -> void:
	var base_pos := DataUtil.vec(data.get("pos", []))
	var base_walk := DataUtil.vec(data.get("walk_to", []), base_pos + Vector2(-90, 8))
	_walk_offset = base_walk - base_pos
	var pos := base_pos
	var walk := base_walk
	for alt in data.get("pos_if", []):
		if GameState.evaluate(alt.get("if", {})):
			pos = DataUtil.vec(alt.get("pos", []), pos)
			walk = DataUtil.vec(alt.get("walk_to", []), pos + _walk_offset)
			break
	if not _moving:
		position = pos
	walk_to = position + (walk - pos)
	_update_poly()


func refresh() -> void:
	super.refresh()
	if not _moving and actor != null:
		read_geometry()


func _update_poly() -> void:
	var s := actor.base_scale if actor != null else 1.0
	var w := 62.0 * s
	var h := 180.0 * s
	poly = PackedVector2Array([
		position + Vector2(-w, -h), position + Vector2(w, -h),
		position + Vector2(w, 10), position + Vector2(-w, 10),
	])


func top_center() -> Vector2:
	return position + Vector2(0, -(actor.visual.head_height() + 10.0) * actor.scale.x)


func face_toward(x: float) -> void:
	actor.visual.face(x - position.x)


## Cammina in linea retta fino a `target` (coordinate di scena).
func move_to(target: Vector2, speed: float = 260.0) -> void:
	_moving = true
	if GameState.test_mode:
		position = target
	else:
		actor.visual.play_walk()
		while position.distance_to(target) > 1.5:
			if not is_inside_tree():
				return
			actor.visual.face(target.x - position.x)
			position = position.move_toward(target, speed * get_process_delta_time())
			_update_poly()
			await get_tree().process_frame
		actor.visual.play_idle()
	_moving = false
	walk_to = position + _walk_offset
	_update_poly()


func _draw() -> void:
	if not enabled:
		return
	if hovered or hint_time > 0.0:
		# L'oca disegna se' stessa: qui solo l'evidenziazione (ellisse ai piedi).
		var pulse := 0.5 + 0.5 * sin(Time.get_ticks_msec() / 160.0)
		if hint_time > 0.0:
			draw_arc(Vector2.ZERO, 70.0 + pulse * 10.0, 0.0, TAU, 36, Color(1.0, 0.85, 0.3, 0.9), 5.0, true)
		if hovered:
			draw_arc(Vector2.ZERO, 62.0, 0.0, TAU, 36, Color(1.0, 0.93, 0.6, 0.95), 4.0, true)
