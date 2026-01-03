/**
 * Hydraulic Erosion System Module
 * CPU-based erosion simulation operating on terrain heightmap
 */

import { TerrainSystem } from './terrain';

export interface ErosionConfig {
  rainfallRate: number; // Amount of water added per iteration
  erosionRate: number; // How fast terrain erodes
  depositionRate: number; // How fast sediment deposits
  evaporationRate: number; // Water removal rate per iteration
  maxErosion: number; // Maximum erosion per cell per step (stability)
  minSlopeForFlow: number; // Minimum slope for water to flow
  cellSize: number; // Physical size of each grid cell (for slope calculations)
  depositionThreshold: number; // Velocity threshold below which deposition occurs
  maxVelocity: number; // Maximum water velocity for calculations
  minWaterForFlow: number; // Minimum water amount for flow calculations
  // NEW: Debug and advanced parameters
  debugAggressive?: boolean; // Force aggressive erosion for visual testing
  capacityConstant?: number; // Sediment capacity constant
  maxSedimentCapacity?: number; // Maximum sediment capacity
  flowInertia?: number; // Flow direction inertia (0-1, higher = more channeling)
  debugVisualMode?: 'none' | 'water' | 'flow' | 'sediment' | 'heightDelta' | 'cumulative'; // Debug visualization mode
}

export const defaultErosionConfig: ErosionConfig = {
  rainfallRate: 0.01,
  erosionRate: 0.3,
  depositionRate: 0.3,
  evaporationRate: 0.01,
  maxErosion: 0.1,
  minSlopeForFlow: 0.001,
  cellSize: 1.0, // Will be calculated from terrain size / segments
  depositionThreshold: 0.1,
  maxVelocity: 10.0,
  minWaterForFlow: 0.0001,
  debugAggressive: false,
  capacityConstant: 10.0, // Sediment capacity multiplier
  maxSedimentCapacity: 1.0, // Maximum sediment a cell can carry
  flowInertia: 0.3, // Flow direction persistence (0 = no inertia, 1 = full inertia)
  debugVisualMode: 'none',
};

interface ErosionCell {
  waterAmount: number;
  sedimentAmount: number;
}

export class ErosionSystem {
  private terrain: TerrainSystem;
  private config: ErosionConfig;
  private waterMap: Float32Array; // Water amount per cell
  private sedimentMap: Float32Array; // Sediment amount per cell
  private flowMap: Float32Array; // Flow velocity per cell (for visualization)
  private flowDirectionMap: Float32Array; // Flow direction (encoded as vec2: x=dirX, y=dirZ)
  private heightDeltaMap: Float32Array; // Height change per iteration (for debug)
  private cumulativeErosionMap: Float32Array; // Cumulative erosion over time (negative = erosion, positive = deposition)
  private persistentFlowMap: Float32Array; // Persistent flow paths (accumulated flow over time)
  private gridSize: number; // (segments + 1)
  private cellSize: number; // Physical cell size

  constructor(terrain: TerrainSystem, config: Partial<ErosionConfig> = {}) {
    this.terrain = terrain;
    this.config = { ...defaultErosionConfig, ...config };

    // Calculate grid size and cell size
    this.gridSize = terrain.config.segments + 1;
    this.cellSize = terrain.config.size / terrain.config.segments;
    this.config.cellSize = this.cellSize; // Update config with actual cell size

    // Initialize water and sediment maps
    const cellCount = this.gridSize * this.gridSize;
    this.waterMap = new Float32Array(cellCount);
    this.sedimentMap = new Float32Array(cellCount);
    this.flowMap = new Float32Array(cellCount);
    this.flowDirectionMap = new Float32Array(cellCount * 2); // vec2 per cell
    this.heightDeltaMap = new Float32Array(cellCount);
    this.cumulativeErosionMap = new Float32Array(cellCount); // Track cumulative erosion/deposition
    this.persistentFlowMap = new Float32Array(cellCount); // Track persistent flow paths
  }

