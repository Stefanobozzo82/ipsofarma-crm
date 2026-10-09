class_name GooseVisual
extends Node2D
## Aspetto di un'oca: parti separate (Polygon2D) animate da AnimationPlayer.
## Origine = punto tra le zampe, a terra; l'oca guarda verso +X.
##
## Sostituzione con sprite veri (tutti in assets/sprites/, vedi README):
##   <prefisso>.png                    un solo sprite per tutta l'oca (piedi sull'origine)
##   <prefisso>_body / _wing / _neck / _head / _foot .png   sprite per singola parte
## <prefisso> e' "goose" per il protagonista, "npc_<id>" per i personaggi.

const NECK_LEN := 48.0
const LEG_LEN := 44.0

## 0..1: quanto e' allungato il collo (animato da AnimationPlayer "neck_stretch").
var neck_ext: float = 0.0:
	set(v):
		neck_ext = v
		_apply_pose()
## 0..1: quanto e' abbassata (animato da AnimationPlayer "crouch_down").
var crouch_amt: float = 0.0:
	set(v):
		crouch_amt = v
		_apply_pose()

var palette: Dictionary = {}
var accessory := ""
var sprite_prefix := "goose"
var voice := 0

var rig: Node2D
var body: Node2D
var wing: Node2D
var neck_pivot: Node2D
var neck: Node2D
var head: Node2D
var beak_low: Node2D
var leg_l: Node2D
var leg_r: Node2D
var anim_loco: AnimationPlayer
var anim_act: AnimationPlayer
var anim_neck: AnimationPlayer
var anim_crouch: AnimationPlayer

var _full: Sprite2D
var _built := false


func setup(p_palette: Dictionary, p_accessory: String, p_prefix: String, p_voice: int = 0) -> void:
	var defaults := {
		"body": "#dacfb2", "wing": "#b8a98a", "beak": "#d98b2b",
		"accent": "#6f8a4b", "eye": "#2b2118", "feet": "#c9792a",
	}
	palette = {}
	for k in defaults:
		palette[k] = DataUtil.color(p_palette.get(k, defaults[k]))
	accessory = p_accessory
	sprite_prefix = p_prefix
	voice = p_voice
	_build()


func _ready() -> void:
	play_idle()


# ------------------------------------------------------------------ costruzione

func _col(key: String) -> Color:
	return palette[key]


## Crea una parte: Sprite2D se esiste assets/sprites/<prefisso>_<chiave>.png, altrimenti Polygon2D.
func _part(part_name: String, pts: PackedVector2Array, col: Color, parent: Node2D, sprite_key: String = "") -> Node2D:
	if sprite_key != "":
		var tex: Texture2D = Assets.sprite("%s_%s" % [sprite_prefix, sprite_key])
		if tex != null:
			var sp := Sprite2D.new()
			sp.name = part_name
			sp.texture = tex
			sp.offset = DataUtil.bounds(pts).get_center()
			parent.add_child(sp)
			return sp
	var pg := Polygon2D.new()
	pg.name = part_name
	pg.polygon = pts
	pg.color = col
	parent.add_child(pg)
	return pg


func _has_sprite(sprite_key: String) -> bool:
	return Assets.sprite("%s_%s" % [sprite_prefix, sprite_key]) != null


func _node(node_name: String, parent: Node2D, pos: Vector2 = Vector2.ZERO) -> Node2D:
	var n := Node2D.new()
	n.name = node_name
	n.position = pos
	parent.add_child(n)
	return n


func _build() -> void:
	if _built:
		return
	var shadow := Polygon2D.new()
	shadow.name = "Shadow"
	shadow.polygon = DataUtil.ellipse(Vector2.ZERO, 56.0, 10.0)
	shadow.color = Color(0, 0, 0, 0.28)
	add_child(shadow)
	rig = _node("Rig", self)

	var full_tex: Texture2D = Assets.sprite(sprite_prefix)
	if full_tex != null:
		_full = Sprite2D.new()
		_full.name = "Full"
		_full.texture = full_tex
		_full.offset = Vector2(0, -full_tex.get_height() / 2.0)
		rig.add_child(_full)
	else:
		_build_parts()
	_build_animations()
	_built = true
	_apply_pose()


