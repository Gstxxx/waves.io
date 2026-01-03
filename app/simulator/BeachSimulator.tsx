'use client';

/**
 * Beach Simulator Component
 * Main React component integrating all simulation modules
 */

import React, { useRef, useEffect, useMemo, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Sky, Environment } from '@react-three/drei';
import { useControls, folder, button } from 'leva';
import * as THREE from 'three';

import { TerrainSystem, defaultTerrainConfig } from './core/terrain';
import { WaterSystem, defaultWaterConfig } from './core/water';
import { VegetationSystem, defaultVegetationConfig } from './core/vegetation';
import { TerrainControls } from './core/controls';
import { BrushType, defaultBrushConfig } from './core/brushes';

// Terrain Component
function Terrain({
  terrainRef,
  sandColor,
  seaLevel,
}: {
  terrainRef: React.MutableRefObject<TerrainSystem | null>;
  sandColor: string;
  seaLevel: number;
}) {
  const terrain = useMemo(() => {
    const t = new TerrainSystem(defaultTerrainConfig);
    return t;
  }, []);

  useEffect(() => {
    terrainRef.current = terrain;
    return () => {
      terrain.dispose();
    };
  }, [terrain, terrainRef]);

  useEffect(() => {
    terrain.updateUniforms({
      sandColor: new THREE.Color(sandColor),
      seaLevel,
    });
  }, [terrain, sandColor, seaLevel]);

  return <primitive object={terrain.mesh} />;
}

// Water Component
function Water({
  waterRef,
  terrainRef,
  seaLevel,
  waveIntensity,
  waveSpeed,
  shallowColor,
  deepColor,
  timeScale,
}: {
  waterRef: React.MutableRefObject<WaterSystem | null>;
  terrainRef: React.MutableRefObject<TerrainSystem | null>;
  seaLevel: number;
  waveIntensity: number;
  waveSpeed: number;
  shallowColor: string;
  deepColor: string;
  timeScale: number;
}) {
  const water = useMemo(() => {
    return new WaterSystem({
      ...defaultWaterConfig,
      seaLevel,
      waveStrength: waveIntensity,
      waveSpeed,
      shallowColor,
      deepColor,
    });
  }, []);

  useEffect(() => {
    waterRef.current = water;
    return () => {
      water.dispose();
    };
  }, [water, waterRef]);

  // Connect terrain heightmap to water - THIS IS THE KEY!
  useEffect(() => {
    const terrain = terrainRef.current;
    if (terrain && terrain.heightmapTexture) {
      water.setTerrainHeightmap(terrain.heightmapTexture, terrain.config.size);
    }
  }, [water, terrainRef]);

  useEffect(() => {
    water.setSeaLevel(seaLevel);
  }, [water, seaLevel]);

  useEffect(() => {
    water.setWaveParams(waveIntensity, waveSpeed);
  }, [water, waveIntensity, waveSpeed]);

  useEffect(() => {
    water.setColors(shallowColor, deepColor);
  }, [water, shallowColor, deepColor]);

  useFrame((_, delta) => {
    water.update(delta, timeScale);
  });

  return <primitive object={water.mesh} />;
}

// Vegetation Component
function Vegetation({
  terrain,
  seaLevel,
}: {
  terrain: TerrainSystem | null;
  seaLevel: number;
}) {
  const groupRef = useRef<THREE.Group | null>(null);
  const vegetationRef = useRef<VegetationSystem | null>(null);

  useEffect(() => {
    if (!terrain) return;

    // Create vegetation system
    const vegetation = new VegetationSystem(terrain, seaLevel, defaultVegetationConfig);
    vegetationRef.current = vegetation;

    // Generate and add to scene
    const group = vegetation.generate();
    groupRef.current = group;

    return () => {
      vegetation.dispose();
    };
  }, [terrain, seaLevel]);

  if (!groupRef.current) return null;

  return <primitive object={groupRef.current} />;
}

// Brush Indicator Component
function BrushIndicator({
  controlsRef,
}: {
  controlsRef: React.MutableRefObject<TerrainControls | null>;
}) {
  const controls = controlsRef.current;
  if (!controls) return null;

  return <primitive object={controls.brushIndicator} />;
}

