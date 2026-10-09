class_name IconPainter
extends RefCounted
## Disegna proceduralmente le icone (fumetti di pensiero, oggetti d'inventario, pulsanti).
## Per sostituire un'icona basta mettere assets/sprites/icon_<nome>.png (o item_<nome>.png).
## Le coordinate delle icone sono in un riquadro virtuale di 100x100 centrato su (0,0).

const INK := Color("2b2118")
const BRASS := Color("d1a84b")
const BRASS_D := Color("8e6a2a")
const RUST := Color("b0572f")
const STEEL := Color("a3a8a2")
const WATER := Color("6fa3b0")
const MOSS := Color("7b9650")
const CREAM := Color("efe3c2")
const RED := Color("c4472f")
const PINK := Color("d99a8f")

static var _alpha := 1.0


## Disegna l'icona `icon` centrata in `c` con lato `s` pixel.
static func draw(ci: CanvasItem, icon: String, c: Vector2, s: float, tint: Color = Color.WHITE) -> void:
	var tex: Texture2D = Assets.sprite("icon_" + icon)
	if tex == null:
		tex = Assets.sprite("item_" + icon)
	if tex != null:
		ci.draw_texture_rect(tex, Rect2(c - Vector2(s, s) * 0.5, Vector2(s, s)), false, tint)
		return
	_alpha = tint.a
	_vector(ci, icon, c, s / 100.0)


# ------------------------------------------------------------------ helpers

static func _v(x: float, y: float) -> Vector2:
	return Vector2(x, y)


static func _col(col: Color) -> Color:
	return Color(col.r, col.g, col.b, col.a * _alpha)


static func _poly(ci: CanvasItem, c: Vector2, u: float, pts: Array, col: Color) -> void:
	var arr := PackedVector2Array()
	for p in pts:
		arr.append(c + (p as Vector2) * u)
	ci.draw_colored_polygon(arr, _col(col))


static func _line(ci: CanvasItem, c: Vector2, u: float, a: Vector2, b: Vector2, col: Color, w: float) -> void:
	ci.draw_line(c + a * u, c + b * u, _col(col), maxf(1.0, w * u), true)


static func _circ(ci: CanvasItem, c: Vector2, u: float, p: Vector2, r: float, col: Color) -> void:
	ci.draw_circle(c + p * u, r * u, _col(col))


static func _ring(ci: CanvasItem, c: Vector2, u: float, p: Vector2, r: float, col: Color, w: float, from: float = 0.0, to: float = TAU) -> void:
	ci.draw_arc(c + p * u, r * u, from, to, 28, _col(col), maxf(1.0, w * u), true)


static func _rect(ci: CanvasItem, c: Vector2, u: float, x: float, y: float, w: float, h: float, col: Color) -> void:
	ci.draw_rect(Rect2(c + _v(x, y) * u, _v(w, h) * u), _col(col))


static func _gear(ci: CanvasItem, c: Vector2, u: float, p: Vector2, r: float, teeth: int, col: Color, hole: float) -> void:
	var pts := PackedVector2Array()
	for i in teeth:
		var a0 := TAU * float(i) / float(teeth)
		var step := TAU / float(teeth)
		for k in [[-0.30, 0.78], [-0.18, 1.0], [0.18, 1.0], [0.30, 0.78]]:
			var a := a0 + step * float(k[0])
			pts.append(c + (p + _v(cos(a), sin(a)) * r * float(k[1])) * u)
	ci.draw_colored_polygon(pts, _col(col))
	ci.draw_circle(c + p * u, r * 0.78 * u, _col(col.darkened(0.12)))
	ci.draw_circle(c + p * u, hole * u, _col(INK))


