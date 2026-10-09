extends Control
## Schermata finale: l'oca e' tornata a casa. Nessun testo narrativo, solo un fumetto di icone.

var _goose: GooseActor
var _t := 0.0
var _cycle := 0


func _ready() -> void:
	theme = UITheme.make()
	set_anchors_preset(Control.PRESET_FULL_RECT)
	AudioManager.set_mood("finale")
	AudioManager.set_ambience("wind")
	AudioManager.play_sfx("bell")
	_goose = GooseActor.new()
	add_child(_goose)
	_goose.setup({}, "scarf", "goose", 0)
	_goose.depth_scale = Vector2(2.2, 2.2)
	_goose.position = Vector2(960, 880)
	var label := Label.new()
	label.text = "FINE"
	label.add_theme_font_size_override("font_size", 120)
	label.add_theme_color_override("font_color", IconPainter.BRASS)
	label.set_anchors_preset(Control.PRESET_CENTER_TOP)
	label.position = Vector2(850, 80)
	add_child(label)
	var again := Button.new()
	again.text = "Torna al menu"
	again.position = Vector2(760, 960)
	again.custom_minimum_size = Vector2(400, 72)
	again.pressed.connect(func() -> void: SceneManager.go_to_menu())
	add_child(again)
	_loop_bubbles()


func _loop_bubbles() -> void:
	var sets := [["home", "heart"], ["sun", "clock"], ["goose", "heart", "goose"]]
	while is_inside_tree():
		await _goose.say(sets[_cycle % sets.size()], 3.0)
		if is_inside_tree():
			_goose.honk()
		_cycle += 1
		await get_tree().create_timer(0.6).timeout


func _process(delta: float) -> void:
	_t += delta
	queue_redraw()


func _draw() -> void:
	draw_polygon(PackedVector2Array([Vector2(0, 0), Vector2(1920, 0), Vector2(1920, 1080), Vector2(0, 1080)]),
		PackedColorArray([Color("1d2a2a"), Color("1d2a2a"), Color("8a6a3c"), Color("8a6a3c")]))
	draw_circle(Vector2(960, 700), 300.0 + sin(_t) * 10.0, Color(1.0, 0.85, 0.5, 0.12))
	draw_rect(Rect2(0, 880, 1920, 200), Color("2a2118"))
