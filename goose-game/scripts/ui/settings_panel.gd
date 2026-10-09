class_name SettingsPanel
extends VBoxContainer
## Tre slider di volume (musica, effetti, ambiente) collegati ai bus di AudioManager.

const ROWS := [["Music", "Musica"], ["SFX", "Effetti"], ["Ambience", "Ambiente"]]


func _ready() -> void:
	add_theme_constant_override("separation", 14)
	for row in ROWS:
		var bus: String = row[0]
		var h := HBoxContainer.new()
		h.add_theme_constant_override("separation", 20)
		var label := Label.new()
		label.text = str(row[1])
		label.custom_minimum_size = Vector2(190, 0)
		h.add_child(label)
		var slider := HSlider.new()
		slider.min_value = 0.0
		slider.max_value = 1.0
		slider.step = 0.05
		slider.value = AudioManager.get_volume(bus)
		slider.custom_minimum_size = Vector2(380, 36)
		slider.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		slider.value_changed.connect(func(v: float) -> void:
			AudioManager.set_volume(bus, v)
			if bus == "SFX":
				AudioManager.play_sfx("click"))
		h.add_child(slider)
		add_child(h)
