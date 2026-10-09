class_name Interactable
extends Node2D
## Classe base di tutto cio' che si puo' cliccare nella scena (hotspot, oggetti raccoglibili,
## personaggi). Eredita da questa per creare nuovi tipi: basta sovrascrivere
## read_geometry(), get_rules() e _draw().
##
## I dati arrivano dal JSON della scena (data/scenes/<id>.json -> "objects"):
##   id, type, poly (poligono cliccabile in coordinate di scena), walk_to (dove si ferma l'oca),
##   visible_if (condizione), interactions (regole), clickable ...

var id := ""
var data: Dictionary = {}
var level: Node = null          # Level che possiede l'oggetto
var poly := PackedVector2Array()  # poligono cliccabile in coordinate di scena
var walk_to := Vector2.ZERO
var hovered := false
var enabled := true             # false se visible_if non e' soddisfatta
var hint_time := 0.0            # >0: anello pulsante del suggerimento


func setup(p_data: Dictionary, p_level: Node) -> void:
	data = p_data
	level = p_level
	id = str(data.get("id", ""))
	read_geometry()
	refresh()


## (Ri)legge poligono e punto di arrivo dai dati. Chiamata anche dopo i drag della modalita' debug.
func read_geometry() -> void:
	poly = DataUtil.poly(data.get("poly", []))
	walk_to = DataUtil.vec(data.get("walk_to", []), DataUtil.centroid(poly))
	# Il nodo sta in basso al poligono: cosi' l'ordinamento in profondita' (y-sort) con l'oca e' naturale.
	position = Vector2(0, DataUtil.bounds(poly).end.y)
	queue_redraw()


## Rivaluta la visibilita' in base ai flag. Chiamata a ogni cambio di stato.
func refresh() -> void:
	enabled = GameState.evaluate(data.get("visible_if", {}))
	visible = enabled
	queue_redraw()


## Regole di interazione: [{ "when": {...}, "do": [azioni] }, ...] (la prima valida vince).
func get_rules() -> Array:
	return data.get("interactions", [])


func is_clickable() -> bool:
	return enabled and bool(data.get("clickable", true)) and poly.size() >= 3


func contains_point(p: Vector2) -> bool:
	return is_clickable() and Geometry2D.is_point_in_polygon(p, poly)


## Punto (coordinate di scena) sopra l'oggetto, dove ancorare i fumetti.
func top_center() -> Vector2:
	var b := DataUtil.bounds(poly)
	return Vector2(b.get_center().x, b.position.y)


func face_toward(_x: float) -> void:
	pass


func show_hint(seconds: float = 4.5) -> void:
	hint_time = seconds


func _process(delta: float) -> void:
	if hint_time > 0.0:
		hint_time = maxf(0.0, hint_time - delta)
		queue_redraw()
	elif hovered:
		queue_redraw()


# ------------------------------------------------------------------ disegno condiviso

## Il poligono in coordinate locali del nodo.
func local_poly() -> PackedVector2Array:
	var out := PackedVector2Array()
	for p in poly:
		out.append(p - position)
	return out


## Evidenziazione al passaggio del mouse e anello del suggerimento.
func draw_feedback() -> void:
	var lp := local_poly()
	if lp.size() < 3:
		return
	var closed := lp.duplicate()
	closed.append(lp[0])
	if hovered:
		draw_polyline(closed, Color(1.0, 0.93, 0.6, 0.95), 4.0, true)
	if hint_time > 0.0:
		var pulse := 0.5 + 0.5 * sin(Time.get_ticks_msec() / 160.0)
		var b := DataUtil.bounds(lp)
		var r := maxf(b.size.x, b.size.y) * 0.5 + 18.0 + pulse * 10.0
		draw_arc(b.get_center(), r, 0.0, TAU, 40, Color(1.0, 0.85, 0.3, 0.55 + 0.4 * pulse), 6.0, true)
