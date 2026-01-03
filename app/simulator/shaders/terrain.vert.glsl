/**
 * Terrain Vertex Shader
 * Handles vertex transformation and passes data to fragment shader
 */

varying vec3 vWorldPosition;
varying vec3 vNormal;
varying vec3 vViewPosition;
varying float vHeight;
varying vec2 vUv;

void main() {
  vUv = uv;
  vNormal = normalize(normalMatrix * normal);
  
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPos.xyz;
  vHeight = position.y;
  
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vViewPosition = -mvPosition.xyz;
  
  gl_Position = projectionMatrix * mvPosition;
}

