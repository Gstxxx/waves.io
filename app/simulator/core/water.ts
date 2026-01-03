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

// Vertex shader for water with breaking waves - DEPTH AWARE
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
varying float vBarrelIntensity;
varying float vShoreWash;
varying float vTerrainDepth; // NEW: actual depth to terrain
varying float vDepthNormalized; // NEW: normalized depth for colors

// Enhanced noise functions for organic variation
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

// Fractal Brownian Motion for complex patterns
float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  float frequency = 1.0;
  for (int i = 0; i < 5; i++) {
    value += amplitude * noise(p * frequency);
    frequency *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}

// Sample terrain height from REAL heightmap texture
// This is the KEY - water now sees the actual terrain!
float sampleTerrainHeight(vec2 worldPos) {
  // Convert world position to UV coordinates (0-1 range)
  // World position is centered at origin, so we offset by half size
  vec2 terrainUV = (worldPos / terrainSize) + 0.5;
  
  // Clamp to valid texture range
  terrainUV = clamp(terrainUV, 0.0, 1.0);
  
  // Sample heightmap texture (normalized 0-1, needs denormalization)
  float normalizedHeight = texture2D(terrainHeightMap, terrainUV).r;
  
  // Denormalize: heightmap stores 0-1, we need actual height range
  // Assuming terrain height range is -5 to 15 (20 units total)
  float minHeight = -5.0;
  float maxHeight = 15.0;
  float heightRange = maxHeight - minHeight;
  
  float terrainHeight = minHeight + normalizedHeight * heightRange;
  
  return terrainHeight;
}

// Organic Gerstner-like wave with noise modulation - NOW DEPTH AWARE
vec3 organicWave(vec2 position, float steepness, float wavelength, vec2 baseDir, float time, float phaseOffset, float depthFactor) {
  // Add noise to make each wave unique
  float noiseVal = fbm(position * 0.05 + vec2(phaseOffset * 10.0));
  
  // Vary direction slightly based on position
  vec2 direction = normalize(baseDir + vec2(noiseVal - 0.5, noise(position * 0.1) - 0.5) * 0.4);
  
  float k = 2.0 * 3.14159 / wavelength;
  float c = sqrt(9.8 / k);
  
  // DEPTH AWARENESS: waves slow down and shorten in shallow water
  // Shallow water physics: c = sqrt(g * depth)
  float shallowFactor = smoothstep(0.0, 10.0, depthFactor); // 0 in very shallow, 1 in deep
  c *= 0.3 + shallowFactor * 0.7; // Speed reduces in shallow water
  
  // Add noise to frequency for irregular timing
  float timeVariation = time + noiseVal * 2.0;
  float f = k * (dot(direction, position) - c * timeVariation + phaseOffset);
  
  // Variable amplitude based on local noise AND depth
  // Shallow water = smaller waves
  float amplitudeScale = 0.5 + shallowFactor * 0.5;
  float localAmp = (0.8 + noiseVal * 0.4) * steepness / k * amplitudeScale;
  
  return vec3(
    direction.x * (localAmp * cos(f)),
    localAmp * sin(f),
    direction.y * (localAmp * cos(f))
  );
}

// Individual wave patches that form and dissipate
float wavePatch(vec2 pos, vec2 center, float time, float speed, float size) {
  float dist = length(pos - center);
  float wave = sin(dist * 2.0 - time * speed) * 0.5 + 0.5;
  float falloff = smoothstep(size, 0.0, dist);
  return wave * falloff;
}