func _build_parts() -> void:
	# Zampe: agganciate all'anca, ruotano nella camminata.
	var leg_pts := PackedVector2Array([Vector2(-3, 0), Vector2(3, 0), Vector2(3, LEG_LEN), Vector2(-3, LEG_LEN)])
	var foot_pts := PackedVector2Array([Vector2(-6, LEG_LEN - 3), Vector2(16, LEG_LEN + 1), Vector2(-6, LEG_LEN + 4)])
	leg_l = _node("LegL", rig, Vector2(-14, -LEG_LEN))
	leg_r = _node("LegR", rig, Vector2(14, -LEG_LEN))
	for leg in [leg_l, leg_r]:
		_part("Leg", leg_pts, _col("feet"), leg, "")
		_part("Foot", foot_pts, _col("feet"), leg, "foot")
	# Corpo, coda e ala.
	body = _node("Body", rig, Vector2(0, -70))
	_part("Tail", PackedVector2Array([Vector2(-42, -6), Vector2(-74, -22), Vector2(-46, 12)]), _col("wing"), body, "")
	_part("BodyShape", DataUtil.ellipse(Vector2.ZERO, 50.0, 33.0), _col("body"), body, "body")
	wing = _part("Wing", DataUtil.ellipse(Vector2(-4, -2), 30.0, 17.0, 16), _col("wing"), body, "wing")
	if accessory == "apron":
		_part("Apron", PackedVector2Array([Vector2(-6, -22), Vector2(26, -14), Vector2(22, 28), Vector2(-10, 30)]), _col("accent"), body, "")
	# Collo e testa.
	neck_pivot = _node("NeckPivot", rig, Vector2(30, -86))
	neck = _part("Neck", PackedVector2Array([Vector2(-8, 0), Vector2(8, 0), Vector2(5.5, -NECK_LEN), Vector2(-5.5, -NECK_LEN)]), _col("body"), neck_pivot, "neck")
	if accessory == "scarf":
		_part("Scarf", PackedVector2Array([Vector2(-11, -2), Vector2(11, -2), Vector2(11, -15), Vector2(-11, -15)]), _col("accent"), neck_pivot, "")
	head = _node("Head", neck_pivot, Vector2(0, -NECK_LEN))
	var head_sprite := _has_sprite("head")
	_part("HeadShape", DataUtil.ellipse(Vector2.ZERO, 17.0, 13.0, 18), _col("body"), head, "head")
	if not head_sprite:
		_part("Beak", PackedVector2Array([Vector2(12, -5), Vector2(40, 2), Vector2(12, 6)]), _col("beak"), head, "")
		beak_low = _node("BeakLow", head, Vector2(12, 4))
		_part("BeakLowShape", PackedVector2Array([Vector2(0, -1), Vector2(24, 1), Vector2(0, 4)]), _col("beak").darkened(0.12), beak_low, "")
		_part("Eye", DataUtil.ellipse(Vector2(5, -4), 2.6, 2.6, 8), _col("eye"), head, "")
	else:
		beak_low = _node("BeakLow", head, Vector2(12, 4))
	_build_accessory()


