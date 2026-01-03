/**
 * Water System Module
 * Realistic water plane with animated waves using custom shaders
 */

import * as THREE from 'three';

export interface WaterConfig {
  size: number;
  segments: number;
  seaLevel: number;
  waveStrength: number;
  waveSpeed: number;
  shallowColor: string;
  deepColor: string;
  opacity: number;
}

export const defaultWaterConfig: WaterConfig = {
  size: 512,
  segments: 128,
  seaLevel: 2.0,
  waveStrength: 0.15,
  waveSpeed: 1.0,
  shallowColor: '#4db8b8',
  deepColor: '#0a4f6e',
  opacity: 0.9,
};

// Vertex shader for water with breaking waves
const waterVertexShader = `
uniform float time;
uniform float waveStrength;
uniform float waveSpeed;
uniform float seaLevel;
uniform sampler2D terrainHeightMap;
uniform vec2 terrainSize;

varying vec3 vWorldPosition;
varying vec3 vNormal;
varying vec3 vViewPosition;
varying vec2 vUv;
varying float vWaveHeight;
varying float vDepth;

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

// Noise function for turbulence
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

void main() {
  vUv = uv;
  
  vec3 pos = position;
  
  // Calculate distance from center (proxy for depth)
  float distFromCenter = length(pos.xz) / (terrainSize.x * 0.5);
  vDepth = smoothstep(0.0, 0.8, distFromCenter);
  
  // Multiple overlapping waves for realism
  float t = time * waveSpeed;
  
  // Waves move towards shore (radially inward)
  vec2 toCenter = -normalize(pos.xz + vec2(0.001)); // Direction towards center
  vec2 waveDir1 = toCenter;
  vec2 waveDir2 = vec2(toCenter.x + 0.3, toCenter.y - 0.2);
  vec2 waveDir3 = vec2(toCenter.x - 0.2, toCenter.y + 0.3);
  
  // Primary waves - larger in deep water
  float deepWaveMultiplier = mix(0.3, 1.0, vDepth);
  vec3 wave1 = gerstnerWave(pos.xz, waveStrength * 0.5 * deepWaveMultiplier, 30.0, waveDir1, t);
  vec3 wave2 = gerstnerWave(pos.xz, waveStrength * 0.3 * deepWaveMultiplier, 20.0, waveDir2, t * 1.1);
  vec3 wave3 = gerstnerWave(pos.xz, waveStrength * 0.25 * deepWaveMultiplier, 15.0, waveDir3, t * 0.9);
  
  // Breaking waves in shallow water - steeper and more chaotic
  float shallowFactor = 1.0 - vDepth;
  float breakingIntensity = smoothstep(0.3, 0.7, shallowFactor);
  
  // Add turbulence and steepness in breaking zone
  float turbulence = noise(pos.xz * 0.3 + t * 0.5) * breakingIntensity;
  float breakingWave = sin(length(pos.xz) * 0.5 - t * 3.0) * breakingIntensity * waveStrength * 1.5;
  
  // Small ripples
  float ripple = sin(pos.x * 0.5 + t * 2.0) * sin(pos.z * 0.5 + t * 1.5) * waveStrength * 0.1;
  
  // Combine waves
  vec3 totalWave = wave1 + wave2 + wave3;
  pos.x += totalWave.x;
  pos.y += totalWave.y + ripple + breakingWave + turbulence * 0.5;
  pos.z += totalWave.z;
  
  vWaveHeight = totalWave.y + breakingWave;
  
  // Calculate normal from wave gradients
  float delta = 0.1;
  vec3 posX = position + vec3(delta, 0.0, 0.0);
  vec3 posZ = position + vec3(0.0, 0.0, delta);
  
  float distX = length(posX.xz) / (terrainSize.x * 0.5);
  float depthX = smoothstep(0.0, 0.8, distX);
  float shallowX = 1.0 - depthX;
  float breakingX = smoothstep(0.3, 0.7, shallowX);
  
  float distZ = length(posZ.xz) / (terrainSize.x * 0.5);
  float depthZ = smoothstep(0.0, 0.8, distZ);
  float shallowZ = 1.0 - depthZ;
  float breakingZ = smoothstep(0.3, 0.7, shallowZ);
  
  vec3 waveX1 = gerstnerWave(posX.xz, waveStrength * 0.5, 30.0, waveDir1, t);
  vec3 waveX2 = gerstnerWave(posX.xz, waveStrength * 0.3, 20.0, waveDir2, t * 1.1);
  vec3 waveX = waveX1 + waveX2;
  float breakingWaveX = sin(length(posX.xz) * 0.5 - t * 3.0) * breakingX * waveStrength * 1.5;
  posX.y += waveX.y + breakingWaveX;
  
  vec3 waveZ1 = gerstnerWave(posZ.xz, waveStrength * 0.5, 30.0, waveDir1, t);
  vec3 waveZ2 = gerstnerWave(posZ.xz, waveStrength * 0.3, 20.0, waveDir2, t * 1.1);
  vec3 waveZ = waveZ1 + waveZ2;
  float breakingWaveZ = sin(length(posZ.xz) * 0.5 - t * 3.0) * breakingZ * waveStrength * 1.5;
  posZ.y += waveZ.y + breakingWaveZ;
  
  vec3 tangent = normalize(posX - pos);
  vec3 bitangent = normalize(posZ - pos);
  vNormal = normalize(cross(bitangent, tangent));
  
  vec4 worldPos = modelMatrix * vec4(pos, 1.0);
  vWorldPosition = worldPos.xyz;
  
  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  vViewPosition = -mvPosition.xyz;
  
  gl_Position = projectionMatrix * mvPosition;
}
`;

