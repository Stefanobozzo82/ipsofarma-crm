class_name PipeMaze
extends Minigame
## Labirinto di tubi (livello 2): ruota i tratti di tubo (clic sinistro = orario, destro = antiorario)
## finche' l'acqua dall'ingresso a sinistra non arriva all'uscita a destra.
## config: { "kinds": ["LTILI", ...], "rot": [[0,1,2,3,1], ...], "entry_row": 1, "exit_row": 2 }
##   kinds: I = dritto, L = curva, T = a T, X = incrocio, . = vuoto.  rot: rotazioni iniziali (0..3).

const N := 1
const E := 2
const S := 4
const W := 8
const BASE := {"I": 5, "L": 3, "T": 14, "X": 15}  # aperture a rotazione 0 (N=1, E=2, S=4, W=8)
const DIRS := [[N, Vector2i(0, -1), S], [E, Vector2i(1, 0), W], [S, Vector2i(0, 1), N], [W, Vector2i(-1, 0), E]]

var kinds: Array[String] = []
var rots: Array = []        # righe di int
var vis: Array = []         # righe di float (rotazione animata, in quarti di giro)
var entry_row := 0
var exit_row := 0
var tile := 140.0
var origin := Vector2.ZERO
var reached: Dictionary = {}
var solved := false


## Maschera delle aperture di un tratto ruotato di `rot` quarti di giro in senso orario.
static func openings(kind: String, rot: int) -> int:
	var m: int = BASE.get(kind, 0)
	for _i in posmod(rot, 4):
		m = ((m << 1) | (m >> 3)) & 15
	return m


## Propaga l'acqua dall'ingresso. Ritorna { "reached": {Vector2i: true}, "solved": bool }.
static func flood(p_kinds: Array, p_rots: Array, p_entry_row: int, p_exit_row: int) -> Dictionary:
	var rows := p_kinds.size()
	var cols := str(p_kinds[0]).length()
	var seen: Dictionary = {}
	var ok := false
	var start := Vector2i(0, p_entry_row)
	if openings(str(p_kinds[start.y])[start.x], int(p_rots[start.y][start.x])) & W == 0:
		return {"reached": seen, "solved": false}
	var stack: Array[Vector2i] = [start]
	seen[start] = true
	while not stack.is_empty():
		var c: Vector2i = stack.pop_back()
		var m := openings(str(p_kinds[c.y])[c.x], int(p_rots[c.y][c.x]))
		for d in DIRS:
			if m & int(d[0]) == 0:
				continue
			var nb: Vector2i = c + (d[1] as Vector2i)
			if nb.x < 0 or nb.y < 0 or nb.x >= cols or nb.y >= rows:
				if int(d[0]) == E and c.x == cols - 1 and c.y == p_exit_row:
					ok = true
				continue
			if seen.has(nb):
				continue
			var nm := openings(str(p_kinds[nb.y])[nb.x], int(p_rots[nb.y][nb.x]))
			if nm & int(d[2]) != 0:
				seen[nb] = true
				stack.append(nb)
	return {"reached": seen, "solved": ok}


func _start() -> void:
	kinds.clear()
	for k in config.get("kinds", ["I"]):
		kinds.append(str(k))
	rots.clear()
	vis.clear()
	var rot_cfg: Array = config.get("rot", [])
	for y in kinds.size():
		var row: Array = []
		var vrow: Array = []
		for x in kinds[y].length():
			var r := 0
			if y < rot_cfg.size() and x < (rot_cfg[y] as Array).size():
				r = int(rot_cfg[y][x])
			row.append(r)
			vrow.append(float(r))
		rots.append(row)
		vis.append(vrow)
	entry_row = int(config.get("entry_row", 0))
	exit_row = int(config.get("exit_row", kinds.size() - 1))
	var rows := kinds.size()
	var cols := kinds[0].length()
	tile = minf(150.0, 520.0 / float(rows))
	origin = Vector2(PANEL.get_center().x - tile * float(cols) * 0.5, PANEL.position.y + 130.0)
	_update_flow()


