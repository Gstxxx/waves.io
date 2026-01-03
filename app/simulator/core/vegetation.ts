/**
 * Vegetation System Module
 * InstancedMesh-based vegetation (palm trees, rocks, coastal plants)
 */

import * as THREE from 'three';
import { TerrainSystem } from './terrain';

export interface VegetationConfig {
  palmTreeCount: number;
  rockCount: number;
  bushCount: number;
  minHeight: number; // Minimum height above sea level
  maxSlope: number;  // Maximum slope for placement
}

export const defaultVegetationConfig: VegetationConfig = {
  palmTreeCount: 30,
  rockCount: 50,
  bushCount: 80,
  minHeight: 3.0,
  maxSlope: 0.5,
};

/**
 * Creates a simple palm tree geometry
 */
function createPalmTreeGeometry(): THREE.Group {
  const group = new THREE.Group();
  
  // Trunk - slightly curved cylinder
  const trunkGeometry = new THREE.CylinderGeometry(0.3, 0.5, 8, 8);
  const trunkMaterial = new THREE.MeshStandardMaterial({
    color: '#8B7355',
    roughness: 0.9,
  });
  const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
  trunk.position.y = 4;
  trunk.castShadow = true;
  group.add(trunk);
  
  // Leaves - multiple cones arranged in a star pattern
  const leafMaterial = new THREE.MeshStandardMaterial({
    color: '#228B22',
    roughness: 0.8,
    side: THREE.DoubleSide,
  });
  
  const leafCount = 7;
  for (let i = 0; i < leafCount; i++) {
    const leafGeometry = new THREE.ConeGeometry(0.5, 4, 4);
    const leaf = new THREE.Mesh(leafGeometry, leafMaterial);
    
    const angle = (i / leafCount) * Math.PI * 2;
    const tilt = Math.PI / 4;
    
    leaf.position.y = 8;
    leaf.position.x = Math.cos(angle) * 1.5;
    leaf.position.z = Math.sin(angle) * 1.5;
    leaf.rotation.z = -tilt * Math.cos(angle);
    leaf.rotation.x = -tilt * Math.sin(angle);
    leaf.castShadow = true;
    
    group.add(leaf);
  }
  
  return group;
}

/**
 * Creates a merged palm tree geometry for instancing
 */
function createPalmTreeMergedGeometry(): THREE.BufferGeometry {
  const geometries: THREE.BufferGeometry[] = [];
  
  // Trunk
  const trunkGeometry = new THREE.CylinderGeometry(0.3, 0.5, 8, 6);
  trunkGeometry.translate(0, 4, 0);
  geometries.push(trunkGeometry);
  
  // Leaves
  const leafCount = 6;
  for (let i = 0; i < leafCount; i++) {
    const leafGeometry = new THREE.ConeGeometry(0.4, 3.5, 3);
    const angle = (i / leafCount) * Math.PI * 2;
    const tilt = Math.PI / 4;
    
    const matrix = new THREE.Matrix4();
    matrix.makeRotationFromEuler(new THREE.Euler(
      -tilt * Math.sin(angle),
      0,
      -tilt * Math.cos(angle)
    ));
    matrix.setPosition(
      Math.cos(angle) * 1.2,
      8,
      Math.sin(angle) * 1.2
    );
    
    leafGeometry.applyMatrix4(matrix);
    geometries.push(leafGeometry);
  }
  
  // Merge all geometries
  const mergedGeometry = new THREE.BufferGeometry();
  
  // Combine positions
  let totalVertices = 0;
  for (const geo of geometries) {
    totalVertices += geo.attributes.position.count;
  }
  
  const positions = new Float32Array(totalVertices * 3);
  const normals = new Float32Array(totalVertices * 3);
  
  let offset = 0;
  for (const geo of geometries) {
    const pos = geo.attributes.position.array;
    const norm = geo.attributes.normal.array;
    positions.set(pos, offset * 3);
    normals.set(norm, offset * 3);
    offset += geo.attributes.position.count;
  }
  
  mergedGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  mergedGeometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  
  // Cleanup
  for (const geo of geometries) {
    geo.dispose();
  }
  
  return mergedGeometry;
}

/**
 * Creates rock geometry
 */
function createRockGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.IcosahedronGeometry(1, 1);
  
  // Deform vertices for natural look
  const positions = geometry.attributes.position.array as Float32Array;
  for (let i = 0; i < positions.length; i += 3) {
    const scale = 0.7 + Math.random() * 0.6;
    positions[i] *= scale;
    positions[i + 1] *= scale * 0.7; // Flatten
    positions[i + 2] *= scale;
  }
  
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Creates bush geometry
 */
function createBushGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.SphereGeometry(1, 6, 4);
  
  // Deform for natural look
  const positions = geometry.attributes.position.array as Float32Array;
  for (let i = 0; i < positions.length; i += 3) {
    const noise = 0.8 + Math.random() * 0.4;
    positions[i] *= noise;
    positions[i + 1] *= noise * 0.6; // Flatten
    positions[i + 2] *= noise;
  }
  
  geometry.computeVertexNormals();
  return geometry;
}

export class VegetationSystem {
  public palmTrees: THREE.InstancedMesh | null = null;
  public rocks: THREE.InstancedMesh | null = null;
  public bushes: THREE.InstancedMesh | null = null;
  
  private config: VegetationConfig;
  private terrain: TerrainSystem;
  private seaLevel: number;

  constructor(terrain: TerrainSystem, seaLevel: number, config: Partial<VegetationConfig> = {}) {
    this.config = { ...defaultVegetationConfig, ...config };
    this.terrain = terrain;
    this.seaLevel = seaLevel;
  }

