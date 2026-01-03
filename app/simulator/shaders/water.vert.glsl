/**
 * Water Vertex Shader
 * Animated wave displacement using multiple sine waves
 */

uniform float time;
uniform float waveStrength;
uniform float waveSpeed;

varying vec3 vWorldPosition;
varying vec3 vNormal;
varying vec3 vViewPosition;
varying vec2 vUv;

// Gerstner wave function for realistic ocean waves
vec3 gerstnerWave(vec2 position, float steepness, float wavelength, vec2 direction, float time) {
  float k = 2.0 * 3.14159 / wavelength;
  float c = sqrt(9.8 / k);
  vec2 d = normalize(direction);
  float f = k * (dot(d, position) - c * time);
  float a = steepness / k;
  
  return vec3(
    d.x * (a * cos(f)),
    a * sin(f),
    d.y * (a * cos(f))
  );
}

void main() {
  vUv = uv;
  
  vec3 pos = position;
  
  // Multiple overlapping waves for realism
  float t = time * waveSpeed;
  
  // Primary wave
  vec3 wave1 = gerstnerWave(pos.xz, waveStrength * 0.5, 30.0, vec2(1.0, 0.3), t);
  
  // Secondary waves
  vec3 wave2 = gerstnerWave(pos.xz, waveStrength * 0.3, 20.0, vec2(0.5, 1.0), t * 1.1);
  vec3 wave3 = gerstnerWave(pos.xz, waveStrength * 0.2, 15.0, vec2(-0.3, 0.8), t * 0.9);
  vec3 wave4 = gerstnerWave(pos.xz, waveStrength * 0.15, 10.0, vec2(0.8, -0.2), t * 1.3);
  
  // Small ripples
  float ripple = sin(pos.x * 0.5 + t * 2.0) * sin(pos.z * 0.5 + t * 1.5) * waveStrength * 0.1;
  
  // Combine waves
  vec3 totalWave = wave1 + wave2 + wave3 + wave4;
  pos.x += totalWave.x;
  pos.y += totalWave.y + ripple;
  pos.z += totalWave.z;
  
  // Calculate normal from wave gradients
  float delta = 0.1;
  vec3 posX = position + vec3(delta, 0.0, 0.0);
  vec3 posZ = position + vec3(0.0, 0.0, delta);
  
  vec3 waveX1 = gerstnerWave(posX.xz, waveStrength * 0.5, 30.0, vec2(1.0, 0.3), t);
  vec3 waveX2 = gerstnerWave(posX.xz, waveStrength * 0.3, 20.0, vec2(0.5, 1.0), t * 1.1);
  vec3 waveX = waveX1 + waveX2;
  posX.y += waveX.y;
  
  vec3 waveZ1 = gerstnerWave(posZ.xz, waveStrength * 0.5, 30.0, vec2(1.0, 0.3), t);
  vec3 waveZ2 = gerstnerWave(posZ.xz, waveStrength * 0.3, 20.0, vec2(0.5, 1.0), t * 1.1);
  vec3 waveZ = waveZ1 + waveZ2;
  posZ.y += waveZ.y;
  
  vec3 tangent = normalize(posX - pos);
  vec3 bitangent = normalize(posZ - pos);
  vNormal = normalize(cross(bitangent, tangent));
  
  vec4 worldPos = modelMatrix * vec4(pos, 1.0);
  vWorldPosition = worldPos.xyz;
  
  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  vViewPosition = -mvPosition.xyz;
  
  gl_Position = projectionMatrix * mvPosition;
}

