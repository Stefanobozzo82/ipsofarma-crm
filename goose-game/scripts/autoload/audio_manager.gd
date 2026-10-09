extends Node
## Audio procedurale: musica ambient (AudioStreamGenerator), effetti "honk" e ambienti
## sintetizzati al volo (AudioStreamWAV). Tre bus separati: Music, SFX, Ambience.
## Autoload "AudioManager". Nessun file audio esterno e' necessario.

const RATE := 22050
const MUSIC_RATE := 11025
const BUSES: Array[String] = ["Music", "SFX", "Ambience"]
const SETTINGS_PATH := "user://settings.json"

## Atmosfere musicali: nota fondamentale (Hz), scala (semitoni) e pausa media tra le note (s).
const MOODS := {
	"menu": {"root": 110.0, "scale": [0, 3, 5, 7, 10], "gap": 1.4},
	"dump": {"root": 98.0, "scale": [0, 3, 5, 7, 10], "gap": 1.7},
	"canal": {"root": 110.0, "scale": [0, 2, 4, 7, 9], "gap": 1.3},
	"tower": {"root": 87.3, "scale": [0, 3, 5, 8, 10], "gap": 1.1},
	"finale": {"root": 98.0, "scale": [0, 4, 7, 9, 12], "gap": 0.8},
}

var volumes: Dictionary = {"Music": 0.6, "SFX": 0.8, "Ambience": 0.6}

var _cache: Dictionary = {}
var _sfx_pool: Array[AudioStreamPlayer] = []
var _music: AudioStreamPlayer
var _music_pb: AudioStreamGeneratorPlayback
var _amb: AudioStreamPlayer
var _amb_kind := ""
var _rng := RandomNumberGenerator.new()

# Stato del sintetizzatore musicale.
var _mood := "menu"
var _pad_root := 110.0
var _t := 0.0
var _p0 := 0.0
var _p1 := 0.0
var _p2 := 0.0
var _note_timer := 1.0
var _nv_freq := PackedFloat32Array([0.0, 0.0, 0.0, 0.0])
var _nv_age := PackedFloat32Array([-1.0, -1.0, -1.0, -1.0])
var _nv_ph := PackedFloat32Array([0.0, 0.0, 0.0, 0.0])
var _nv_next := 0


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	_rng.randomize()
	_load_settings()
	_setup_buses()
	for i in 8:
		var p := AudioStreamPlayer.new()
		p.bus = "SFX"
		add_child(p)
		_sfx_pool.append(p)
	_amb = AudioStreamPlayer.new()
	_amb.bus = "Ambience"
	add_child(_amb)
	_music = AudioStreamPlayer.new()
	_music.bus = "Music"
	var gen := AudioStreamGenerator.new()
	gen.mix_rate = MUSIC_RATE
	gen.buffer_length = 0.4
	_music.stream = gen
	add_child(_music)
	_music.play()
	_music_pb = _music.get_stream_playback() as AudioStreamGeneratorPlayback


func _process(_delta: float) -> void:
	_fill_music()


# ------------------------------------------------------------------ bus e volumi

func _setup_buses() -> void:
	for b in BUSES:
		if AudioServer.get_bus_index(b) == -1:
			AudioServer.add_bus()
			var idx := AudioServer.bus_count - 1
			AudioServer.set_bus_name(idx, b)
			AudioServer.set_bus_send(idx, "Master")
		_apply_volume(b)


func set_volume(bus: String, value: float) -> void:
	volumes[bus] = clampf(value, 0.0, 1.0)
	_apply_volume(bus)
	_save_settings()


func get_volume(bus: String) -> float:
	return float(volumes.get(bus, 1.0))


func _apply_volume(bus: String) -> void:
	var idx := AudioServer.get_bus_index(bus)
	if idx == -1:
		return
	var v: float = float(volumes.get(bus, 1.0))
	AudioServer.set_bus_mute(idx, v <= 0.001)
	AudioServer.set_bus_volume_db(idx, linear_to_db(maxf(v, 0.0001)))


func _load_settings() -> void:
	if not FileAccess.file_exists(SETTINGS_PATH):
		return
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(SETTINGS_PATH))
	if parsed is Dictionary:
		for b in BUSES:
			if parsed.has(b):
				volumes[b] = clampf(float(parsed[b]), 0.0, 1.0)


func _save_settings() -> void:
	var f := FileAccess.open(SETTINGS_PATH, FileAccess.WRITE)
	if f != null:
		f.store_string(JSON.stringify(volumes))
		f.close()


# ------------------------------------------------------------------ API pubblica

