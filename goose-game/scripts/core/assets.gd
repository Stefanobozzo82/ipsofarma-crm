class_name Assets
extends RefCounted
## Caricamento di sfondi e sprite con fallback sul segnaposto.
##
## Convenzione dei nomi (vedi README):
##   assets/backgrounds/<scena>.png        sfondo 1920x1080
##   assets/backgrounds/<scena>_mid.png    piano intermedio (PNG con trasparenza)
##   assets/backgrounds/<scena>_fg.png     primo piano (PNG con trasparenza)
##   assets/sprites/<nome>.png             sprite di personaggi / oggetti / icone
## Se il file non esiste le funzioni restituiscono null e il chiamante disegna il segnaposto.

const BACKGROUND_DIR := "res://assets/backgrounds/"
const SPRITE_DIR := "res://assets/sprites/"

static var _cache: Dictionary = {}


static func background(scene_name: String, suffix: String = "") -> Texture2D:
	return load_texture(BACKGROUND_DIR + scene_name + suffix + ".png")


static func sprite(sprite_name: String) -> Texture2D:
	return load_texture(SPRITE_DIR + sprite_name + ".png")


## Carica una texture da res://. Funziona anche per PNG non ancora importati
## (utile quando si copiano file mentre l'editor e' chiuso).
static func load_texture(path: String) -> Texture2D:
	if _cache.has(path):
		return _cache[path]
	var tex: Texture2D = null
	if ResourceLoader.exists(path):
		var res: Resource = load(path)
		if res is Texture2D:
			tex = res
	elif FileAccess.file_exists(path):
		var img := Image.load_from_file(ProjectSettings.globalize_path(path))
		if img != null and not img.is_empty():
			tex = ImageTexture.create_from_image(img)
	if tex != null:
		_cache[path] = tex
	return tex


## Svuota la cache (chiamato a ogni cambio scena, cosi' i nuovi file vengono visti).
static func clear_cache() -> void:
	_cache.clear()
