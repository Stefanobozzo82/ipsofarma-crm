extends Node3D
## Prototipo di Fio in Godot 4: carica i livelli esportati dalla versione web (glTF + JSON),
## crea collisioni, monete, Scintille, Nebbioli e passaggi tra Isola, Sala delle Mappe e Vulcano.

const PlayerScript := preload("res://scripts/player.gd")
const CameraScript := preload("res://scripts/camera_rig.gd")

var player: CharacterBody3D
var rig: Node3D
var level: Node3D
var data := {}
var level_id := ""
var env: Environment
var sun: DirectionalLight3D
var props := {}

var coins := []      # {node, red}
var stars := []      # {node, id, name, hidden, taken}
var enemies := []    # {node, home, home_r, dir, turn_t, alive, dead, feet}
var movers := []     # {body, base, axis, amp, period, phase}
var maps := []
var t := 0.0
var busy := false
var msg_t := 0.0

# HUD
var hud: CanvasLayer
var lbl_stars: Label
var lbl_coins: Label
var lbl_red: Label
var lbl_hp: Label
var lbl_lives: Label
var banner: Label
var banner_t := 0.0
var fade: ColorRect
var pause_lbl: Label


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	_setup_world()
	_setup_hud()
	_load_props()
	player = CharacterBody3D.new()
	player.set_script(PlayerScript)
	player.process_mode = Node.PROCESS_MODE_PAUSABLE
	add_child(player)
	player.pounded.connect(_on_pound)
	player.punched.connect(_on_punch)
	player.died.connect(_on_died)
	rig = Node3D.new()
	rig.set_script(CameraScript)
	rig.process_mode = Node.PROCESS_MODE_PAUSABLE
	add_child(rig)
	rig.target = player
	rig.arm.add_excluded_object(player.get_rid())
	load_level("island", "")
	if "--autotest" in OS.get_cmdline_user_args():
		var at := Node.new()
		at.set_script(load("res://scripts/autotest.gd"))
		get_tree().root.add_child.call_deferred(at)


# ---------- mondo ----------
func _setup_world() -> void:
	env = Environment.new()
	env.background_mode = Environment.BG_SKY
	var sky := Sky.new()
	sky.sky_material = ProceduralSkyMaterial.new()
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.tonemap_mode = Environment.TONE_MAPPER_LINEAR
	env.glow_enabled = true
	env.glow_bloom = 0.15
	env.fog_enabled = true
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)
	sun = DirectionalLight3D.new()
	sun.shadow_enabled = true
	sun.directional_shadow_max_distance = 90.0
	sun.rotation_degrees = Vector3(-52, 35, 0)
	add_child(sun)


func _hex(v) -> Color:
	var i := int(v)
	return Color8((i >> 16) & 255, (i >> 8) & 255, i & 255)


func _load_props() -> void:
	var sc: Node3D = (load("res://assets/models/props.glb") as PackedScene).instantiate()
	for n in ["scintilla", "coin", "gem", "nebbiolo"]:
		var node := sc.find_child(n, true, false)
		if node:
			node.get_parent().remove_child(node)
			node.position = Vector3.ZERO
			props[n] = node
	for n in props.values():
		Game.fix_visuals(n)
	sc.free()


## tutte le facce di un nodo (e figli) trasformate dalla matrice data
func _faces(node: Node3D, xf: Transform3D) -> PackedVector3Array:
	var out := PackedVector3Array()
	var list: Array = node.find_children("*", "MeshInstance3D", true, false)
	if node is MeshInstance3D:
		list.append(node)
	for mi in list:
		var rel: Transform3D = xf * (node.global_transform.affine_inverse() * mi.global_transform) if mi != node else xf
		for v in mi.mesh.get_faces():
			out.append(rel * v)
	return out


