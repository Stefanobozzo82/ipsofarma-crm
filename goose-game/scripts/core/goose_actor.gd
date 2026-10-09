class_name GooseActor
extends Node2D
## Personaggio-oca in scena: aspetto (GooseVisual) + fumetto + camminata + scala in profondita'.
## E' usato sia dal protagonista (scenes/goose.tscn) sia dai PNG (dentro Npc).

var visual: GooseVisual
var bubble: ThoughtBubble
var speed := 420.0
var base_scale := 1.0
## Scala minima/massima e intervallo di y su cui si interpola (prospettiva finta).
var depth_scale := Vector2(0.78, 1.12)
var depth_y := Vector2(560.0, 930.0)
var walk_id := 0


func setup(palette: Dictionary, accessory: String, prefix: String, voice: int = 0) -> void:
	visual = GooseVisual.new()
	visual.setup(palette, accessory, prefix, voice)
	add_child(visual)
	bubble = ThoughtBubble.new()
	add_child(bubble)
	update_depth()


func _process(_delta: float) -> void:
	update_depth()


func update_depth() -> void:
	var t := clampf(inverse_lerp(depth_y.x, depth_y.y, global_position.y), 0.0, 1.0)
	var s := base_scale * lerpf(depth_scale.x, depth_scale.y, t)
	scale = Vector2(s, s)


## Cammina lungo i punti dati. Ritorna true se e' arrivata, false se interrotta da un nuovo ordine.
func walk_path(points: PackedVector2Array) -> bool:
	walk_id += 1
	var my_id := walk_id
	if GameState.test_mode:
		if points.size() > 0:
			global_position = points[points.size() - 1]
		return true
	visual.play_walk()
	for p in points:
		while global_position.distance_to(p) > 1.5:
			if my_id != walk_id or not is_inside_tree():
				return false
			var dir := p - global_position
			visual.face(dir.x)
			global_position = global_position.move_toward(p, speed * scale.x * get_process_delta_time())
			await get_tree().process_frame
	if my_id == walk_id:
		visual.play_idle()
	return true


func stop_walking() -> void:
	walk_id += 1
	if visual != null:
		visual.play_idle()


func set_pose(pose: String, instant: bool = false) -> void:
	visual.set_pose(pose, instant)


func honk() -> void:
	visual.honk()


## Mostra un fumetto di pensiero con le icone date e attende che finisca.
func say(icons: Array, duration: float = 2.4) -> void:
	bubble.position = Vector2(0, -visual.head_height() - 30.0)
	await bubble.pop(icons, duration)
