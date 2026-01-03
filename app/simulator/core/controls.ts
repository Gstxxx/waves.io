/**
 * Controls Module
 * Handles user input, raycasting, and brush application
 */

import * as THREE from 'three';
import { TerrainSystem } from './terrain';
import { BrushConfig, applyBrush } from './brushes';

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
  
  public state: ControlsState;
  public brushConfig: BrushConfig;
  public brushIndicator: THREE.Mesh;
  
  private onBrushApplied?: () => void;

  constructor(
    terrain: TerrainSystem,
    camera: THREE.Camera,
    domElement: HTMLElement,
    initialBrushConfig: BrushConfig
  ) {
    this.terrain = terrain;
    this.camera = camera;
    this.domElement = domElement;
    this.raycaster = new THREE.Raycaster();
    
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
    const geometry = new THREE.RingGeometry(
      this.brushConfig.radius * 0.9,
      this.brushConfig.radius,
      32
    );
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
   * Updates brush indicator size
   */
  updateBrushIndicator(): void {
    const oldGeometry = this.brushIndicator.geometry;
    this.brushIndicator.geometry = new THREE.RingGeometry(
      this.brushConfig.radius * 0.9,
      this.brushConfig.radius,
      32
    );
    this.brushIndicator.geometry.rotateX(-Math.PI / 2);
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
      this.brushConfig
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

