'use client';

import dynamic from 'next/dynamic';
import { Suspense, useState, useEffect } from 'react';

// Dynamically import BeachSimulator to avoid SSR issues with Three.js
const BeachSimulator = dynamic(
  () => import('./simulator/BeachSimulator'),
  { 
    ssr: false,
    loading: () => <LoadingScreen />
  }
);

function LoadingScreen() {
  return (
    <div className="loading-screen">
      <h1>waves.io</h1>
      <div className="loading-spinner" />
      <p style={{ marginTop: '24px', color: 'rgba(237, 237, 237, 0.6)', fontSize: '14px' }}>
        Loading beach simulator...
      </p>
    </div>
  );
}

export default function Home() {
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // Small delay to ensure smooth transition
    const timer = setTimeout(() => setIsLoaded(true), 100);
    return () => clearTimeout(timer);
  }, []);

  return (
    <main style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
      {/* Title Bar */}
      <div className="title-bar">
        <h1>WAVES.IO</h1>
        <span>Beach Sandbox Simulator</span>
      </div>

      {/* Main Simulator */}
      <Suspense fallback={<LoadingScreen />}>
        <BeachSimulator />
      </Suspense>
    </main>
  );
}
