extends Node
## Strumento di sviluppo: salva uno screenshot di una scena.
##   godot --path goose-game res://tools/shot.tscn -- <scena|menu> <out.png> [secondi] [extra...]
## extra: flag:nome  item:id  pose:neck|crouch  hint  debug  select:item  minigame:id

func _ready() -> void:
	var args := OS.get_cmdline_user_args()
	var scene := args[0]
	var out := args[1]
	var delay := float(args[2]) if args.size() > 2 else 2.0
	var extras := args.slice(3)
	if scene == "menu":
		add_child(load(SceneManager.MENU_SCENE).instantiate())
	else:
		GameState.new_game()
		GameState.current_scene = scene
		GameState.current_spawn = "start"
		for e in extras:
			if e.begins_with("flag:"):
				GameState.set_flag(e.substr(5))
			elif e.begins_with("item:"):
				GameState.add_item(e.substr(5))
		add_child(load(SceneManager.LEVEL_SCENE).instantiate())
	await get_tree().create_timer(delay).timeout
	var level: Node = get_child(0)
	for e in extras:
		if e == "debug" and level is Level:
			level.debug.toggle()
		elif e == "hint" and level is Level:
			level.busy = false
			level.show_hint()
		elif e.begins_with("pose:") and level is Level:
			level.busy = false
			level.set_player_pose(e.substr(5))
		elif e.begins_with("select:"):
			GameState.select_item(e.substr(7))
		elif e.begins_with("minigame:") and level is Level:
			level.run_minigame(e.substr(9))
	await get_tree().create_timer(1.2).timeout
	var img := get_viewport().get_texture().get_image()
	img.save_png(out)
	print("saved ", out, " ", img.get_size())
	get_tree().quit()