  /**
   * Run one iteration of the erosion simulation
   */
  step(): void {
    console.log('🟢 EROSION STEP CALLED');

    const { gridSize, cellSize } = this;
    const heightmap = this.terrain.heightmap;

    console.log('🟢 Step initialized:', {
      gridSize,
      cellSize,
      heightmapLength: heightmap.length,
      waterMapLength: this.waterMap.length,
    });

    // 1️⃣ DEBUG AGGRESSIVE MODE: Apply multipliers if enabled
    let effectiveRainfallRate = this.config.rainfallRate;
    let effectiveErosionRate = this.config.erosionRate;
    let effectiveMaxErosion = this.config.maxErosion;
    let effectiveEvaporationRate = this.config.evaporationRate;

    if (this.config.debugAggressive) {
      effectiveRainfallRate *= 10;
      effectiveErosionRate *= 5;
      effectiveMaxErosion *= 10;
      effectiveEvaporationRate = 0; // Disable evaporation in debug mode
    }

    // Temporary arrays for water and sediment (double buffering)
    const newWaterMap = new Float32Array(this.waterMap);
    const newSedimentMap = new Float32Array(this.sedimentMap);
    const newFlowDirectionMap = new Float32Array(this.flowDirectionMap);
    const heightChanges = new Map<number, number>();
    this.heightDeltaMap.fill(0); // Reset height delta for debug

    // 1. RAINFALL: Add water to all cells
    for (let i = 0; i < this.waterMap.length; i++) {
      newWaterMap[i] += effectiveRainfallRate;
    }

    // 2. WATER FLOW: Move water downhill based on slope + INERTIA + SEDIMENT TRANSPORT
    for (let row = 0; row < gridSize; row++) {
      for (let col = 0; col < gridSize; col++) {
        const index = row * gridSize + col;
        const waterAmount = newWaterMap[index];
        const sedimentAmount = newSedimentMap[index];

        if (waterAmount < this.config.minWaterForFlow) continue;

        const height = heightmap[index];

        // Get 4 neighbors (N, S, E, W)
        const neighbors = [
          { row: row - 1, col, index: (row - 1) * gridSize + col, dirX: 0, dirZ: -1 }, // North
          { row: row + 1, col, index: (row + 1) * gridSize + col, dirX: 0, dirZ: 1 }, // South
          { row, col: col - 1, index: row * gridSize + (col - 1), dirX: -1, dirZ: 0 }, // West
          { row, col: col + 1, index: row * gridSize + (col + 1), dirX: 1, dirZ: 0 }, // East
        ];

        // Get previous flow direction (for inertia)
        const prevDirX = this.flowDirectionMap[index * 2];
        const prevDirZ = this.flowDirectionMap[index * 2 + 1];

        // Calculate slopes to neighbors
        const slopes: number[] = [];
        let totalOutflow = 0;

        for (const neighbor of neighbors) {
          if (neighbor.row < 0 || neighbor.row >= gridSize ||
            neighbor.col < 0 || neighbor.col >= gridSize) {
            slopes.push(0);
            continue;
          }

          const neighborHeight = heightmap[neighbor.index];
          const slope = (height - neighborHeight) / cellSize;

          if (slope > this.config.minSlopeForFlow) {
            // Apply flow inertia: favor continuation in same direction
            let inertiaBonus = 0;
            if (this.config.flowInertia && this.config.flowInertia > 0) {
              const dotProduct = prevDirX * neighbor.dirX + prevDirZ * neighbor.dirZ;
              inertiaBonus = dotProduct * this.config.flowInertia * slope;
            }

            const adjustedSlope = slope + inertiaBonus;
            slopes.push(adjustedSlope);
            totalOutflow += adjustedSlope;
          } else {
            slopes.push(0);
          }
        }

        // Distribute water AND SEDIMENT to lower neighbors
        if (totalOutflow > 0) {
          let waterOutflow = 0;

          for (let i = 0; i < neighbors.length; i++) {
            const slope = slopes[i];
            if (slope > 0) {
              const flowRatio = slope / totalOutflow;
              const flow = waterAmount * flowRatio;
              const neighbor = neighbors[i];

              if (neighbor.row >= 0 && neighbor.row < gridSize &&
                neighbor.col >= 0 && neighbor.col < gridSize) {
                // Transport water
                newWaterMap[neighbor.index] += flow;
                waterOutflow += flow;

                // 3️⃣ TRANSPORT SEDIMENT WITH WATER (BUG FIX)
                if (waterAmount > 0) {
                  const sedimentFlow = sedimentAmount * flowRatio;
                  newSedimentMap[neighbor.index] += sedimentFlow;
                  newSedimentMap[index] -= sedimentFlow;
                }

                // Update flow direction (weighted average)
                const weight = flow / waterAmount;
                newFlowDirectionMap[neighbor.index * 2] =
                  newFlowDirectionMap[neighbor.index * 2] * (1 - weight) + neighbor.dirX * weight;
                newFlowDirectionMap[neighbor.index * 2 + 1] =
                  newFlowDirectionMap[neighbor.index * 2 + 1] * (1 - weight) + neighbor.dirZ * weight;
              }
            }
          }

          // Remove water that flowed out
          newWaterMap[index] -= waterOutflow;

          // Update flow direction for this cell
          if (waterOutflow > 0) {
            const avgDirX = neighbors.reduce((sum, n, i) => {
              if (slopes[i] > 0) return sum + n.dirX * (slopes[i] / totalOutflow);
              return sum;
            }, 0);
            const avgDirZ = neighbors.reduce((sum, n, i) => {
              if (slopes[i] > 0) return sum + n.dirZ * (slopes[i] / totalOutflow);
              return sum;
            }, 0);

            newFlowDirectionMap[index * 2] = avgDirX;
            newFlowDirectionMap[index * 2 + 1] = avgDirZ;
          }

          // Calculate flow velocity for this cell
          const velocity = Math.sqrt(waterAmount) * (totalOutflow / 4.0);
          this.flowMap[index] = velocity;
        } else {
          this.flowMap[index] = 0;
          newFlowDirectionMap[index * 2] = 0;
          newFlowDirectionMap[index * 2 + 1] = 0;
        }
      }
    }

    // 3. EROSION & DEPOSITION: Using SEDIMENT CAPACITY model (2️⃣)
    let erosionCount = 0;
    let depositionCount = 0;

    for (let row = 0; row < gridSize; row++) {
      for (let col = 0; col < gridSize; col++) {
        const index = row * gridSize + col;
        const waterAmount = newWaterMap[index];
        const velocity = this.flowMap[index];
        const currentSediment = newSedimentMap[index];

        if (waterAmount < this.config.minWaterForFlow) continue;

        // Calculate average slope to neighbors
        let avgSlope = 0;
        let neighborCount = 0;

        const neighbors = [
          { row: row - 1, col, index: (row - 1) * gridSize + col },
          { row: row + 1, col, index: (row + 1) * gridSize + col },
          { row, col: col - 1, index: row * gridSize + (col - 1) },
          { row, col: col + 1, index: row * gridSize + (col + 1) },
        ];

        const height = heightmap[index];
        for (const neighbor of neighbors) {
          if (neighbor.row >= 0 && neighbor.row < gridSize &&
            neighbor.col >= 0 && neighbor.col < gridSize) {
            const neighborHeight = heightmap[neighbor.index];
            const slope = Math.max(0, (height - neighborHeight) / cellSize);
            avgSlope += slope;
            neighborCount++;
          }
        }

        if (neighborCount > 0) {
          avgSlope /= neighborCount;
        }

        // Calculate sediment capacity
        const capacityConstant = this.config.capacityConstant || 10.0;
        const maxCapacity = this.config.maxSedimentCapacity || 1.0;
        const sedimentCapacity = Math.min(
          velocity * waterAmount * avgSlope * capacityConstant,
          maxCapacity
        );

        // Determine if we erode or deposit (never both)
        const currentHeight = heightChanges.has(index)
          ? heightChanges.get(index)!
          : heightmap[index];

        if (currentSediment < sedimentCapacity) {
          // ERODE: Need more sediment
          const deficit = sedimentCapacity - currentSediment;
          const erosion = Math.min(
            deficit * effectiveErosionRate,
            effectiveMaxErosion,
            waterAmount * velocity * avgSlope * effectiveErosionRate
          );

          if (erosion > 0.0001) {
            const newHeight = Math.max(
              currentHeight - erosion,
              this.terrain.config.minHeight
            );

            heightChanges.set(index, newHeight);
            newSedimentMap[index] += erosion;
            this.heightDeltaMap[index] = -erosion; // Track for debug
            erosionCount++;
          }
        } else if (currentSediment > sedimentCapacity) {
          // DEPOSIT: Too much sediment
          const excess = currentSediment - sedimentCapacity;
          const deposit = excess * this.config.depositionRate;

          if (deposit > 0.0001) {
            const newHeight = Math.min(
              currentHeight + deposit,
              this.terrain.config.maxHeight
            );

            heightChanges.set(index, newHeight);
            newSedimentMap[index] = Math.max(0, currentSediment - deposit);
            this.heightDeltaMap[index] = deposit; // Track for debug
            depositionCount++;
          }
        }
      }
    }

    // 4. EVAPORATION: Remove water at constant rate
    for (let i = 0; i < newWaterMap.length; i++) {
      newWaterMap[i] = Math.max(0, newWaterMap[i] * (1.0 - effectiveEvaporationRate));
    }

    // 4.5. UPDATE CUMULATIVE MAPS: Track erosion/deposition and persistent flow
    for (let i = 0; i < this.heightDeltaMap.length; i++) {
      // Accumulate erosion (negative) and deposition (positive)
      this.cumulativeErosionMap[i] += this.heightDeltaMap[i];
    }

    // Update persistent flow map (decay old values, add new flow)
    const flowDecay = 0.95; // Decay factor (persistent flow fades slowly)
    for (let i = 0; i < this.flowMap.length; i++) {
      // Decay existing persistent flow
      this.persistentFlowMap[i] *= flowDecay;
      // Add new flow (if significant)
      if (this.flowMap[i] > 0.01) {
        this.persistentFlowMap[i] = Math.min(
          this.persistentFlowMap[i] + this.flowMap[i] * 0.1,
          1.0 // Cap at 1.0
        );
      }
    }

    // 5. UPDATE TERRAIN: Apply height changes (5️⃣ GUARANTEE VISUAL IMPACT)

    // 🔍 CHECK 1: Log heightChanges to verify erosion is happening
    const maxDelta = this.heightDeltaMap.length > 0
      ? Math.max(...Array.from(this.heightDeltaMap).filter(v => !isNaN(v) && isFinite(v)))
      : 0;
    const minDelta = this.heightDeltaMap.length > 0
      ? Math.min(...Array.from(this.heightDeltaMap).filter(v => !isNaN(v) && isFinite(v)))
      : 0;

    // Always log - remove conditional
    console.log('🔍 EROSION DEBUG:', {
      heightChangesSize: heightChanges.size,
      erosionCount,
      depositionCount,
      maxDelta,
      minDelta,
      debugAggressive: this.config.debugAggressive,
      effectiveErosionRate,
      effectiveMaxErosion,
      effectiveRainfallRate,
    });

    console.log('🟢 Before terrain update:', {
      heightChangesSize: heightChanges.size,
      terrainHeightmapLength: this.terrain.heightmap.length,
    });

    if (heightChanges.size > 0) {
      console.log('🟢 Applying height changes to terrain...');
      this.terrain.applyHeightmapChanges(heightChanges);

      // ✅ CRITICAL: Force Three.js to recognize the update
      // applyHeightmapChanges already updates positions, but we need to ensure
      // the renderer sees the changes
      const geometry = this.terrain.geometry;
      const positionAttr = geometry.attributes.position;

      // Force update - multiple methods to ensure Three.js recognizes it
      positionAttr.needsUpdate = true;

      // Force version increment if available
      if ('version' in positionAttr) {
        (positionAttr as any).version++;
      }

      // Force geometry to mark as dirty
      if ('version' in geometry) {
        (geometry as any).version++;
      }

      // Force mesh matrix update
      this.terrain.mesh.updateMatrix();
      this.terrain.mesh.updateMatrixWorld(false);

      // Verify the update flag was set
      const needsUpdateValue = positionAttr.needsUpdate;

      console.log('✅ Geometry updated:', {
        heightChangesApplied: heightChanges.size,
        needsUpdate: needsUpdateValue,
        positionAttrType: positionAttr.constructor.name,
        hasVersion: 'version' in positionAttr,
      });
    } else {
      console.warn('⚠️ NO HEIGHT CHANGES! Erosion did not produce any terrain modifications.');
      console.warn('⚠️ Check:', {
        waterMapHasWater: Array.from(newWaterMap).some(v => v > 0.0001),
        maxWater: Math.max(...Array.from(newWaterMap)),
        maxVelocity: Math.max(...Array.from(this.flowMap)),
        maxSediment: Math.max(...Array.from(newSedimentMap)),
      });
    }

    // Update water, sediment, and flow direction maps
    this.waterMap = newWaterMap;
    this.sedimentMap = newSedimentMap;
    this.flowDirectionMap = newFlowDirectionMap;
  }

