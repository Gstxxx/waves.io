/**
 * Brush System Module
 * Implements terrain editing brushes: Raise, Lower, Smooth, Flatten, Erosion
 */

import { TerrainSystem } from './terrain';

export type BrushType = 'raise' | 'lower' | 'smooth' | 'flatten' | 'erosion';

export interface BrushConfig {
  radius: number;
  strength: number;
  type: BrushType;
}

export const defaultBrushConfig: BrushConfig = {
  radius: 10,
  strength: 0.5,
  type: 'raise',
};

/**
 * Quadratic falloff function for smooth brush edges
 */
export function quadraticFalloff(distance: number, radius: number): number {
  const t = 1 - distance / radius;
  return t * t;
}

/**
 * Cosine falloff function for even smoother edges
 */
export function cosineFalloff(distance: number, radius: number): number {
  const t = distance / radius;
  return (Math.cos(t * Math.PI) + 1) * 0.5;
}

/**
 * Gaussian falloff function
 */
export function gaussianFalloff(distance: number, radius: number): number {
  const sigma = radius / 3;
  return Math.exp(-(distance * distance) / (2 * sigma * sigma));
}

/**
 * Applies the raise brush - increases terrain height
 */
export function applyRaiseBrush(
  terrain: TerrainSystem,
  x: number,
  z: number,
  config: BrushConfig
): void {
  terrain.modifyHeight(
    x, z,
    config.radius,
    config.strength,
    cosineFalloff
  );
}

/**
 * Applies the lower brush - decreases terrain height
 */
export function applyLowerBrush(
  terrain: TerrainSystem,
  x: number,
  z: number,
  config: BrushConfig
): void {
  terrain.modifyHeight(
    x, z,
    config.radius,
    -config.strength,
    cosineFalloff
  );
}

/**
 * Applies the smooth brush - averages nearby heights
 */
export function applySmoothBrush(
  terrain: TerrainSystem,
  x: number,
  z: number,
  config: BrushConfig
): void {
  const { indices, heights, positions } = terrain.getHeightmapRegion(x, z, config.radius);
  const changes = new Map<number, number>();
  
  // Calculate smoothed heights
  for (let i = 0; i < indices.length; i++) {
    const pos = positions[i];
    const dx = pos.x - x;
    const dz = pos.z - z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    
    if (distance > config.radius) continue;
    
    // Find neighbors and calculate average
    let sum = 0;
    let count = 0;
    const neighborRadius = config.radius * 0.3;
    
    for (let j = 0; j < indices.length; j++) {
      const nPos = positions[j];
      const ndx = nPos.x - pos.x;
      const ndz = nPos.z - pos.z;
      const nDist = Math.sqrt(ndx * ndx + ndz * ndz);
      
      if (nDist <= neighborRadius) {
        const weight = gaussianFalloff(nDist, neighborRadius);
        sum += heights[j] * weight;
        count += weight;
      }
    }
    
    if (count > 0) {
      const avgHeight = sum / count;
      const factor = cosineFalloff(distance, config.radius) * config.strength;
      const newHeight = heights[i] + (avgHeight - heights[i]) * factor;
      changes.set(indices[i], newHeight);
    }
  }
  
  terrain.applyHeightmapChanges(changes);
}

/**
 * Applies the flatten brush - levels terrain to average height
 */
export function applyFlattenBrush(
  terrain: TerrainSystem,
  x: number,
  z: number,
  config: BrushConfig
): void {
  const { indices, heights, positions } = terrain.getHeightmapRegion(x, z, config.radius);
  
  // Calculate target height (center area average)
  let centerSum = 0;
  let centerCount = 0;
  const centerRadius = config.radius * 0.2;
  
  for (let i = 0; i < indices.length; i++) {
    const pos = positions[i];
    const dx = pos.x - x;
    const dz = pos.z - z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    
    if (distance <= centerRadius) {
      centerSum += heights[i];
      centerCount++;
    }
  }
  
  const targetHeight = centerCount > 0 ? centerSum / centerCount : 0;
  const changes = new Map<number, number>();
  
  // Apply flattening
  for (let i = 0; i < indices.length; i++) {
    const pos = positions[i];
    const dx = pos.x - x;
    const dz = pos.z - z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    
    if (distance > config.radius) continue;
    
    const factor = cosineFalloff(distance, config.radius) * config.strength;
    const newHeight = heights[i] + (targetHeight - heights[i]) * factor;
    changes.set(indices[i], newHeight);
  }
  
  terrain.applyHeightmapChanges(changes);
}

