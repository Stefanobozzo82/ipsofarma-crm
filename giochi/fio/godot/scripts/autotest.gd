extends Node
## Test automatico (QA): avvia con  godot --path . -- --autotest
## Muove Fio, salta, entra nella Sala delle Mappe e nel Vulcano, salva screenshot in user://autotest/.

var main: Node
var log := []


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path("user://autotest"))
	_run()


func _wait(sec: float) -> void:
	await get_tree().create_timer(sec).timeout


func _shot(name: String) -> void:
	await RenderingServer.frame_post_draw
	var img := get_viewport().get_texture().get_image()
	img.save_png("user://autotest/%s.png" % name)


func _note(s: String) -> void:
	var p: CharacterBody3D = main.player
	var line := "%s | livello=%s pos=%s a_terra=%s hp=%d monete=%d scintille=%d" % [s, main.level_id, str(p.global_position.snapped(Vector3.ONE * 0.01)), str(p.on_ground), p.hp, Game.coins, Game.star_count()]
	log.append(line)
	print("AUTOTEST ", line)


func _run() -> void:
	await _wait(2.0)
	main = get_tree().current_scene
	_note("partenza isola")
	await _shot("01_isola")
	# corsa in avanti
	Input.action_press("move_forward")
	await _wait(1.2)
	_note("dopo corsa")
	Input.action_press("jump"); await _wait(0.1); Input.action_release("jump")
	await _wait(0.25)
	_note("in salto")
	await _shot("02_salto")
	Input.action_release("move_forward")
	await _wait(1.0)
	_note("atterrato")
	# raccolta di una moneta: teletrasporto sopra la prima
	if main.coins.size() > 0:
		var c: Node3D = main.coins[0].node
		main.player.global_position = c.global_position - Vector3.UP * 0.8
		await _wait(0.3)
		_note("moneta")
	# porta del Faro -> Sala delle Mappe
	main.change_level("castle", "door")
	await _wait(3.0)
	_note("sala delle mappe")
	await _shot("03_sala")
	# mappa del Vulcano: senza Scintille e' sigillata
	for m in main.maps:
		if m.id == "volcano":
			main.player.global_position = m.top + Vector3.UP * 1.5
			main.player.velocity = Vector3.ZERO
	await _wait(1.5)
	_note("mappa vulcano (sigillata)")
	# con 3 Scintille si apre
	Game.stars["test:a"] = true; Game.stars["test:b"] = true; Game.stars["test:c"] = true
	for m in main.maps:
		if m.id == "volcano":
			main.player.global_position = m.top + Vector3.UP * 1.5
			main.player.velocity = Vector3.ZERO
			m.cool = 0.0
	await _wait(3.5)
	_note("dopo mappa vulcano")
	await _shot("04_vulcano")
	Game.stars.erase("test:a"); Game.stars.erase("test:b"); Game.stars.erase("test:c")
	Game.save_game()
	var f := FileAccess.open("user://autotest/log.txt", FileAccess.WRITE)
	f.store_string("\n".join(log))
	print("AUTOTEST fine")
	get_tree().quit()
