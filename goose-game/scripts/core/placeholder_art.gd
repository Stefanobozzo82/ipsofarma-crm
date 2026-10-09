class_name PlaceholderArt
extends Node2D
## Sfondo segnaposto disegnato a codice (gradienti, sagome, forme). Si usa quando manca
## assets/backgrounds/<scena>.png (o _mid / _fg). Il contenuto e' descritto dal blocco
## "placeholder" del JSON di scena, quindi si puo' ritoccare senza programmare:
##   sky [alto, orizzonte], ground_y, ground [lontano, vicino], far (chimneys|towers|gears|pipes),
##   far_color, sun {pos, r, color}, decor [ {shape, pos, size, color, layer, visible_if} ].
## Forme di "decor": heap cart barrel crate pole pipe gear chimney tower water gate boat crane
##                   shelf arch clock pillar machine window lamp
## `pos` e' il punto in basso al centro della forma (centro per gear e clock).

const W := 1920.0
const H := 1080.0

var ph: Dictionary = {}
var layer := "bg"


func setup(p_ph: Dictionary, p_layer: String) -> void:
	ph = p_ph
	layer = p_layer
	GameState.flags_changed.connect(queue_redraw)


func _draw() -> void:
	if layer == "bg":
		_draw_sky()
		_draw_far()
		_draw_ground()
	for raw in ph.get("decor", []):
		var d: Dictionary = raw
		if str(d.get("layer", "bg")) != layer:
			continue
		if not GameState.evaluate(d.get("visible_if", {})):
			continue
		_draw_shape(d)


# ------------------------------------------------------------------ cielo, lontananza, terreno

func _draw_sky() -> void:
	var sky: Array = ph.get("sky", ["#2f3a35", "#7a6a4c"])
	var top := DataUtil.color(sky[0])
	var hor := DataUtil.color(sky[1])
	var gy := float(ph.get("ground_y", 620.0))
	draw_polygon(PackedVector2Array([Vector2(0, 0), Vector2(W, 0), Vector2(W, gy + 60), Vector2(0, gy + 60)]),
		PackedColorArray([top, top, hor, hor]))
	if ph.has("sun"):
		var s: Dictionary = ph["sun"]
		var c := DataUtil.vec(s.get("pos", []), Vector2(1400, 260))
		var r := float(s.get("r", 110))
		var col := DataUtil.color(s.get("color", "#e0b36a"))
		for i in 5:
			draw_circle(c, r * (2.2 - float(i) * 0.3), Color(col.r, col.g, col.b, 0.05 + 0.04 * float(i)))
		draw_circle(c, r, col)


func _draw_far() -> void:
	var kind: String = str(ph.get("far", "none"))
	var gy := float(ph.get("ground_y", 620.0))
	var col := DataUtil.color(ph.get("far_color", "#3a4440"))
	var rng := RandomNumberGenerator.new()
	rng.seed = int(ph.get("seed", 5))
	match kind:
		"chimneys":
			var x := -20.0
			while x < W:
				var w := rng.randf_range(50.0, 110.0)
				var h := rng.randf_range(140.0, 400.0)
				draw_rect(Rect2(x, gy - h, w, h + 4.0), col)
				draw_rect(Rect2(x - 5.0, gy - h - 12.0, w + 10.0, 14.0), col.darkened(0.15))
				x += w + rng.randf_range(10.0, 90.0)
		"towers":
			var x := -20.0
			while x < W:
				var w := rng.randf_range(80.0, 150.0)
				var h := rng.randf_range(200.0, 520.0)
				draw_rect(Rect2(x, gy - h, w, h + 4.0), col)
				draw_colored_polygon(PackedVector2Array([Vector2(x - 8, gy - h), Vector2(x + w * 0.5, gy - h - w * 0.8), Vector2(x + w + 8, gy - h)]), col.darkened(0.12))
				for k in 4:
					if rng.randf() < 0.6:
						draw_rect(Rect2(x + w * 0.3, gy - h + 40.0 + float(k) * 55.0, 14, 24), Color(0.9, 0.75, 0.4, 0.55))
				x += w + rng.randf_range(20.0, 120.0)
		"gears":
			for i in 7:
				var r := rng.randf_range(110.0, 260.0)
				var c := Vector2(rng.randf_range(0.0, W), gy - rng.randf_range(10.0, 250.0))
				draw_colored_polygon(_gear_poly(c, r, 14 + (i % 3) * 2, 0.86, float(i)), Color(col.r, col.g, col.b, 0.8))
				draw_circle(c, r * 0.25, col.lightened(0.1))
		"pipes":
			for i in 9:
				var x := rng.randf_range(0.0, W)
				var w := rng.randf_range(24.0, 50.0)
				var h := rng.randf_range(150.0, 480.0)
				draw_rect(Rect2(x, gy - h, w, h + 4.0), col)
				draw_rect(Rect2(x - 10.0, gy - h, w + 20.0, 16.0), col.darkened(0.18))
			draw_rect(Rect2(0, gy - 300.0, W, 30.0), col.darkened(0.1))
	# Velo di foschia all'orizzonte.
	draw_polygon(PackedVector2Array([Vector2(0, gy - 140), Vector2(W, gy - 140), Vector2(W, gy + 20), Vector2(0, gy + 20)]),
		PackedColorArray([Color(0.7, 0.65, 0.5, 0.0), Color(0.7, 0.65, 0.5, 0.0), Color(0.7, 0.65, 0.5, 0.22), Color(0.7, 0.65, 0.5, 0.22)]))


