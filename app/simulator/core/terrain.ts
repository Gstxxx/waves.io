/**
 * Terrain System Module
 * Handles terrain geometry, heightmap, and real-time editing
 */

import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';

export interface TerrainConfig {
  size: number;
  segments: number;
  maxHeight: number;
  minHeight: number;
  noiseScale: number;
  noiseOctaves: number;
}

export const defaultTerrainConfig: TerrainConfig = {
  size: 256,
  segments: 256,
  maxHeight: 15,
  minHeight: -5,
  noiseScale: 0.02,
  noiseOctaves: 4,
};

export class TerrainSystem {
  public mesh: THREE.Mesh;
  public geometry: THREE.PlaneGeometry;
  public heightmap: Float32Array;
  public config: TerrainConfig;
  public heightmapTexture: THREE.DataTexture; // GPU texture for water shader

  private noise2D: ReturnType<typeof createNoise2D>;
  private material: THREE.ShaderMaterial;

  constructor(config: Partial<TerrainConfig> = {}) {
    this.config = { ...defaultTerrainConfig, ...config };
    this.noise2D = createNoise2D();

    // Initialize heightmap
    const vertexCount = (this.config.segments + 1) * (this.config.segments + 1);
    this.heightmap = new Float32Array(vertexCount);

    // Create geometry
    this.geometry = new THREE.PlaneGeometry(
      this.config.size,
      this.config.size,
      this.config.segments,
      this.config.segments
    );
    this.geometry.rotateX(-Math.PI / 2);

    // Create material (will be replaced by shader material later)
    this.material = this.createMaterial();

    // Create mesh
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = true;

    // Generate initial terrain
    this.generateInitialTerrain();

    // Create heightmap texture for water shader
    this.heightmapTexture = this.createHeightmapTexture();
  }

  /**
   * Creates a DataTexture from the heightmap for GPU access
   * Stores height values as world units directly (no normalization)
   * This allows the water shader to read terrain height directly
   */
  createHeightmapTexture(): THREE.DataTexture {
    const size = this.config.segments + 1;

    // Create data array and copy heightmap values directly (world units)
    const data = new Float32Array(size * size);

    for (let i = 0; i < this.heightmap.length; i++) {
      data[i] = this.heightmap[i]; // Store world units directly
    }

    const texture = new THREE.DataTexture(
      data,
      size,
      size,
      THREE.RedFormat, // Single channel (R32F equivalent)
      THREE.FloatType   // 32-bit float per channel
    );

    texture.needsUpdate = true;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.magFilter = THREE.NearestFilter; // No smoothing
    texture.minFilter = THREE.NearestFilter;  // No smoothing

    return texture;
  }

  /**
   * Updates the heightmap texture after terrain modifications
   * Copies heightmap values directly as world units (no normalization)
   */
  updateHeightmapTexture(): void {
    const data = this.heightmapTexture.image.data as Float32Array;

    // Copy heightmap values directly to texture data (world units)
    for (let i = 0; i < this.heightmap.length; i++) {
      data[i] = this.heightmap[i];
    }

    this.heightmapTexture.needsUpdate = true;
  }