// Fragment shader for water with breaking waves
const waterFragmentShader = `
uniform float time;
uniform vec3 shallowColor;
uniform vec3 deepColor;
uniform vec3 foamColor;
uniform vec3 sunDirection;
uniform vec3 sunColor;
uniform vec3 skyColor;
uniform float seaLevel;
uniform float opacity;
uniform float waveStrength;

varying vec3 vWorldPosition;
varying vec3 vNormal;
varying vec3 vViewPosition;
varying vec2 vUv;
varying float vWaveHeight;
varying float vDepth;

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
  
  // Fresnel effect - water is more reflective at grazing angles
  float fresnel = pow(1.0 - max(dot(viewDir, normal), 0.0), 4.0);
  fresnel = mix(0.04, 1.0, fresnel);
  
  // Depth-based color (shallow = close to shore, deep = far from shore)
  float shallowFactor = 1.0 - vDepth;
  vec3 waterColor = mix(deepColor, shallowColor, shallowFactor);
  
  // Add variation based on waves
  float waveColorVar = fbm(vWorldPosition.xz * 0.05 + time * 0.1);
  waterColor = mix(waterColor, shallowColor, waveColorVar * 0.2);
  
  // === Lighting ===
  float NdotL = max(dot(normal, sunDirection), 0.0);
  vec3 diffuse = waterColor * sunColor * NdotL * 0.3;
  
  // Specular (sun reflection)
  vec3 reflectDir = reflect(-sunDirection, normal);
  float specAngle = max(dot(reflectDir, viewDir), 0.0);
  float specular = pow(specAngle, 256.0) * 2.0;
  float specular2 = pow(specAngle, 32.0) * 0.5;
  vec3 specColor = sunColor * (specular + specular2);
  
  // Sky reflection
  vec3 skyReflection = skyColor * fresnel * 0.5;
  
  // Subsurface scattering approximation
  float scatter = pow(max(dot(viewDir, -sunDirection), 0.0), 2.0);
  vec3 subsurface = shallowColor * scatter * 0.2;
  
  // === BREAKING WAVE FOAM ===
  
  // Calculate breaking intensity based on shallow water
  float breakingZone = smoothstep(0.3, 0.7, shallowFactor);
  
  // Multi-layered foam noise for realism
  float foamNoise1 = fbm(vWorldPosition.xz * 0.5 + time * 0.8);
  float foamNoise2 = fbm(vWorldPosition.xz * 1.0 - time * 0.6);
  float foamNoise3 = noise(vWorldPosition.xz * 2.0 + time * 1.2);
  
  // Combine foam noises
  float foamPattern = foamNoise1 * 0.5 + foamNoise2 * 0.3 + foamNoise3 * 0.2;
  
  // Wave crest foam (at peaks)
  float waveHeight = vWaveHeight / max(waveStrength, 0.01);
  float crestFoam = smoothstep(0.4, 1.0, waveHeight) * foamPattern;
  
  // Breaking wave foam - intense in shallow water
  float breakingFoam = breakingZone * foamPattern;
  breakingFoam *= smoothstep(0.2, 0.8, foamNoise1);
  
  // Turbulent foam patterns in breaking zone
  float turbulentFoam = 0.0;
  if (breakingZone > 0.3) {
    vec2 flowDir = normalize(vWorldPosition.xz);
    float flowPattern = fbm(vWorldPosition.xz * 0.3 + flowDir * time * 0.5);
    turbulentFoam = breakingZone * flowPattern * smoothstep(0.4, 0.9, foamNoise2);
  }
  
  // Combine all foam types
  float foamFactor = max(max(crestFoam, breakingFoam), turbulentFoam);
  foamFactor = smoothstep(0.3, 0.9, foamFactor);
  
  // Extra intense foam right at the breaking zone
  float breakingEdge = smoothstep(0.55, 0.65, shallowFactor) * (1.0 - smoothstep(0.65, 0.75, shallowFactor));
  foamFactor = max(foamFactor, breakingEdge * foamNoise1 * 1.5);
  
  // Animated foam streaks
  float streaks = abs(sin(vWorldPosition.x * 2.0 + time * 2.0)) * abs(sin(vWorldPosition.z * 2.0 - time * 1.5));
  foamFactor += streaks * breakingZone * 0.3;
  
  foamFactor = clamp(foamFactor, 0.0, 1.0);
  
  // === Combine everything ===
  vec3 finalColor = waterColor * 0.3;
  finalColor += diffuse;
  finalColor += specColor;
  finalColor += skyReflection;
  finalColor += subsurface;
  
  // Blend foam with water
  vec3 foamWithHighlight = foamColor + specColor * 0.5; // Foam is slightly reflective
  finalColor = mix(finalColor, foamWithHighlight, foamFactor * 0.85);
  
  // Extra brightness in breaking zone
  finalColor += vec3(1.0) * breakingZone * foamFactor * 0.2;
  
  // Tone mapping
  finalColor = finalColor / (finalColor + vec3(1.0));
  finalColor = pow(finalColor, vec3(1.0 / 2.2));
  
  // Transparency - foam is more opaque
  float alpha = mix(0.7, 0.95, fresnel);
  alpha = mix(alpha, 1.0, vDepth * 0.3);
  alpha = mix(alpha, 1.0, foamFactor * 0.5); // Foam is less transparent
  alpha *= opacity;
  
  gl_FragColor = vec4(finalColor, alpha);
}
`;