func _process(delta: float) -> void:
	var moving := false
	for y in vis.size():
		for x in (vis[y] as Array).size():
			var target := float(rots[y][x])
			var cur: float = vis[y][x]
			if absf(cur - target) > 0.01:
				vis[y][x] = move_toward(cur, target, delta * 9.0)
				moving = true
	if moving:
		queue_redraw()


func _update_flow() -> void:
	var res := flood(kinds, rots, entry_row, exit_row)
	reached = res["reached"]
	solved = res["solved"]
	queue_redraw()
	if solved:
		_win()


func _win() -> void:
	AudioManager.play_sfx("splash")
	await get_tree().create_timer(1.1).timeout
	if is_inside_tree():
		finish(true)


func _content_click(pos: Vector2, button: int) -> void:
	if solved:
		return
	var cell := Vector2i(floori((pos.x - origin.x) / tile), floori((pos.y - origin.y) / tile))
	if cell.y < 0 or cell.y >= kinds.size() or cell.x < 0 or cell.x >= kinds[0].length():
		return
	if kinds[cell.y][cell.x] == ".":
		return
	rots[cell.y][cell.x] = int(rots[cell.y][cell.x]) + (-1 if button == MOUSE_BUTTON_RIGHT else 1)
	AudioManager.play_sfx("lever")
	_update_flow()


func _draw_content() -> void:
	var water := Color("5fa8c0")
	var dry := IconPainter.BRASS_D
	var cols := kinds[0].length() if not kinds.is_empty() else 0
	for y in kinds.size():
		for x in cols:
			var tl := origin + Vector2(float(x), float(y)) * tile
			draw_rect(Rect2(tl + Vector2(3, 3), Vector2(tile - 6, tile - 6)), Color("1a120d"))
			draw_rect(Rect2(tl + Vector2(3, 3), Vector2(tile - 6, tile - 6)), Color("3a2a1e"), false, 3.0)
			var kind := kinds[y][x]
			if kind == ".":
				continue
			var wet := reached.has(Vector2i(x, y))
			var c := tl + Vector2(tile, tile) * 0.5
			draw_set_transform(c, float(vis[y][x]) * PI * 0.5, Vector2.ONE)
			var m: int = BASE.get(kind, 0)
			for d in DIRS:
				if m & int(d[0]) != 0:
					var v := Vector2(float((d[1] as Vector2i).x), float((d[1] as Vector2i).y))
					draw_line(Vector2.ZERO, v * tile * 0.5, dry.lightened(0.15), tile * 0.24)
					if wet:
						draw_line(Vector2.ZERO, v * tile * 0.5, water, tile * 0.14)
			draw_circle(Vector2.ZERO, tile * 0.15, water if wet else dry.lightened(0.3))
			draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
	# Ingresso (sempre pieno d'acqua) e uscita.
	var ey := origin.y + (float(entry_row) + 0.5) * tile
	draw_line(Vector2(origin.x - 90.0, ey), Vector2(origin.x, ey), dry.lightened(0.15), tile * 0.24)
	draw_line(Vector2(origin.x - 90.0, ey), Vector2(origin.x, ey), water, tile * 0.14)
	IconPainter.draw(self, "valve", Vector2(origin.x - 120.0, ey), 70.0)
	var xx := origin.x + tile * float(cols)
	var oy := origin.y + (float(exit_row) + 0.5) * tile
	draw_line(Vector2(xx, oy), Vector2(xx + 90.0, oy), dry.lightened(0.15), tile * 0.24)
	if solved:
		draw_line(Vector2(xx, oy), Vector2(xx + 90.0, oy), water, tile * 0.14)
	IconPainter.draw(self, "boat", Vector2(xx + 130.0, oy), 64.0)
