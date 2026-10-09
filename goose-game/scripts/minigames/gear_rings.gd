class_name GearRings
extends Minigame
## Anelli dentati dell'orologio (livello 3, puzzle finale): ogni anello ha un dente d'ottone;
## portali tutti in cima. Girare un anello trascina anche un altro (la legenda a sinistra
## mostra i collegamenti). Clic sinistro = orario, destro = antiorario.
## config: { "couple": [[1,-1],[2,-1],[0,-1]], "scramble": [[0,1],[0,1],[1,-1]] }
##   couple[i] = [anello trascinato, direzione relativa]; scramble = mosse applicate allo stato risolto.

const STEPS := 8
const RADII: Array[float] = [300.0, 215.0, 130.0]
const BAND := 66.0
const COLORS: Array[Color] = [Color("b0572f"), Color("d1a84b"), Color("7b9650")]

var pos: Array[int] = [0, 0, 0]
var couple: Array = []
var angle: Array[float] = [0.0, 0.0, 0.0]
var target: Array[float] = [0.0, 0.0, 0.0]
var solved := false
var center := Vector2(1100, 520)


## Applica una mossa (anello `ring`, verso `dir` = +1/-1) e ritorna il nuovo stato.
static func apply_move(state: Array, p_couple: Array, ring: int, dir: int) -> Array:
	var out := state.duplicate()
	out[ring] = posmod(int(out[ring]) + dir, STEPS)
	if ring < p_couple.size():
		var c: Array = p_couple[ring]
		var other := int(c[0])
		out[other] = posmod(int(out[other]) + int(c[1]) * dir, STEPS)
	return out


static func is_solved(state: Array) -> bool:
	for v in state:
		if int(v) != 0:
			return false
	return true


static func scrambled(p_couple: Array, moves: Array) -> Array:
	var s: Array = [0, 0, 0]
	for m in moves:
		s = apply_move(s, p_couple, int(m[0]), int(m[1]))
	return s


func _start() -> void:
	couple = config.get("couple", [[1, -1], [2, -1], [0, -1]])
	var s := scrambled(couple, config.get("scramble", [[0, 1], [1, 1]]))
	for i in 3:
		pos[i] = int(s[i])
		angle[i] = float(pos[i]) * TAU / float(STEPS)
		target[i] = angle[i]
	center = PANEL.get_center() + Vector2(120, 20)


func _process(delta: float) -> void:
	var moving := false
	for i in 3:
		if absf(angle[i] - target[i]) > 0.002:
			angle[i] = move_toward(angle[i], target[i], delta * 5.0)
			moving = true
	if moving:
		queue_redraw()


func _content_click(p: Vector2, button: int) -> void:
	if solved:
		return
	var d := p.distance_to(center)
	for i in 3:
		if absf(d - RADII[i]) <= BAND * 0.5 + 4.0:
			var dir := -1 if button == MOUSE_BUTTON_RIGHT else 1
			var ns := apply_move(pos, couple, i, dir)
			for k in 3:
				var delta_steps := int(ns[k]) - pos[k]
				# Passo minimo con segno (evita il giro completo quando si passa da 7 a 0).
				if delta_steps > STEPS / 2:
					delta_steps -= STEPS
				elif delta_steps < -STEPS / 2:
					delta_steps += STEPS
				target[k] += float(delta_steps) * TAU / float(STEPS)
				pos[k] = int(ns[k])
			AudioManager.play_sfx("clank", 1.0 + float(i) * 0.15, -6.0)
			if is_solved(pos):
				_win()
			queue_redraw()
			return


func _win() -> void:
	solved = true
	AudioManager.play_sfx("bell")
	queue_redraw()
	await get_tree().create_timer(1.6).timeout
	if is_inside_tree():
		finish(true)


func _draw_content() -> void:
	# Guida verticale e indicatore in cima.
	draw_line(center + Vector2(0, -RADII[0] - 50.0), center, Color(1, 1, 1, 0.14), 4.0)
	draw_colored_polygon(PackedVector2Array([center + Vector2(0, -RADII[0] - 38.0), center + Vector2(-16, -RADII[0] - 66.0), center + Vector2(16, -RADII[0] - 66.0)]), IconPainter.BRASS)
	for i in 3:
		var r := RADII[i]
		var col := COLORS[i]
		draw_arc(center, r, 0.0, TAU, 72, col.darkened(0.55), BAND + 8.0, true)
		draw_arc(center, r, 0.0, TAU, 72, col.darkened(0.2), BAND, true)
		for k in STEPS:
			var a := angle[i] + TAU * float(k) / float(STEPS) - PI * 0.5
			var dir := Vector2(cos(a), sin(a))
			draw_line(center + dir * (r - BAND * 0.5), center + dir * (r + BAND * 0.5), col.darkened(0.55), 3.0)
		# Dente d'ottone (indice 0 dell'anello).
		var a0 := angle[i] - PI * 0.5
		var tooth := center + Vector2(cos(a0), sin(a0)) * r
		draw_circle(tooth, 24, IconPainter.INK)
		draw_circle(tooth, 19, IconPainter.BRASS if not solved else Color("fff0a0"))
		draw_circle(tooth + Vector2(-5, -5), 6, Color(1, 1, 1, 0.5))
	draw_circle(center, 60, Color("15100c"))
	IconPainter.draw(self, "clock", center, 100.0)
	# Legenda dei collegamenti: anello -> anello trascinato (con verso).
	for i in 3:
		var y := PANEL.position.y + 260.0 + float(i) * 110.0
		var x := PANEL.position.x + 90.0
		draw_circle(Vector2(x, y), 26, COLORS[i])
		IconPainter.draw(self, "arrow_right", Vector2(x + 70.0, y), 46.0)
		var c: Array = couple[i]
		var other := int(c[0])
		draw_circle(Vector2(x + 140.0, y), 26, COLORS[other])
		var sgn := int(c[1])
		var base := PI if sgn > 0 else 0.0
		draw_arc(Vector2(x + 140.0, y), 15, base, base + PI * 1.4, 12, IconPainter.INK, 4.0)
		var tip := Vector2(x + 140.0, y) + Vector2(cos(base + PI * 1.4), sin(base + PI * 1.4)) * 15.0
		draw_circle(tip, 5, IconPainter.INK)
