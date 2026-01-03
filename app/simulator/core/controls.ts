/**
 * Controls Module
 * Handles user input, raycasting, and brush application
 */

import * as THREE from 'three';
import { TerrainSystem } from './terrain';
import { BrushConfig, applyBrush, BrushShape } from './brushes';

export interface ControlsState {
  isPointerDown: boolean;
  pointerPosition: THREE.Vector2;
  brushPosition: THREE.Vector3 | null;
  isOverTerrain: boolean;
}

export class TerrainControls {
  private terrain: TerrainSystem;
  private camera: THREE.Camera;
  private domElement: HTMLElement;
  private raycaster: THREE.Raycaster;
  private objectsToIgnore: THREE.Object3D[] = []; // Objects to ignore in raycast (e.g., water)
  private erosionSystem: any; // ErosionSystem instance (optional)
  
  public state: ControlsState;
  public brushConfig: BrushConfig;
  public brushIndicator: THREE.Mesh;
  
  private onBrushApplied?: () => void;

  constructor(
    terrain: TerrainSystem,
    camera: THREE.Camera,
    domElement: HTMLElement,
    initialBrushConfig: BrushConfig,
    erosionSystem?: any
  ) {
    this.terrain = terrain;
    this.camera = camera;
    this.domElement = domElement;
    this.raycaster = new THREE.Raycaster();
    this.erosionSystem = erosionSystem;
    
    this.brushConfig = { ...initialBrushConfig };
    
    this.state = {
      isPointerDown: false,
      pointerPosition: new THREE.Vector2(),
      brushPosition: null,
      isOverTerrain: false,
    };
    
    // Create brush indicator
    this.brushIndicator = this.createBrushIndicator();
    
    // Bind event handlers
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
    
    this.attachEventListeners();
  }

