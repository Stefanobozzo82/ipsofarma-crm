extends CharacterBody3D
## Fio: movimenti portati dalla versione web (corsa, salti concatenati, salto lungo,
## salto all'indietro, salto dal muro, schianto, pugno e tuffo).

signal pounded(pos: Vector3)
signal punched(pos: Vector3, facing: float)
signal died

const H := 1.6
const R := 0.45
const STEP := 0.45
const RUN := 9.5
const JUMPS := [13.0, 15.5, 19.0]

var cam_yaw := 0.0          # impostato dalla telecamera
var facing := 0.0
var hp := 8
var inv := 0.0
var on_ground := false
var coyote := 0.0
var jump_buf := 0.0
var chain := 0
var land_t := -9.0
var air_t := 0.0
var wall_t := -9.0
var wall_n := Vector3.ZERO
var lock_t := 0.0
var punch_t := 0.0
var kick_t := 0.0
var belly_t := 0.0
var long_jump := false
var backflip := false
var pound := false
var pound_hang := 0.0
var dive := false
var squash := 0.0
var time := 0.0
var frozen := false        # durante i cambi di livello

var model: Node3D
var parts := {}
var _walk := 0.0


func _ready() -> void:
	var shape := CapsuleShape3D.new()
	shape.radius = R
	shape.height = H
	var col := CollisionShape3D.new()
	col.shape = shape
	col.position.y = H * 0.5
	add_child(col)
	floor_max_angle = deg_to_rad(52)
	floor_snap_length = 0.6
	safe_margin = 0.02
	model = (load("res://assets/models/fio.glb") as PackedScene).instantiate()
	add_child(model)
	Game.fix_visuals(model)
	for n in ["body", "head", "torso", "footL", "footR", "handL", "handR", "tail", "kite"]:
		var node := model.find_child(n, true, false)
		if node:
			parts[n] = node
	if parts.has("kite"):
		parts["kite"].visible = false
	for n in ["footL", "footR", "handL", "handR"]:
		if parts.has(n):
			parts[n].set_meta("rest", parts[n].position)


func place(pos: Vector3, yaw: float) -> void:
	global_position = pos
	velocity = Vector3.ZERO
	facing = yaw
	long_jump = false; backflip = false; pound = false; dive = false; chain = 0


func hurt(from: Vector3, dmg := 2) -> void:
	if inv > 0.0:
		return
	hp = max(0, hp - dmg)
	inv = 1.6
	var away := global_position - from
	away.y = 0
	away = away.normalized() if away.length() > 0.01 else Vector3.BACK
	velocity = away * 8.0 + Vector3.UP * 9.0
	lock_t = 0.4
	pound = false; long_jump = false; dive = false
	if hp <= 0:
		died.emit()


func bounce(vy := 13.0) -> void:
	velocity.y = vy
	pound = false; dive = false
	on_ground = false


func _approach(tx: float, tz: float, step: float) -> void:
	var dx := tx - velocity.x
	var dz := tz - velocity.z
	var d := sqrt(dx * dx + dz * dz)
	if d <= step or d < 1e-5:
		velocity.x = tx; velocity.z = tz
	else:
		velocity.x += dx / d * step; velocity.z += dz / d * step


