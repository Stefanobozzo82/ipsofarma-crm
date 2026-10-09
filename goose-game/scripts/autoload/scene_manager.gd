extends Node
## Cambio scena con dissolvenza + overlay globale (grana/vignettatura).
## Autoload "SceneManager".

signal level_ready

const LEVEL_SCENE := "res://scenes/level.tscn"
const MENU_SCENE := "res://scenes/main_menu.tscn"
const ENDING_SCENE := "res://scenes/ending.tscn"
const SHADER_PATH := "res://shaders/grain_vignette.gdshader"

var fade_rect: ColorRect
var last_goto: Dictionary = {}  # ultimo cambio scena richiesto (utile ai test)
var _busy := false


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	# Overlay grana/vignettatura: sopra tutto tranne la dissolvenza.
	var fx_layer := CanvasLayer.new()
	fx_layer.layer = 90
	add_child(fx_layer)
	var fx := ColorRect.new()
	fx.set_anchors_preset(Control.PRESET_FULL_RECT)
	fx.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var shader: Shader = load(SHADER_PATH)
	if shader != null:
		var mat := ShaderMaterial.new()
		mat.shader = shader
		fx.material = mat
	fx_layer.add_child(fx)
	# Dissolvenza.
	var fade_layer := CanvasLayer.new()
	fade_layer.layer = 100
	add_child(fade_layer)
	fade_rect = ColorRect.new()
	fade_rect.set_anchors_preset(Control.PRESET_FULL_RECT)
	fade_rect.color = Color(0.03, 0.02, 0.02, 0.0)
	fade_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	fade_layer.add_child(fade_rect)


## Dissolvenza dell'overlay nero verso `alpha` (1 = nero pieno).
func fade_to(alpha: float, duration: float = 0.6) -> void:
	if GameState.test_mode:
		return
	var tw := create_tween()
	tw.tween_property(fade_rect, "color:a", alpha, duration)
	await tw.finished


## Cambia scena di gioco (id come in data/scenes/<id>.json) con dissolvenza.
func change_scene(scene_id: String, spawn: String = "start") -> void:
	last_goto = {"scene": scene_id, "spawn": spawn}
	if GameState.test_mode:
		GameState.current_scene = scene_id
		GameState.current_spawn = spawn
		return
	if _busy:
		return
	_busy = true
	await fade_to(1.0, 0.6)
	GameState.current_scene = scene_id
	GameState.current_spawn = spawn
	GameState.save_game()
	Assets.clear_cache()
	get_tree().paused = false
	get_tree().change_scene_to_file(LEVEL_SCENE)
	await _wait_level_ready()
	await fade_to(0.0, 0.8)
	_busy = false


func go_to_menu() -> void:
	await _change_plain(MENU_SCENE)


func go_to_ending() -> void:
	await _change_plain(ENDING_SCENE)


func _change_plain(path: String) -> void:
	if GameState.test_mode or _busy:
		return
	_busy = true
	await fade_to(1.0, 0.8)
	get_tree().paused = false
	get_tree().change_scene_to_file(path)
	await get_tree().process_frame
	await get_tree().process_frame
	await fade_to(0.0, 0.8)
	_busy = false


func _wait_level_ready() -> void:
	var done := [false]
	level_ready.connect(func() -> void: done[0] = true, CONNECT_ONE_SHOT)
	var waited := 0.0
	while not done[0] and waited < 5.0:
		await get_tree().process_frame
		waited += get_process_delta_time()