func _build_accessory() -> void:
	match accessory:
		"hat":
			_part("Hat", PackedVector2Array([Vector2(-11, -14), Vector2(11, -14), Vector2(9, -38), Vector2(-9, -38)]), Color("2e2620"), head, "")
			_part("HatBrim", PackedVector2Array([Vector2(-17, -12), Vector2(17, -12), Vector2(17, -17), Vector2(-17, -17)]), Color("2e2620"), head, "")
		"goggles":
			_part("Goggles", DataUtil.ellipse(Vector2(5, -4), 7.5, 7.5, 12), Color("c9a14a"), head, "")
			_part("Lens", DataUtil.ellipse(Vector2(5, -4), 5.0, 5.0, 12), Color("7fb2c0"), head, "")
			_part("Strap", PackedVector2Array([Vector2(-16, -9), Vector2(-2, -9), Vector2(-2, -5), Vector2(-16, -5)]), Color("5a4630"), head, "")
		"glasses":
			_part("Glasses", DataUtil.ellipse(Vector2(6, -4), 6.5, 6.5, 12), Color("2b2118"), head, "")
			_part("GlassesIn", DataUtil.ellipse(Vector2(6, -4), 4.5, 4.5, 12), Color("d9e6e0"), head, "")
		"cap":
			_part("Cap", PackedVector2Array([Vector2(-14, -8), Vector2(14, -8), Vector2(10, -22), Vector2(-10, -22)]), _col("accent"), head, "")
			_part("CapBrim", PackedVector2Array([Vector2(8, -10), Vector2(26, -8), Vector2(8, -6)]), _col("accent").darkened(0.2), head, "")
		"bowler":
			_part("Dome", DataUtil.ellipse(Vector2(0, -16), 12.0, 11.0, 14), Color("1d1b20"), head, "")
			_part("Brim", PackedVector2Array([Vector2(-19, -11), Vector2(19, -11), Vector2(19, -15), Vector2(-19, -15)]), Color("1d1b20"), head, "")
		"bandana":
			_part("Bandana", PackedVector2Array([Vector2(-14, -6), Vector2(14, -6), Vector2(12, -14), Vector2(-12, -14)]), Color("a2332a"), head, "")


# ------------------------------------------------------------------ animazioni

func _track(anim: Animation, path: String, times: Array, values: Array, loop_wrap: bool = false) -> void:
	var t := anim.add_track(Animation.TYPE_VALUE)
	anim.track_set_path(t, NodePath(path))
	anim.track_set_interpolation_type(t, Animation.INTERPOLATION_CUBIC if values.size() > 2 else Animation.INTERPOLATION_LINEAR)
	anim.track_set_interpolation_loop_wrap(t, loop_wrap)
	for i in times.size():
		anim.track_insert_key(t, float(times[i]), values[i])


func _make_player(player_name: String, anims: Dictionary) -> AnimationPlayer:
	var p := AnimationPlayer.new()
	p.name = player_name
	add_child(p)
	var lib := AnimationLibrary.new()
	for k in anims:
		lib.add_animation(k, anims[k])
	p.add_animation_library("", lib)
	return p


func _new_anim(length: float, looped: bool) -> Animation:
	var a := Animation.new()
	a.length = length
	a.loop_mode = Animation.LOOP_LINEAR if looped else Animation.LOOP_NONE
	return a


func _build_animations() -> void:
	var parts := _full == null
	# --- idle: respiro lento
	var idle := _new_anim(2.4, true)
	_track(idle, "Rig:position", [0.0, 1.2, 2.4], [Vector2(0, 0), Vector2(0, -2.5), Vector2(0, 0)], true)
	if parts:
		_track(idle, "Rig/Body/Wing:rotation", [0.0, 1.2, 2.4], [0.0, 0.04, 0.0], true)
	# --- walk: dondolio + zampe alternate
	var walk := _new_anim(0.56, true)
	_track(walk, "Rig:position", [0.0, 0.14, 0.28, 0.42, 0.56], [Vector2(0, 0), Vector2(0, -7), Vector2(0, 0), Vector2(0, -7), Vector2(0, 0)], true)
	_track(walk, "Rig:rotation", [0.0, 0.14, 0.28, 0.42, 0.56], [0.0, 0.05, 0.0, -0.05, 0.0], true)
	if parts:
		_track(walk, "Rig/LegL:rotation", [0.0, 0.14, 0.28, 0.42, 0.56], [0.5, 0.0, -0.5, 0.0, 0.5], true)
		_track(walk, "Rig/LegR:rotation", [0.0, 0.14, 0.28, 0.42, 0.56], [-0.5, 0.0, 0.5, 0.0, -0.5], true)
		_track(walk, "Rig/Body/Wing:rotation", [0.0, 0.28, 0.56], [0.0, -0.1, 0.0], true)
	# --- honk: becco che si apre + sobbalzo
	var honk := _new_anim(0.55, false)
	_track(honk, "Rig:scale", [0.0, 0.08, 0.3, 0.55], [Vector2(1, 1), Vector2(1.06, 0.95), Vector2(0.97, 1.04), Vector2(1, 1)])
	if parts:
		_track(honk, "Rig/NeckPivot/Head/BeakLow:rotation", [0.0, 0.08, 0.35, 0.45, 0.55], [0.0, 0.6, 0.6, 0.1, 0.0])
	# --- collo che si allunga
	var stretch := _new_anim(0.5, false)
	_track(stretch, ":neck_ext", [0.0, 0.5], [0.0, 1.0])
	# --- abbassarsi
	var crouch := _new_anim(0.35, false)
	_track(crouch, ":crouch_amt", [0.0, 0.35], [0.0, 1.0])
	anim_loco = _make_player("AnimLoco", {"idle": idle, "walk": walk})
	anim_act = _make_player("AnimAct", {"honk": honk})
	anim_neck = _make_player("AnimNeck", {"neck_stretch": stretch})
	anim_crouch = _make_player("AnimCrouch", {"crouch_down": crouch})