static func _text(ci: CanvasItem, c: Vector2, u: float, txt: String, size: float, col: Color, off: Vector2 = Vector2.ZERO) -> void:
	var font: Font = ThemeDB.fallback_font
	var fs := int(size * u)
	var w := font.get_string_size(txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
	ci.draw_string(font, c + off * u + _v(-w * 0.5, size * u * 0.35), txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, _col(col))


# ------------------------------------------------------------------ icone

static func _vector(ci: CanvasItem, icon: String, c: Vector2, u: float) -> void:
	match icon:
		"cog":
			_gear(ci, c, u, Vector2.ZERO, 40.0, 8, STEEL, 12.0)
		"big_gear":
			_gear(ci, c, u, Vector2.ZERO, 46.0, 12, BRASS, 15.0)
		"oilcan":
			_poly(ci, c, u, [_v(-30, -4), _v(12, -4), _v(12, 38), _v(-30, 38)], STEEL)
			_poly(ci, c, u, [_v(12, 8), _v(46, -28), _v(50, -22), _v(16, 18)], STEEL)
			_line(ci, c, u, _v(-30, 8), _v(-42, -10), BRASS_D, 6)
			_line(ci, c, u, _v(-42, -10), _v(-20, -22), BRASS_D, 6)
			_circ(ci, c, u, _v(-9, 17), 9, RUST)
		"rag":
			_poly(ci, c, u, [_v(-38, -20), _v(-12, -28), _v(14, -20), _v(38, -28), _v(34, 10), _v(40, 34), _v(12, 28), _v(-14, 36), _v(-38, 28), _v(-32, 4)], Color("a8916a"))
			_line(ci, c, u, _v(-28, -6), _v(28, -8), Color("7b6a4a"), 5)
			_line(ci, c, u, _v(-28, 12), _v(28, 12), Color("7b6a4a"), 5)
		"rod":
			_line(ci, c, u, _v(-38, 38), _v(34, -34), STEEL, 10)
			_circ(ci, c, u, _v(36, -36), 7, BRASS_D)
		"knob":
			_line(ci, c, u, _v(0, 42), _v(0, 8), STEEL, 11)
			_circ(ci, c, u, _v(0, -10), 28, BRASS)
			_circ(ci, c, u, _v(-9, -19), 7, CREAM)
		"crank":
			_line(ci, c, u, _v(-34, 38), _v(-34, -12), STEEL, 10)
			_line(ci, c, u, _v(-34, -12), _v(24, -12), STEEL, 10)
			_circ(ci, c, u, _v(32, -12), 14, BRASS)
		"worm":
			for i in 7:
				_circ(ci, c, u, _v(-38.0 + float(i) * 12.5, sin(float(i) * 1.2) * 14.0), 10.0, PINK if i % 2 == 0 else PINK.darkened(0.12))
			_circ(ci, c, u, _v(36, -2), 2.5, INK)
		"fish":
			ci.draw_colored_polygon(_xf(DataUtil.ellipse(Vector2.ZERO, 34, 20, 20), c, u, _v(-4, 0)), _col(Color("8fb0b8")))
			_poly(ci, c, u, [_v(28, 0), _v(50, -18), _v(50, 18)], Color("6f93a0"))
			_circ(ci, c, u, _v(-20, -5), 4, INK)
			_line(ci, c, u, _v(-4, -18), _v(-4, 18), Color("6f93a0"), 3)
		"rope":
			_ring(ci, c, u, Vector2.ZERO, 34, Color("b79a62"), 8)
			_ring(ci, c, u, Vector2.ZERO, 21, Color("b79a62"), 8)
			_ring(ci, c, u, Vector2.ZERO, 9, Color("b79a62"), 8)
			_line(ci, c, u, _v(34, 0), _v(46, 30), Color("b79a62"), 7)
		"book":
			_rect(ci, c, u, -28, -38, 56, 76, RUST)
			_rect(ci, c, u, -22, -32, 46, 64, CREAM)
			_rect(ci, c, u, -28, -38, 10, 76, RUST.darkened(0.25))
			_line(ci, c, u, _v(-8, -16), _v(16, -16), INK, 4)
			_line(ci, c, u, _v(-8, 0), _v(16, 0), INK, 4)
		"key":
			_ring(ci, c, u, _v(-26, 0), 17, BRASS, 9)
			_line(ci, c, u, _v(-10, 0), _v(42, 0), BRASS, 9)
			_line(ci, c, u, _v(28, 0), _v(28, 16), BRASS, 8)
			_line(ci, c, u, _v(42, 0), _v(42, 16), BRASS, 8)
		"lever":
			_rect(ci, c, u, -32, 24, 64, 16, STEEL)
			_line(ci, c, u, _v(0, 26), _v(26, -26), BRASS_D, 9)
			_circ(ci, c, u, _v(28, -30), 13, RED)
		"pipe":
			_line(ci, c, u, _v(-40, 20), _v(0, 20), STEEL, 20)
			_line(ci, c, u, _v(0, 20), _v(0, -32), STEEL, 20)
			_rect(ci, c, u, -46, 8, 8, 24, BRASS_D)
			_rect(ci, c, u, -12, -38, 24, 8, BRASS_D)
		"valve":
			_ring(ci, c, u, Vector2.ZERO, 33, STEEL, 9)
			_line(ci, c, u, _v(-33, 0), _v(33, 0), STEEL, 8)
			_line(ci, c, u, _v(0, -33), _v(0, 33), STEEL, 8)
			_circ(ci, c, u, Vector2.ZERO, 9, BRASS)
		"boat":
			_poly(ci, c, u, [_v(-44, 8), _v(44, 8), _v(30, 34), _v(-30, 34)], RUST)
			_line(ci, c, u, _v(0, 8), _v(0, -38), INK, 5)
			_poly(ci, c, u, [_v(4, -36), _v(4, 2), _v(34, 2)], CREAM)
		"wave":
			for row in 2:
				var pts := PackedVector2Array()
				for i in 17:
					var x := -40.0 + float(i) * 5.0
					pts.append(c + _v(x, -12.0 + float(row) * 26.0 + sin(float(i) * 0.9) * 7.0) * u)
				ci.draw_polyline(pts, _col(WATER), 7.0 * u, true)
		"clock":
			_circ(ci, c, u, Vector2.ZERO, 40, INK)
			_circ(ci, c, u, Vector2.ZERO, 35, CREAM)
			_line(ci, c, u, Vector2.ZERO, _v(0, -26), INK, 6)
			_line(ci, c, u, Vector2.ZERO, _v(18, 8), INK, 6)
			_circ(ci, c, u, Vector2.ZERO, 5, BRASS_D)
		"skull":
			_circ(ci, c, u, _v(0, -8), 32, CREAM)
			_rect(ci, c, u, -18, 12, 36, 24, CREAM)
			_circ(ci, c, u, _v(-12, -8), 9, INK)
			_circ(ci, c, u, _v(12, -8), 9, INK)
			_poly(ci, c, u, [_v(0, 4), _v(-5, 14), _v(5, 14)], INK)
			_line(ci, c, u, _v(-9, 14), _v(-9, 36), INK, 3)
			_line(ci, c, u, _v(0, 14), _v(0, 36), INK, 3)
			_line(ci, c, u, _v(9, 14), _v(9, 36), INK, 3)
		"heart":
			_circ(ci, c, u, _v(-15, -10), 19, RED)
			_circ(ci, c, u, _v(15, -10), 19, RED)
			_poly(ci, c, u, [_v(-33, -4), _v(33, -4), _v(0, 38)], RED)
		"no":
			_ring(ci, c, u, Vector2.ZERO, 36, RED, 10)
			_line(ci, c, u, _v(-26, -26), _v(26, 26), RED, 10)
		"question":
			_text(ci, c, u, "?", 110.0, BRASS)
		"exclaim":
			_text(ci, c, u, "!", 110.0, RED)
		"zzz":
			_text(ci, c, u, "Z", 70.0, WATER, _v(-14, 10))
			_text(ci, c, u, "Z", 48.0, WATER, _v(16, -20))
		"neck":
			var pts := PackedVector2Array()
			for i in 12:
				var t := float(i) / 11.0
				pts.append(c + _v(-6.0 + sin(t * 3.0) * 10.0, 38.0 - t * 70.0) * u)
			ci.draw_polyline(pts, _col(CREAM), 13.0 * u, true)
			_circ(ci, c, u, _v(8, -36), 13, CREAM)
			_poly(ci, c, u, [_v(18, -40), _v(38, -34), _v(18, -30)], Color("d98b2b"))
			_circ(ci, c, u, _v(10, -39), 3, INK)
			_line(ci, c, u, _v(-38, 36), _v(-38, -22), BRASS, 6)
			_poly(ci, c, u, [_v(-38, -38), _v(-50, -20), _v(-26, -20)], BRASS)
		"crouch":
			ci.draw_colored_polygon(_xf(DataUtil.ellipse(Vector2.ZERO, 34, 20, 20), c, u, _v(-4, 20)), _col(CREAM))
			_circ(ci, c, u, _v(32, 30), 11, CREAM)
			_poly(ci, c, u, [_v(40, 28), _v(54, 34), _v(40, 38)], Color("d98b2b"))
			_line(ci, c, u, _v(-8, 38), _v(-8, 46), Color("d98b2b"), 6)
			_line(ci, c, u, _v(-38, -38), _v(-38, 8), BRASS, 6)
			_poly(ci, c, u, [_v(-38, 24), _v(-50, 6), _v(-26, 6)], BRASS)
		"stand":
			ci.draw_colored_polygon(_xf(DataUtil.ellipse(Vector2.ZERO, 30, 18, 20), c, u, _v(-6, 10)), _col(CREAM))
			_line(ci, c, u, _v(14, 6), _v(22, -18), CREAM, 11)
			_circ(ci, c, u, _v(24, -24), 11, CREAM)
			_poly(ci, c, u, [_v(33, -27), _v(48, -22), _v(33, -18)], Color("d98b2b"))
			_line(ci, c, u, _v(-8, 26), _v(-8, 42), Color("d98b2b"), 6)
			_line(ci, c, u, _v(6, 26), _v(6, 42), Color("d98b2b"), 6)
		"goose", "goose_black":
			var body := CREAM if icon == "goose" else Color("4a4650")
			ci.draw_colored_polygon(_xf(DataUtil.ellipse(Vector2.ZERO, 32, 20, 20), c, u, _v(-8, 12)), _col(body))
			_line(ci, c, u, _v(14, 6), _v(24, -22), body, 12)
			_circ(ci, c, u, _v(26, -28), 12, body)
			_poly(ci, c, u, [_v(36, -31), _v(52, -26), _v(36, -21)], Color("d98b2b"))
			_circ(ci, c, u, _v(29, -31), 3, CREAM if icon == "goose_black" else INK)
			_line(ci, c, u, _v(-10, 30), _v(-10, 44), Color("d98b2b"), 6)
		"cold":
			for k in 3:
				var a := PI * float(k) / 3.0
				_line(ci, c, u, _v(cos(a), sin(a)) * 40.0, _v(cos(a), sin(a)) * -40.0, WATER, 8)
		"home":
			_poly(ci, c, u, [_v(-44, -2), _v(0, -42), _v(44, -2)], RUST)
			_rect(ci, c, u, -30, -2, 60, 40, CREAM)
			_rect(ci, c, u, -8, 12, 16, 26, BRASS_D)
		"sun":
			_circ(ci, c, u, Vector2.ZERO, 20, BRASS)
			for k in 8:
				var a := TAU * float(k) / 8.0
				_line(ci, c, u, _v(cos(a), sin(a)) * 28.0, _v(cos(a), sin(a)) * 42.0, BRASS, 7)
		"lock":
			_ring(ci, c, u, _v(0, -6), 17, STEEL, 9, PI, TAU)
			_rect(ci, c, u, -28, -6, 56, 42, BRASS)
			_circ(ci, c, u, _v(0, 12), 6, INK)
			_rect(ci, c, u, -2, 14, 4, 12, INK)
		"arrow_right":
			_poly(ci, c, u, [_v(-40, -12), _v(8, -12), _v(8, -32), _v(42, 0), _v(8, 32), _v(8, 12), _v(-40, 12)], BRASS)
		"arrow_up":
			_poly(ci, c, u, [_v(-12, 40), _v(-12, -8), _v(-32, -8), _v(0, -42), _v(32, -8), _v(12, -8), _v(12, 40)], BRASS)
		"winch":
			_rect(ci, c, u, -34, -6, 68, 30, STEEL)
			_line(ci, c, u, _v(-34, 9), _v(34, 9), STEEL.darkened(0.35), 4)
			_rect(ci, c, u, -40, 24, 80, 12, BRASS_D)
			_line(ci, c, u, _v(34, 9), _v(46, -26), BRASS, 7)
			_circ(ci, c, u, _v(46, -28), 8, BRASS)
		"gate":
			_rect(ci, c, u, -40, -36, 80, 8, STEEL)
			_rect(ci, c, u, -40, 28, 80, 8, STEEL)
			for i in 5:
				_rect(ci, c, u, -34.0 + float(i) * 17.0, -36, 7, 72, STEEL.darkened(0.15))
		"bell":
			_poly(ci, c, u, [_v(-14, -34), _v(14, -34), _v(30, 8), _v(40, 26), _v(-40, 26), _v(-30, 8)], BRASS)
			_circ(ci, c, u, _v(0, -38), 7, BRASS_D)
			_circ(ci, c, u, _v(0, 32), 9, BRASS_D)
		"bulb":
			_circ(ci, c, u, _v(0, -10), 28, BRASS)
			_circ(ci, c, u, _v(-8, -18), 8, CREAM)
			_rect(ci, c, u, -13, 14, 26, 8, STEEL)
			_rect(ci, c, u, -10, 22, 20, 8, STEEL.darkened(0.2))
			_rect(ci, c, u, -6, 30, 12, 6, STEEL.darkened(0.3))
		"menu":
			_gear(ci, c, u, Vector2.ZERO, 38.0, 8, STEEL, 12.0)
		_:
			_ring(ci, c, u, Vector2.ZERO, 34, BRASS, 8)
			_text(ci, c, u, "?", 70.0, BRASS)


## Trasla/scala un poligono (usato dalle ellissi nelle icone).
static func _xf(pts: PackedVector2Array, c: Vector2, u: float, off: Vector2) -> PackedVector2Array:
	var out := PackedVector2Array()
	for p in pts:
		out.append(c + (p + off) * u)
	return out