func load_level(id: String, entry: String) -> void:
	busy = true
	if level:
		level.queue_free()
		await get_tree().process_frame
	level_id = id
	data = JSON.parse_string(FileAccess.get_file_as_string("res://assets/levels/%s.json" % id))
	level = Node3D.new()
	level.name = "Level"
	add_child(level)
	coins.clear(); stars.clear(); enemies.clear(); movers.clear(); maps.clear()
	Game.reset_level_counters()

	# grafica
	var vis: Node3D = (load("res://assets/levels/%s.glb" % id) as PackedScene).instantiate()
	level.add_child(vis)
	Game.fix_visuals(vis)
	# collisioni: una sola forma statica + i piani mobili
	var colsc: Node3D = (load("res://assets/levels/%s_col.glb" % id) as PackedScene).instantiate()
	level.add_child(colsc)
	var faces := PackedVector3Array()
	for child in colsc.get_children():
		if not child is Node3D:
			continue
		if child.name.begins_with("mover_"):
			continue
		faces.append_array(_faces(child, child.global_transform))
	var sb := StaticBody3D.new()
	var cs := CollisionShape3D.new()
	var shape := ConcavePolygonShape3D.new()
	shape.set_faces(faces)
	shape.backface_collision = true
	cs.shape = shape
	sb.add_child(cs)
	level.add_child(sb)
	for i in data.get("movers", []).size():
		var md: Dictionary = data.movers[i]
		var body := AnimatableBody3D.new()
		var base := Vector3(md.base[0], md.base[1], md.base[2])
		level.add_child(body)
		body.global_position = base
		var cnode: Node3D = colsc.find_child("mover_%d" % i, true, false)
		if cnode:
			var mshape := ConcavePolygonShape3D.new()
			mshape.backface_collision = true
			var basis_only := Transform3D(cnode.global_transform.basis, Vector3.ZERO)
			mshape.set_faces(_faces(cnode, basis_only))
			var mcs := CollisionShape3D.new()
			mcs.shape = mshape
			body.add_child(mcs)
		var vnode: Node3D = vis.find_child("mover_%d" % i, true, false)
		if vnode:
			var keep := vnode.global_transform
			vnode.get_parent().remove_child(vnode)
			body.add_child(vnode)
			vnode.global_transform = Transform3D(keep.basis, base)
		movers.append({"body": body, "base": base, "axis": Vector3(md.axis[0], md.axis[1], md.axis[2]), "amp": md.amp, "period": md.period, "phase": md.phase})
	colsc.queue_free()

	# luce, cielo e nebbia del mondo
	var skyc := _hex(data.sky)
	var skym: ProceduralSkyMaterial = env.sky.sky_material
	skym.sky_top_color = skyc.darkened(0.15)
	skym.sky_horizon_color = skyc.lerp(Color.WHITE, 0.35)
	skym.ground_horizon_color = skym.sky_horizon_color
	skym.ground_bottom_color = skyc.darkened(0.5)
	env.fog_light_color = skyc.lerp(Color.WHITE, 0.3)
	env.fog_density = 0.45 / max(40.0, float(data.get("fogFar", 300)))
	var hemi: Array = data.get("hemi", [0xffffff, 0x888888, 1.0])
	env.ambient_light_color = _hex(hemi[0]).lerp(_hex(hemi[1]), 0.4)
	env.ambient_light_energy = float(hemi[2]) * 0.55
	var sd: Array = data.get("sun", [0xffffff, 1.0])
	sun.light_color = _hex(sd[0])
	sun.light_energy = float(sd[1]) * 0.95

	# monete, gemme rosse, Scintille, Nebbioli
	for c in data.get("coins", []):
		_add_coin(Vector3(c.p[0], c.p[1], c.p[2]), c.red)
	for s in data.get("stars", []):
		var n: Node3D = props["scintilla"].duplicate()
		level.add_child(n)
		n.global_position = Vector3(s.p[0], s.p[1], s.p[2])
		n.scale = Vector3.ONE * 0.9
		var hidden: bool = s.hidden
		n.visible = not hidden
		if Game.has_star(id, s.id):
			n.transparency = 0.6
		stars.append({"node": n, "id": s.id, "name": s.name, "hidden": hidden, "taken": false})
	for e in data.get("enemies", []):
		var en: Node3D = props["nebbiolo"].duplicate()
		level.add_child(en)
		var p := Vector3(e.p[0], e.p[1], e.p[2])
		en.global_position = p
		enemies.append({"node": en, "pos": p, "home": p, "home_r": float(e.homeR), "dir": randf() * TAU, "turn_t": 0.0, "alive": true, "dead": 0.0, "vy": 0.0})
	if data.has("maps"):
		for m in data.maps:
			maps.append({"id": m.id, "name": m.name, "need": int(m.need), "top": Vector3(m.top[0], m.top[1], m.top[2]), "wall": m.wall, "cool": 0.0})

	# dove compare Fio
	var sp: Dictionary = data.spawn
	if entry != "" and data.entries.has(entry):
		sp = data.entries[entry]
	player.place(Vector3(sp.pos[0], sp.pos[1], sp.pos[2]), float(sp.yaw))
	player.hp = 8
	rig.snap_behind(player.facing)
	if data.has("maps"):
		rig.yaw = player.facing + PI
	_show_banner(data.name, 2.2)
	_hud()
	var tw := create_tween()
	tw.tween_property(fade, "color:a", 0.0, 0.35)
	busy = false


