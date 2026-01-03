/**
 * Hydraulic Erosion System Module
 * Simulates water flow, erosion, and river formation on terrain
 */

import { TerrainSystem } from './terrain';

export interface ErosionConfig {
  enabled: boolean;
  intensity: number; // Overall erosion strength (0-1)
  waterAmount: number; // Amount of water to simulate (0-1)
  evaporationRate: number; // How fast water evaporates (0-1)
  sedimentCapacity: number; // Maximum sediment a drop can carry
  erosionRate: number; // How fast terrain erodes (0-1)
  depositionRate: number; // How fast sediment deposits (0-1)
  minSlope: number; // Minimum slope for erosion to occur
  gravity: number; // Gravity strength for water flow
  iterations: number; // Number of erosion iterations per frame
  dropRadius: number; // Radius of influence for each water drop
}

export const defaultErosionConfig: ErosionConfig = {
  enabled: false,
  intensity: 0.5,
  waterAmount: 0.3,
  evaporationRate: 0.01,
  sedimentCapacity: 0.1,
  erosionRate: 0.3,
  depositionRate: 0.3,
  minSlope: 0.01,
  gravity: 9.8,
  iterations: 10,
  dropRadius: 1.0,
};

interface WaterDrop {
  x: number;
  z: number;
  velocityX: number;
  velocityZ: number;
  water: number;
  sediment: number;
}

export class ErosionSystem {
  private terrain: TerrainSystem;
  private config: ErosionConfig;
  private waterMap: Float32Array; // Water height at each vertex
  private sedimentMap: Float32Array; // Sediment amount at each vertex
  private flowMap: Float32Array; // Water flow direction and magnitude
  private timeAccumulator: number = 0;
  private frameInterval: number = 0.016; // ~60fps

  constructor(terrain: TerrainSystem, config: Partial<ErosionConfig> = {}) {
    this.terrain = terrain;
    this.config = { ...defaultErosionConfig, ...config };

    // Initialize water and sediment maps
    const vertexCount = (terrain.config.segments + 1) * (terrain.config.segments + 1);
    this.waterMap = new Float32Array(vertexCount);
    this.sedimentMap = new Float32Array(vertexCount);
    this.flowMap = new Float32Array(vertexCount * 2); // 2 components (x, z) per vertex
  }

