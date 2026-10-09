class_name ThoughtBubble
extends Node2D
## Fumetto di pensiero con icone animate: l'unico "dialogo" del gioco.
## Uso: `await bubble.pop(["cog", "arrow_right", "winch"])`.
## Le icone sono disegnate da IconPainter (o da assets/sprites/icon_<nome>.png).

signal finished

const ICON_SIZE := 78.0

var icons: Array = []
var _age := 0.0
var _duration := 2.4
var _active := false
var _pop := 0.0


func _ready() -> void:
	visible = false
	z_as_relative = false
	z_index = 500
	# Compensa il CanvasModulate scuro della scena: il fumetto deve restare leggibile.
	modulate = Color(1.7, 1.7, 1.7)


## Mostra il fumetto; ritorna quando e' sparito. Una nuova chiamata sostituisce la precedente.
func pop(icon_list: Array, duration: float = 2.4) -> void:
	if GameState.test_mode:
		return
	if _active:
		finished.emit()
	icons = icon_list
	_age = 0.0
	_duration = duration
	_active = true
	visible = true
	await finished


func _process(delta: float) -> void:
	if not _active:
		return
	_age += delta
	if _age >= _duration:
		_active = false
		visible = false
		finished.emit()
		return
	# Comparsa elastica, permanenza, scomparsa rapida.
	if _age < 0.28:
		var t := _age / 0.28
		_pop = 1.0 + 2.2 * pow(t - 1.0, 3.0) + 1.2 * pow(t - 1.0, 2.0)
		_pop = clampf(_pop, 0.0, 1.15)
	elif _age > _duration - 0.2:
		_pop = maxf(0.0, (_duration - _age) / 0.2)
	else:
		_pop = 1.0
	# Mantiene la dimensione costante anche se l'attore cambia scala con la profondita'.
	var parent_scale := 1.0
	if get_parent() is Node2D:
		parent_scale = maxf((get_parent() as Node2D).scale.x, 0.05)
	scale = Vector2.ONE * _pop / parent_scale
	queue_redraw()


func _draw() -> void:
	if not _active or icons.is_empty():
		return
	var n := icons.size()
	var w := float(n) * (ICON_SIZE + 10.0) + 50.0
	var h := 112.0
	var center := Vector2(0.0, -h * 0.5 - 40.0)
	var bob := sin(_age * 3.0) * 3.0
	center.y += bob
	# Coda di bollicine verso chi pensa.
	var tail := [Vector2(0, -6), Vector2(-4, -22), Vector2(-2, -42)]
	var radii := [5.0, 8.0, 12.0]
	for i in 3:
		draw_circle(tail[i] + Vector2(0, bob * 0.3), radii[i] + 2.0, IconPainter.INK)
		draw_circle(tail[i] + Vector2(0, bob * 0.3), radii[i], IconPainter.CREAM)
	# Nuvola: contorno scuro poi riempimento chiaro.
	for pass_i in 2:
		var grow := 3.0 if pass_i == 0 else 0.0
		var col: Color = IconPainter.INK if pass_i == 0 else IconPainter.CREAM
		draw_rect(Rect2(center + Vector2(-w * 0.5, -h * 0.5 + 12.0 - grow), Vector2(w, h - 24.0 + grow * 2.0)), col)
		var bumps := maxi(3, n * 2)
		for k in bumps:
			var x := -w * 0.5 + 6.0 + (w - 12.0) * float(k) / float(bumps - 1)
			var r := h * 0.30 + (6.0 if k % 2 == 0 else 0.0)
			draw_circle(center + Vector2(x, -h * 0.5 + 18.0), r + grow, col)
			draw_circle(center + Vector2(x, h * 0.5 - 18.0), r + grow, col)
		draw_circle(center + Vector2(-w * 0.5 + 10.0, 0), h * 0.4 + grow, col)
		draw_circle(center + Vector2(w * 0.5 - 10.0, 0), h * 0.4 + grow, col)
	# Icone, con rimbalzo sfalsato.
	for i in n:
		var x := -w * 0.5 + 25.0 + (ICON_SIZE + 10.0) * (float(i) + 0.5)
		var pulse := 1.0 + 0.07 * sin(_age * 5.0 + float(i) * 1.3)
		var off := Vector2(0, sin(_age * 4.0 + float(i) * 0.9) * 4.0)
		IconPainter.draw(self, str(icons[i]), center + Vector2(x, 0) + off, ICON_SIZE * pulse)
