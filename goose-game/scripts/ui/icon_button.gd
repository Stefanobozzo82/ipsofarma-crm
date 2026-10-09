class_name IconButton
extends Control
## Pulsante rotondo/quadrato con un'icona procedurale (pose, lampadina, slot d'inventario).

signal pressed

var icon := ""
var square := false
var toggled := false      # evidenziato (posa attiva / oggetto selezionato)
var flash_time := 0.0     # >0: lampeggia (suggerimento sull'inventario)
var _hover := false


func _init(p_icon: String = "", p_square: bool = false, p_size: float = 96.0) -> void:
	icon = p_icon
	square = p_square
	custom_minimum_size = Vector2(p_size, p_size)
	size = custom_minimum_size
	mouse_filter = Control.MOUSE_FILTER_STOP
	mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND


func _ready() -> void:
	mouse_entered.connect(func() -> void: _hover = true; queue_redraw())
	mouse_exited.connect(func() -> void: _hover = false; queue_redraw())


func _process(delta: float) -> void:
	if flash_time > 0.0:
		flash_time = maxf(0.0, flash_time - delta)
		queue_redraw()


func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		pressed.emit()
		accept_event()


func _draw() -> void:
	var c := size * 0.5
	var r := minf(size.x, size.y) * 0.5
	var border: Color = IconPainter.BRASS if (toggled or _hover) else IconPainter.BRASS_D
	if flash_time > 0.0 and int(flash_time * 5.0) % 2 == 0:
		border = Color("fff0a0")
	var bg := Color("2b2118") if not toggled else Color("5a3f2a")
	if square:
		draw_rect(Rect2(Vector2(3, 3), size - Vector2(6, 6)), bg)
		draw_rect(Rect2(Vector2(3, 3), size - Vector2(6, 6)), border, false, 4.0 if toggled else 3.0)
	else:
		draw_circle(c, r - 3.0, bg)
		draw_arc(c, r - 3.0, 0.0, TAU, 40, border, 4.0 if toggled else 3.0, true)
	if icon != "":
		IconPainter.draw(self, icon, c, r * 1.25)