export class WaterSystem {
  public mesh: THREE.Mesh;
  public geometry: THREE.PlaneGeometry;
  public material: THREE.ShaderMaterial;
  public config: WaterConfig;

  constructor(config: Partial<WaterConfig> = {}) {
    this.config = { ...defaultWaterConfig, ...config };
    
    // Create geometry
    this.geometry = new THREE.PlaneGeometry(
      this.config.size,
      this.config.size,
      this.config.segments,
      this.config.segments
    );
    this.geometry.rotateX(-Math.PI / 2);
    
    // Create shader material
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        waveStrength: { value: this.config.waveStrength },
        waveSpeed: { value: this.config.waveSpeed },
        seaLevel: { value: this.config.seaLevel },
        shallowColor: { value: new THREE.Color(this.config.shallowColor) },
        deepColor: { value: new THREE.Color(this.config.deepColor) },
        foamColor: { value: new THREE.Color('#ffffff') },
        sunDirection: { value: new THREE.Vector3(0.5, 0.8, 0.3).normalize() },
        sunColor: { value: new THREE.Color('#fffaf0') },
        skyColor: { value: new THREE.Color('#87CEEB') },
        opacity: { value: this.config.opacity },
        terrainSize: { value: new THREE.Vector2(this.config.size, this.config.size) },
      },
      vertexShader: waterVertexShader,
      fragmentShader: waterFragmentShader,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    
    // Create mesh
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.position.y = this.config.seaLevel;
    this.mesh.receiveShadow = true;
  }

  /**
   * Updates water animation - call every frame
   */
  update(deltaTime: number, timeScale: number = 1): void {
    this.material.uniforms.time.value += deltaTime * timeScale;
  }

  /**
   * Updates sea level
   */
  setSeaLevel(level: number): void {
    this.config.seaLevel = level;
    this.mesh.position.y = level;
    this.material.uniforms.seaLevel.value = level;
  }

  /**
   * Updates wave parameters
   */
  setWaveParams(strength: number, speed: number): void {
    this.config.waveStrength = strength;
    this.config.waveSpeed = speed;
    this.material.uniforms.waveStrength.value = strength;
    this.material.uniforms.waveSpeed.value = speed;
  }

  /**
   * Updates water colors
   */
  setColors(shallow: string, deep: string): void {
    this.config.shallowColor = shallow;
    this.config.deepColor = deep;
    this.material.uniforms.shallowColor.value = new THREE.Color(shallow);
    this.material.uniforms.deepColor.value = new THREE.Color(deep);
  }

  /**
   * Updates sun direction for lighting
   */
  setSunDirection(direction: THREE.Vector3): void {
    this.material.uniforms.sunDirection.value = direction.normalize();
  }

  /**
   * Disposes of geometry and material
   */
  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}

