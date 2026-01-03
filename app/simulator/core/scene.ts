/**
 * Scene Setup Module
 * Configures the Three.js scene with camera, lights, fog, and sky
 */

import * as THREE from 'three';

export interface SceneConfig {
  fogColor: string;
  fogNear: number;
  fogFar: number;
  ambientIntensity: number;
  sunIntensity: number;
  sunPosition: THREE.Vector3;
}

export const defaultSceneConfig: SceneConfig = {
  fogColor: '#87CEEB',
  fogNear: 100,
  fogFar: 500,
  ambientIntensity: 0.4,
  sunIntensity: 1.5,
  sunPosition: new THREE.Vector3(100, 100, 50),
};

/**
 * Creates and configures the main directional light (sun)
 */
export function createSunLight(config: SceneConfig): THREE.DirectionalLight {
  const sun = new THREE.DirectionalLight(0xffffff, config.sunIntensity);
  sun.position.copy(config.sunPosition);
  sun.castShadow = true;
  
  // Shadow map configuration for quality
  sun.shadow.mapSize.width = 2048;
  sun.shadow.mapSize.height = 2048;
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 500;
  sun.shadow.camera.left = -150;
  sun.shadow.camera.right = 150;
  sun.shadow.camera.top = 150;
  sun.shadow.camera.bottom = -150;
  sun.shadow.bias = -0.0001;
  sun.shadow.normalBias = 0.02;
  
  return sun;
}

/**
 * Creates ambient light for soft fill
 */
export function createAmbientLight(config: SceneConfig): THREE.AmbientLight {
  return new THREE.AmbientLight(0x87CEEB, config.ambientIntensity);
}

/**
 * Creates hemisphere light for natural sky/ground lighting
 */
export function createHemisphereLight(): THREE.HemisphereLight {
  return new THREE.HemisphereLight(
    0x87CEEB, // Sky color
    0xC2B280, // Ground color (sand)
    0.3
  );
}

/**
 * Configures fog for atmospheric depth
 */
export function configureFog(scene: THREE.Scene, config: SceneConfig): void {
  scene.fog = new THREE.Fog(config.fogColor, config.fogNear, config.fogFar);
  scene.background = new THREE.Color(config.fogColor);
}

/**
 * Scene configuration for React Three Fiber
 * These values are used in the Canvas component
 */
export const canvasConfig = {
  shadows: true,
  dpr: [1, 2] as [number, number],
  camera: {
    fov: 60,
    near: 0.1,
    far: 1000,
    position: [80, 60, 80] as [number, number, number],
  },
  gl: {
    antialias: true,
    toneMapping: THREE.ACESFilmicToneMapping,
    toneMappingExposure: 1.0,
  },
};

/**
 * Updates sun position based on time of day (0-1)
 */
export function updateSunPosition(
  sun: THREE.DirectionalLight,
  timeOfDay: number
): void {
  const angle = timeOfDay * Math.PI;
  const radius = 100;
  sun.position.x = Math.cos(angle) * radius;
  sun.position.y = Math.sin(angle) * radius + 20;
  sun.position.z = 50;
}

