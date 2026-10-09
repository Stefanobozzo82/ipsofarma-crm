shader_type canvas_item;
// Grana di pellicola + vignettatura + leggero viraggio seppia su tutto lo schermo.

uniform sampler2D screen_tex : hint_screen_texture, filter_linear_mipmap;
uniform float grain : hint_range(0.0, 0.3) = 0.07;
uniform float vignette : hint_range(0.0, 1.0) = 0.55;
uniform float sepia : hint_range(0.0, 1.0) = 0.12;

float hash(vec2 p) {
	return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void fragment() {
	vec3 col = textureLod(screen_tex, SCREEN_UV, 0.0).rgb;
	// Viraggio seppia leggero.
	float lum = dot(col, vec3(0.299, 0.587, 0.114));
	col = mix(col, vec3(lum) * vec3(1.08, 0.95, 0.78), sepia);
	// Grana animata (cambia ~12 volte al secondo).
	float n = hash(SCREEN_UV * vec2(1920.0, 1080.0) + floor(TIME * 12.0) * 17.0);
	col += (n - 0.5) * grain;
	// Vignettatura.
	float d = distance(SCREEN_UV, vec2(0.5));
	col *= 1.0 - smoothstep(0.35, 0.9, d) * vignette;
	COLOR = vec4(col, 1.0);
}
