class_name UITheme
extends RefCounted
## Tema grafico minimale (ottone / ruggine) per menu e pannelli, creato a codice.


static func _box(bg: Color, border: Color, radius: int = 10) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = bg
	s.border_color = border
	s.set_border_width_all(3)
	s.set_corner_radius_all(radius)
	s.content_margin_left = 24
	s.content_margin_right = 24
	s.content_margin_top = 10
	s.content_margin_bottom = 10
	return s


static func make() -> Theme:
	var t := Theme.new()
	t.set_stylebox("normal", "Button", _box(Color("3a2a1e"), Color("c9a14a")))
	t.set_stylebox("hover", "Button", _box(Color("5a3f2a"), Color("f0cf7a")))
	t.set_stylebox("pressed", "Button", _box(Color("261a12"), Color("c9a14a")))
	t.set_stylebox("focus", "Button", StyleBoxEmpty.new())
	t.set_color("font_color", "Button", Color("efe3c2"))
	t.set_color("font_hover_color", "Button", Color("ffffff"))
	t.set_font_size("font_size", "Button", 34)
	t.set_font_size("font_size", "Label", 32)
	t.set_color("font_color", "Label", Color("efe3c2"))
	var slider := StyleBoxFlat.new()
	slider.bg_color = Color("261a12")
	slider.set_corner_radius_all(6)
	slider.content_margin_top = 8
	slider.content_margin_bottom = 8
	t.set_stylebox("slider", "HSlider", slider)
	var fill := StyleBoxFlat.new()
	fill.bg_color = Color("c9a14a")
	fill.set_corner_radius_all(6)
	t.set_stylebox("grabber_area", "HSlider", fill)
	t.set_stylebox("grabber_area_highlight", "HSlider", fill)
	return t
