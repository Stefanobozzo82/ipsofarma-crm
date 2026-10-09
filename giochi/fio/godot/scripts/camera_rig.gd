extends Node3D
## Telecamera che segue Fio da dietro e si rimette alle sue spalle quando corre.
## Lo SpringArm3D la avvicina quando un muro o un albero si mettono in mezzo.

var target: Node3D
var yaw := 0.0
var pitch := 0.32
var dist := 9.0
var manual_t := -9.0
var time := 0.0
var arm: SpringArm3D
var camera: Camera3D


func _ready() -> void:
	arm = SpringArm3D.new()
	arm.spring_length = dist
	arm.margin = 0.3
	var sphere := SphereShape3D.new()
	sphere.radius = 0.3
	arm.shape = sphere
	add_child(arm)
	camera = Camera3D.new()
	camera.fov = 60
	camera.far = 900
	arm.add_child(camera)


func snap_behind(f: float) -> void:
	yaw = f + PI
	_place(1.0)


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseMotion and (event.button_mask & MOUSE_BUTTON_MASK_LEFT or event.button_mask & MOUSE_BUTTON_MASK_RIGHT):
		yaw -= event.relative.x * 0.006
		pitch = clamp(pitch + event.relative.y * 0.004, 0.05, 1.2)
		manual_t = time
	elif event is InputEventMouseButton and event.pressed:
		if event.button_index == MOUSE_BUTTON_WHEEL_UP:
			dist = clamp(dist - 0.8, 4.0, 16.0)
		elif event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			dist = clamp(dist + 0.8, 4.0, 16.0)


func _physics_process(dt: float) -> void:
	time += dt
	if not target:
		return
	var turn := Input.get_axis("cam_left", "cam_right")
	if abs(turn) > 0.05:
		yaw -= turn * 2.4 * dt
		manual_t = time
	if Input.is_action_just_pressed("cam_recenter"):
		manual_t = -9.0
		yaw = target.facing + PI
	var hv := Vector2(target.velocity.x, target.velocity.z)
	if time - manual_t > 1.2 and hv.length() > 1.5:
		# si rimette dolcemente alle spalle di Fio, piu' in fretta quando corre
		var behind := atan2(hv.x, hv.y) + PI
		var k := clampf(hv.length() / 9.5, 0.0, 1.0) * 1.6
		yaw = lerp_angle(yaw, behind, 1.0 - exp(-k * dt))
		pitch = lerp(pitch, 0.32, 1.0 - exp(-1.5 * dt))
	_place(1.0 - exp(-10.0 * dt))


func _place(k: float) -> void:
	var p: Vector3 = target.global_position + Vector3.UP * 1.4
	global_position = global_position.lerp(p, k) if k < 1.0 else p
	rotation = Vector3(-pitch, yaw, 0)
	arm.spring_length = dist
	target.cam_yaw = yaw