func _add_coin(p: Vector3, red: bool) -> void:
	var n: Node3D = props["gem" if red else "coin"].duplicate()
	level.add_child(n)
	n.global_position = p
	coins.append({"node": n, "red": red})


func change_level(id: String, entry: String) -> void:
	if busy:
		return
	busy = true
	player.frozen = true
	var tw := create_tween()
	tw.tween_property(fade, "color:a", 1.0, 0.3)
	await tw.finished
	await load_level(id, entry)
	player.frozen = false


# ---------- ciclo di gioco ----------
func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("pause"):
		get_tree().paused = not get_tree().paused
		pause_lbl.visible = get_tree().paused


func _physics_process(dt: float) -> void:
	if get_tree().paused or busy or not level:
		return
	t += dt
	msg_t -= dt
	for m in movers:
		var off: float = sin(t / m.period * TAU + m.phase) * m.amp
		m.body.global_position = m.base + m.axis * off
	var pp: Vector3 = player.global_position
	var center := pp + Vector3.UP * 0.8
	for c in coins:
		var n: Node3D = c.node
		if not n.visible:
			continue
		n.rotation.y = t * 3.0
		if n.global_position.distance_to(center) < 1.5:
			n.visible = false
			if c.red:
				Game.red += 1; Game.coins += 2
				if Game.red == int(data.get("redTotal", 8)):
					_reveal("rosse")
			else:
				Game.coins += 1
			if Game.coins >= Game.next_life:
				Game.next_life += 50; Game.lives += 1; _show_banner("Vita extra!", 1.4)
			if Game.coins >= 100:
				_reveal("cento", pp + Vector3.UP * 3.0)
			_hud()
	for s in stars:
		if s.taken or s.hidden:
			continue
		var n: Node3D = s.node
		n.rotation.y = t * 1.6
		if n.global_position.distance_to(center) < 1.7:
			s.taken = true
			n.visible = false
			player.hp = 8
			if Game.add_star(level_id, s.id):
				_show_banner("Scintilla!\n%s · %d su %d" % [s.name, Game.star_count(), Game.TOTAL_STARS], 2.6)
			else:
				_show_banner("Scintilla già presa\n%s" % s.name, 2.0)
			_hud()
	_update_enemies(dt)
	_update_triggers()
	# pericoli: lava e cadute
	var hz = data.get("hazardY")
	if hz != null and pp.y <= float(hz) + 0.02:
		player.velocity.y = 21.0
		player.velocity.x *= 0.3; player.velocity.z *= 0.3
		player.global_position.y = float(hz) + 0.05
		player.hp = max(0, player.hp - 3)
		player.inv = 0.6
		_hud()
		if player.hp <= 0:
			_on_died()
	if pp.y < float(data.get("deathY", -10)):
		_on_died()
	if banner_t > 0.0:
		banner_t -= dt
		banner.modulate.a = clampf(banner_t * 2.0, 0.0, 1.0)
	_hud()


func _reveal(id: String, at = null) -> void:
	for s in stars:
		if s.id == id and s.hidden:
			s.hidden = false
			s.node.visible = true
			if at != null:
				s.node.global_position = at
			_show_banner("È apparsa una Scintilla!", 2.2)