  /**
   * Generates all vegetation based on terrain
   */
  generate(): THREE.Group {
    const group = new THREE.Group();
    
    this.generatePalmTrees(group);
    this.generateRocks(group);
    this.generateBushes(group);
    
    return group;
  }

  /**
   * Generates palm trees
   */
  private generatePalmTrees(group: THREE.Group): void {
    const geometry = createPalmTreeMergedGeometry();
    const material = new THREE.MeshStandardMaterial({
      color: '#5D8A4A',
      roughness: 0.8,
      flatShading: true,
    });
    
    this.palmTrees = new THREE.InstancedMesh(
      geometry,
      material,
      this.config.palmTreeCount
    );
    this.palmTrees.castShadow = true;
    this.palmTrees.receiveShadow = true;
    
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    
    let placed = 0;
    let attempts = 0;
    const maxAttempts = this.config.palmTreeCount * 10;
    
    while (placed < this.config.palmTreeCount && attempts < maxAttempts) {
      attempts++;
      
      // Random position within terrain bounds
      const x = (Math.random() - 0.5) * this.terrain.config.size * 0.8;
      const z = (Math.random() - 0.5) * this.terrain.config.size * 0.8;
      const height = this.terrain.getHeightAt(x, z);
      
      // Check placement conditions
      if (height < this.seaLevel + this.config.minHeight) continue;
      if (height > this.seaLevel + 10) continue; // Not too high
      
      position.set(x, height, z);
      quaternion.setFromEuler(new THREE.Euler(
        (Math.random() - 0.5) * 0.1,
        Math.random() * Math.PI * 2,
        (Math.random() - 0.5) * 0.1
      ));
      const s = 0.8 + Math.random() * 0.4;
      scale.set(s, s, s);
      
      matrix.compose(position, quaternion, scale);
      this.palmTrees.setMatrixAt(placed, matrix);
      placed++;
    }
    
    this.palmTrees.count = placed;
    this.palmTrees.instanceMatrix.needsUpdate = true;
    group.add(this.palmTrees);
  }

  /**
   * Generates rocks
   */
  private generateRocks(group: THREE.Group): void {
    const geometry = createRockGeometry();
    const material = new THREE.MeshStandardMaterial({
      color: '#6B5B4F',
      roughness: 0.95,
      flatShading: true,
    });
    
    this.rocks = new THREE.InstancedMesh(
      geometry,
      material,
      this.config.rockCount
    );
    this.rocks.castShadow = true;
    this.rocks.receiveShadow = true;
    
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    
    let placed = 0;
    let attempts = 0;
    const maxAttempts = this.config.rockCount * 10;
    
    while (placed < this.config.rockCount && attempts < maxAttempts) {
      attempts++;
      
      const x = (Math.random() - 0.5) * this.terrain.config.size * 0.9;
      const z = (Math.random() - 0.5) * this.terrain.config.size * 0.9;
      const height = this.terrain.getHeightAt(x, z);
      
      // Rocks can be near water or on higher ground
      if (height < this.seaLevel - 1) continue;
      
      position.set(x, height - 0.3, z);
      quaternion.setFromEuler(new THREE.Euler(
        Math.random() * 0.3,
        Math.random() * Math.PI * 2,
        Math.random() * 0.3
      ));
      const s = 0.5 + Math.random() * 1.5;
      scale.set(s, s * 0.7, s);
      
      matrix.compose(position, quaternion, scale);
      this.rocks.setMatrixAt(placed, matrix);
      placed++;
    }
    
    this.rocks.count = placed;
    this.rocks.instanceMatrix.needsUpdate = true;
    group.add(this.rocks);
  }

  /**
   * Generates bushes and coastal plants
   */
  private generateBushes(group: THREE.Group): void {
    const geometry = createBushGeometry();
    const material = new THREE.MeshStandardMaterial({
      color: '#3A5F0B',
      roughness: 0.9,
      flatShading: true,
    });
    
    this.bushes = new THREE.InstancedMesh(
      geometry,
      material,
      this.config.bushCount
    );
    this.bushes.castShadow = true;
    this.bushes.receiveShadow = true;
    
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    
    let placed = 0;
    let attempts = 0;
    const maxAttempts = this.config.bushCount * 10;
    
    while (placed < this.config.bushCount && attempts < maxAttempts) {
      attempts++;
      
      const x = (Math.random() - 0.5) * this.terrain.config.size * 0.85;
      const z = (Math.random() - 0.5) * this.terrain.config.size * 0.85;
      const height = this.terrain.getHeightAt(x, z);
      
      // Bushes on higher ground
      if (height < this.seaLevel + 2) continue;
      
      position.set(x, height, z);
      quaternion.setFromEuler(new THREE.Euler(0, Math.random() * Math.PI * 2, 0));
      const s = 0.3 + Math.random() * 0.5;
      scale.set(s * 1.5, s, s * 1.5);
      
      matrix.compose(position, quaternion, scale);
      this.bushes.setMatrixAt(placed, matrix);
      placed++;
    }
    
    this.bushes.count = placed;
    this.bushes.instanceMatrix.needsUpdate = true;
    group.add(this.bushes);
  }

  /**
   * Updates vegetation when sea level changes
   */
  updateSeaLevel(newSeaLevel: number): void {
    this.seaLevel = newSeaLevel;
    // Could regenerate vegetation here if needed
  }

  /**
   * Disposes of all vegetation meshes
   */
  dispose(): void {
    if (this.palmTrees) {
      this.palmTrees.geometry.dispose();
      (this.palmTrees.material as THREE.Material).dispose();
    }
    if (this.rocks) {
      this.rocks.geometry.dispose();
      (this.rocks.material as THREE.Material).dispose();
    }
    if (this.bushes) {
      this.bushes.geometry.dispose();
      (this.bushes.material as THREE.Material).dispose();
    }
  }
}