  /**
   * Reset water and sediment maps
   */
  reset(): void {
    this.waterMap.fill(0);
    this.sedimentMap.fill(0);
    this.flowMap.fill(0);
    this.flowDirectionMap.fill(0);
    this.heightDeltaMap.fill(0);
    this.cumulativeErosionMap.fill(0); // Reset cumulative erosion
    this.persistentFlowMap.fill(0); // Reset persistent flow
  }

  /**
   * 🧪 TESTE ATÔMICO: "CUT THE WORLD IN HALF"
   * Force drastic terrain deformation to test heightmap ↔ geometry link
   */
  testHeightmapGeometryLink(): void {
    console.log('🧪 TESTE ATÔMICO: Deforming terrain to test heightmap ↔ geometry link');

    const heightmap = this.terrain.heightmap;
    const changes = new Map<number, number>();

    // Cut every 5th cell in half
    for (let i = 0; i < heightmap.length; i++) {
      if (i % 5 === 0) {
        const newHeight = Math.max(
          heightmap[i] - 5,
          this.terrain.config.minHeight
        );
        changes.set(i, newHeight);
      }
    }

    console.log(`🧪 Applying ${changes.size} forced height changes`);
    this.terrain.applyHeightmapChanges(changes);

    // Force full geometry sync
    const geometry = this.terrain.geometry;
    const positions = geometry.attributes.position.array as Float32Array;

    for (let i = 0; i < heightmap.length; i++) {
      positions[i * 3 + 1] = heightmap[i];
    }

    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();

    console.log('🧪 TESTE COMPLETO: Se o terreno não deformou drasticamente, há problema na ligação!');
  }

