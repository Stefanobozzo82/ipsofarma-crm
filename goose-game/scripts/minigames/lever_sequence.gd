class_name LeverSequence
extends Minigame
## Sequenza di leve (livello 1): le lampade mostrano una sequenza, il giocatore la ripete
## tirando le leve nello stesso ordine. Il bottone-campana in alto la ripete.
## config: { "levers": 4, "sequence": [2, 0, 3] }

const COLORS: Array[Color] = [Color("c4472f"), Color("d1a84b"), Color("7b9650"), Color("5b8fa8"), Color("8e5ba8")]
const NOTES: Array[float] = [262.0, 330.0, 392.0, 523.0, 659.0]
const BASE_Y := 640.0

var n := 4
var sequence: Array[int] = []
var progress := 0
var lamp_on := -1
var angles: Array[float] = []   # 0 = leva su, 1 = leva giu
var showing := true
var flash := Color(0, 0, 0, 0)
var _run := 0


func _start() -> void:
	n = clampi(int(config.get("levers", 4)), 2, 5)
	sequence.clear()
	for v in config.get("sequence", [0, 1, 2]):
		sequence.append(int(v) % n)
	angles.clear()
	for i in n:
		angles.append(0.0)
	_play_sequence()


func lever_x(i: int) -> float:
	return PANEL.position.x + PANEL.size.x * float(i + 1) / float(n + 1)


func _sleep(seconds: float, run_id: int) -> bool:
	await get_tree().create_timer(seconds).timeout
	return is_inside_tree() and run_id == _run


func _play_sequence() -> void:
	_run += 1
	var rid := _run
	showing = true
	progress = 0
	queue_redraw()
	if not await _sleep(0.7, rid):
		return
	for idx in sequence:
		lamp_on = idx
		AudioManager.play_note(NOTES[idx])
		queue_redraw()
		if not await _sleep(0.55, rid):
			return
		lamp_on = -1
		queue_redraw()
		if not await _sleep(0.2, rid):
			return
	showing = false


func _content_click(pos: Vector2, _button: int) -> void:
	if pos.distance_to(Vector2(PANEL.get_center().x, PANEL.position.y + 90.0)) < 44.0:
		if not showing:
			_play_sequence()
		return
	if showing:
		return
	for i in n:
		if Rect2(lever_x(i) - 55.0, BASE_Y - 250.0, 110.0, 290.0).has_point(pos):
			_pull(i)
			return


func _set_angle(v: float, i: int) -> void:
	angles[i] = v
	queue_redraw()


func _pull(i: int) -> void:
	AudioManager.play_sfx("lever")
	AudioManager.play_note(NOTES[i])
	var tw := create_tween()
	tw.tween_method(_set_angle.bind(i), 0.0, 1.0, 0.12)
	tw.tween_interval(0.2)
	tw.tween_method(_set_angle.bind(i), 1.0, 0.0, 0.2)
	lamp_on = i
	queue_redraw()
	if i == sequence[progress]:
		progress += 1
		if progress >= sequence.size():
			_win()
		else:
			_clear_lamp()
	else:
		_fail()


func _clear_lamp() -> void:
	var rid := _run
	if await _sleep(0.35, rid):
		lamp_on = -1
		queue_redraw()


func _win() -> void:
	showing = true
	flash = Color(0.4, 1.0, 0.4, 0.18)
	AudioManager.play_sfx("win")
	queue_redraw()
	await get_tree().create_timer(1.0).timeout
	if is_inside_tree():
		finish(true)


func _fail() -> void:
	showing = true
	flash = Color(1.0, 0.25, 0.2, 0.2)
	AudioManager.play_sfx("buzz")
	queue_redraw()
	await get_tree().create_timer(0.9).timeout
	if is_inside_tree():
		flash = Color(0, 0, 0, 0)
		lamp_on = -1
		_play_sequence()


func _draw_content() -> void:
	# Bottone di ripetizione (campanella).
	var rc := Vector2(PANEL.get_center().x, PANEL.position.y + 90.0)
	draw_circle(rc, 44, Color("3a2a1e"))
	draw_arc(rc, 44, 0.0, TAU, 32, IconPainter.BRASS, 4.0)
	IconPainter.draw(self, "bell", rc, 62.0)
	for i in n:
		var x := lever_x(i)
		var col := COLORS[i]
		# Lampada.
		var lamp := Vector2(x, PANEL.position.y + 250.0)
		var lit := (lamp_on == i)
		if lit:
			draw_circle(lamp, 80, Color(col.r, col.g, col.b, 0.25))
		draw_circle(lamp, 50, Color("1a120d"))
		draw_circle(lamp, 42, col if lit else col.darkened(0.6))
		if lit:
			draw_circle(lamp + Vector2(-12, -12), 12, Color(1, 1, 1, 0.55))
		draw_arc(lamp, 50, 0.0, TAU, 32, IconPainter.BRASS_D, 5.0)
		# Leva: guida, base e asta che ruota attorno al perno.
		draw_rect(Rect2(x - 14, BASE_Y - 230, 28, 250), Color("15100c"))
		draw_rect(Rect2(x - 55, BASE_Y + 10, 110, 30), IconPainter.STEEL.darkened(0.3))
		var pivot := Vector2(x, BASE_Y - 40.0)
		var a := lerpf(-0.45, 0.45, angles[i])
		var tip := pivot + Vector2(sin(a), -cos(a)) * 170.0
		draw_line(pivot, tip, IconPainter.STEEL, 14.0, true)
		draw_circle(tip, 26, col)
		draw_circle(tip + Vector2(-8, -8), 8, Color(1, 1, 1, 0.4))
		draw_circle(pivot, 16, IconPainter.BRASS_D)
	# Avanzamento.
	for k in sequence.size():
		var p := Vector2(PANEL.get_center().x + (float(k) - float(sequence.size() - 1) * 0.5) * 50.0, PANEL.end.y - 50.0)
		draw_circle(p, 14, IconPainter.BRASS if k < progress else Color("15100c"))
		draw_arc(p, 14, 0.0, TAU, 16, IconPainter.BRASS_D, 3.0)
	if flash.a > 0.0:
		draw_rect(PANEL, flash)