// Scene Controls Component
function SceneControls({
  terrainRef,
  brushRadius,
  brushStrength,
  brushType,
  controlsRef,
  orbitControlsRef,
}: {
  terrainRef: React.MutableRefObject<TerrainSystem | null>;
  brushRadius: number;
  brushStrength: number;
  brushType: BrushType;
  controlsRef: React.MutableRefObject<TerrainControls | null>;
  orbitControlsRef: React.MutableRefObject<any>;
}) {
  const { camera, gl } = useThree();

  useEffect(() => {
    const terrain = terrainRef.current;
    if (!terrain) return;

    const controls = new TerrainControls(terrain, camera, gl.domElement, {
      radius: brushRadius,
      strength: brushStrength,
      type: brushType,
    });

    // Setup interaction between terrain controls and orbit controls
    // Disable OrbitControls only when actively editing terrain (clicking and dragging on terrain)
    let isEditingTerrain = false;
    
    const handlePointerDown = (e: PointerEvent) => {
      // Only disable orbit controls on primary button (left click) without modifiers
      if (e.button === 0 && !e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) {
        // Check if we're over terrain - if so, we're editing, disable OrbitControls
        if (orbitControlsRef.current && controls.state.isOverTerrain) {
          isEditingTerrain = true;
          orbitControlsRef.current.enabled = false;
        }
      }
    };

    const handlePointerUp = () => {
      // Re-enable orbit controls when done editing
      if (isEditingTerrain && orbitControlsRef.current) {
        orbitControlsRef.current.enabled = true;
        isEditingTerrain = false;
      }
    };

    gl.domElement.addEventListener('pointerdown', handlePointerDown, { capture: true });
    gl.domElement.addEventListener('pointerup', handlePointerUp);
    gl.domElement.addEventListener('pointerleave', handlePointerUp);

    controlsRef.current = controls;

    return () => {
      gl.domElement.removeEventListener('pointerdown', handlePointerDown, { capture: true });
      gl.domElement.removeEventListener('pointerup', handlePointerUp);
      gl.domElement.removeEventListener('pointerleave', handlePointerUp);
      controls.dispose();
    };
  }, [terrainRef, camera, gl.domElement, controlsRef, orbitControlsRef]);

  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.setBrushConfig({
        radius: brushRadius,
        strength: brushStrength,
        type: brushType,
      });
    }
  }, [brushRadius, brushStrength, brushType, controlsRef]);

  return null;
}

// Lighting Component
function Lighting({ sunPosition }: { sunPosition: [number, number, number] }) {
  const sunRef = useRef<THREE.DirectionalLight>(null);

  return (
    <>
      <ambientLight intensity={0.4} color="#87CEEB" />
      <hemisphereLight
        args={['#87CEEB', '#C2B280', 0.3]}
      />
      <directionalLight
        ref={sunRef}
        position={sunPosition}
        intensity={1.5}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={0.5}
        shadow-camera-far={500}
        shadow-camera-left={-150}
        shadow-camera-right={150}
        shadow-camera-top={150}
        shadow-camera-bottom={-150}
        shadow-bias={-0.0001}
        shadow-normalBias={0.02}
      />
    </>
  );
}

