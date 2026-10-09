shader_type canvas_item;
// Versione leggera di grana + vignettatura per dispositivi mobili: niente lettura dello
// schermo, solo un velo scuro semitrasparente (molto piu' economico per la GPU).

float hash(vec2 p) {
	return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void fragment() {
	float n = hash(UV * vec2(960.0, 540.0) + floor(TIME * 10.0) * 17.0);
	float v = smoothstep(0.35, 0.9, distance(UV, vec2(0.5))) * 0.55;
	COLOR = vec4(0.04, 0.03, 0.02, clamp(v + abs(n - 0.5) * 0.12, 0.0, 1.0));
}