func _update_enemies(dt: float) -> void:
	var pp: Vector3 = player.global_position
	var space := get_world_3d().direct_space_state
	for e in enemies:
		var n: Node3D = e.node
		if not e.alive:
			if e.dead > 0.0:
				e.dead -= dt
				n.scale = Vector3(1.0 + (0.4 - e.dead), max(0.05, e.dead * 2.5), 1.0 + (0.4 - e.dead))
				if e.dead <= 0.0:
					n.visible = false
			continue
		var to_p: Vector3 = pp - e.pos
		to_p.y = 0
		var spd := 2.0
		if to_p.length() < 8.0 and abs(pp.y - e.pos.y) < 3.0:
			e.dir = lerp_angle(e.dir, atan2(to_p.x, to_p.z), 1.0 - exp(-4.0 * dt))
			spd = 3.6
		else:
			e.turn_t -= dt
			if e.turn_t <= 0.0:
				e.turn_t = 1.5 + randf() * 2.0
				e.dir += randf_range(-1.5, 1.5)
			var home: Vector3 = e.home - e.pos
			home.y = 0
			if home.length() > e.home_r:
				e.dir = atan2(home.x, home.z)
		var np: Vector3 = e.pos + Vector3(sin(e.dir), 0, cos(e.dir)) * spd * dt
		# resta a terra: raggio verso il basso
		var q := PhysicsRayQueryParameters3D.create(np + Vector3.UP * 1.5, np + Vector3.DOWN * 3.0)
		q.exclude = [player.get_rid()]
		var hit := space.intersect_ray(q)
		if hit and hit.position.y < e.pos.y + 0.8:
			np.y = hit.position.y
			e.pos = np
		else:
			e.dir += PI * 0.5
		n.global_position = e.pos + Vector3.UP * abs(sin(t * 8.0)) * 0.12
		n.rotation.y = e.dir
		# contatto con Fio
		var d := Vector2(pp.x - e.pos.x, pp.z - e.pos.z).length()
		if d < 1.1 and pp.y < e.pos.y + 1.4 and pp.y + 1.6 > e.pos.y:
			if (player.velocity.y < 0.0 and pp.y > e.pos.y + 0.55) or player.pound or player.dive:
				_kill(e)
				player.bounce(13.0)
			else:
				player.hurt(e.pos)
				_hud()


func _kill(e: Dictionary) -> void:
	e.alive = false
	e.dead = 0.4
	_add_coin(e.pos + Vector3.UP, false)


func _on_pound(pos: Vector3) -> void:
	for e in enemies:
		if e.alive and Vector2(e.pos.x - pos.x, e.pos.z - pos.z).length() < 3.4 and abs(e.pos.y - pos.y) < 1.6:
			_kill(e)


func _on_punch(pos: Vector3, f: float) -> void:
	var fwd := Vector3(sin(f), 0, cos(f))
	for e in enemies:
		if not e.alive:
			continue
		var d: Vector3 = e.pos - pos
		d.y = 0
		if d.length() < 2.1 and abs(e.pos.y - pos.y) < 1.2 and d.normalized().dot(fwd) > 0.3:
			_kill(e)


func _on_died() -> void:
	if busy:
		return
	Game.lives = max(0, Game.lives - 1)
	if Game.lives == 0:
		Game.lives = 4
		_show_banner("Game over\nSi riparte con 4 vite", 2.4)
	else:
		_show_banner("Riprova!", 1.6)
	change_level(level_id, "")


func _update_triggers() -> void:
	var pp: Vector3 = player.global_position
	for d in data.get("doors", []):
		if pp.x > d.x0 and pp.x < d.x1 and pp.z > d.z0 - 0.4 and pp.z < d.z1 + 0.4 and pp.y < 2.0:
			change_level(d.to, d.entry)
			return
	for p in data.get("portals", []):
		var pos := Vector3(p.p[0], p.p[1] + 1.5, p.p[2])
		if pos.distance_to(pp + Vector3.UP * 0.8) < 1.6:
			if p.to in Game.PORTED and Game.star_count() >= int(p.need):
				change_level(p.to, p.entry if p.entry != null else "")
				return
			elif msg_t <= 0.0:
				msg_t = 2.5
				_show_banner("Vortice chiuso\nQuesto mondo non è ancora nel prototipo Godot", 2.2)
	if level_id == "castle":
		if abs(pp.x) < 1.6 and pp.z > 19.1 and pp.y < 1.0:
			change_level("island", "door")
			return
		for m in maps:
			m.cool -= get_physics_process_delta_time()
			var top: Vector3 = m.top
			var hx := 1.4 if m.wall == "x" else 1.9
			var hzz := 1.9 if m.wall == "x" else 1.4
			if player.on_ground and abs(pp.x - top.x) < hx and abs(pp.z - top.z) < hzz and abs(pp.y - top.y) < 0.6 and m.cool <= 0.0:
				m.cool = 1.2
				if Game.star_count() < m.need:
					var out := Vector3(pp.x - top.x, 0, pp.z - top.z).normalized()
					player.velocity = out * 7.0 + Vector3.UP * 7.0
					player.lock_t = 0.35
					_show_banner("Mappa sigillata\nServono %d Scintille: ne hai %d" % [m.need, Game.star_count()], 2.2)
				elif m.id in Game.PORTED:
					change_level(m.id, "")
					return
				else:
					player.velocity = Vector3.UP * 8.0
					_show_banner("%s\nQuesto mondo arriverà nella versione Godot completa" % m.name, 2.4)