  /**
   * Get water depth map (normalized 0-1)
   */
  getWaterDepthMap(): Float32Array {
    // Find max water for normalization
    let maxWater = 0;
    for (let i = 0; i < this.waterMap.length; i++) {
      maxWater = Math.max(maxWater, this.waterMap[i]);
    }

    const normalized = new Float32Array(this.waterMap.length);
    if (maxWater > 0) {
      for (let i = 0; i < this.waterMap.length; i++) {
        normalized[i] = this.waterMap[i] / maxWater;
      }
    }

    return normalized;
  }

  /**
   * Get flow velocity map (normalized 0-1)
   */
  getFlowMap(): Float32Array {
    // Find max flow for normalization
    let maxFlow = 0;
    for (let i = 0; i < this.flowMap.length; i++) {
      maxFlow = Math.max(maxFlow, this.flowMap[i]);
    }

    const normalized = new Float32Array(this.flowMap.length);
    if (maxFlow > 0) {
      for (let i = 0; i < this.flowMap.length; i++) {
        normalized[i] = this.flowMap[i] / maxFlow;
      }
    }

    return normalized;
  }

  /**
   * Update erosion configuration
   */
  updateConfig(config: Partial<ErosionConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // ========== DEBUG HELPERS ==========

  /**
   * Print terrain statistics
   */
  printTerrainStats(): void {
    const heightmap = this.terrain.heightmap;
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;

    for (let i = 0; i < heightmap.length; i++) {
      const h = heightmap[i];
      min = Math.min(min, h);
      max = Math.max(max, h);
      sum += h;
    }

    const avg = sum / heightmap.length;

    console.log('=== Terrain Statistics ===');
    console.log(`Min height: ${min.toFixed(3)}`);
    console.log(`Max height: ${max.toFixed(3)}`);
    console.log(`Avg height: ${avg.toFixed(3)}`);
    console.log(`Range: ${(max - min).toFixed(3)}`);
  }

  /**
   * Print water statistics
   */
  printWaterStats(): void {
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    let cellsWithWater = 0;

    for (let i = 0; i < this.waterMap.length; i++) {
      const w = this.waterMap[i];
      min = Math.min(min, w);
      max = Math.max(max, w);
      sum += w;
      if (w > 0.0001) cellsWithWater++;
    }

    const avg = sum / this.waterMap.length;

    console.log('=== Water Statistics ===');
    console.log(`Min water: ${min.toFixed(6)}`);
    console.log(`Max water: ${max.toFixed(6)}`);
    console.log(`Avg water: ${avg.toFixed(6)}`);
    console.log(`Cells with water: ${cellsWithWater} / ${this.waterMap.length}`);
    console.log(`Total water: ${sum.toFixed(6)}`);
  }

  /**
   * Export heightmap as grayscale array (0-255)
   */
  exportHeightmapAsGrayscale(): Uint8Array {
    const heightmap = this.terrain.heightmap;
    const result = new Uint8Array(heightmap.length);

    // Find min/max for normalization
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < heightmap.length; i++) {
      min = Math.min(min, heightmap[i]);
      max = Math.max(max, heightmap[i]);
    }

    const range = max - min;
    if (range > 0) {
      for (let i = 0; i < heightmap.length; i++) {
        const normalized = (heightmap[i] - min) / range;
        result[i] = Math.floor(normalized * 255);
      }
    }

    return result;
  }

