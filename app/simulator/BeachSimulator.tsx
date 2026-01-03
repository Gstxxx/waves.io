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
import { ErosionSystem, defaultErosionConfig } from './core/erosion';

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
  if (!controls || !controls.enabled) return null;

  return <primitive object={controls.brushIndicator} />;
}

// Erosion Debug Visualization Component
function ErosionDebugVisualization({
  erosionRef,
  debugVisualMode,
}: {
  erosionRef: React.MutableRefObject<ErosionSystem | null>;
  debugVisualMode: 'none' | 'water' | 'flow' | 'sediment' | 'heightDelta' | 'cumulative';
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (debugVisualMode === 'none' || !erosionRef.current) {
      return;
    }

    const updateVisualization = () => {
      if (erosionRef.current && canvasRef.current) {
        erosionRef.current.renderDebugVisualization(canvasRef.current);
      }
      animationFrameRef.current = requestAnimationFrame(updateVisualization);
    };

    // Initial render
    if (canvasRef.current && erosionRef.current) {
      erosionRef.current.renderDebugVisualization(canvasRef.current);
    }

    // Start animation loop
    animationFrameRef.current = requestAnimationFrame(updateVisualization);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [erosionRef, debugVisualMode]);

  if (debugVisualMode === 'none') {
    return null;
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: '20px',
        right: '20px',
        width: '256px',
        height: '256px',
        border: '2px solid rgba(255, 255, 255, 0.3)',
        borderRadius: '8px',
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(4px)',
        zIndex: 1000,
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: '8px',
          left: '8px',
          color: 'white',
          fontSize: '12px',
          fontWeight: 'bold',
          textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)',
        }}
      >
        {debugVisualMode === 'cumulative' && 'Cumulative Erosion'}
        {debugVisualMode === 'water' && 'Water Depth'}
        {debugVisualMode === 'flow' && 'Flow Velocity'}
        {debugVisualMode === 'sediment' && 'Sediment'}
        {debugVisualMode === 'heightDelta' && 'Height Delta'}
      </div>
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: '100%',
          imageRendering: 'pixelated',
        }}
      />
      {debugVisualMode === 'cumulative' && (
        <div
          style={{
            position: 'absolute',
            bottom: '8px',
            left: '8px',
            right: '8px',
            fontSize: '10px',
            color: 'rgba(255, 255, 255, 0.8)',
            textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
            <div style={{ width: '12px', height: '12px', backgroundColor: '#ff0000', marginRight: '6px' }} />
            <span>Erosion</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
            <div style={{ width: '12px', height: '12px', backgroundColor: '#00ff00', marginRight: '6px' }} />
            <span>Deposition</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
            <div style={{ width: '12px', height: '12px', backgroundColor: '#808080', marginRight: '6px' }} />
            <span>Stable</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ width: '12px', height: '12px', backgroundColor: '#0000ff', marginRight: '6px' }} />
            <span>Flow Paths</span>
          </div>
        </div>
      )}
    </div>
  );
}

// Erosion Component
function Erosion({
  terrainRef,
  erosionRef,
  enabled,
  mode,
  iterations,
  speed,
  config,
  onStep,
  onReset,
}: {
  terrainRef: React.MutableRefObject<TerrainSystem | null>;
  erosionRef: React.MutableRefObject<ErosionSystem | null>;
  enabled: boolean;
  mode: 'manual' | 'continuous';
  iterations: number;
  speed: number;
  config: Partial<typeof defaultErosionConfig>;
  onStep: () => void;
  onReset: () => void;
}) {
  const erosion = useMemo(() => {
    const terrain = terrainRef.current;
    if (!terrain) return null;
    return new ErosionSystem(terrain, config);
  }, [terrainRef]);

  useEffect(() => {
    erosionRef.current = erosion;
    return () => {
      erosionRef.current = null;
    };
  }, [erosion, erosionRef]);

  useEffect(() => {
    if (!erosion) return;
    erosion.updateConfig(config);
  }, [erosion, config]);

  // Expose step and reset functions for Leva buttons
  useEffect(() => {
    (window as any).__erosionStep = () => {
      if (erosionRef.current && enabled && mode === 'manual') {
        for (let i = 0; i < iterations; i++) {
          erosionRef.current.step();
        }
      }
    };
    (window as any).__erosionReset = () => {
      if (erosionRef.current) {
        erosionRef.current.reset();
      }
    };
    (window as any).__erosionTestLink = () => {
      if (erosionRef.current) {
        erosionRef.current.testHeightmapGeometryLink();
      }
    };
  }, [erosionRef, enabled, mode, iterations]);

  // Continuous mode
  const lastTimeRef = useRef(0);
  useFrame((_, delta) => {
    if (!erosion || !enabled || mode !== 'continuous') {
      lastTimeRef.current = 0;
      return;
    }
    
    // Accumulate time for speed control
    const timePerIteration = 1.0 / speed;
    lastTimeRef.current += delta;
    
    while (lastTimeRef.current >= timePerIteration) {
      if (erosion) {
        erosion.step();
      }
      lastTimeRef.current -= timePerIteration;
    }
  });

  return null;
}

