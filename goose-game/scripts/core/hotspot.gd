class_name Hotspot
extends Interactable
## Zona cliccabile / oggetto fisso della scena (argano, cancello, valvola...).
##
## Aspetto: se esiste assets/sprites/<sprite>.png (default: <id>.png) viene disegnato quello,
## centrato nel riquadro del poligono (+ "sprite_offset"). Altrimenti segnaposto colorato,
## a meno che nel JSON ci sia "invisible": true (l'oggetto e' gia' dipinto nello sfondo).

func _draw() -> void:
	if not enabled:
		return
	var lp := local_poly()
	if lp.size() < 3:
		return
	var b := DataUtil.bounds(lp)
	var sprite_name: String = str(data.get("sprite", id))
	var tex: Texture2D = Assets.sprite(sprite_name)
	if tex != null:
		var off := DataUtil.vec(data.get("sprite_offset", []))
		draw_texture(tex, b.get_center() - tex.get_size() * 0.5 + off)
	elif not bool(data.get("invisible", false)):
		var col := DataUtil.color(data.get("color", "#6b4a2b"))
		draw_colored_polygon(lp, col)
		var closed := lp.duplicate()
		closed.append(lp[0])
		draw_polyline(closed, col.darkened(0.45), 4.0, true)
		var icon: String = str(data.get("icon", ""))
		if icon != "":
			var s := minf(minf(b.size.x, b.size.y) * 0.75, 110.0)
			IconPainter.draw(self, icon, b.get_center(), maxf(s, 40.0))
	draw_feedback()
