/**
 * Water Fragment Shader
 * Realistic water rendering with Fresnel, depth-based color, and foam
 */

uniform float time;
uniform vec3 shallowColor;
uniform vec3 deepColor;
uniform vec3 foamColor;
uniform vec3 sunDirection;
uniform vec3 sunColor;
uniform vec3 skyColor;
uniform float seaLevel;
uniform float opacity;

varying vec3 vWorldPosition;
varying vec3 vNormal;
varying vec3 vViewPosition;
varying vec2 vUv;

// Simple noise for foam
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
  for (int i = 0; i < 3; i++) {
    value += amplitude * noise(p);
    p *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}

void main() {
  vec3 normal = normalize(vNormal);
  vec3 viewDir = normalize(vViewPosition);
  
  // Fresnel effect - water is more reflective at grazing angles
  float fresnel = pow(1.0 - max(dot(viewDir, normal), 0.0), 4.0);
  fresnel = mix(0.04, 1.0, fresnel); // Water F0 ~= 0.04
  
  // Depth-based color (fake depth using world position)
  float distFromCenter = length(vWorldPosition.xz) / 128.0;
  float depthFactor = smoothstep(0.0, 0.7, distFromCenter);
  vec3 waterColor = mix(shallowColor, deepColor, depthFactor);
  
  // Add variation based on waves
  float waveColorVar = fbm(vWorldPosition.xz * 0.05 + time * 0.1);
  waterColor = mix(waterColor, shallowColor, waveColorVar * 0.3);
  
  // === Lighting ===
  
  // Diffuse
  float NdotL = max(dot(normal, sunDirection), 0.0);
  vec3 diffuse = waterColor * sunColor * NdotL * 0.3;
  
  // Specular (sun reflection)
  vec3 reflectDir = reflect(-sunDirection, normal);
  float specAngle = max(dot(reflectDir, viewDir), 0.0);
  float specular = pow(specAngle, 256.0) * 2.0; // Sharp sun reflection
  
  // Secondary specular for broader highlight
  float specular2 = pow(specAngle, 32.0) * 0.5;
  
  vec3 specColor = sunColor * (specular + specular2);
  
  // Sky reflection
  vec3 skyReflection = skyColor * fresnel * 0.5;
  
  // Subsurface scattering approximation
  float scatter = pow(max(dot(viewDir, -sunDirection), 0.0), 2.0);
  vec3 subsurface = shallowColor * scatter * 0.2;
  
  // Foam at wave peaks
  float foamNoise = fbm(vWorldPosition.xz * 0.3 + time * 0.5);
  float waveHeight = vWorldPosition.y - seaLevel;
  float foamFactor = smoothstep(0.3, 0.8, waveHeight * 2.0 + foamNoise * 0.5);
  foamFactor *= foamNoise;
  
  // Edge foam (where waves meet shore - approximation)
  float edgeFoam = smoothstep(0.8, 1.0, distFromCenter) * foamNoise * 0.5;
  foamFactor = max(foamFactor, edgeFoam);
  
  // Combine everything
  vec3 finalColor = waterColor * 0.3; // Base ambient
  finalColor += diffuse;
  finalColor += specColor;
  finalColor += skyReflection;
  finalColor += subsurface;
  finalColor = mix(finalColor, foamColor, foamFactor * 0.7);
  
  // Tone mapping
  finalColor = finalColor / (finalColor + vec3(1.0));
  
  // Gamma correction
  finalColor = pow(finalColor, vec3(1.0 / 2.2));
  
  // Transparency based on fresnel and depth
  float alpha = mix(0.7, 0.95, fresnel);
  alpha = mix(alpha, 1.0, depthFactor * 0.3);
  alpha *= opacity;
  
  gl_FragColor = vec4(finalColor, alpha);
}

