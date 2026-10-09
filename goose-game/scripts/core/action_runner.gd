class_name ActionRunner
extends RefCounted
## Esegue le liste di azioni definite nei JSON ("do": [...]). Per aggiungere un'azione nuova
## basta un nuovo ramo nel `match` di _exec().
##
## Azioni disponibili (chiave "a"):
##   bubble   {who, icons[], wait=true, time}  fumetto di pensiero ("goose" o id di un oggetto/PNG)
##   honk     {who}                            verso dell'oca
##   flag     {flag, value=true}               imposta/azzera un flag di progresso
##   give     {item}                           aggiunge un oggetto all'inventario
##   take     {item}                           toglie un oggetto dall'inventario
##   sfx      {name}                           effetto sonoro (click, clank, bell, gate...)
##   wait     {s}                              pausa
##   move     {who, to:[x,y]}                  un PNG cammina fino a un punto
##   look     {who}                            l'oca si gira verso un oggetto/PNG
##   shake    {amount, time}                   scossone della scena
##   minigame {id, win:[...], lose:[...]}      avvia un minigioco definito in "minigames" della scena
##   if       {when:{...}, then:[...], else:[...]}
##   goto     {scene, spawn}                   cambia scena (con dissolvenza)
##   ending   {}                               schermata finale

var level: Level


func _init(p_level: Level) -> void:
	level = p_level


func run(actions: Array) -> void:
	for raw in actions:
		if not is_instance_valid(level) or not level.is_inside_tree():
			return
		if raw is Dictionary:
			await _exec(raw)


func _exec(a: Dictionary) -> void:
	var kind: String = str(a.get("a", ""))
	match kind:
		"bubble":
			await level.say(str(a.get("who", "goose")), a.get("icons", []), bool(a.get("wait", true)), float(a.get("time", 2.4)))
		"honk":
			level.honk(str(a.get("who", "goose")))
			await level.wait(0.5)
		"flag":
			GameState.set_flag(str(a.get("flag", "")), bool(a.get("value", true)))
		"give":
			var item: String = str(a.get("item", ""))
			GameState.add_item(item)
			AudioManager.play_sfx("pickup")
			await level.say("goose", [item], true, 1.3)
		"take":
			GameState.remove_item(str(a.get("item", "")))
		"sfx":
			AudioManager.play_sfx(str(a.get("name", "click")))
		"wait":
			await level.wait(float(a.get("s", 0.5)))
		"move":
			await level.move_npc(str(a.get("who", "")), DataUtil.vec(a.get("to", [])))
		"look":
			level.look_at_object(str(a.get("who", "")))
		"shake":
			await level.shake(float(a.get("amount", 8.0)), float(a.get("time", 0.5)))
		"minigame":
			var won: bool = await level.run_minigame(str(a.get("id", "")))
			await run(a.get("win", []) if won else a.get("lose", []))
		"if":
			await run(a.get("then", []) if GameState.evaluate(a.get("when", {})) else a.get("else", []))
		"goto":
			SceneManager.change_scene(str(a.get("scene", "")), str(a.get("spawn", "start")))
			if not GameState.test_mode:
				await level.halt  # il Level sta per essere distrutto: non si riprende piu'
		"ending":
			SceneManager.go_to_ending()
			if not GameState.test_mode:
				await level.halt
		_:
			push_warning("Azione sconosciuta: '%s'" % kind)
