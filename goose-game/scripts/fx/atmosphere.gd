class_name Atmosphere
extends Node2D
## Effetti atmosferici di una scena, costruiti dal JSON:
##   "tint"   colore del CanvasModulate (luce ambiente)
##   "lights" [ {pos, color, energy, scale, flicker, glint} ]  -> PointLight2D (bagliori sull'ottone, lampade)
##   "fx"     [ {type: fog|steam|dust, rect|pos, amount, color, scale} ] -> GPUParticles2D

var _lights: Array[Dictionary] = []
var _time := 0.0
var _puff_tex: GradientTexture2D
var _light_tex: GradientTexture2D


func build(data: Dictionary) -> void:
	_puff_tex = _radial_texture(Color(1, 1, 1, 0.9), Color(1, 1, 1, 0.0), 128)
	_light_tex = _radial_texture(Color(1, 1, 1, 1), Color(0, 0, 0, 1), 256)
	var cm := CanvasModulate.new()
	cm.color = DataUtil.color(data.get("tint", "#b9ad9c"))
	add_child(cm)
	for raw in data.get("lights", []):
		_add_light(raw)
	for raw in data.get("fx", []):
		_add_fx(raw)


func _process(delta: float) -> void:
	_time += delta
	for l in _lights:
		var node: PointLight2D = l["node"]
		var f: float = l["flicker"]
		var wob := sin(_time * 7.0 + float(l["phase"])) * 0.5 + sin(_time * 13.0 + float(l["phase"]) * 2.3) * 0.5
		if bool(l["glint"]):
			# Scintilla breve e netta, come un riflesso su un pezzo d'ottone.
			wob = pow(maxf(0.0, sin(_time * 1.3 + float(l["phase"]))), 12.0) * 2.0 - 0.5
		node.energy = maxf(0.0, float(l["base"]) * (1.0 + f * wob))


func _radial_texture(inner: Color, outer: Color, size: int) -> GradientTexture2D:
	var g := Gradient.new()
	g.set_color(0, inner)
	g.set_color(1, outer)
	var t := GradientTexture2D.new()
	t.gradient = g
	t.fill = GradientTexture2D.FILL_RADIAL
	t.fill_from = Vector2(0.5, 0.5)
	t.fill_to = Vector2(1.0, 0.5)
	t.width = size
	t.height = size
	return t


func _add_light(d: Dictionary) -> void:
	var pl := PointLight2D.new()
	pl.texture = _light_tex
	pl.position = DataUtil.vec(d.get("pos", []))
	pl.color = DataUtil.color(d.get("color", "#ffcf80"))
	pl.energy = float(d.get("energy", 1.0))
	pl.texture_scale = float(d.get("scale", 3.0))
	add_child(pl)
	_lights.append({
		"node": pl, "base": pl.energy, "flicker": float(d.get("flicker", 0.0)),
		"glint": bool(d.get("glint", false)), "phase": randf() * TAU,
	})


func _fade_ramp() -> GradientTexture1D:
	var g := Gradient.new()
	g.offsets = PackedFloat32Array([0.0, 0.25, 0.75, 1.0])
	g.colors = PackedColorArray([Color(1, 1, 1, 0), Color(1, 1, 1, 1), Color(1, 1, 1, 1), Color(1, 1, 1, 0)])
	var t := GradientTexture1D.new()
	t.gradient = g
	return t


func _add_fx(d: Dictionary) -> void:
	var kind: String = str(d.get("type", "fog"))
	var p := GPUParticles2D.new()
	var m := ParticleProcessMaterial.new()
	m.color_ramp = _fade_ramp()
	m.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
	p.texture = _puff_tex
	p.local_coords = false
	var col := DataUtil.color(d.get("color", ""), Color(1, 1, 1, 0.2))
	match kind:
		"fog":
			var rect := Rect2(0, 560, 1920, 400)
			if d.has("rect"):
				var r: Array = d["rect"]
				rect = Rect2(float(r[0]), float(r[1]), float(r[2]), float(r[3]))
			p.position = rect.get_center()
			m.emission_box_extents = Vector3(rect.size.x * 0.5, rect.size.y * 0.5, 1.0)
			m.direction = Vector3(1, 0, 0)
			m.spread = 12.0
			m.initial_velocity_min = 12.0
			m.initial_velocity_max = 28.0
			m.gravity = Vector3.ZERO
			m.scale_min = 3.0
			m.scale_max = 6.0
			m.color = Color(col.r, col.g, col.b, col.a)
			p.amount = int(d.get("amount", 10))
			p.lifetime = 16.0
			p.z_index = 20
		"steam":
			p.position = DataUtil.vec(d.get("pos", []))
			var sc := float(d.get("scale", 1.0))
			m.emission_box_extents = Vector3(8.0, 4.0, 1.0)
			m.direction = Vector3(0, -1, 0)
			m.spread = 14.0
			m.initial_velocity_min = 50.0 * sc
			m.initial_velocity_max = 90.0 * sc
			m.gravity = Vector3(10, -12, 0)
			m.scale_min = 0.5 * sc
			m.scale_max = 1.0 * sc
			var curve := Curve.new()
			curve.add_point(Vector2(0, 0.35))
			curve.add_point(Vector2(1, 1.6))
			var ct := CurveTexture.new()
			ct.curve = curve
			m.scale_curve = ct
			m.color = Color(col.r, col.g, col.b, col.a * 1.6)
			p.amount = int(d.get("amount", 14))
			p.lifetime = 3.2
			p.z_index = 15
		_:  # dust: pulviscolo che fluttua per tutta la scena
			var rect2 := Rect2(0, 0, 1920, 1080)
			p.position = rect2.get_center()
			m.emission_box_extents = Vector3(960.0, 540.0, 1.0)
			m.direction = Vector3(1, -0.2, 0)
			m.spread = 180.0
			m.initial_velocity_min = 4.0
			m.initial_velocity_max = 14.0
			m.gravity = Vector3(0, 2, 0)
			m.scale_min = 0.03
			m.scale_max = 0.09
			m.color = Color(1.0, 0.92, 0.72, 0.7)
			p.amount = int(d.get("amount", 40))
			p.lifetime = 9.0
			p.z_index = 30
	p.process_material = m
	p.preprocess = p.lifetime
	add_child(p)