func play_idle() -> void:
	if anim_loco != null and anim_loco.current_animation != "idle":
		anim_loco.play("idle")


func play_walk() -> void:
	if anim_loco != null and anim_loco.current_animation != "walk":
		anim_loco.play("walk")


func honk() -> void:
	if anim_act != null:
		anim_act.stop()
		anim_act.play("honk")
	AudioManager.honk(voice)


## Cambia posa: "normal", "neck" (collo allungato) o "crouch" (abbassata).
func set_pose(pose: String, instant: bool = false) -> void:
	var n_target := 1.0 if pose == "neck" else 0.0
	var c_target := 1.0 if pose == "crouch" else 0.0
	if instant or anim_neck == null:
		if anim_neck != null:
			anim_neck.stop()
			anim_crouch.stop()
		neck_ext = n_target
		crouch_amt = c_target
		return
	if n_target > neck_ext:
		anim_neck.play("neck_stretch")
	elif n_target < neck_ext:
		anim_neck.play_backwards("neck_stretch")
	if c_target > crouch_amt:
		anim_crouch.play("crouch_down")
	elif c_target < crouch_amt:
		anim_crouch.play_backwards("crouch_down")


## Guarda a destra (dir > 0) o a sinistra (dir < 0).
func face(dir: float) -> void:
	if absf(dir) < 0.01:
		return
	scale.x = -1.0 if dir < 0.0 else 1.0


## Altezza approssimativa della testa da terra (per ancorare i fumetti).
func head_height() -> float:
	return 150.0 + 110.0 * neck_ext - 55.0 * crouch_amt


func _apply_pose() -> void:
	if not _built:
		return
	if _full != null:
		# Con uno sprite unico: la posa e' simulata con deformazione.
		rig.scale = Vector2(1.0 + 0.1 * crouch_amt - 0.04 * neck_ext, 1.0 - 0.3 * crouch_amt + 0.25 * neck_ext)
		return
	var cr := crouch_amt
	var ext := neck_ext
	var leg_scale := 1.0 - 0.6 * cr
	var hip_y := -LEG_LEN * leg_scale
	leg_l.scale.y = leg_scale
	leg_r.scale.y = leg_scale
	leg_l.position.y = hip_y
	leg_r.position.y = hip_y
	body.position = Vector2(0, -70.0 + (LEG_LEN * 0.6) * cr)
	neck_pivot.position = Vector2(30, -86.0 + (LEG_LEN * 0.6) * cr)
	neck_pivot.rotation = deg_to_rad(lerpf(24.0, 0.0, ext)) + deg_to_rad(62.0) * cr
	neck.scale.y = 1.0 + 2.4 * ext - 0.3 * cr
	head.position = Vector2(0, -NECK_LEN * neck.scale.y)
	head.rotation = -neck_pivot.rotation * 0.75