  /**
   * Export water depth as grayscale array (0-255)
   */
  exportWaterDepthAsGrayscale(): Uint8Array {
    const result = new Uint8Array(this.waterMap.length);

    // Find max for normalization
    let max = 0;
    for (let i = 0; i < this.waterMap.length; i++) {
      max = Math.max(max, this.waterMap[i]);
    }

    if (max > 0) {
      for (let i = 0; i < this.waterMap.length; i++) {
        const normalized = this.waterMap[i] / max;
        result[i] = Math.floor(normalized * 255);
      }
    }

    return result;
  }

  /**
   * Visualize heightmap on canvas
   */
  visualizeHeightmap(canvas: HTMLCanvasElement): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const grayscale = this.exportHeightmapAsGrayscale();
    const imageData = ctx.createImageData(this.gridSize, this.gridSize);

    for (let i = 0; i < grayscale.length; i++) {
      const gray = grayscale[i];
      const idx = i * 4;
      imageData.data[idx] = gray;     // R
      imageData.data[idx + 1] = gray; // G
      imageData.data[idx + 2] = gray; // B
      imageData.data[idx + 3] = 255;  // A
    }

    canvas.width = this.gridSize;
    canvas.height = this.gridSize;
    ctx.putImageData(imageData, 0, 0);
  }

  /**
   * Visualize water depth on canvas
   */
  visualizeWaterDepth(canvas: HTMLCanvasElement): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const grayscale = this.exportWaterDepthAsGrayscale();
    const imageData = ctx.createImageData(this.gridSize, this.gridSize);

    for (let i = 0; i < grayscale.length; i++) {
      const gray = grayscale[i];
      const idx = i * 4;
      // Use blue tint for water
      imageData.data[idx] = 0;           // R
      imageData.data[idx + 1] = gray / 2; // G
      imageData.data[idx + 2] = gray;     // B
      imageData.data[idx + 3] = 255;      // A
    }

    canvas.width = this.gridSize;
    canvas.height = this.gridSize;
    ctx.putImageData(imageData, 0, 0);
  }

  // ========== DEBUG VISUAL MODES (6️⃣) ==========

  /**
   * Get debug visualization data based on current mode
   */
  getDebugVisualization(): Uint8Array {
    const mode = this.config.debugVisualMode || 'none';
    const result = new Uint8Array(this.gridSize * this.gridSize * 4);

    switch (mode) {
      case 'water':
        return this.getWaterVisualization();
      case 'flow':
        return this.getFlowVisualization();
      case 'sediment':
        return this.getSedimentVisualization();
      case 'heightDelta':
        return this.getHeightDeltaVisualization();
      case 'cumulative':
        return this.getCumulativeVisualization();
      default:
        return result;
    }
  }

  /**
   * Visualize water map (blue tint)
   */
  private getWaterVisualization(): Uint8Array {
    const result = new Uint8Array(this.gridSize * this.gridSize * 4);
    const grayscale = this.exportWaterDepthAsGrayscale();

    for (let i = 0; i < grayscale.length; i++) {
      const gray = grayscale[i];
      const idx = i * 4;
      result[idx] = 0;           // R
      result[idx + 1] = Math.floor(gray / 2); // G
      result[idx + 2] = gray;     // B
      result[idx + 3] = 255;      // A
    }

    return result;
  }

  /**
   * Visualize flow map (red = high flow, black = no flow)
   */
  private getFlowVisualization(): Uint8Array {
    const result = new Uint8Array(this.gridSize * this.gridSize * 4);
    const normalized = this.getFlowMap();

    for (let i = 0; i < normalized.length; i++) {
      const flow = normalized[i];
      const idx = i * 4;
      result[idx] = Math.floor(flow * 255);     // R (red for flow)
      result[idx + 1] = 0;                       // G
      result[idx + 2] = 0;                       // B
      result[idx + 3] = 255;                     // A
    }

    return result;
  }

  /**
   * Visualize sediment map (yellow tint)
   */
  private getSedimentVisualization(): Uint8Array {
    const result = new Uint8Array(this.gridSize * this.gridSize * 4);

    // Find max sediment for normalization
    let maxSediment = 0;
    for (let i = 0; i < this.sedimentMap.length; i++) {
      maxSediment = Math.max(maxSediment, this.sedimentMap[i]);
    }

    for (let i = 0; i < this.sedimentMap.length; i++) {
      const normalized = maxSediment > 0 ? this.sedimentMap[i] / maxSediment : 0;
      const gray = Math.floor(normalized * 255);
      const idx = i * 4;
      result[idx] = gray;         // R
      result[idx + 1] = gray;     // G (yellow tint)
      result[idx + 2] = 0;         // B
      result[idx + 3] = 255;       // A
    }

    return result;
  }

  /**
   * Visualize height delta (green = deposition, red = erosion)
   */
  private getHeightDeltaVisualization(): Uint8Array {
    const result = new Uint8Array(this.gridSize * this.gridSize * 4);

    // Find max absolute delta for normalization
    let maxDelta = 0;
    for (let i = 0; i < this.heightDeltaMap.length; i++) {
      maxDelta = Math.max(maxDelta, Math.abs(this.heightDeltaMap[i]));
    }

    for (let i = 0; i < this.heightDeltaMap.length; i++) {
      const delta = this.heightDeltaMap[i];
      const normalized = maxDelta > 0 ? Math.abs(delta) / maxDelta : 0;
      const intensity = Math.floor(normalized * 255);
      const idx = i * 4;

      if (delta > 0) {
        // Deposition (green)
        result[idx] = 0;           // R
        result[idx + 1] = intensity; // G
        result[idx + 2] = 0;       // B
      } else if (delta < 0) {
        // Erosion (red)
        result[idx] = intensity;   // R
        result[idx + 1] = 0;       // G
        result[idx + 2] = 0;       // B
      } else {
        // No change (black)
        result[idx] = 0;
        result[idx + 1] = 0;
        result[idx + 2] = 0;
      }
      result[idx + 3] = 255;       // A
    }

    return result;
  }

  /**
   * Visualize cumulative erosion with persistent flow paths
   * Color coding: Red = deep erosion, Green = deposition, Gray = stable, Blue overlay = flow paths
   */
  private getCumulativeVisualization(): Uint8Array {
    const result = new Uint8Array(this.gridSize * this.gridSize * 4);

    // Find max absolute cumulative erosion for normalization
    let maxCumulative = 0;
    for (let i = 0; i < this.cumulativeErosionMap.length; i++) {
      maxCumulative = Math.max(maxCumulative, Math.abs(this.cumulativeErosionMap[i]));
    }

    // Find max persistent flow for normalization
    let maxFlow = 0;
    for (let i = 0; i < this.persistentFlowMap.length; i++) {
      maxFlow = Math.max(maxFlow, this.persistentFlowMap[i]);
    }

    for (let i = 0; i < this.cumulativeErosionMap.length; i++) {
      const cumulative = this.cumulativeErosionMap[i];
      const persistentFlow = this.persistentFlowMap[i];
      const idx = i * 4;

      // Normalize cumulative erosion
      const normalizedCumulative = maxCumulative > 0
        ? Math.abs(cumulative) / maxCumulative
        : 0;

      // Normalize persistent flow
      const normalizedFlow = maxFlow > 0
        ? persistentFlow / maxFlow
        : 0;

      // Base color based on cumulative erosion/deposition
      let r = 128; // Gray (stable) default
      let g = 128;
      let b = 128;

      if (cumulative < -0.001) {
        // EROSION (Red) - deeper erosion = brighter red
        const intensity = Math.min(normalizedCumulative, 1.0);
        r = Math.floor(128 + intensity * 127); // 128-255 (gray to bright red)
        g = Math.floor(128 * (1 - intensity * 0.5)); // 128-64 (darker green component)
        b = Math.floor(128 * (1 - intensity * 0.5)); // 128-64 (darker blue component)
      } else if (cumulative > 0.001) {
        // DEPOSITION (Green) - more deposition = brighter green
        const intensity = Math.min(normalizedCumulative, 1.0);
        r = Math.floor(128 * (1 - intensity * 0.5)); // 128-64 (darker red component)
        g = Math.floor(128 + intensity * 127); // 128-255 (gray to bright green)
        b = Math.floor(128 * (1 - intensity * 0.5)); // 128-64 (darker blue component)
      }
      // else: STABLE (Gray) - keep default gray

      // Overlay persistent flow paths (blue tint)
      if (normalizedFlow > 0.1) {
        const flowIntensity = Math.min(normalizedFlow, 1.0);
        // Add blue tint to highlight flow paths
        b = Math.min(255, Math.floor(b + flowIntensity * 100));
        // Slightly brighten the area
        r = Math.min(255, Math.floor(r + flowIntensity * 30));
        g = Math.min(255, Math.floor(g + flowIntensity * 30));
      }

      result[idx] = r;     // R
      result[idx + 1] = g;  // G
      result[idx + 2] = b;  // B
      result[idx + 3] = 255; // A
    }

    return result;
  }

  /**
   * Render debug visualization to canvas
   */
  renderDebugVisualization(canvas: HTMLCanvasElement): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const imageData = ctx.createImageData(this.gridSize, this.gridSize);
    const data = this.getDebugVisualization();

    imageData.data.set(data);

    canvas.width = this.gridSize;
    canvas.height = this.gridSize;
    ctx.putImageData(imageData, 0, 0);
  }
}