func _draw_ground() -> void:
	var gy := float(ph.get("ground_y", 620.0))
	var g: Array = ph.get("ground", ["#4a3b2a", "#251d16"])
	var far := DataUtil.color(g[0])
	var near := DataUtil.color(g[1])
	draw_polygon(PackedVector2Array([Vector2(0, gy), Vector2(W, gy), Vector2(W, H), Vector2(0, H)]),
		PackedColorArray([far, far, near, near]))
	var rng := RandomNumberGenerator.new()
	rng.seed = int(ph.get("seed", 5)) + 31
	for i in 70:
		var p := Vector2(rng.randf_range(0.0, W), rng.randf_range(gy + 20.0, H))
		var l := rng.randf_range(20.0, 90.0) * (0.5 + (p.y - gy) / (H - gy))
		draw_line(p, p + Vector2(l, 0), Color(0, 0, 0, 0.16), 3.0)


# ------------------------------------------------------------------ forme

func _gear_poly(c: Vector2, r: float, teeth: int, inner: float, rot: float = 0.0) -> PackedVector2Array:
	var pts := PackedVector2Array()
	for i in teeth:
		var a0 := rot + TAU * float(i) / float(teeth)
		var step := TAU / float(teeth)
		for k in [[-0.30, inner], [-0.18, 1.0], [0.18, 1.0], [0.30, inner]]:
			var a := a0 + step * float(k[0])
			pts.append(c + Vector2(cos(a), sin(a)) * r * float(k[1]))
	return pts


func _rect_b(pos: Vector2, w: float, h: float) -> Rect2:
	return Rect2(pos.x - w * 0.5, pos.y - h, w, h)


