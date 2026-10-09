class_name Hud
extends Control
## Interfaccia di gioco: barra inferiore con pose, inventario, lampadina dei suggerimenti,
## menu di pausa e oggetto "in mano" che segue il mouse.

const BAR_Y := 940.0
const SLOT := 104.0
const SLOT_X0 := 410.0
const MAX_SLOTS := 10

var level: Level
var pose_buttons: Dictionary = {}
var slots_root: Control
var held := Control.new()
var pause_menu: Control
var _flash_inventory := 0.0


func _ready() -> void:
	theme = UITheme.make()
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	process_mode = Node.PROCESS_MODE_ALWAYS

	# Sfondo della barra: assorbe i clic cosi' non muovono l'oca.
	var bar := Control.new()
	bar.position = Vector2(0, BAR_Y)
	bar.size = Vector2(1920, 1080.0 - BAR_Y)
	bar.mouse_filter = Control.MOUSE_FILTER_STOP
	bar.draw.connect(func() -> void:
		bar.draw_rect(Rect2(Vector2.ZERO, bar.size), Color(0.11, 0.08, 0.06, 0.88))
		bar.draw_rect(Rect2(0, 0, 1920, 5), IconPainter.BRASS_D)
		bar.draw_rect(Rect2(0, 5, 1920, 2), IconPainter.BRASS)
		for x in range(40, 1920, 160):
			bar.draw_circle(Vector2(x, 14), 4, IconPainter.BRASS_D))
	add_child(bar)

	# Pulsanti di posa (tasti 1, 2, 3).
	var poses := [["normal", "stand"], ["neck", "neck"], ["crouch", "crouch"]]
	for i in poses.size():
		var pose: String = poses[i][0]
		var b := IconButton.new(poses[i][1], false, 96.0)
		b.position = Vector2(40.0 + float(i) * 112.0, BAR_Y + 22.0)
		b.pressed.connect(func() -> void: level.set_player_pose(pose))
		add_child(b)
		pose_buttons[pose] = b

	slots_root = Control.new()
	slots_root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(slots_root)

	var hint := IconButton.new("bulb", false, 96.0)
	hint.position = Vector2(1680, BAR_Y + 22.0)
	hint.pressed.connect(func() -> void: level.show_hint())
	add_child(hint)
	var menu := IconButton.new("menu", false, 96.0)
	menu.position = Vector2(1792, BAR_Y + 22.0)
	menu.pressed.connect(toggle_pause)
	add_child(menu)

	held.mouse_filter = Control.MOUSE_FILTER_IGNORE
	held.z_index = 50
	held.draw.connect(_draw_held)
	add_child(held)

	_build_pause_menu()
	GameState.inventory_changed.connect(_rebuild_slots)
	GameState.selected_item_changed.connect(func(_i: String) -> void: _rebuild_slots(); held.queue_redraw())
	GameState.pose_changed.connect(_update_pose_buttons)
	_rebuild_slots()
	_update_pose_buttons("normal")


func setup(p_level: Level) -> void:
	level = p_level


func _process(delta: float) -> void:
	held.visible = GameState.selected_item != ""
	if held.visible:
		held.position = get_local_mouse_position() + Vector2(34, 34)
		held.queue_redraw()
	if _flash_inventory > 0.0:
		_flash_inventory = maxf(0.0, _flash_inventory - delta)


func _unhandled_key_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo and event.keycode == KEY_ESCAPE:
		toggle_pause()
		get_viewport().set_input_as_handled()


func _notification(what: int) -> void:
	if what == NOTIFICATION_WM_GO_BACK_REQUEST:
		toggle_pause()


func _draw_held() -> void:
	IconPainter.draw(held, GameState.selected_item, Vector2.ZERO, 84.0)


func _update_pose_buttons(_pose: String) -> void:
	for p in pose_buttons:
		(pose_buttons[p] as IconButton).toggled = (p == GameState.pose)
		(pose_buttons[p] as IconButton).queue_redraw()


func flash_inventory() -> void:
	_flash_inventory = 3.0
	for s in slots_root.get_children():
		(s as IconButton).flash_time = 3.0


## Ricostruisce gli slot dell'inventario.
func _rebuild_slots() -> void:
	for c in slots_root.get_children():
		c.queue_free()
	for i in MAX_SLOTS:
		var item := GameState.inventory[i] if i < GameState.inventory.size() else ""
		var slot := IconButton.new(item, true, SLOT)
		slot.position = Vector2(SLOT_X0 + float(i) * (SLOT + 6.0), BAR_Y + 18.0)
		slot.toggled = (item != "" and item == GameState.selected_item)
		if item == "":
			slot.mouse_filter = Control.MOUSE_FILTER_IGNORE
		else:
			slot.pressed.connect(_on_slot_pressed.bind(item))
		slots_root.add_child(slot)


## Clic su uno slot: seleziona; se c'e' gia' un oggetto selezionato prova a combinarli.
func _on_slot_pressed(item: String) -> void:
	var sel := GameState.selected_item
	if sel == "" :
		GameState.select_item(item)
		AudioManager.play_sfx("click")
	elif sel == item:
		GameState.select_item("")
	else:
		var result := GameState.try_combine(sel, item)
		GameState.select_item("")
		if result != "":
			AudioManager.play_sfx("win")
			level.say("goose", [sel, "arrow_right", result], false, 1.8)
		else:
			AudioManager.play_sfx("buzz")
			level.say("goose", ["no"], false, 1.4)


# ------------------------------------------------------------------ pausa

func _build_pause_menu() -> void:
	pause_menu = Control.new()
	pause_menu.set_anchors_preset(Control.PRESET_FULL_RECT)
	pause_menu.visible = false
	pause_menu.process_mode = Node.PROCESS_MODE_ALWAYS
	var dim := ColorRect.new()
	dim.set_anchors_preset(Control.PRESET_FULL_RECT)
	dim.color = Color(0, 0, 0, 0.6)
	pause_menu.add_child(dim)
	var center := CenterContainer.new()
	center.set_anchors_preset(Control.PRESET_FULL_RECT)
	pause_menu.add_child(center)
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", UITheme._box(Color("1d1510"), Color("c9a14a"), 16))
	center.add_child(panel)
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 22)
	panel.add_child(v)
	var title := Label.new()
	title.text = "Pausa"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 52)
	v.add_child(title)
	v.add_child(SettingsPanel.new())
	var resume := Button.new()
	resume.text = "Riprendi"
	resume.pressed.connect(toggle_pause)
	v.add_child(resume)
	var quit := Button.new()
	quit.text = "Menu principale"
	quit.pressed.connect(func() -> void:
		GameState.save_game()
		SceneManager.go_to_menu())
	v.add_child(quit)
	add_child(pause_menu)


func toggle_pause() -> void:
	if level != null and level.busy and not pause_menu.visible:
		return
	pause_menu.visible = not pause_menu.visible
	get_tree().paused = pause_menu.visible
