class_name Pickup
extends Interactable
## Oggetto raccoglibile. Dati JSON: "item" (id oggetto, default = id), "pose" (opzionale:
## "neck" / "crouch" = posa richiesta per raggiungerlo). Sparisce quando il flag "got_<id>" e' attivo.
## Senza "interactions" nel JSON usa regole automatiche (raccogli, oppure fumetto con la posa giusta).


func refresh() -> void:
	enabled = GameState.evaluate(data.get("visible_if", {})) and not GameState.has_flag("got_" + id)
	visible = enabled
	queue_redraw()


func get_rules() -> Array:
	if data.has("interactions"):
		return data["interactions"]
	var item_id: String = str(data.get("item", id))
	var pose: String = str(data.get("pose", ""))
	var take: Array = [
		{"a": "flag", "flag": "got_" + id},
		{"a": "give", "item": item_id},
	]
	if pose == "":
		return [{"when": {}, "do": take}]
	return [
		{"when": {"pose": pose}, "do": take},
		{"when": {}, "do": [{"a": "bubble", "icons": [pose, item_id]}]},
	]


func _draw() -> void:
	if not enabled:
		return
	var lp := local_poly()
	if lp.size() < 3:
		return
	var b := DataUtil.bounds(lp)
	var c := b.get_center() + Vector2(0, sin(Time.get_ticks_msec() / 400.0) * 3.0)
	var tex: Texture2D = Assets.sprite(str(data.get("sprite", id)))
	if tex != null:
		draw_texture(tex, c - tex.get_size() * 0.5)
	else:
		# Alone morbido + icona dell'oggetto.
		var s := clampf(maxf(b.size.x, b.size.y), 50.0, 96.0)
		draw_circle(c, s * 0.62, Color(1.0, 0.85, 0.4, 0.16))
		draw_circle(c, s * 0.46, Color(0.12, 0.09, 0.07, 0.55))
		IconPainter.draw(self, str(data.get("item", id)), c, s * 0.82)
	draw_feedback()