func _draw_shape(d: Dictionary) -> void:
	var shape: String = str(d.get("shape", ""))
	var pos := DataUtil.vec(d.get("pos", []))
	var size := DataUtil.vec(d.get("size", []), Vector2(100, 100))
	var w := size.x
	var h := size.y
	var rng := RandomNumberGenerator.new()
	rng.seed = int(pos.x * 7.0 + pos.y * 13.0)
	var col := DataUtil.color(d.get("color", ""), Color("6b5036"))
	var dark := col.darkened(0.4)
	match shape:
		"heap":
			var pts := PackedVector2Array([Vector2(pos.x - w * 0.5, pos.y)])
			var n := 16
			for i in n + 1:
				var u := float(i) / float(n)
				var y := pos.y - h * pow(sin(PI * u), 0.75) * rng.randf_range(0.72, 1.0)
				pts.append(Vector2(pos.x - w * 0.5 + w * u, y))
			pts.append(Vector2(pos.x + w * 0.5, pos.y))
			draw_colored_polygon(pts, col)
			for i in int(w / 22.0):
				var p := Vector2(pos.x + rng.randf_range(-w * 0.45, w * 0.45), pos.y - rng.randf_range(4.0, h * 0.7))
				var c2 := col.lightened(rng.randf_range(-0.2, 0.25))
				match rng.randi() % 3:
					0: draw_rect(Rect2(p, Vector2(rng.randf_range(10, 34), rng.randf_range(6, 16))), c2)
					1: draw_colored_polygon(_gear_poly(p, rng.randf_range(10, 22), 8, 0.7, rng.randf() * 3.0), c2)
					_: draw_circle(p, rng.randf_range(6, 14), c2)
		"cart":
			var r := h * 0.27
			draw_rect(Rect2(pos.x - w * 0.5, pos.y - h, w, h * 0.5), col)
			draw_rect(Rect2(pos.x - w * 0.5, pos.y - h, w, 8), dark)
			for i in 5:
				draw_line(Vector2(pos.x - w * 0.5 + float(i) * w / 4.0, pos.y - h), Vector2(pos.x - w * 0.5 + float(i) * w / 4.0, pos.y - h * 0.5), dark, 4.0)
			draw_line(Vector2(pos.x + w * 0.5, pos.y - h * 0.8), Vector2(pos.x + w * 0.5 + 90.0, pos.y - h * 0.2), dark, 8.0)
			for wx in [-0.3, 0.3]:
				var c3 := Vector2(pos.x + w * float(wx), pos.y - r)
				draw_circle(c3, r, dark)
				draw_circle(c3, r * 0.7, col.lightened(0.05))
				draw_circle(c3, r * 0.15, dark)
				for k in 6:
					var a := TAU * float(k) / 6.0
					draw_line(c3, c3 + Vector2(cos(a), sin(a)) * r * 0.7, dark, 3.0)
		"barrel":
			draw_colored_polygon(PackedVector2Array([
				Vector2(pos.x - w * 0.42, pos.y), Vector2(pos.x - w * 0.5, pos.y - h * 0.5), Vector2(pos.x - w * 0.42, pos.y - h),
				Vector2(pos.x + w * 0.42, pos.y - h), Vector2(pos.x + w * 0.5, pos.y - h * 0.5), Vector2(pos.x + w * 0.42, pos.y)]), col)
			for f in [0.2, 0.5, 0.8]:
				draw_line(Vector2(pos.x - w * 0.48, pos.y - h * float(f)), Vector2(pos.x + w * 0.48, pos.y - h * float(f)), dark, 6.0)
		"crate":
			var rc := _rect_b(pos, w, h)
			draw_rect(rc, col)
			draw_rect(rc, dark, false, 5.0)
			draw_line(rc.position, rc.end, dark, 5.0)
			draw_line(Vector2(rc.end.x, rc.position.y), Vector2(rc.position.x, rc.end.y), dark, 5.0)
		"pole":
			draw_rect(Rect2(pos.x - 7.0, pos.y - h, 14.0, h), col)
			draw_rect(Rect2(pos.x - w * 0.5, pos.y - h, w, 12.0), col.darkened(0.15))
			draw_line(Vector2(pos.x - w * 0.5 + 6.0, pos.y - h + 10.0), Vector2(pos.x - w * 0.5 + 6.0, pos.y - h + 50.0), dark, 4.0)
			draw_rect(Rect2(pos.x - 22.0, pos.y - 14.0, 44.0, 14.0), dark)
		"pipe":
			if w >= h:
				draw_rect(_rect_b(pos, w, h), col)
				draw_rect(Rect2(pos.x - w * 0.5, pos.y - h - 4.0, 12.0, h + 8.0), dark)
				draw_rect(Rect2(pos.x + w * 0.5 - 12.0, pos.y - h - 4.0, 12.0, h + 8.0), dark)
			else:
				draw_rect(_rect_b(pos, w, h), col)
				draw_rect(Rect2(pos.x - w * 0.5 - 4.0, pos.y - h, w + 8.0, 12.0), dark)
				draw_rect(Rect2(pos.x - w * 0.5 - 4.0, pos.y - 12.0, w + 8.0, 12.0), dark)
		"gear":
			var r2 := w * 0.5
			draw_colored_polygon(_gear_poly(pos, r2, 16, 0.84, float(d.get("rot", 0.0))), col)
			draw_circle(pos, r2 * 0.62, col.darkened(0.15))
			draw_circle(pos, r2 * 0.2, dark)
			for k in 5:
				var a2 := TAU * float(k) / 5.0
				draw_line(pos, pos + Vector2(cos(a2), sin(a2)) * r2 * 0.62, dark, r2 * 0.08)
		"chimney":
			draw_rect(_rect_b(pos, w, h), col)
			draw_rect(Rect2(pos.x - w * 0.6, pos.y - h - 10.0, w * 1.2, 22.0), col.darkened(0.2))
		"tower":
			draw_rect(_rect_b(pos, w, h), col)
			draw_colored_polygon(PackedVector2Array([Vector2(pos.x - w * 0.6, pos.y - h), Vector2(pos.x, pos.y - h - w * 0.8), Vector2(pos.x + w * 0.6, pos.y - h)]), col.darkened(0.2))
			for k in int(h / 90.0):
				draw_rect(Rect2(pos.x - 9.0, pos.y - h + 40.0 + float(k) * 90.0, 18.0, 36.0), Color(0.95, 0.8, 0.45, 0.7))
		"water":
			var wr := _rect_b(pos, w, h)
			draw_polygon(PackedVector2Array([wr.position, Vector2(wr.end.x, wr.position.y), wr.end, Vector2(wr.position.x, wr.end.y)]),
				PackedColorArray([col.lightened(0.1), col.lightened(0.1), col.darkened(0.3), col.darkened(0.3)]))
			var rows := int(h / 28.0)
			for k in rows:
				var y0 := wr.position.y + 12.0 + float(k) * 28.0
				var pts2 := PackedVector2Array()
				for i in int(w / 24.0) + 1:
					pts2.append(Vector2(wr.position.x + float(i) * 24.0, y0 + sin(float(i) * 0.9 + float(k) * 2.1) * 3.0))
				draw_polyline(pts2, Color(1, 1, 1, 0.10), 2.0)
		"gate":
			var gr := _rect_b(pos, w, h)
			draw_rect(gr, col)
			for i in int(w / 28.0):
				draw_line(Vector2(gr.position.x + 14.0 + float(i) * 28.0, gr.position.y), Vector2(gr.position.x + 14.0 + float(i) * 28.0, gr.end.y), dark, 3.0)
			draw_rect(gr, dark, false, 8.0)
			draw_rect(Rect2(gr.position.x, gr.position.y + h * 0.3, w, 12.0), dark)
			draw_rect(Rect2(gr.position.x, gr.position.y + h * 0.7, w, 12.0), dark)
		"boat":
			draw_colored_polygon(PackedVector2Array([Vector2(pos.x - w * 0.5, pos.y - h * 0.5), Vector2(pos.x + w * 0.5, pos.y - h * 0.5),
				Vector2(pos.x + w * 0.38, pos.y), Vector2(pos.x - w * 0.38, pos.y)]), col)
			draw_rect(Rect2(pos.x - w * 0.2, pos.y - h, w * 0.4, h * 0.5), col.lightened(0.15))
			draw_rect(Rect2(pos.x - w * 0.12, pos.y - h * 0.9, w * 0.24, h * 0.2), Color(0.95, 0.8, 0.45, 0.8))
			draw_rect(Rect2(pos.x + w * 0.2, pos.y - h * 1.25, 18.0, h * 0.6), dark)
			draw_line(Vector2(pos.x - w * 0.5, pos.y - h * 0.5), Vector2(pos.x + w * 0.5, pos.y - h * 0.5), dark, 6.0)
		"crane":
			draw_rect(Rect2(pos.x - 9.0, pos.y - h, 18.0, h), col)
			draw_line(Vector2(pos.x, pos.y - h), Vector2(pos.x + w, pos.y - h + 40.0), col, 14.0)
			draw_line(Vector2(pos.x, pos.y - h * 0.6), Vector2(pos.x + w * 0.6, pos.y - h + 40.0), dark, 6.0)
			draw_line(Vector2(pos.x + w * 0.95, pos.y - h + 40.0), Vector2(pos.x + w * 0.95, pos.y - h + 130.0), dark, 4.0)
			draw_rect(Rect2(pos.x - 40.0, pos.y - 16.0, 80.0, 16.0), dark)
		"shelf":
			var sr := _rect_b(pos, w, h)
			draw_rect(sr, col.darkened(0.2))
			var rows2 := maxi(2, int(h / 100.0))
			for k in rows2:
				var by := sr.position.y + 10.0 + float(k) * (h - 20.0) / float(rows2)
				var bx := sr.position.x + 8.0
				while bx < sr.end.x - 24.0:
					var bw := rng.randf_range(10.0, 22.0)
					var bh := rng.randf_range(50.0, (h - 20.0) / float(rows2) - 12.0)
					var palette: Array[Color] = [Color("8c3b2a"), Color("5a6b3a"), Color("b0873a"), Color("3f5663"), Color("6b4a35")]
					var bc: Color = palette[rng.randi() % 5]
					draw_rect(Rect2(bx, by + (h - 20.0) / float(rows2) - 10.0 - bh, bw, bh), bc)
					bx += bw + 2.0
				draw_rect(Rect2(sr.position.x, by + (h - 20.0) / float(rows2) - 10.0, w, 8.0), col)
			draw_rect(sr, dark, false, 6.0)
		"arch":
			var ar := _rect_b(pos, w, h - w * 0.5)
			draw_rect(ar, dark.darkened(0.3))
			draw_colored_polygon(DataUtil.ellipse(Vector2(pos.x, pos.y - h + w * 0.5), w * 0.5, w * 0.5, 24), dark.darkened(0.3))
			draw_arc(Vector2(pos.x, pos.y - h + w * 0.5), w * 0.5, PI, TAU, 24, col, 12.0)
			draw_line(Vector2(pos.x - w * 0.5, pos.y - h + w * 0.5), Vector2(pos.x - w * 0.5, pos.y), col, 12.0)
			draw_line(Vector2(pos.x + w * 0.5, pos.y - h + w * 0.5), Vector2(pos.x + w * 0.5, pos.y), col, 12.0)
		"clock":
			var rr := w * 0.5
			draw_circle(pos, rr + 14.0, col.darkened(0.3))
			draw_circle(pos, rr, Color("e3d5ad"))
			for k in 12:
				var a3 := TAU * float(k) / 12.0
				draw_line(pos + Vector2(sin(a3), -cos(a3)) * rr * 0.82, pos + Vector2(sin(a3), -cos(a3)) * rr * 0.95, dark, 6.0)
			draw_line(pos, pos + Vector2(sin(0.5), -cos(0.5)) * rr * 0.5, dark, 10.0)
			draw_line(pos, pos + Vector2(sin(3.6), -cos(3.6)) * rr * 0.8, dark, 6.0)
			draw_circle(pos, 10.0, col)
		"pillar":
			draw_rect(_rect_b(pos, w, h), col)
			draw_rect(Rect2(pos.x - w * 0.65, pos.y - h - 8.0, w * 1.3, 26.0), col.lightened(0.1))
			draw_rect(Rect2(pos.x - w * 0.65, pos.y - 20.0, w * 1.3, 20.0), col.lightened(0.1))
			draw_line(Vector2(pos.x - w * 0.2, pos.y - h + 20.0), Vector2(pos.x - w * 0.2, pos.y - 20.0), dark, 3.0)
		"machine":
			var mr := _rect_b(pos, w, h)
			draw_rect(mr, col)
			draw_rect(mr, dark, false, 6.0)
			for k in 3:
				var dc := Vector2(mr.position.x + w * (0.2 + 0.3 * float(k)), mr.position.y + h * 0.3)
				draw_circle(dc, minf(w, h) * 0.09, Color("e3d5ad"))
				draw_line(dc, dc + Vector2(cos(float(k) * 2.0), sin(float(k) * 2.0)) * minf(w, h) * 0.07, dark, 3.0)
			draw_rect(Rect2(mr.position.x + w * 0.1, mr.position.y + h * 0.6, w * 0.8, h * 0.25), dark)
		"window":
			var wc := Vector2(pos.x, pos.y - h + w * 0.5)
			draw_rect(_rect_b(pos, w, h - w * 0.5), Color(0.95, 0.78, 0.42, 0.85))
			draw_circle(wc, w * 0.5, Color(0.95, 0.78, 0.42, 0.85))
			draw_line(Vector2(pos.x, pos.y - h), Vector2(pos.x, pos.y), col, 6.0)
			draw_line(Vector2(pos.x - w * 0.5, pos.y - h * 0.5), Vector2(pos.x + w * 0.5, pos.y - h * 0.5), col, 6.0)
			draw_arc(wc, w * 0.5, PI, TAU, 20, col, 8.0)
		"lamp":
			draw_rect(Rect2(pos.x - 4.0, pos.y - h, 8.0, h), dark)
			draw_circle(Vector2(pos.x, pos.y - h), 16.0, Color(1.0, 0.85, 0.5, 0.95))
			draw_circle(Vector2(pos.x, pos.y - h), 36.0, Color(1.0, 0.8, 0.4, 0.18))
		_:
			push_warning("Forma segnaposto sconosciuta: " + shape)