  /**
   * Updates erosion configuration
   */
  updateConfig(config: Partial<ErosionConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Gets vertex index from world coordinates
   */
  private getVertexIndex(x: number, z: number): number | null {
    const { size, segments } = this.terrain.config;
    const halfSize = size / 2;

    // Convert world coords to grid coords
    const gridX = ((x + halfSize) / size) * segments;
    const gridZ = ((z + halfSize) / size) * segments;

    // Clamp to valid range
    const i = Math.floor(Math.max(0, Math.min(segments, gridZ)));
    const j = Math.floor(Math.max(0, Math.min(segments, gridX)));

    if (i < 0 || i > segments || j < 0 || j > segments) {
      return null;
    }

    return i * (segments + 1) + j;
  }

  /**
   * Gets world position from vertex index
   */
  private getWorldPosition(index: number): { x: number; z: number } {
    const { size, segments } = this.terrain.config;
    const halfSize = size / 2;
    const gridSize = size / segments;

    const i = Math.floor(index / (segments + 1));
    const j = index % (segments + 1);

    const x = -halfSize + j * gridSize;
    const z = -halfSize + i * gridSize;

    return { x, z };
  }

  /**
   * Gets height at vertex index
   */
  private getHeight(index: number): number {
    return this.terrain.heightmap[index];
  }

  /**
   * Gets neighbors of a vertex (4-connected)
   */
  private getNeighbors(index: number): number[] {
    const { segments } = this.terrain.config;
    const i = Math.floor(index / (segments + 1));
    const j = index % (segments + 1);
    const neighbors: number[] = [];

    // 4-connected neighbors
    if (i > 0) neighbors.push((i - 1) * (segments + 1) + j); // Up
    if (i < segments) neighbors.push((i + 1) * (segments + 1) + j); // Down
    if (j > 0) neighbors.push(i * (segments + 1) + (j - 1)); // Left
    if (j < segments) neighbors.push(i * (segments + 1) + (j + 1)); // Right

    return neighbors;
  }

  /**
   * Calculates water flow direction based on height differences
   * Returns normalized direction vector and magnitude (steepness)
   */
  private calculateFlowDirection(index: number): { dirX: number; dirZ: number; magnitude: number } {
    const height = this.getHeight(index);
    const pos = this.getWorldPosition(index);

    let steepestDirX = 0;
    let steepestDirZ = 0;
    let maxGradient = 0;

    // Check 4-connected neighbors to find steepest descent
    const neighbors = this.getNeighbors(index);
    for (const neighborIdx of neighbors) {
      const neighborPos = this.getWorldPosition(neighborIdx);
      const neighborHeight = this.getHeight(neighborIdx);

      const dx = neighborPos.x - pos.x;
      const dz = neighborPos.z - pos.z;
      const distance = Math.sqrt(dx * dx + dz * dz);

      if (distance > 0) {
        const heightDiff = height - neighborHeight;
        const gradient = heightDiff / distance;

        // Track the steepest direction (water flows downhill)
        if (gradient > maxGradient) {
          maxGradient = gradient;
          steepestDirX = dx / distance;
          steepestDirZ = dz / distance;
        }
      }
    }

    // If no downhill direction found, use a small random direction to break symmetry
    if (maxGradient <= 0) {
      const angle = Math.random() * Math.PI * 2;
      steepestDirX = Math.cos(angle) * 0.01;
      steepestDirZ = Math.sin(angle) * 0.01;
      maxGradient = 0.01;
    }

    // Normalize direction
    const dirLength = Math.sqrt(steepestDirX * steepestDirX + steepestDirZ * steepestDirZ);
    if (dirLength > 0) {
      steepestDirX /= dirLength;
      steepestDirZ /= dirLength;
    }

    return {
      dirX: steepestDirX,
      dirZ: steepestDirZ,
      magnitude: Math.max(0, maxGradient), // Ensure non-negative
    };
  }

  /**
   * Simulates a single water drop
   */
  private simulateDrop(startX: number, startZ: number): void {
    const drop: WaterDrop = {
      x: startX,
      z: startZ,
      velocityX: 0,
      velocityZ: 0,
      water: this.config.waterAmount,
      sediment: 0,
    };

    const maxSteps = 100;
    const dt = 0.1;
    const { size, segments } = this.terrain.config;
    const halfSize = size / 2;

    for (let step = 0; step < maxSteps; step++) {
      // Get current position index
      const idx = this.getVertexIndex(drop.x, drop.z);
      if (idx === null) break;

      const height = this.getHeight(idx);
      const flow = this.calculateFlowDirection(idx);

      // Update velocity based on gradient (water flows downhill)
      const acceleration = this.config.gravity * flow.magnitude;
      drop.velocityX += flow.dirX * acceleration * dt;
      drop.velocityZ += flow.dirZ * acceleration * dt;

      // Apply friction
      const friction = 0.9;
      drop.velocityX *= friction;
      drop.velocityZ *= friction;

      // Move drop
      const oldX = drop.x;
      const oldZ = drop.z;
      drop.x += drop.velocityX * dt;
      drop.z += drop.velocityZ * dt;

      // Check bounds
      if (Math.abs(drop.x) > halfSize || Math.abs(drop.z) > halfSize) break;

      // Get new position
      const newIdx = this.getVertexIndex(drop.x, drop.z);
      if (newIdx === null) break;

      const newHeight = this.getHeight(newIdx);
      const heightDiff = height - newHeight;

      // Calculate sediment capacity (more capacity with faster flow and steeper slopes)
      const speed = Math.sqrt(drop.velocityX * drop.velocityX + drop.velocityZ * drop.velocityZ);
      const capacity = this.config.sedimentCapacity * (speed + 0.1) * Math.max(0, heightDiff + 0.01);

      // Erosion: if carrying less sediment than capacity, erode terrain
      if (drop.sediment < capacity && heightDiff > this.config.minSlope) {
        const erosionAmount = Math.min(
          (capacity - drop.sediment) * this.config.erosionRate * dt * drop.water,
          heightDiff * 0.3 // Don't erode more than 30% of the height difference
        );

        // Erode from current position
        if (idx !== null && erosionAmount > 0.0001) {
          this.terrain.heightmap[idx] -= erosionAmount * this.config.intensity;
          drop.sediment += erosionAmount;
        }
      }

      // Deposition: if carrying more sediment than capacity, deposit
      if (drop.sediment > capacity) {
        const depositAmount = (drop.sediment - capacity) * this.config.depositionRate * dt * drop.water;

        // Deposit at current position
        if (idx !== null && depositAmount > 0.0001) {
          this.terrain.heightmap[idx] += depositAmount * this.config.intensity;
          drop.sediment -= depositAmount;
        }
      }

      // Evaporation
      drop.water *= 1 - this.config.evaporationRate * dt;
      if (drop.water < 0.001) break;

      // Stop if velocity is too low and on flat terrain
      if (speed < 0.001 && Math.abs(heightDiff) < 0.01) break;
    }
  }

  /**
   * Adds water at random positions (rain simulation)
   */
  private addRain(): void {
    const { size, segments } = this.terrain.config;
    const halfSize = size / 2;

    // Add water drops at random positions
    const numDrops = Math.floor(this.config.iterations);
    for (let i = 0; i < numDrops; i++) {
      const x = (Math.random() - 0.5) * size * 0.8; // Keep away from edges
      const z = (Math.random() - 0.5) * size * 0.8;

      // Prefer higher elevations for rain
      const idx = this.getVertexIndex(x, z);
      if (idx !== null) {
        const height = this.getHeight(idx);
        // Only add rain above sea level or on high terrain
        if (height > 0 || Math.random() > 0.7) {
          this.simulateDrop(x, z);
        }
      }
    }
  }

  /**
   * Updates water flow and erosion - call every frame
   */
  update(deltaTime: number): void {
    if (!this.config.enabled) return;

    this.timeAccumulator += deltaTime;

    // Run erosion simulation at fixed intervals
    if (this.timeAccumulator >= this.frameInterval) {
      this.timeAccumulator = 0;

      // Simulate rain and water flow
      this.addRain();

      // Update terrain geometry
      const positions = this.terrain.geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < this.terrain.heightmap.length; i++) {
        positions[i * 3 + 1] = this.terrain.heightmap[i];
      }

      this.terrain.geometry.attributes.position.needsUpdate = true;
      this.terrain.geometry.computeVertexNormals();
      this.terrain.updateHeightmapTexture();
    }
  }