## Cambia atmosfera della musica ("menu", "dump", "canal", "tower", "finale").
func set_mood(mood: String) -> void:
	_mood = mood if MOODS.has(mood) else "dump"


## Cambia il loop ambientale: "wind", "water", "clock" oppure "" per silenzio.
func set_ambience(kind: String) -> void:
	if kind == _amb_kind:
		return
	_amb_kind = kind
	if kind == "":
		_amb.stop()
		return
	_amb.stream = _ambience_stream(kind)
	_amb.play()


## Effetto sonoro per nome: click, pickup, clank, drip, splash, creak, gate, bell, win, buzz, lever, tick, honk.
func play_sfx(sfx_name: String, pitch: float = 1.0, volume_db: float = 0.0) -> void:
	if sfx_name == "honk":
		honk(0)
		return
	_play_stream(_get_sfx(sfx_name), pitch, volume_db)


## Verso dell'oca. `voice` (0..2) sceglie il timbro; il pitch varia leggermente a ogni volta.
func honk(voice: int = 0) -> void:
	_play_stream(_get_sfx("honk_%d" % (voice % 3)), _rng.randf_range(0.92, 1.08), 0.0)


## Nota "pizzicata" (usata dai minigiochi).
func play_note(freq: float, volume_db: float = -4.0) -> void:
	var key := "note_%d" % int(freq)
	if not _cache.has(key):
		_cache[key] = _synth_note(freq)
	_play_stream(_cache[key], 1.0, volume_db)


func _play_stream(stream: AudioStream, pitch: float, volume_db: float) -> void:
	if stream == null:
		return
	var player: AudioStreamPlayer = _sfx_pool[0]
	for p in _sfx_pool:
		if not p.playing:
			player = p
			break
	player.stream = stream
	player.pitch_scale = pitch
	player.volume_db = volume_db
	player.play()


func _get_sfx(sfx_name: String) -> AudioStreamWAV:
	if not _cache.has(sfx_name):
		_cache[sfx_name] = _synth(sfx_name)
	return _cache[sfx_name]


# ------------------------------------------------------------------ musica

func _spawn_note(m: Dictionary) -> void:
	var scale_arr: Array = m["scale"]
	var semis: int = int(scale_arr[_rng.randi() % scale_arr.size()])
	var octave := 2.0 if _rng.randf() < 0.55 else 4.0
	var f: float = float(m["root"]) * octave * pow(2.0, float(semis) / 12.0)
	_nv_freq[_nv_next] = f
	_nv_age[_nv_next] = 0.0
	_nv_ph[_nv_next] = 0.0
	_nv_next = (_nv_next + 1) % 4
	_note_timer = float(m["gap"]) * _rng.randf_range(0.6, 1.5)


func _fill_music() -> void:
	if _music_pb == null:
		return
	var n: int = mini(_music_pb.get_frames_available(), 1024)
	if n <= 0:
		return
	var m: Dictionary = MOODS[_mood]
	_pad_root = lerpf(_pad_root, float(m["root"]), 0.01)
	var f0 := _pad_root
	var dt := 1.0 / float(MUSIC_RATE)
	var buf := PackedVector2Array()
	buf.resize(n)
	for i in n:
		_t += dt
		_note_timer -= dt
		if _note_timer <= 0.0:
			_spawn_note(m)
		_p0 += TAU * f0 * dt
		_p1 += TAU * f0 * 1.5 * (1.0 + 0.002 * sin(_t * 0.7)) * dt
		_p2 += TAU * f0 * 2.0 * (1.0 - 0.0025 * sin(_t * 0.5)) * dt
		var lfo := 0.7 + 0.3 * sin(_t * 0.31)
		var s := (sin(_p0) + 0.75 * sin(_p1) + 0.5 * sin(_p2)) * 0.10 * lfo
		for v in 4:
			var age := _nv_age[v]
			if age < 0.0:
				continue
			age += dt
			_nv_age[v] = age
			_nv_ph[v] += TAU * _nv_freq[v] * dt
			var env := exp(-age * 2.0) * minf(age * 40.0, 1.0)
			s += (sin(_nv_ph[v]) * 0.20 + sin(_nv_ph[v] * 2.0) * 0.05) * env
			if age > 3.0:
				_nv_age[v] = -1.0
		buf[i] = Vector2(s, s)
	if _p0 > 100000.0:
		_p0 = fmod(_p0, TAU)
		_p1 = fmod(_p1, TAU)
		_p2 = fmod(_p2, TAU)
	_music_pb.push_buffer(buf)


# ------------------------------------------------------------------ sintesi effetti

