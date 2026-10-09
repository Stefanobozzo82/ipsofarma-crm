class_name Minigame
extends Control
## Base dei minigiochi: pannello centrale con pulsante di chiusura e segnale `finished(success)`.
## Per crearne uno nuovo: estendi questa classe, implementa _start(), _draw_content() e
## _content_click(), crea la scena in scenes/minigames/<tipo>.tscn e richiamala dal JSON di scena:
##   "minigames": { "mio_id": { "type": "<tipo>", "config": { ... } } }

signal finished(success: bool)

const PANEL := Rect2(410, 150, 1100, 740)
const CLOSE_CENTER := Vector2(1480, 182)

var config: Dictionary = {}
var _done := false


func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP


## Chiamata da Level subito dopo l'istanza, con la configurazione presa dal JSON.
func start(cfg: Dictionary) -> void:
	config = cfg
	_start()
	queue_redraw()


func finish(success: bool) -> void:
	if _done:
		return
	_done = true
	finished.emit(success)


func _start() -> void:
	pass


func _draw_content() -> void:
	pass


func _content_click(_pos: Vector2, _button: int) -> void:
	pass


func _draw() -> void:
	draw_rect(Rect2(Vector2.ZERO, size), Color(0, 0, 0, 0.68))
	draw_rect(PANEL, Color("2a2018"))
	draw_rect(PANEL, IconPainter.BRASS_D, false, 8.0)
	draw_rect(PANEL.grow(-10.0), IconPainter.BRASS, false, 2.0)
	for c in [PANEL.position + Vector2(24, 24), PANEL.position + Vector2(PANEL.size.x - 24, 24),
			PANEL.position + Vector2(24, PANEL.size.y - 24), PANEL.end - Vector2(24, 24)]:
		draw_circle(c, 7, IconPainter.BRASS_D)
		draw_circle(c, 3, IconPainter.BRASS)
	# Pulsante di chiusura.
	draw_circle(CLOSE_CENTER, 26, Color("3a2a1e"))
	draw_arc(CLOSE_CENTER, 26, 0.0, TAU, 24, IconPainter.BRASS, 3.0)
	draw_line(CLOSE_CENTER + Vector2(-10, -10), CLOSE_CENTER + Vector2(10, 10), IconPainter.CREAM, 4.0)
	draw_line(CLOSE_CENTER + Vector2(10, -10), CLOSE_CENTER + Vector2(-10, 10), IconPainter.CREAM, 4.0)
	_draw_content()


func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.pressed:
		if event.position.distance_to(CLOSE_CENTER) < 30.0:
			finish(false)
		else:
			_content_click(event.position, event.button_index)
		accept_event()