// Main Scene Component
function Scene({
  seaLevel,
  waveIntensity,
  waveSpeed,
  brushRadius,
  brushStrength,
  brushType,
  sandColor,
  shallowColor,
  deepColor,
  timeScale,
  sunAzimuth,
  sunElevation,
}: {
  seaLevel: number;
  waveIntensity: number;
  waveSpeed: number;
  brushRadius: number;
  brushStrength: number;
  brushType: BrushType;
  sandColor: string;
  shallowColor: string;
  deepColor: string;
  timeScale: number;
  sunAzimuth: number;
  sunElevation: number;
}) {
  const terrainRef = useRef<TerrainSystem | null>(null);
  const waterRef = useRef<WaterSystem | null>(null);
  const controlsRef = useRef<TerrainControls | null>(null);
  const orbitControlsRef = useRef<any>(null);

  // Calculate sun position from azimuth and elevation
  const sunPosition: [number, number, number] = useMemo(() => {
    const azimuthRad = (sunAzimuth * Math.PI) / 180;
    const elevationRad = (sunElevation * Math.PI) / 180;
    const distance = 100;
    return [
      Math.cos(elevationRad) * Math.sin(azimuthRad) * distance,
      Math.sin(elevationRad) * distance,
      Math.cos(elevationRad) * Math.cos(azimuthRad) * distance,
    ];
  }, [sunAzimuth, sunElevation]);

  return (
    <>
      {/* Sky */}
      <Sky
        distance={450000}
        sunPosition={sunPosition}
        inclination={0.5}
        azimuth={0.25}
        rayleigh={0.5}
        turbidity={8}
      />

      {/* Fog */}
      <fog attach="fog" args={['#87CEEB', 100, 400]} />

      {/* Lighting */}
      <Lighting sunPosition={sunPosition} />

      {/* Camera Controls */}
      <OrbitControls
        ref={orbitControlsRef}
        makeDefault
        enablePan={true}
        enableZoom={true}
        enableRotate={true}
        mouseButtons={{
          LEFT: THREE.MOUSE.ROTATE, // Rotate with left mouse (will be disabled when editing terrain)
          MIDDLE: THREE.MOUSE.PAN, // Pan with middle mouse
          RIGHT: THREE.MOUSE.ROTATE, // Rotate with right mouse (not zoom!)
        }}
        touches={{
          ONE: THREE.TOUCH.ROTATE, // Rotate with one finger touch
          TWO: THREE.TOUCH.PAN, // Pan with two finger touch
        }}
        maxPolarAngle={Math.PI / 2.1}
        minDistance={20}
        maxDistance={300}
        target={[0, 0, 0]}
      />

      {/* Terrain */}
      <Terrain
        terrainRef={terrainRef}
        sandColor={sandColor}
        seaLevel={seaLevel}
      />

      {/* Water */}
      <Water
        waterRef={waterRef}
        terrainRef={terrainRef}
        seaLevel={seaLevel}
        waveIntensity={waveIntensity}
        waveSpeed={waveSpeed}
        shallowColor={shallowColor}
        deepColor={deepColor}
        timeScale={timeScale}
      />

      {/* Vegetation */}
      <Vegetation terrain={terrainRef.current} seaLevel={seaLevel} />

      {/* Terrain Controls */}
      <SceneControls
        terrainRef={terrainRef}
        brushRadius={brushRadius}
        brushStrength={brushStrength}
        brushType={brushType}
        controlsRef={controlsRef}
        orbitControlsRef={orbitControlsRef}
      />

      {/* Brush Indicator */}
      <BrushIndicator controlsRef={controlsRef} />
    </>
  );
}

// Main Beach Simulator Component
export default function BeachSimulator() {
  // Leva controls
  const {
    seaLevel,
    waveIntensity,
    waveSpeed,
    timeScale,
  } = useControls('Environment', {
    seaLevel: { value: 2, min: -5, max: 10, step: 0.1 },
    waveIntensity: { value: 0.15, min: 0, max: 0.5, step: 0.01 },
    waveSpeed: { value: 1, min: 0.1, max: 3, step: 0.1 },
    timeScale: { value: 1, min: 0, max: 3, step: 0.1 },
  });

  const {
    brushRadius,
    brushStrength,
    brushType,
  } = useControls('Brush', {
    brushType: {
      value: 'raise' as BrushType,
      options: ['raise', 'lower', 'smooth', 'flatten', 'erosion'] as BrushType[],
    },
    brushRadius: { value: 10, min: 1, max: 50, step: 1 },
    brushStrength: { value: 0.5, min: 0.1, max: 2, step: 0.1 },
  });

  const {
    sandColor,
    shallowColor,
    deepColor,
  } = useControls('Colors', {
    sandColor: '#c2b280',
    shallowColor: '#4db8b8',
    deepColor: '#0a4f6e',
  });

  const {
    sunAzimuth,
    sunElevation,
  } = useControls('Sun', {
    sunAzimuth: { value: 180, min: 0, max: 360, step: 1 },
    sunElevation: { value: 45, min: 5, max: 90, step: 1 },
  });

  return (
    <div className="simulator-container">
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{
          fov: 60,
          near: 0.1,
          far: 1000,
          position: [80, 60, 80],
        }}
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.0,
        }}
      >
        <Scene
          seaLevel={seaLevel}
          waveIntensity={waveIntensity}
          waveSpeed={waveSpeed}
          brushRadius={brushRadius}
          brushStrength={brushStrength}
          brushType={brushType as BrushType}
          sandColor={sandColor}
          shallowColor={shallowColor}
          deepColor={deepColor}
          timeScale={timeScale}
          sunAzimuth={sunAzimuth}
          sunElevation={sunElevation}
        />
      </Canvas>

      {/* Instructions Overlay */}
      <div className="instructions">
        <h3>Beach Sandbox Simulator</h3>
        <p><strong>Left Click + Drag:</strong> Apply brush to terrain</p>
        <p><strong>Right Click + Drag:</strong> Rotate camera</p>
        <p><strong>Scroll:</strong> Zoom in/out</p>
        <p><strong>Middle Click + Drag:</strong> Pan camera</p>
        <p style={{ marginTop: '12px', fontSize: '11px', opacity: 0.7 }}>
          💡 Tip: Use the controls panel to adjust brush type, sea level, and waves
        </p>
      </div>
    </div>
  );
}