func _physics_process(dt: float) -> void:
	time += dt
	if frozen:
		return
	var ix := Input.get_axis("move_left", "move_right")
	var iy := Input.get_axis("move_back", "move_forward")
	var il := sqrt(ix * ix + iy * iy)
	if il > 1.0:
		ix /= il; iy /= il; il = 1.0
	var sy := sin(cam_yaw)
	var cy := cos(cam_yaw)
	var wx := -sy * iy + cy * ix
	var wz := -cy * iy - sy * ix
	var crouch_key := Input.is_action_pressed("crouch")
	var crouch := on_ground and crouch_key and not pound
	if Input.is_action_just_pressed("jump"):
		jump_buf = 0.15
	if Input.is_action_just_pressed("crouch") and not on_ground and not pound:
		pound = true; pound_hang = 0.22; long_jump = false; backflip = false; dive = false
	var hs0 := Vector2(velocity.x, velocity.z).length()
	if Input.is_action_just_pressed("punch") and not pound and not dive:
		if (on_ground and hs0 > 8.5 and not crouch) or (not on_ground and hs0 > 6.0):
			dive = true
			velocity.x = sin(facing) * 15.0; velocity.z = cos(facing) * 15.0
			velocity.y = 6.0 if on_ground else max(velocity.y, 3.0)
			on_ground = false; long_jump = false; backflip = false; chain = 0; punch_t = 0.3
		elif not on_ground and kick_t <= 0.0:
			kick_t = 0.3; punch_t = 0.3
			if velocity.y < 4.0:
				velocity.y = 4.0
			punched.emit(global_position, facing)
		elif on_ground and punch_t <= 0.0 and not crouch:
			punch_t = 0.32
			velocity.x += sin(facing) * 3.0; velocity.z += cos(facing) * 3.0
			punched.emit(global_position, facing)
	punch_t -= dt; lock_t -= dt; kick_t -= dt; inv -= dt

	if pound:
		velocity.x = 0; velocity.z = 0
		if pound_hang > 0.0:
			pound_hang -= dt; velocity.y = 0
		else:
			velocity.y = -34.0
	else:
		var max_s := RUN
		var acc := 55.0 if on_ground else (22.0 if il > 0.1 else 4.0)
		if crouch:
			max_s = 2.5
		if long_jump:
			max_s = 17.0; acc = 5.0 if il > 0.1 else 1.5
		if dive:
			max_s = 15.0; acc = 3.0 if il > 0.1 else 1.0
		if punch_t > 0.0 and on_ground:
			acc = 18.0
		if belly_t > 0.0 and on_ground:
			belly_t -= dt
			_approach(0, 0, 10.0 * dt)
			if jump_buf > 0.0:
				velocity.y = 10.5; belly_t = 0; on_ground = false; jump_buf = 0; coyote = 0; air_t = 0
		elif lock_t <= 0.0:
			_approach(wx * max_s, wz * max_s, acc * dt)
		if il > 0.1 and lock_t <= 0.0 and not long_jump and punch_t <= 0.0 and not dive and belly_t <= 0.0:
			facing = lerp_angle(facing, atan2(wx, wz), 1.0 - exp(-14.0 * dt))
		coyote = 0.1 if on_ground else coyote - dt
		if jump_buf > 0.0:
			if coyote > 0.0:
				var hs := Vector2(velocity.x, velocity.z).length()
				var fx := sin(facing)
				var fz := cos(facing)
				if crouch_key and hs > 4.0:
					velocity = Vector3(fx * 17.0, 10.0, fz * 17.0); long_jump = true; chain = 0
				elif crouch_key:
					velocity = Vector3(-fx * 4.0, 21.0, -fz * 4.0); backflip = true; lock_t = 0.45; chain = 0
				else:
					if time - land_t < 0.22 and hs > 5.0 and chain < 2:
						chain += 1
					else:
						chain = 0
					velocity.y = JUMPS[chain]
				on_ground = false; coyote = 0; jump_buf = 0; air_t = 0
			elif time - wall_t < 0.2 and air_t > 0.08:
				velocity = Vector3(wall_n.x * 9.0, 15.5, wall_n.z * 9.0)
				facing = atan2(wall_n.x, wall_n.z); lock_t = 0.22; chain = 0
				long_jump = false; backflip = false; wall_t = -9; jump_buf = 0; air_t = 0
		var g := 26.0 if long_jump else 34.0
		if not Input.is_action_pressed("jump") and velocity.y > 0 and not long_jump and not backflip:
			g *= 2.2
		velocity.y = max(velocity.y - g * dt, -40.0)
	jump_buf -= dt

	var was_ground := on_ground
	floor_snap_length = 0.6 if was_ground and velocity.y <= 0 else 0.0
	_step_up(dt)
	move_and_slide()
	on_ground = is_on_floor()
	if not on_ground:
		air_t += dt
		if is_on_wall():
			var n := get_wall_normal()
			n.y = 0
			if n.length() > 0.1:
				wall_t = time; wall_n = n.normalized()
				if long_jump or dive:
					velocity.x *= 0.2; velocity.z *= 0.2
	if on_ground and not was_ground:
		land_t = time; squash = 1.0; long_jump = false; backflip = false
		if dive:
			dive = false; belly_t = 0.5
		if pound:
			pound = false
			pounded.emit(global_position)
	_animate(dt, hs0)


## salire gli scalini bassi (fino a STEP) come nella versione web
func _step_up(dt: float) -> void:
	if not on_ground:
		return
	var motion := Vector3(velocity.x, 0, velocity.z) * dt
	if motion.length() < 1e-4:
		return
	if not test_move(global_transform, motion):
		return
	var up := global_transform.translated(Vector3.UP * STEP)
	if test_move(global_transform, Vector3.UP * STEP) or test_move(up, motion):
		return
	global_position += Vector3.UP * STEP


func _animate(dt: float, hs: float) -> void:
	if not model:
		return
	model.rotation.y = lerp_angle(model.rotation.y, facing, 1.0 - exp(-20.0 * dt))
	squash = max(0.0, squash - dt * 5.0)
	var body: Node3D = parts.get("body")
	if body:
		var s := 1.0 - squash * 0.18
		body.scale = Vector3(2.0 - s, s, 2.0 - s)
		body.rotation.x = 0.0
		if long_jump or dive:
			body.rotation.x = 1.1
		elif backflip:
			body.rotation.x = -fmod(time * 9.0, TAU)
		elif pound and pound_hang > 0.0:
			body.rotation.x = -TAU * (1.0 - pound_hang / 0.22)
	if on_ground and hs > 0.5:
		_walk += dt * (6.0 + hs * 1.1)
	var amp := 0.25 if on_ground and hs > 0.5 else 0.0
	for n in ["footL", "footR", "handL", "handR"]:
		if not parts.has(n):
			continue
		var p: Node3D = parts[n]
		var rest: Vector3 = p.get_meta("rest")
		var sgn := 1.0 if n.ends_with("L") else -1.0
		if n.begins_with("hand"):
			sgn = -sgn
		p.position = rest + Vector3(0, max(0.0, sin(_walk) * sgn) * amp * 0.5 if n.begins_with("foot") else 0.0, sin(_walk) * sgn * amp)
	if parts.has("tail"):
		parts["tail"].rotation.y = sin(time * 3.0) * 0.25
	model.visible = inv <= 0.0 or int(inv * 14.0) % 2 == 0