  /**
   * Creates the terrain shader material
   */
  private createMaterial(): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      uniforms: {
        sandColor: { value: new THREE.Color('#c2b280') },
        rockColor: { value: new THREE.Color('#6b5b4f') },
        grassColor: { value: new THREE.Color('#4a7c3f') },
        seaLevel: { value: 2.0 },
        sunDirection: { value: new THREE.Vector3(0.5, 0.8, 0.3).normalize() },
        ambientLight: { value: new THREE.Color('#87CEEB') },
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        varying vec3 vNormal;
        varying float vHeight;
        
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPos.xyz;
          vHeight = position.y;
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: `
        uniform vec3 sandColor;
        uniform vec3 rockColor;
        uniform vec3 grassColor;
        uniform float seaLevel;
        uniform vec3 sunDirection;
        uniform vec3 ambientLight;
        
        varying vec3 vWorldPosition;
        varying vec3 vNormal;
        varying float vHeight;
        
        void main() {
          // Height-based color blending
          float heightFactor = clamp((vHeight - seaLevel) / 10.0, 0.0, 1.0);
          float slopeFactor = 1.0 - abs(dot(vNormal, vec3(0.0, 1.0, 0.0)));
          
          // Blend between sand, grass, and rock
          vec3 baseColor = mix(sandColor, grassColor, smoothstep(0.0, 0.5, heightFactor));
          baseColor = mix(baseColor, rockColor, smoothstep(0.3, 0.6, slopeFactor));
          
          // Wet sand near water
          float wetFactor = 1.0 - smoothstep(seaLevel - 0.5, seaLevel + 1.0, vHeight);
          baseColor = mix(baseColor, sandColor * 0.6, wetFactor);
          
          // Simple lighting
          float diffuse = max(dot(vNormal, sunDirection), 0.0);
          vec3 lighting = ambientLight * 0.3 + vec3(1.0) * diffuse * 0.7;
          
          gl_FragColor = vec4(baseColor * lighting, 1.0);
        }
      `,
    });
  }

  /**
   * Generates initial terrain using simplex noise
   */
  generateInitialTerrain(): void {
    const positions = this.geometry.attributes.position.array as Float32Array;
    const { segments, noiseScale, noiseOctaves, maxHeight, minHeight } = this.config;

    // Helper function for smooth transitions
    const smoothstep = (edge0: number, edge1: number, x: number): number => {
      const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
      return t * t * (3 - 2 * t);
    };

    for (let i = 0; i <= segments; i++) {
      for (let j = 0; j <= segments; j++) {
        const index = i * (segments + 1) + j;
        const vertexIndex = index * 3;

        const x = positions[vertexIndex];
        const z = positions[vertexIndex + 2];

        // Multi-octave noise for natural terrain
        let height = 0;
        let amplitude = 1;
        let frequency = noiseScale;
        let maxAmplitude = 0;

        for (let o = 0; o < noiseOctaves; o++) {
          height += this.noise2D(x * frequency, z * frequency) * amplitude;
          maxAmplitude += amplitude;
          amplitude *= 0.5;
          frequency *= 2;
        }

        height = (height / maxAmplitude) * 0.5 + 0.5; // Normalize to 0-1
        height = minHeight + height * (maxHeight - minHeight);

        // Create natural coastal terrain - land extends to edges
        // Add gradual slope towards one side (ocean side)
        const oceanSide = z / (this.config.size * 0.5); // -1 to 1
        const coastalSlope = smoothstep(-0.8, 0.8, oceanSide);

        // Land is higher inland, slopes down towards ocean
        height = height * (1.0 - coastalSlope * 0.6) + coastalSlope * minHeight;

        this.heightmap[index] = height;
        positions[vertexIndex + 1] = height;
      }
    }

    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.computeVertexNormals();
  }

  /**
   * Gets height at world coordinates
   */
  getHeightAt(x: number, z: number): number {
    const { size, segments } = this.config;
    const halfSize = size / 2;

    // Convert world coords to grid coords
    const gridX = ((x + halfSize) / size) * segments;
    const gridZ = ((z + halfSize) / size) * segments;

    // Clamp to valid range
    const i = Math.floor(Math.max(0, Math.min(segments, gridZ)));
    const j = Math.floor(Math.max(0, Math.min(segments, gridX)));

    const index = i * (segments + 1) + j;
    return this.heightmap[index] ?? 0;
  }

  /**
   * Modifies terrain height at given world position
   */
  modifyHeight(
    centerX: number,
    centerZ: number,
    radius: number,
    strength: number,
    falloff: (distance: number, radius: number) => number
  ): void {
    const { size, segments } = this.config;
    const halfSize = size / 2;
    const positions = this.geometry.attributes.position.array as Float32Array;

    // Calculate affected grid range
    const gridRadius = (radius / size) * segments;
    const centerGridX = ((centerX + halfSize) / size) * segments;
    const centerGridZ = ((centerZ + halfSize) / size) * segments;

    const minI = Math.max(0, Math.floor(centerGridZ - gridRadius));
    const maxI = Math.min(segments, Math.ceil(centerGridZ + gridRadius));
    const minJ = Math.max(0, Math.floor(centerGridX - gridRadius));
    const maxJ = Math.min(segments, Math.ceil(centerGridX + gridRadius));

    for (let i = minI; i <= maxI; i++) {
      for (let j = minJ; j <= maxJ; j++) {
        const index = i * (segments + 1) + j;
        const vertexIndex = index * 3;

        const vx = positions[vertexIndex];
        const vz = positions[vertexIndex + 2];

        const dx = vx - centerX;
        const dz = vz - centerZ;
        const distance = Math.sqrt(dx * dx + dz * dz);

        if (distance <= radius) {
          const factor = falloff(distance, radius);
          const delta = strength * factor;

          this.heightmap[index] += delta;
          positions[vertexIndex + 1] = this.heightmap[index];
        }
      }
    }

    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.computeVertexNormals();

    // Update heightmap texture for water shader
    this.updateHeightmapTexture();
  }

  /**
   * Gets heightmap data for a region (used by smooth/erosion)
   */
  getHeightmapRegion(
    centerX: number,
    centerZ: number,
    radius: number
  ): { indices: number[]; heights: number[]; positions: { x: number; z: number }[] } {
    const { size, segments } = this.config;
    const halfSize = size / 2;
    const positions = this.geometry.attributes.position.array as Float32Array;

    const gridRadius = (radius / size) * segments;
    const centerGridX = ((centerX + halfSize) / size) * segments;
    const centerGridZ = ((centerZ + halfSize) / size) * segments;

    const minI = Math.max(0, Math.floor(centerGridZ - gridRadius));
    const maxI = Math.min(segments, Math.ceil(centerGridZ + gridRadius));
    const minJ = Math.max(0, Math.floor(centerGridX - gridRadius));
    const maxJ = Math.min(segments, Math.ceil(centerGridX + gridRadius));

    const indices: number[] = [];
    const heights: number[] = [];
    const posArray: { x: number; z: number }[] = [];

    for (let i = minI; i <= maxI; i++) {
      for (let j = minJ; j <= maxJ; j++) {
        const index = i * (segments + 1) + j;
        const vertexIndex = index * 3;

        indices.push(index);
        heights.push(this.heightmap[index]);
        posArray.push({
          x: positions[vertexIndex],
          z: positions[vertexIndex + 2],
        });
      }
    }

    return { indices, heights, positions: posArray };
  }

  /**
   * Applies heightmap changes directly
   */
  applyHeightmapChanges(changes: Map<number, number>): void {
    const positions = this.geometry.attributes.position.array as Float32Array;

    changes.forEach((height, index) => {
      this.heightmap[index] = height;
      positions[index * 3 + 1] = height;
    });

    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.computeVertexNormals();

    // Update heightmap texture for water shader
    this.updateHeightmapTexture();
  }

  /**
   * Updates shader uniforms
   */
  updateUniforms(uniforms: Partial<{
    sandColor: THREE.Color;
    seaLevel: number;
    sunDirection: THREE.Vector3;
  }>): void {
    if (uniforms.sandColor) {
      this.material.uniforms.sandColor.value = uniforms.sandColor;
    }
    if (uniforms.seaLevel !== undefined) {
      this.material.uniforms.seaLevel.value = uniforms.seaLevel;
    }
    if (uniforms.sunDirection) {
      this.material.uniforms.sunDirection.value = uniforms.sunDirection;
    }
  }

  /**
   * Disposes of geometry and material
   */
  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}