void main() {
  vUv = uv;
  vec3 pos = position;
  
  // === DEPTH CALCULATION - THE KEY ===
  float terrainHeight = sampleTerrainHeight(pos.xz);
  float waterHeight = seaLevel;
  float depth = waterHeight - terrainHeight;
  
  vTerrainDepth = depth;
  
  // REAL DEPTH calculation from actual terrain heightmap!
  float actualDepth = max(depth, 0.0);
  float depthNormalized = clamp(actualDepth / 15.0, 0.0, 1.0); // Normalize to 0-1 range
  
  // Pass to fragment shader
  vDepth = depthNormalized; // Use real depth, not fake distance
  vDepthNormalized = depthNormalized;
  
  float t = time * waveSpeed;
  
  // General wave direction towards shore
  vec2 toCenter = -normalize(pos.xz + vec2(0.001));
  
  // === DEPTH-AWARE WAVE SYSTEM ===
  
  vec3 totalWave = vec3(0.0);
  
  // Only generate waves where there's water
  if (depth > 0.5) {
    // Large swells with varied directions - MODULATED BY DEPTH
    float deepWaveMultiplier = mix(0.2, 1.0, depthNormalized); // Much smaller in shallow
    
    vec3 swell1 = organicWave(pos.xz, waveStrength * 0.6 * deepWaveMultiplier, 35.0, toCenter, t, 0.0, actualDepth);
    vec3 swell2 = organicWave(pos.xz, waveStrength * 0.4 * deepWaveMultiplier, 28.0, toCenter + vec2(0.5, -0.3), t * 1.13, 3.7, actualDepth);
    vec3 swell3 = organicWave(pos.xz, waveStrength * 0.35 * deepWaveMultiplier, 22.0, toCenter + vec2(-0.4, 0.6), t * 0.87, 7.2, actualDepth);
    
    totalWave = swell1 + swell2 + swell3;
    
    // Medium waves - even more depth sensitive
    float mediumDepthMult = mix(0.1, 0.8, depthNormalized);
    vec3 med1 = organicWave(pos.xz, waveStrength * 0.25 * mediumDepthMult, 15.0, toCenter + vec2(0.3, 0.2), t * 1.31, 2.1, actualDepth);
    vec3 med2 = organicWave(pos.xz, waveStrength * 0.2 * mediumDepthMult, 12.0, toCenter + vec2(-0.2, -0.5), t * 1.57, 5.8, actualDepth);
    
    totalWave += med1 + med2;
    
    // === BREAKING WAVES - intensify in shallow water ===
    float shallowFactor = 1.0 - depthNormalized;
    float breakingIntensity = smoothstep(0.3, 0.7, shallowFactor);
    
    // Barrel zone - where waves curl (specific depth range)
    vBarrelIntensity = 0.0;
    if (depth > 1.0 && depth < 5.0) {
      vBarrelIntensity = smoothstep(1.0, 2.5, depth) * (1.0 - smoothstep(3.0, 5.0, depth));
    }
    
    if (breakingIntensity > 0.05) {
      // Wave patches that break in shallow areas
      float patch1 = wavePatch(pos.xz, vec2(20.0, 15.0) + vec2(sin(t * 0.3), cos(t * 0.4)) * 30.0, t, 3.0, 25.0);
      float patch2 = wavePatch(pos.xz, vec2(-30.0, 25.0) + vec2(cos(t * 0.25), sin(t * 0.35)) * 35.0, t * 1.2, 2.8, 30.0);
      float patch3 = wavePatch(pos.xz, vec2(10.0, -20.0) + vec2(sin(t * 0.28), cos(t * 0.38)) * 25.0, t * 0.9, 3.2, 20.0);
      
      float patchBreaking = (patch1 + patch2 + patch3) * breakingIntensity * waveStrength * 1.8;
      
      // BARREL/TUBE FORMATION
      vec2 toShore = -normalize(pos.xz);
      float barrelCurl = vBarrelIntensity * waveStrength * 2.5;
      
      float curlPhase = fbm(pos.xz * 0.15 + t * 0.2);
      float lipHeight = sin(length(pos.xz) * 0.3 - t * 2.5 + curlPhase * 2.0) * barrelCurl;
      lipHeight = max(lipHeight, 0.0);
      lipHeight *= (1.0 + curlPhase * 0.5);
      
      // Overhang effect
      float overhang = vBarrelIntensity * toShore.x * waveStrength * 0.8;
      pos.x += overhang * smoothstep(0.0, 1.0, lipHeight);
      
      totalWave.y += patchBreaking + lipHeight;
      
      // Turbulence
      float turbNoise = fbm(pos.xz * 0.2 + t * 0.3);
      float turbulence = turbNoise * breakingIntensity * waveStrength * 0.6;
      totalWave.y += turbulence;
    }
    
    // SHORE WASH - very shallow water
    vShoreWash = 0.0;
    if (depth < 2.0 && depth > 0.3) {
      vShoreWash = smoothstep(0.3, 0.8, depth) * (1.0 - smoothstep(1.2, 2.0, depth));
      
      float washSpeed = 2.0;
      float wash1 = sin(length(pos.xz) * 0.8 - t * washSpeed + fbm(pos.xz * 0.3) * 3.0);
      float wash2 = sin(length(pos.xz) * 1.2 - t * washSpeed * 1.3 + fbm(pos.xz * 0.25) * 2.5);
      
      float washHeight = (wash1 * 0.5 + 0.5) * (wash2 * 0.5 + 0.5);
      washHeight *= vShoreWash * waveStrength * 0.8;
      
      totalWave.y += washHeight;
    }
    
    // High-frequency chop - only in deeper water
    float chop = fbm(pos.xz * 0.8 + t * 1.5) * waveStrength * 0.15 * depthNormalized;
    totalWave.y += chop;
  } else {
    // No waves where terrain is above water
    vBarrelIntensity = 0.0;
    vShoreWash = 0.0;
  }
  
  // Apply displacement
  pos.x += totalWave.x;
  pos.y += totalWave.y;
  pos.z += totalWave.z;
  
  vWaveHeight = totalWave.y;
  
  // Calculate normal from wave gradients (simplified)
  vec3 tangent = vec3(1.0, 0.0, 0.0);
  vec3 bitangent = vec3(0.0, 0.0, 1.0);
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
varying float vBarrelIntensity;
varying float vShoreWash;
varying float vTerrainDepth; // NEW: actual depth to terrain
varying float vDepthNormalized; // NEW: normalized depth for colors

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
  
  // === DEPTH-AWARE COLOR ===
  // Use actual depth for color, not just distance from center
  vec3 waterColor = mix(shallowColor, deepColor, vDepthNormalized);
  
  // Very shallow water (less than 1 unit) is extra light
  if (vTerrainDepth < 1.5) {
    float veryShallow = 1.0 - smoothstep(0.0, 1.5, vTerrainDepth);
    waterColor = mix(waterColor, shallowColor * 1.2, veryShallow);
  }
  
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
  
  // === DEPTH-AWARE FOAM ===
  
  // Use actual terrain depth for better foam placement
  float actualDepth = max(vTerrainDepth, 0.0);
  float depthNormalized = smoothstep(0.0, 10.0, actualDepth);
  
  // Calculate breaking intensity based on actual depth
  float breakingZone = 0.0;
  if (actualDepth > 0.5 && actualDepth < 8.0) {
    breakingZone = smoothstep(0.5, 3.0, actualDepth) * (1.0 - smoothstep(5.0, 8.0, actualDepth));
  }
  
  // Multi-scale foam noise for organic appearance
  vec2 foamCoord1 = vWorldPosition.xz * 0.4 + vec2(time * 0.3, time * 0.2);
  vec2 foamCoord2 = vWorldPosition.xz * 0.8 - vec2(time * 0.5, time * 0.4);
  vec2 foamCoord3 = vWorldPosition.xz * 1.5 + vec2(time * 0.7, -time * 0.6);
  
  float foamNoise1 = fbm(foamCoord1);
  float foamNoise2 = fbm(foamCoord2);
  float foamNoise3 = noise(foamCoord3);
  
  // Combine with different weights for variety
  float foamPattern = foamNoise1 * 0.4 + foamNoise2 * 0.35 + foamNoise3 * 0.25;
  
  // Wave height-based foam (foam at peaks)
  float waveHeightNorm = vWaveHeight / max(waveStrength, 0.01);
  float peakFoam = smoothstep(0.3, 0.8, waveHeightNorm);
  peakFoam *= smoothstep(0.3, 0.7, foamPattern);
  
  // === BARREL LIP FOAM (intense spray and foam curtain) ===
  float barrelLipFoam = 0.0;
  if (vBarrelIntensity > 0.1) {
    // Intense foam at the lip of the barrel
    float lipNoise = fbm(vWorldPosition.xz * 0.6 + time * 1.5);
    float lipFoam = smoothstep(0.4, 0.9, lipNoise) * vBarrelIntensity;
    
    // Spray effect (mist from the lip)
    float sprayNoise = noise(vWorldPosition.xz * 2.0 + time * 2.0);
    float spray = smoothstep(0.5, 1.0, sprayNoise) * vBarrelIntensity * 0.8;
    
    // Curtain of foam falling from the lip
    float curtain = smoothstep(0.3, 0.7, foamNoise1) * vBarrelIntensity * 1.2;
    
    barrelLipFoam = max(max(lipFoam, spray), curtain);
  }
  
  // Breaking wave foam - irregular and patchy
  float breakingFoam = 0.0;
  if (breakingZone > 0.2) {
    // Create irregular foam patches
    float patch1 = smoothstep(0.5, 0.8, foamNoise1) * breakingZone;
    float patch2 = smoothstep(0.4, 0.75, foamNoise2) * breakingZone * 0.8;
    
    // Add some larger foam areas
    float largePatch = smoothstep(0.6, 0.9, fbm(vWorldPosition.xz * 0.15 + time * 0.2));
    largePatch *= breakingZone;
    
    breakingFoam = max(max(patch1, patch2), largePatch * 0.6);
  }
  
  // === SHORE WASH FOAM (persistent foam at the water's edge) ===
  float washFoam = 0.0;
  if (vShoreWash > 0.1) {
    // Dense foam in the wash zone
    float washNoise1 = fbm(vWorldPosition.xz * 1.2 + time * 0.4);
    float washNoise2 = noise(vWorldPosition.xz * 2.5 - time * 0.6);
    
    // Very dense foam that lingers
    washFoam = smoothstep(0.2, 0.8, washNoise1) * vShoreWash;
    washFoam = max(washFoam, smoothstep(0.4, 0.9, washNoise2) * vShoreWash * 0.7);
    
    // Bubbles and texture in the wash
    float bubbles = noise(vWorldPosition.xz * 5.0 + time * 1.0);
    washFoam += bubbles * vShoreWash * 0.3;
  }
  
  // Foam streaks and trails
  float streakNoise = abs(noise(vWorldPosition.xz * 0.6 + vec2(time * 1.2, time * 0.8)));
  float streaks = smoothstep(0.6, 0.9, streakNoise) * breakingZone * 0.5;
  
  // Localized intense foam bursts
  float burst1 = smoothstep(0.8, 0.95, foamNoise1) * peakFoam;
  float burst2 = smoothstep(0.75, 0.9, foamNoise3) * breakingZone;
  
  // Combine all foam types with priorities
  float foamFactor = peakFoam * 0.2 + breakingFoam * 0.5 + streaks + burst1 * 0.3 + burst2 * 0.4;
  
  // Barrel lip foam is most intense
  foamFactor = max(foamFactor, barrelLipFoam * 1.5);
  
  // Shore wash foam is dense and persistent
  foamFactor = max(foamFactor, washFoam * 1.3);
  
  foamFactor = clamp(foamFactor, 0.0, 1.0);
  
  // Add temporal variation to foam (foam appears and disappears)
  float foamFlicker = 0.85 + noise(vWorldPosition.xz * 2.0 + time * 3.0) * 0.15;
  foamFactor *= foamFlicker;
  
  // === Combine everything ===
  vec3 finalColor = waterColor * 0.3;
  finalColor += diffuse;
  finalColor += specColor;
  finalColor += skyReflection;
  finalColor += subsurface;
  
  // Blend foam with water - foam is bright and slightly reflective
  vec3 foamWithHighlight = foamColor + specColor * 0.3;
  finalColor = mix(finalColor, foamWithHighlight, foamFactor * 0.8);
  
  // Extra brightness in intense foam areas
  finalColor += vec3(1.0) * foamFactor * foamFactor * 0.15;
  
  // Tone mapping
  finalColor = finalColor / (finalColor + vec3(1.0));
  finalColor = pow(finalColor, vec3(1.0 / 2.2));
  
  // Transparency - foam is more opaque
  float alpha = mix(0.7, 0.95, fresnel);
  alpha = mix(alpha, 1.0, vDepth * 0.3);
  alpha = mix(alpha, 0.98, foamFactor * 0.6); // Foam is less transparent
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
        terrainHeightMap: { value: null }, // Will be set from terrain system
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
   * Sets the terrain heightmap texture - THIS IS THE KEY!
   * Water can now "see" the actual terrain
   */
  setTerrainHeightmap(texture: THREE.DataTexture, terrainSize: number): void {
    this.material.uniforms.terrainHeightMap.value = texture;
    this.material.uniforms.terrainSize.value = new THREE.Vector2(terrainSize, terrainSize);
  }

  /**
   * Disposes of geometry and material
   */
  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}