func _to_wav(samples: PackedFloat32Array, rate: int = RATE, loop: bool = false) -> AudioStreamWAV:
	var bytes := PackedByteArray()
	bytes.resize(samples.size() * 2)
	for i in samples.size():
		bytes.encode_s16(i * 2, int(clampf(samples[i], -1.0, 1.0) * 32000.0))
	var w := AudioStreamWAV.new()
	w.format = AudioStreamWAV.FORMAT_16_BITS
	w.mix_rate = rate
	w.stereo = false
	w.data = bytes
	if loop:
		w.loop_mode = AudioStreamWAV.LOOP_FORWARD
		w.loop_begin = 0
		w.loop_end = samples.size()
	return w


func _buf(duration: float, rate: int = RATE) -> PackedFloat32Array:
	var b := PackedFloat32Array()
	b.resize(int(duration * float(rate)))
	return b


func _synth(sfx_name: String) -> AudioStreamWAV:
	if sfx_name.begins_with("honk_"):
		return _synth_honk(int(sfx_name.substr(5)))
	var b: PackedFloat32Array
	var rng := RandomNumberGenerator.new()
	rng.seed = 1234
	match sfx_name:
		"click":
			b = _buf(0.06)
			for i in b.size():
				var t := float(i) / RATE
				b[i] = sin(TAU * 900.0 * t) * exp(-t * 60.0) * 0.5
		"pickup":
			b = _buf(0.26)
			var notes: Array[float] = [660.0, 880.0, 1320.0]
			for i in b.size():
				var t := float(i) / RATE
				var k := mini(int(t / 0.08), 2)
				var lt := t - float(k) * 0.08
				b[i] = sin(TAU * notes[k] * t) * exp(-lt * 14.0) * 0.45
		"clank":
			b = _buf(0.5)
			for i in b.size():
				var t := float(i) / RATE
				b[i] = (rng.randf_range(-1.0, 1.0) * exp(-t * 22.0) * 0.5
					+ sin(TAU * 310.0 * t) * exp(-t * 9.0) * 0.35
					+ sin(TAU * 497.0 * t) * exp(-t * 12.0) * 0.25)
		"lever":
			b = _buf(0.22)
			for i in b.size():
				var t := float(i) / RATE
				b[i] = (rng.randf_range(-1.0, 1.0) * exp(-t * 40.0) * 0.4
					+ sin(TAU * 140.0 * t) * exp(-t * 18.0) * 0.5)
		"drip":
			b = _buf(0.3)
			for i in b.size():
				var t := float(i) / RATE
				b[i] = sin(TAU * (300.0 + 1500.0 * exp(-t * 14.0)) * t) * exp(-t * 12.0) * 0.5
		"splash":
			b = _buf(0.8)
			var y := 0.0
			for i in b.size():
				var t := float(i) / RATE
				y += 0.25 * (rng.randf_range(-1.0, 1.0) - y)
				b[i] = y * exp(-t * 4.0) * (0.6 + 0.4 * sin(t * 40.0)) * 0.9
		"creak":
			b = _buf(0.9)
			var ph := 0.0
			for i in b.size():
				var t := float(i) / RATE
				var f := 140.0 + 120.0 * sin(PI * t / 0.9) + 20.0 * sin(t * 50.0)
				ph += TAU * f / RATE
				var s := fmod(ph, TAU) / TAU * 2.0 - 1.0
				b[i] = s * 0.25 * sin(PI * t / 0.9) * (0.7 + 0.3 * sin(t * 90.0))
		"gate":
			b = _buf(1.6)
			var y := 0.0
			for i in b.size():
				var t := float(i) / RATE
				y += 0.05 * (rng.randf_range(-1.0, 1.0) - y)
				var env := minf(t * 4.0, 1.0) * (1.0 - smoothstep(1.1, 1.5, t))
				var thud := sin(TAU * 70.0 * t) * exp(-maxf(t - 1.2, 0.0) * 8.0) * (1.0 if t > 1.2 else 0.0)
				b[i] = y * env * 4.0 + thud * 0.6
		"bell":
			b = _buf(2.4)
			var ratios: Array[float] = [1.0, 2.0, 2.76, 5.4]
			var amps: Array[float] = [0.5, 0.3, 0.22, 0.1]
			for i in b.size():
				var t := float(i) / RATE
				var s := 0.0
				for k in 4:
					s += sin(TAU * 392.0 * ratios[k] * t) * amps[k] * exp(-t * (1.6 + float(k) * 1.4))
				b[i] = s * 0.8
		"win":
			b = _buf(0.9)
			var notes: Array[float] = [523.0, 659.0, 784.0, 1047.0]
			for i in b.size():
				var t := float(i) / RATE
				var k := mini(int(t / 0.12), 3)
				var lt := t - float(k) * 0.12
				var tail := exp(-maxf(t - 0.36, 0.0) * 4.0) if k == 3 else exp(-lt * 8.0)
				b[i] = (sin(TAU * notes[k] * t) + 0.3 * sin(TAU * notes[k] * 2.0 * t)) * tail * 0.35
		"buzz":
			b = _buf(0.3)
			for i in b.size():
				var t := float(i) / RATE
				b[i] = (1.0 if sin(TAU * 110.0 * t) > 0.0 else -1.0) * 0.25 * (1.0 - t / 0.3)
		"tick":
			b = _buf(0.05)
			for i in b.size():
				var t := float(i) / RATE
				b[i] = rng.randf_range(-1.0, 1.0) * exp(-t * 90.0) * 0.5
		_:
			b = _buf(0.05)
	return _to_wav(b)


