class_name SceneBackdrop
extends Node2D
## Sfondo a tre piani con parallasse leggera:
##   bg  = assets/backgrounds/<scena>.png      (dietro a tutto, fermo: ci si allineano hotspot e navigazione)
##   mid = assets/backgrounds/<scena>_mid.png  (dietro ai personaggi)
##   fg  = assets/backgrounds/<scena>_fg.png   (davanti ai personaggi)
## Se un file manca, quel piano usa il segnaposto (PlaceholderArt).

const Z := {"bg": -100, "mid": -50, "fg": 100}
## Spostamento massimo in pixel dei piani col mouse (il bg resta fermo).
const STRENGTH := {"bg": 0.0, "mid": 10.0, "fg": 26.0}

var layers: Dictionary = {}
var enabled := true  # false in modalita' debug: tutto esattamente allineato
var _smooth := Vector2.ZERO


func build(scene_id: String, data: Dictionary) -> void:
	var ph: Dictionary = data.get("placeholder", {})
	for ln in ["bg", "mid", "fg"]:
		var suffix: String = "" if ln == "bg" else "_" + str(ln)
		var tex: Texture2D = Assets.background(scene_id, suffix)
		var layer := Node2D.new()
		layer.name = str(ln)
		layer.z_index = int(Z[ln])
		if tex != null:
			var sp := Sprite2D.new()
			sp.texture = tex
			sp.centered = false
			# Tollera immagini di risoluzione diversa riportandole a 1920x1080.
			sp.scale = Vector2(1920.0 / tex.get_width(), 1080.0 / tex.get_height())
			layer.add_child(sp)
		else:
			var art := PlaceholderArt.new()
			art.setup(ph, str(ln))
			layer.add_child(art)
		add_child(layer)
		layers[ln] = layer


func _process(delta: float) -> void:
	var target := Vector2.ZERO
	if enabled and bool(GameState.config.get("parallax", true)):
		target = get_global_mouse_position() / Vector2(1920.0, 1080.0) - Vector2(0.5, 0.5)
		target = target.clamp(Vector2(-0.5, -0.5), Vector2(0.5, 0.5))
	_smooth = _smooth.lerp(target, clampf(delta * 4.0, 0.0, 1.0))
	for ln in layers:
		var l: Node2D = layers[ln]
		l.position = -_smooth * float(STRENGTH[ln]) * 2.0