  /**
   * Creates a visual indicator for the brush
   */
  private createBrushIndicator(): THREE.Mesh {
    const geometry = this.createBrushGeometry(this.brushConfig.shape, this.brushConfig.radius);
    geometry.rotateX(-Math.PI / 2);
    
    const material = new THREE.MeshBasicMaterial({
      color: '#ffffff',
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.visible = false;
    
    return mesh;
  }

  /**
   * Creates geometry for different brush shapes
   */
  private createBrushGeometry(shape: BrushShape, radius: number): THREE.BufferGeometry {
    const aspectRatio = this.brushConfig.aspectRatio || 1.0;
    const rotation = this.brushConfig.rotation || 0;

    switch (shape) {
      case 'circle': {
        return new THREE.RingGeometry(radius * 0.9, radius, 32);
      }

      case 'square': {
        const shape = new THREE.Shape();
        const size = radius;
        shape.moveTo(-size, -size);
        shape.lineTo(size, -size);
        shape.lineTo(size, size);
        shape.lineTo(-size, size);
        shape.closePath();
        const hole = new THREE.Path();
        const innerSize = size * 0.9;
        hole.moveTo(-innerSize, -innerSize);
        hole.lineTo(innerSize, -innerSize);
        hole.lineTo(innerSize, innerSize);
        hole.lineTo(-innerSize, innerSize);
        hole.closePath();
        shape.holes.push(hole);
        return new THREE.ShapeGeometry(shape);
      }

      case 'diamond': {
        const shape = new THREE.Shape();
        const size = radius;
        shape.moveTo(0, -size);
        shape.lineTo(size, 0);
        shape.lineTo(0, size);
        shape.lineTo(-size, 0);
        shape.closePath();
        const hole = new THREE.Path();
        const innerSize = size * 0.9;
        hole.moveTo(0, -innerSize);
        hole.lineTo(innerSize, 0);
        hole.lineTo(0, innerSize);
        hole.lineTo(-innerSize, 0);
        hole.closePath();
        shape.holes.push(hole);
        return new THREE.ShapeGeometry(shape);
      }

      case 'star': {
        const shape = new THREE.Shape();
        const outerRadius = radius;
        const innerRadius = radius * 0.5;
        const points = 5;
        const vertices: number[] = [];
        for (let i = 0; i < points * 2; i++) {
          const angle = (i * Math.PI) / points - Math.PI / 2;
          const r = i % 2 === 0 ? outerRadius : innerRadius;
          const x = Math.cos(angle) * r;
          const y = Math.sin(angle) * r;
          vertices.push(x, y);
        }
        shape.moveTo(vertices[0], vertices[1]);
        for (let i = 1; i < vertices.length / 2; i++) {
          shape.lineTo(vertices[i * 2], vertices[i * 2 + 1]);
        }
        shape.closePath();
        const hole = new THREE.Path();
        const innerOuter = outerRadius * 0.9;
        const innerInner = innerRadius * 0.9;
        const holeVertices: number[] = [];
        for (let i = 0; i < points * 2; i++) {
          const angle = (i * Math.PI) / points - Math.PI / 2;
          const r = i % 2 === 0 ? innerOuter : innerInner;
          const x = Math.cos(angle) * r;
          const y = Math.sin(angle) * r;
          holeVertices.push(x, y);
        }
        hole.moveTo(holeVertices[0], holeVertices[1]);
        for (let i = 1; i < holeVertices.length / 2; i++) {
          hole.lineTo(holeVertices[i * 2], holeVertices[i * 2 + 1]);
        }
        hole.closePath();
        shape.holes.push(hole);
        return new THREE.ShapeGeometry(shape);
      }

      case 'line': {
        const shape = new THREE.Shape();
        const length = radius * 2;
        const width = radius * 0.1;
        shape.moveTo(-length / 2, -width / 2);
        shape.lineTo(length / 2, -width / 2);
        shape.lineTo(length / 2, width / 2);
        shape.lineTo(-length / 2, width / 2);
        shape.closePath();
        return new THREE.ShapeGeometry(shape);
      }

      case 'ellipse': {
        const rx = radius * Math.max(1, aspectRatio);
        const rz = radius * Math.max(1, 1 / aspectRatio);
        const segments = 32;
        const shape = new THREE.Shape();
        const vertices: number[] = [];
        for (let i = 0; i <= segments; i++) {
          const angle = (i / segments) * Math.PI * 2;
          const x = Math.cos(angle) * rx;
          const y = Math.sin(angle) * rz;
          vertices.push(x, y);
        }
        shape.moveTo(vertices[0], vertices[1]);
        for (let i = 1; i < vertices.length / 2; i++) {
          shape.lineTo(vertices[i * 2], vertices[i * 2 + 1]);
        }
        shape.closePath();
        const hole = new THREE.Path();
        const innerRx = rx * 0.9;
        const innerRz = rz * 0.9;
        const holeVertices: number[] = [];
        for (let i = 0; i <= segments; i++) {
          const angle = (i / segments) * Math.PI * 2;
          const x = Math.cos(angle) * innerRx;
          const y = Math.sin(angle) * innerRz;
          holeVertices.push(x, y);
        }
        hole.moveTo(holeVertices[0], holeVertices[1]);
        for (let i = 1; i < holeVertices.length / 2; i++) {
          hole.lineTo(holeVertices[i * 2], holeVertices[i * 2 + 1]);
        }
        hole.closePath();
        shape.holes.push(hole);
        return new THREE.ShapeGeometry(shape);
      }

      default:
        return new THREE.RingGeometry(radius * 0.9, radius, 32);
    }
  }

  /**
   * Updates brush indicator size and shape
   */
  updateBrushIndicator(): void {
    const oldGeometry = this.brushIndicator.geometry;
    this.brushIndicator.geometry = this.createBrushGeometry(
      this.brushConfig.shape,
      this.brushConfig.radius
    );
    this.brushIndicator.geometry.rotateX(-Math.PI / 2);
    
    // Apply rotation if needed
    if (this.brushConfig.rotation !== undefined) {
      this.brushIndicator.rotation.z = this.brushConfig.rotation;
    }
    
    oldGeometry.dispose();
  }

  /**
   * Attaches event listeners
   */
  private attachEventListeners(): void {
    this.domElement.addEventListener('pointermove', this.handlePointerMove);
    this.domElement.addEventListener('pointerdown', this.handlePointerDown);
    this.domElement.addEventListener('pointerup', this.handlePointerUp);
    this.domElement.addEventListener('pointerleave', this.handlePointerUp);
  }

  /**
   * Handles pointer movement
   */
  private handlePointerMove(event: PointerEvent): void {
    const rect = this.domElement.getBoundingClientRect();
    this.state.pointerPosition.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.state.pointerPosition.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    this.updateRaycast();
    
    // Apply brush while dragging
    if (this.state.isPointerDown && this.state.brushPosition) {
      this.applyBrushAtPosition();
    }
  }

  /**
   * Handles pointer down
   */
  private handlePointerDown(event: PointerEvent): void {
    // Only respond to left click (primary button)
    if (event.button !== 0) return;
    
    // Check if Ctrl or Shift is held (for camera controls)
    if (event.ctrlKey || event.shiftKey || event.altKey) return;
    
    this.state.isPointerDown = true;
    
    if (this.state.brushPosition) {
      this.applyBrushAtPosition();
    }
  }

  /**
   * Handles pointer up
   */
  private handlePointerUp(): void {
    this.state.isPointerDown = false;
  }

  /**
   * Updates raycast to terrain
   * Ignores water and other objects, prioritizing terrain
   */
  private updateRaycast(): void {
    this.raycaster.setFromCamera(this.state.pointerPosition, this.camera);
    
    // Test terrain directly, ignoring water
    // We'll use a custom approach: test terrain with a filter
    const terrainIntersects = this.raycaster.intersectObject(this.terrain.mesh, false);
    
    // If we hit terrain, use it
    if (terrainIntersects.length > 0) {
      const point = terrainIntersects[0].point;
      this.state.brushPosition = point.clone();
      this.state.isOverTerrain = true;
      
      // Update brush indicator
      this.brushIndicator.position.copy(point);
      this.brushIndicator.position.y += 0.1; // Slight offset to prevent z-fighting
      this.brushIndicator.visible = true;
    } else {
      // If terrain wasn't hit directly, try to project onto terrain plane
      // This handles cases where water is blocking
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const intersectionPoint = new THREE.Vector3();
      this.raycaster.ray.intersectPlane(plane, intersectionPoint);
      
      // Check if intersection is within terrain bounds
      const halfSize = this.terrain.config.size / 2;
      if (
        Math.abs(intersectionPoint.x) <= halfSize &&
        Math.abs(intersectionPoint.z) <= halfSize
      ) {
        // Get terrain height at this point
        const terrainHeight = this.terrain.getHeightAt(intersectionPoint.x, intersectionPoint.z);
        intersectionPoint.y = terrainHeight;
        
        this.state.brushPosition = intersectionPoint.clone();
        this.state.isOverTerrain = true;
        
        // Update brush indicator
        this.brushIndicator.position.copy(intersectionPoint);
        this.brushIndicator.position.y += 0.1;
        this.brushIndicator.visible = true;
      } else {
        this.state.brushPosition = null;
        this.state.isOverTerrain = false;
        this.brushIndicator.visible = false;
      }
    }
  }
  
  /**
   * Sets objects to ignore during raycast (e.g., water mesh)
   */
  setObjectsToIgnore(objects: THREE.Object3D[]): void {
    this.objectsToIgnore = objects;
  }

  /**
   * Applies brush at current position
   */
  private applyBrushAtPosition(): void {
    if (!this.state.brushPosition) return;
    
    applyBrush(
      this.terrain,
      this.state.brushPosition.x,
      this.state.brushPosition.z,
      this.brushConfig,
      this.erosionSystem
    );
    
    // Update terrain uniforms
    this.terrain.updateUniforms({});
    
    // Callback for vegetation regeneration, etc.
    if (this.onBrushApplied) {
      this.onBrushApplied();
    }
  }

  /**
   * Sets callback for when brush is applied
   */
  setOnBrushApplied(callback: () => void): void {
    this.onBrushApplied = callback;
  }

  /**
   * Updates camera reference (needed if camera changes)
   */
  setCamera(camera: THREE.Camera): void {
    this.camera = camera;
  }

  /**
   * Updates brush configuration
   */
  setBrushConfig(config: Partial<BrushConfig>): void {
    this.brushConfig = { ...this.brushConfig, ...config };
    this.updateBrushIndicator();
    
    // Update indicator color based on brush type
    const material = this.brushIndicator.material as THREE.MeshBasicMaterial;
    switch (this.brushConfig.type) {
      case 'raise':
        material.color.setHex(0x00ff00);
        break;
      case 'lower':
        material.color.setHex(0xff0000);
        break;
      case 'smooth':
        material.color.setHex(0x00ffff);
        break;
      case 'flatten':
        material.color.setHex(0xffff00);
        break;
      case 'erosion':
        material.color.setHex(0xff8800);
        break;
    }
  }

  /**
   * Updates on each frame
   */
  update(): void {
    // Continuous brush application could be throttled here
  }

  /**
   * Cleans up event listeners
   */
  dispose(): void {
    this.domElement.removeEventListener('pointermove', this.handlePointerMove);
    this.domElement.removeEventListener('pointerdown', this.handlePointerDown);
    this.domElement.removeEventListener('pointerup', this.handlePointerUp);
    this.domElement.removeEventListener('pointerleave', this.handlePointerUp);
    
    this.brushIndicator.geometry.dispose();
    (this.brushIndicator.material as THREE.Material).dispose();
  }
}