func _synth_honk(voice: int) -> AudioStreamWAV:
	var b := _buf(0.45)
	var rng := RandomNumberGenerator.new()
	rng.seed = 7 + voice
	var base_freqs: Array[float] = [330.0, 410.0, 250.0]
	var f0: float = base_freqs[voice % 3]
	var ph := 0.0
	for i in b.size():
		var t := float(i) / RATE
		# Glissando: sale in fretta e poi scende, come un vero "HONK".
		var f := f0 * (1.0 + 0.30 * minf(t / 0.07, 1.0) - 0.45 * clampf((t - 0.07) / 0.33, 0.0, 1.0))
		f *= 1.0 + 0.02 * sin(TAU * 28.0 * t)
		ph += TAU * f / RATE
		var s := 0.0
		for k in range(1, 8):
			s += sin(float(k) * ph) / float(k)
		s += rng.randf_range(-1.0, 1.0) * 0.15
		var env := minf(t / 0.02, 1.0) * (1.0 - smoothstep(0.30, 0.45, t)) * (0.85 + 0.15 * sin(TAU * 14.0 * t))
		b[i] = s * env * 0.32
	return _to_wav(b)


func _synth_note(freq: float) -> AudioStreamWAV:
	var b := _buf(0.5)
	for i in b.size():
		var t := float(i) / RATE
		b[i] = (sin(TAU * freq * t) + 0.35 * sin(TAU * freq * 2.0 * t)) * exp(-t * 6.0) * minf(t * 200.0, 1.0) * 0.4
	return _to_wav(b)


# ------------------------------------------------------------------ ambienti (loop)

func _ambience_stream(kind: String) -> AudioStreamWAV:
	var key := "amb_" + kind
	if _cache.has(key):
		return _cache[key]
	var rate := 16000
	var n := 4 * rate
	var fade := rate / 4
	var x := PackedFloat32Array()
	x.resize(n + fade)
	var rng := RandomNumberGenerator.new()
	rng.seed = 99
	var y1 := 0.0
	var y2 := 0.0
	for i in x.size():
		var t := float(i) / float(rate)
		var white := rng.randf_range(-1.0, 1.0)
		var s := 0.0
		match kind:
			"water":
				y1 += 0.30 * (white - y1)
				y2 += 0.04 * (white - y2)
				s = (y1 - y2) * (0.6 + 0.4 * sin(TAU * 3.0 * t / 4.0) * sin(TAU * 7.0 * t / 4.0))
			"clock":
				y1 += 0.01 * (white - y1)
				s = y1 * 2.0 + sin(TAU * 55.0 * t) * 0.05
				var beat := fmod(t, 0.5)
				if beat < 0.03:
					var tone := 1.0 if int(t / 0.5) % 2 == 0 else 0.8
					s += white * (1.0 - beat / 0.03) * 0.5 * tone
			_:
				y1 += 0.02 * (white - y1)
				s = y1 * (0.6 + 0.4 * sin(TAU * 2.0 * t / 4.0))
		x[i] = s
	# Normalizza e rende il loop senza stacchi (crossfade coda -> testa).
	var peak := 0.001
	for v in x:
		peak = maxf(peak, absf(v))
	var out := PackedFloat32Array()
	out.resize(n)
	for i in n:
		out[i] = x[i] / peak * 0.5
	for i in fade:
		var w := float(i) / float(fade)
		out[i] = x[i] / peak * 0.5 * w + x[n + i] / peak * 0.5 * (1.0 - w)
	var wav := _to_wav(out, rate, true)
	_cache[key] = wav
	return wav
