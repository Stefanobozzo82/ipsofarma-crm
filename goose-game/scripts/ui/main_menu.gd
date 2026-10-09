extends Control
## Menu principale: Nuova partita / Continua / Opzioni (volumi) / Esci.

var _options: Control
var _goose: GooseActor
var _t := 0.0


func _ready() -> void:
	theme = UITheme.make()
	set_anchors_preset(Control.PRESET_FULL_RECT)
	AudioManager.set_mood("menu")
	AudioManager.set_ambience("wind")

	_goose = GooseActor.new()
	add_child(_goose)
	_goose.setup({}, "scarf", "goose", 0)
	_goose.depth_scale = Vector2(2.6, 2.6)
	_goose.position = Vector2(520, 900)

	var box := VBoxContainer.new()
	box.position = Vector2(1080, 250)
	box.custom_minimum_size = Vector2(620, 0)
	box.add_theme_constant_override("separation", 20)
	add_child(box)

	var title := Label.new()
	title.text = "Il Ritorno\ndell'Oca"
	title.add_theme_font_size_override("font_size", 96)
	title.add_theme_color_override("font_color", IconPainter.BRASS)
	title.add_theme_color_override("font_outline_color", Color("1b130e"))
	title.add_theme_constant_override("outline_size", 12)
	box.add_child(title)
	var spacer := Control.new()
	spacer.custom_minimum_size = Vector2(0, 30)
	box.add_child(spacer)

	var new_btn := _button(box, "Nuova partita")
	new_btn.pressed.connect(func() -> void:
		GameState.new_game()
		SceneManager.change_scene(GameState.current_scene, GameState.current_spawn))
	var cont_btn := _button(box, "Continua")
	cont_btn.disabled = not GameState.has_save()
	cont_btn.pressed.connect(func() -> void:
		if GameState.load_game():
			SceneManager.change_scene(GameState.current_scene, GameState.current_spawn))
	var opt_btn := _button(box, "Opzioni")
	opt_btn.pressed.connect(func() -> void: _options.visible = not _options.visible)
	var quit_btn := _button(box, "Esci")
	quit_btn.pressed.connect(func() -> void: get_tree().quit())

	_options = PanelContainer.new()
	_options.add_theme_stylebox_override("panel", UITheme._box(Color("1d1510"), Color("c9a14a"), 16))
	_options.add_child(SettingsPanel.new())
	_options.visible = false
	box.add_child(_options)


func _button(parent: Control, text: String) -> Button:
	var b := Button.new()
	b.text = text
	b.custom_minimum_size = Vector2(0, 74)
	parent.add_child(b)
	return b


func _process(delta: float) -> void:
	_t += delta
	queue_redraw()


func _draw() -> void:
	# Sfondo del menu: cielo ruggine, ingranaggi lenti, nebbia, pavimento di palude.
	draw_polygon(PackedVector2Array([Vector2(0, 0), Vector2(1920, 0), Vector2(1920, 1080), Vector2(0, 1080)]),
		PackedColorArray([Color("2c3732"), Color("2c3732"), Color("6b5a3e"), Color("6b5a3e")]))
	for i in 4:
		var c := Vector2(300.0 + float(i) * 480.0, 300.0 + float(i % 2) * 160.0)
		var r := 180.0 + float(i) * 25.0
		var pts := PackedVector2Array()
		var teeth := 14
		for k in teeth:
			var a0 := _t * (0.15 if i % 2 == 0 else -0.15) + TAU * float(k) / float(teeth)
			for kk in [[-0.3, 0.86], [-0.18, 1.0], [0.18, 1.0], [0.3, 0.86]]:
				var a := a0 + TAU / float(teeth) * float(kk[0])
				pts.append(c + Vector2(cos(a), sin(a)) * r * float(kk[1]))
		draw_colored_polygon(pts, Color(0.18, 0.2, 0.18, 0.7))
	draw_rect(Rect2(0, 860, 1920, 220), Color("2a2118"))
	draw_circle(Vector2(520, 905), 330, Color(1.0, 0.8, 0.45, 0.05))
