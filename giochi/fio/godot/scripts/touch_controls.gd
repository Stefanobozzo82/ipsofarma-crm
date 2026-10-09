extends CanvasLayer
## Comandi touch per telefono e tablet: joystick a sinistra, tasti Salta / Pesta / Pugno a destra,
## trascinare sul resto dello schermo gira la telecamera. Si mostrano solo con lo schermo touch.

var rig: Node3D            # la telecamera, per ruotarla col dito
var stick_id := -1
var stick_center := Vector2.ZERO
var cam_id := -1
var buttons := {}          # nome -> {rect, action, id}
var radius := 110.0
var _draw: Control


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	layer = 5
	visible = DisplayServer.is_touchscreen_available() or "--touch" in OS.get_cmdline_user_args()
	_draw = Control.new()
	_draw.set_anchors_preset(Control.PRESET_FULL_RECT)
	_draw.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_draw.draw.connect(_on_draw)
	add_child(_draw)
	get_viewport().size_changed.connect(_layout)
	_layout()


func _layout() -> void:
	var s := get_viewport().get_visible_rect().size
	var b := clampf(s.y * 0.15, 80.0, 140.0)
	radius = b * 0.95
	buttons = {
		"jump": {"rect": Rect2(s.x - b * 1.25, s.y - b * 1.55, b, b), "action": "jump", "id": -1, "label": "Salta", "color": Color(1, 0.81, 0.23)},
		"crouch": {"rect": Rect2(s.x - b * 2.45, s.y - b * 1.05, b * 0.85, b * 0.85), "action": "crouch", "id": -1, "label": "Pesta", "color": Color(1, 0.42, 0.35)},
		"punch": {"rect": Rect2(s.x - b * 2.2, s.y - b * 2.3, b * 0.85, b * 0.85), "action": "punch", "id": -1, "label": "Pugno", "color": Color(0.49, 0.78, 0.94)},
		"pause": {"rect": Rect2(s.x - b * 0.75, b * 1.0, b * 0.55, b * 0.55), "action": "pause", "id": -1, "label": "II", "color": Color(1, 1, 1, 0.8)},
	}
	_draw.queue_redraw()


func _input(event: InputEvent) -> void:
	if not visible:
		return
	var s := get_viewport().get_visible_rect().size
	if event is InputEventScreenTouch:
		if event.pressed:
			for k in buttons:
				var bt: Dictionary = buttons[k]
				if bt.rect.grow(12).has_point(event.position):
					bt.id = event.index
					Input.action_press(bt.action)
					_draw.queue_redraw()
					get_viewport().set_input_as_handled()
					return
			if event.position.x < s.x * 0.45 and stick_id < 0:
				stick_id = event.index
				stick_center = event.position
			elif cam_id < 0:
				cam_id = event.index
		else:
			for k in buttons:
				var bt: Dictionary = buttons[k]
				if bt.id == event.index:
					bt.id = -1
					Input.action_release(bt.action)
			if event.index == stick_id:
				stick_id = -1
				for a in ["move_left", "move_right", "move_forward", "move_back"]:
					Input.action_release(a)
			if event.index == cam_id:
				cam_id = -1
		_draw.queue_redraw()
		get_viewport().set_input_as_handled()
	elif event is InputEventScreenDrag:
		if event.index == stick_id:
			var v: Vector2 = (event.position - stick_center) / radius
			if v.length() > 1.0:
				stick_center = event.position - v.normalized() * radius
				v = v.normalized()
			_axis("move_left", "move_right", v.x)
			_axis("move_forward", "move_back", v.y)
			_draw.queue_redraw()
		elif event.index == cam_id and rig:
			rig.yaw -= event.relative.x * 0.008
			rig.pitch = clampf(rig.pitch + event.relative.y * 0.005, 0.05, 1.2)
			rig.manual_t = rig.time
		get_viewport().set_input_as_handled()


func _axis(neg: String, pos: String, v: float) -> void:
	if v < -0.15:
		Input.action_press(neg, minf(1.0, -v)); Input.action_release(pos)
	elif v > 0.15:
		Input.action_press(pos, minf(1.0, v)); Input.action_release(neg)
	else:
		Input.action_release(neg); Input.action_release(pos)


func _on_draw() -> void:
	var font := ThemeDB.fallback_font
	if stick_id >= 0:
		_draw.draw_circle(stick_center, radius, Color(1, 1, 1, 0.12))
		_draw.draw_arc(stick_center, radius, 0, TAU, 48, Color(1, 1, 1, 0.5), 3.0)
		var off := Vector2(Input.get_axis("move_left", "move_right"), Input.get_axis("move_forward", "move_back")) * radius
		_draw.draw_circle(stick_center + off, radius * 0.38, Color(1, 1, 1, 0.55))
	else:
		var s := get_viewport().get_visible_rect().size
		var c := Vector2(radius * 1.4, s.y - radius * 1.4)
		_draw.draw_arc(c, radius, 0, TAU, 48, Color(1, 1, 1, 0.3), 3.0)
		_draw.draw_circle(c, radius * 0.38, Color(1, 1, 1, 0.25))
	for k in buttons:
		var bt: Dictionary = buttons[k]
		var r: Rect2 = bt.rect
		var col: Color = bt.color
		col.a = 0.85 if bt.id >= 0 else 0.55
		_draw.draw_circle(r.get_center(), r.size.x * 0.5, col)
		var fs := int(r.size.x * 0.22)
		var tw := font.get_string_size(bt.label, HORIZONTAL_ALIGNMENT_CENTER, -1, fs).x
		_draw.draw_string(font, r.get_center() + Vector2(-tw * 0.5, fs * 0.35), bt.label, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color(0.09, 0.13, 0.24))