/**
 * Applies the erosion brush - simulates erosion via blur + slope detection
 */
export function applyErosionBrush(
  terrain: TerrainSystem,
  x: number,
  z: number,
  config: BrushConfig
): void {
  const { indices, heights, positions } = terrain.getHeightmapRegion(x, z, config.radius);
  const changes = new Map<number, number>();
  
  // Multi-pass erosion simulation
  const passes = 3;
  const erosionStrength = config.strength * 0.3;
  
  let currentHeights = [...heights];
  
  for (let pass = 0; pass < passes; pass++) {
    const newHeights = [...currentHeights];
    
    for (let i = 0; i < indices.length; i++) {
      const pos = positions[i];
      const dx = pos.x - x;
      const dz = pos.z - z;
      const distance = Math.sqrt(dx * dx + dz * dz);
      
      if (distance > config.radius) continue;
      
      // Calculate local slope
      let maxSlope = 0;
      let lowestNeighbor = currentHeights[i];
      const neighborRadius = config.radius * 0.15;
      
      for (let j = 0; j < indices.length; j++) {
        if (i === j) continue;
        
        const nPos = positions[j];
        const ndx = nPos.x - pos.x;
        const ndz = nPos.z - pos.z;
        const nDist = Math.sqrt(ndx * ndx + ndz * ndz);
        
        if (nDist <= neighborRadius && nDist > 0) {
          const slope = (currentHeights[i] - currentHeights[j]) / nDist;
          if (slope > maxSlope) {
            maxSlope = slope;
            lowestNeighbor = currentHeights[j];
          }
        }
      }
      
      // Erode based on slope
      if (maxSlope > 0.1) {
        const factor = cosineFalloff(distance, config.radius) * erosionStrength;
        const erosionAmount = maxSlope * factor;
        newHeights[i] = currentHeights[i] - erosionAmount;
        
        // Deposit at lower neighbor (simplified)
        // This is a fake erosion - real erosion would track sediment
      }
    }
    
    currentHeights = newHeights;
  }
  
  // Apply final changes
  for (let i = 0; i < indices.length; i++) {
    const pos = positions[i];
    const dx = pos.x - x;
    const dz = pos.z - z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    
    if (distance <= config.radius) {
      changes.set(indices[i], currentHeights[i]);
    }
  }
  
  terrain.applyHeightmapChanges(changes);
}

/**
 * Main brush application function
 */
export function applyBrush(
  terrain: TerrainSystem,
  x: number,
  z: number,
  config: BrushConfig
): void {
  switch (config.type) {
    case 'raise':
      applyRaiseBrush(terrain, x, z, config);
      break;
    case 'lower':
      applyLowerBrush(terrain, x, z, config);
      break;
    case 'smooth':
      applySmoothBrush(terrain, x, z, config);
      break;
    case 'flatten':
      applyFlattenBrush(terrain, x, z, config);
      break;
    case 'erosion':
      applyErosionBrush(terrain, x, z, config);
      break;
  }
}

/**
 * Brush cursor helper - returns vertices within brush radius for visualization
 */
export function getBrushAffectedArea(
  terrain: TerrainSystem,
  x: number,
  z: number,
  radius: number
): { x: number; y: number; z: number }[] {
  const { positions } = terrain.getHeightmapRegion(x, z, radius);
  const affected: { x: number; y: number; z: number }[] = [];
  
  for (const pos of positions) {
    const dx = pos.x - x;
    const dz = pos.z - z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    
    if (distance <= radius) {
      affected.push({
        x: pos.x,
        y: terrain.getHeightAt(pos.x, pos.z),
        z: pos.z,
      });
    }
  }
  
  return affected;
}

