/**
 * Terrain Fragment Shader
 * PBR-inspired terrain rendering with height-based texturing
 */

uniform vec3 sandColor;
uniform vec3 wetSandColor;
uniform vec3 rockColor;
uniform vec3 grassColor;
uniform float seaLevel;
uniform vec3 sunDirection;
uniform vec3 sunColor;
uniform vec3 ambientColor;
uniform float roughness;

varying vec3 vWorldPosition;
varying vec3 vNormal;
varying vec3 vViewPosition;
varying float vHeight;
varying vec2 vUv;

// Simple noise for texture variation
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 4; i++) {
    value += amplitude * noise(p);
    p *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}

void main() {
  vec3 normal = normalize(vNormal);
  vec3 viewDir = normalize(vViewPosition);
  
  // Calculate slope factor (0 = flat, 1 = vertical)
  float slopeFactor = 1.0 - abs(dot(normal, vec3(0.0, 1.0, 0.0)));
  
  // Height relative to sea level
  float relativeHeight = vHeight - seaLevel;
  float heightFactor = clamp(relativeHeight / 12.0, 0.0, 1.0);
  
  // Add noise variation to break up uniformity
  float noiseVal = fbm(vWorldPosition.xz * 0.1);
  float detailNoise = fbm(vWorldPosition.xz * 0.5);
  
  // Base terrain color selection
  vec3 baseColor;
  
  // Wet sand zone (underwater to slightly above)
  float wetZone = smoothstep(-2.0, 0.5, relativeHeight) * (1.0 - smoothstep(0.5, 2.0, relativeHeight));
  
  // Dry sand zone
  float sandZone = smoothstep(0.0, 2.0, relativeHeight) * (1.0 - smoothstep(3.0, 6.0, relativeHeight));
  
  // Grass zone
  float grassZone = smoothstep(4.0, 7.0, relativeHeight) * (1.0 - smoothstep(9.0, 12.0, relativeHeight));
  
  // Rock on steep slopes
  float rockZone = smoothstep(0.3, 0.6, slopeFactor);
  
  // Blend colors
  baseColor = wetSandColor;
  baseColor = mix(baseColor, sandColor, sandZone);
  baseColor = mix(baseColor, grassColor, grassZone * (1.0 - rockZone));
  baseColor = mix(baseColor, rockColor, rockZone);
  
  // Add subtle variation
  baseColor *= 0.9 + noiseVal * 0.2;
  baseColor += detailNoise * 0.05;
  
  // === PBR-inspired Lighting ===
  
  // Diffuse (Lambert)
  float NdotL = max(dot(normal, sunDirection), 0.0);
  vec3 diffuse = baseColor * sunColor * NdotL;
  
  // Ambient
  vec3 ambient = baseColor * ambientColor * 0.3;
  
  // Specular (Blinn-Phong approximation)
  vec3 halfDir = normalize(sunDirection + viewDir);
  float NdotH = max(dot(normal, halfDir), 0.0);
  float specPower = mix(32.0, 4.0, roughness);
  float spec = pow(NdotH, specPower) * (1.0 - roughness) * 0.3;
  
  // Wet sand is more specular
  spec *= 1.0 + wetZone * 2.0;
  
  vec3 specular = sunColor * spec;
  
  // Rim lighting for depth
  float rim = 1.0 - max(dot(viewDir, normal), 0.0);
  rim = pow(rim, 3.0) * 0.1;
  vec3 rimLight = ambientColor * rim;
  
  // Final color
  vec3 finalColor = ambient + diffuse + specular + rimLight;
  
  // Tone mapping
  finalColor = finalColor / (finalColor + vec3(1.0));
  
  // Gamma correction
  finalColor = pow(finalColor, vec3(1.0 / 2.2));
  
  gl_FragColor = vec4(finalColor, 1.0);
}