  /**
   * Applies erosion at a specific location (for brush tool)
   */
  applyErosionAt(x: number, z: number, radius: number, strength: number): void {
    const { size, segments } = this.terrain.config;
    const halfSize = size / 2;

    // Add multiple drops in the area
    const numDrops = Math.floor(strength * 20);
    for (let i = 0; i < numDrops; i++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.random() * radius;
      const dropX = x + Math.cos(angle) * distance;
      const dropZ = z + Math.sin(angle) * distance;

      if (Math.abs(dropX) < halfSize && Math.abs(dropZ) < halfSize) {
        this.simulateDrop(dropX, dropZ);
      }
    }

    // Update terrain geometry
    const positions = this.terrain.geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < this.terrain.heightmap.length; i++) {
      positions[i * 3 + 1] = this.terrain.heightmap[i];
    }

    this.terrain.geometry.attributes.position.needsUpdate = true;
    this.terrain.geometry.computeVertexNormals();
    this.terrain.updateHeightmapTexture();
  }

  /**
   * Resets water and sediment maps
   */
  reset(): void {
    this.waterMap.fill(0);
    this.sedimentMap.fill(0);
    this.flowMap.fill(0);
  }

  /**
   * Disposes of resources
   */
  dispose(): void {
    // Arrays are automatically garbage collected
  }
}

