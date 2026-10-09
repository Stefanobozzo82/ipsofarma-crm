extends Node
## Riformatta tutti i JSON di data/scenes/ con lo stesso serializzatore del salvataggio F1:
##   godot --headless --path goose-game res://tools/format_data.tscn

func _ready() -> void:
	for sid in GameState.config.get("scenes", []):
		var d := LevelData.load_scene(str(sid))
		print("%s -> %s" % [sid, LevelData.save_scene(str(sid), d)])
	get_tree().quit()
