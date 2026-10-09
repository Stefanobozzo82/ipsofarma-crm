class_name DataUtil
extends RefCounted
## Conversioni tra i dati JSON (array di numeri / stringhe) e i tipi di Godot.


static func vec(v: Variant, fallback: Vector2 = Vector2.ZERO) -> Vector2:
	if v is Array and v.size() >= 2:
		return Vector2(float(v[0]), float(v[1]))
	return fallback


static func poly(v: Variant) -> PackedVector2Array:
	var out := PackedVector2Array()
	if v is Array:
		for p in v:
			out.append(vec(p))
	return out


static func color(v: Variant, fallback: Color = Color.WHITE) -> Color:
	if v is String and v != "":
		return Color(str(v))
	if v is Array and v.size() >= 3:
		var a: float = float(v[3]) if v.size() > 3 else 1.0
		return Color(float(v[0]), float(v[1]), float(v[2]), a)
	return fallback


## Vettore -> [x, y] con interi (formato usato nei file JSON salvati).
static func to_arr(v: Vector2) -> Array:
	return [int(round(v.x)), int(round(v.y))]


static func bounds(p: PackedVector2Array) -> Rect2:
	if p.is_empty():
		return Rect2()
	var r := Rect2(p[0], Vector2.ZERO)
	for v in p:
		r = r.expand(v)
	return r


static func centroid(p: PackedVector2Array) -> Vector2:
	if p.is_empty():
		return Vector2.ZERO
	var s := Vector2.ZERO
	for v in p:
		s += v
	return s / float(p.size())


## Punti di un'ellisse (poligono) - utile per le forme segnaposto.
static func ellipse(center: Vector2, rx: float, ry: float, n: int = 24) -> PackedVector2Array:
	var out := PackedVector2Array()
	for i in n:
		var a := TAU * float(i) / float(n)
		out.append(center + Vector2(cos(a) * rx, sin(a) * ry))
	return out