# ---------- HUD ----------
func _label(pos: Vector2, size: int, align := HORIZONTAL_ALIGNMENT_LEFT) -> Label:
	var l := Label.new()
	l.position = pos
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", Color(1, 0.97, 0.9))
	l.add_theme_color_override("font_outline_color", Color(0.09, 0.13, 0.24))
	l.add_theme_constant_override("outline_size", 8)
	l.horizontal_alignment = align
	hud.add_child(l)
	return l


func _setup_hud() -> void:
	hud = CanvasLayer.new()
	hud.process_mode = Node.PROCESS_MODE_ALWAYS
	add_child(hud)
	lbl_stars = _label(Vector2(24, 16), 30)
	lbl_coins = _label(Vector2(24, 56), 26)
	lbl_red = _label(Vector2(24, 92), 22)
	lbl_hp = _label(Vector2.ZERO, 28, HORIZONTAL_ALIGNMENT_RIGHT)
	_place(lbl_hp, 1.0, 1.0, -424.0, -24.0, 16.0, 56.0)
	lbl_lives = _label(Vector2.ZERO, 22, HORIZONTAL_ALIGNMENT_RIGHT)
	_place(lbl_lives, 1.0, 1.0, -424.0, -24.0, 56.0, 88.0)
	banner = _label(Vector2.ZERO, 46, HORIZONTAL_ALIGNMENT_CENTER)
	_place(banner, 0.0, 1.0, 24.0, -24.0, 150.0, 320.0)
	banner.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	banner.add_theme_color_override("font_color", Color(1, 0.81, 0.23))
	banner.modulate.a = 0.0
	pause_lbl = _label(Vector2.ZERO, 40, HORIZONTAL_ALIGNMENT_CENTER)
	_place(pause_lbl, 0.0, 1.0, 24.0, -24.0, 280.0, 420.0)
	pause_lbl.text = "Pausa\nEsc o Start per riprendere · F11 schermo intero"
	pause_lbl.visible = false
	fade = ColorRect.new()
	fade.color = Color(0.09, 0.13, 0.24, 1.0)
	fade.set_anchors_preset(Control.PRESET_FULL_RECT)
	fade.mouse_filter = Control.MOUSE_FILTER_IGNORE
	hud.add_child(fade)


## ancora un'etichetta in orizzontale (0 = sinistra, 1 = destra) con margini fissi in alto
func _place(c: Control, al: float, ar: float, ol: float, orr: float, ot: float, ob: float) -> void:
	c.anchor_left = al; c.anchor_right = ar; c.anchor_top = 0.0; c.anchor_bottom = 0.0
	c.offset_left = ol; c.offset_right = orr; c.offset_top = ot; c.offset_bottom = ob


func _exit_tree() -> void:
	for n in props.values():
		if is_instance_valid(n) and not n.is_inside_tree():
			n.free()


func _show_banner(text: String, sec: float) -> void:
	banner.text = text
	banner_t = sec


func _hud() -> void:
	lbl_stars.text = "Scintille %d/%d" % [Game.star_count(), Game.TOTAL_STARS]
	lbl_coins.text = "Monete %d" % Game.coins
	var rt := int(data.get("redTotal", 0)) if data else 0
	lbl_red.visible = rt > 0
	lbl_red.text = "Gemme rosse %d/%d" % [Game.red, rt]
	lbl_hp.text = "Lanterna %d/8" % player.hp if player else ""
	lbl_lives.text = "Fio ×%d" % Game.lives