// Scene Controls Component
function SceneControls({
  terrainRef,
  brushRadius,
  brushStrength,
  brushType,
  controlsRef,
  orbitControlsRef,
  erosionEnabled,
}: {
  terrainRef: React.MutableRefObject<TerrainSystem | null>;
  brushRadius: number;
  brushStrength: number;
  brushType: BrushType;
  controlsRef: React.MutableRefObject<TerrainControls | null>;
  orbitControlsRef: React.MutableRefObject<any>;
  erosionEnabled: boolean;
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

    // Initialize enabled state based on erosion mode
    controls.enabled = !erosionEnabled;

    // OrbitControls left button is already disabled, so no need for additional handling
    // The brush will work directly with left click

    controlsRef.current = controls;

    return () => {
      controls.dispose();
    };
  }, [terrainRef, camera, gl.domElement, controlsRef, orbitControlsRef, erosionEnabled]);

  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.setBrushConfig({
        radius: brushRadius,
        strength: brushStrength,
        type: brushType,
      });
    }
  }, [brushRadius, brushStrength, brushType, controlsRef]);

  // Enable/disable controls based on erosion mode
  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.enabled = !erosionEnabled;
    }
  }, [controlsRef, erosionEnabled]);

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
  erosionEnabled,
  erosionMode,
  erosionIterations,
  erosionSpeed,
  erosionConfig,
  debugVisualMode,
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
  erosionEnabled: boolean;
  erosionMode: 'manual' | 'continuous';
  erosionIterations: number;
  erosionSpeed: number;
  erosionConfig: Partial<typeof defaultErosionConfig>;
  debugVisualMode: 'none' | 'water' | 'flow' | 'sediment' | 'heightDelta' | 'cumulative';
}) {
  const terrainRef = useRef<TerrainSystem | null>(null);
  const waterRef = useRef<WaterSystem | null>(null);
  const controlsRef = useRef<TerrainControls | null>(null);
  const orbitControlsRef = useRef<any>(null);
  const erosionRef = useRef<ErosionSystem | null>(null);

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
          LEFT: undefined, // Disable left mouse - used for brush editing
          MIDDLE: THREE.MOUSE.PAN, // Pan with middle mouse
          RIGHT: THREE.MOUSE.ROTATE, // Rotate with right mouse
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

      {/* Erosion System */}
      <Erosion
        terrainRef={terrainRef}
        erosionRef={erosionRef}
        enabled={erosionEnabled}
        mode={erosionMode}
        iterations={erosionIterations}
        speed={erosionSpeed}
        config={erosionConfig}
        onStep={() => {
          if (erosionRef.current && erosionEnabled && erosionMode === 'manual') {
            for (let i = 0; i < erosionIterations; i++) {
              erosionRef.current.step();
            }
          }
        }}
        onReset={() => {
          if (erosionRef.current) {
            erosionRef.current.reset();
          }
        }}
      />

      {/* Terrain Controls - Always present, but disabled when erosion is enabled */}
      <SceneControls
        terrainRef={terrainRef}
        brushRadius={brushRadius}
        brushStrength={brushStrength}
        brushType={brushType}
        controlsRef={controlsRef}
        orbitControlsRef={orbitControlsRef}
        erosionEnabled={erosionEnabled}
      />
      <BrushIndicator controlsRef={controlsRef} />
      
      {/* Erosion Debug Visualization */}
      <ErosionDebugVisualization
        erosionRef={erosionRef}
        debugVisualMode={debugVisualMode}
      />
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

  // Erosion controls
  const {
    erosionEnabled,
    erosionMode,
    erosionIterations,
    erosionSpeed,
    rainfallRate,
    erosionRate,
    depositionRate,
    evaporationRate,
    maxErosion,
    minSlopeForFlow,
    depositionThreshold,
    debugAggressive,
    capacityConstant,
    maxSedimentCapacity,
    flowInertia,
    debugVisualMode,
  } = useControls('Erosion', {
    erosionEnabled: { value: false, label: 'Enable Erosion' },
    erosionMode: {
      value: 'manual' as 'manual' | 'continuous',
      options: ['manual', 'continuous'],
    },
    erosionIterations: { value: 1, min: 1, max: 100, step: 1, label: 'Iterations (Manual)' },
    erosionSpeed: { value: 1, min: 0.1, max: 10, step: 0.1, label: 'Speed (iterations/sec)' },
    rainfallRate: { value: defaultErosionConfig.rainfallRate, min: 0, max: 0.1, step: 0.001, label: 'Rainfall Rate' },
    erosionRate: { value: defaultErosionConfig.erosionRate, min: 0, max: 1, step: 0.01, label: 'Erosion Rate' },
    depositionRate: { value: defaultErosionConfig.depositionRate, min: 0, max: 1, step: 0.01, label: 'Deposition Rate' },
    evaporationRate: { value: defaultErosionConfig.evaporationRate, min: 0, max: 0.1, step: 0.001, label: 'Evaporation Rate' },
    maxErosion: { value: defaultErosionConfig.maxErosion, min: 0.01, max: 1, step: 0.01, label: 'Max Erosion' },
    minSlopeForFlow: { value: defaultErosionConfig.minSlopeForFlow, min: 0, max: 0.01, step: 0.0001, label: 'Min Slope for Flow' },
    depositionThreshold: { value: defaultErosionConfig.depositionThreshold, min: 0, max: 1, step: 0.01, label: 'Deposition Threshold' },
    capacityConstant: { value: defaultErosionConfig.capacityConstant || 10.0, min: 1, max: 50, step: 1, label: 'Capacity Constant' },
    maxSedimentCapacity: { value: defaultErosionConfig.maxSedimentCapacity || 1.0, min: 0.1, max: 5, step: 0.1, label: 'Max Sediment Capacity' },
    flowInertia: { value: defaultErosionConfig.flowInertia || 0.3, min: 0, max: 1, step: 0.05, label: 'Flow Inertia' },
    debugAggressive: { value: false, label: 'Debug Aggressive Mode' },
    debugVisualMode: {
      value: 'none' as 'none' | 'water' | 'flow' | 'sediment' | 'heightDelta' | 'cumulative',
      options: ['none', 'water', 'flow', 'sediment', 'heightDelta', 'cumulative'],
      label: 'Debug Visual Mode',
    },
  });

  // Erosion buttons (separate useControls call)
  useControls('Erosion', {
    stepButton: button(() => {
      const stepFn = (window as any).__erosionStep;
      if (stepFn) stepFn();
    }),
    resetButton: button(() => {
      const resetFn = (window as any).__erosionReset;
      if (resetFn) resetFn();
    }),
    testLinkButton: button(() => {
      const testFn = (window as any).__erosionTestLink;
      if (testFn) testFn();
    }),
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
          erosionEnabled={erosionEnabled}
          erosionMode={erosionMode as 'manual' | 'continuous'}
          erosionIterations={erosionIterations}
          erosionSpeed={erosionSpeed}
          erosionConfig={{
            rainfallRate,
            erosionRate,
            depositionRate,
            evaporationRate,
            maxErosion,
            minSlopeForFlow,
            depositionThreshold,
            debugAggressive,
            capacityConstant,
            maxSedimentCapacity,
            flowInertia,
            debugVisualMode: debugVisualMode as 'none' | 'water' | 'flow' | 'sediment' | 'heightDelta' | 'cumulative',
          }}
          debugVisualMode={debugVisualMode as 'none' | 'water' | 'flow' | 'sediment' | 'heightDelta' | 'cumulative'}
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

