# WAVES.IO - Beach Sandbox Simulator

Uma POC (Proof of Concept) de simulador de praias realistas executando inteiramente no navegador, com edição de terreno em tempo real, água realista com shaders customizados e vegetação procedural.

![Beach Sandbox Simulator](docs/screenshot.png)

## 🌊 Características

### Terreno Editável
- PlaneGeometry 256x256 com subdivisões de alta qualidade
- Heightmap em memória (Float32Array) para performance
- Geração procedural usando Simplex Noise
- 5 tipos de brushes:
  - **Raise**: Eleva o terreno
  - **Lower**: Rebaixa o terreno
  - **Smooth**: Suaviza e remove imperfeições
  - **Flatten**: Nivela para altura média
  - **Erosion**: Simula erosão com blur gaussiano

### Água Realista
- Shaders GLSL customizados
- Ondas Gerstner animadas (múltiplas sobrepostas)
- Efeito Fresnel para reflexão realista
- Gradiente de cor baseado em profundidade
- Espuma procedural nas cristas das ondas
- Subsurface scattering aproximado

### Vegetação Procedural
- InstancedMesh para alta performance
- Palmeiras com troncos e folhas
- Pedras com geometria deformada
- Arbustos costeiros
- Posicionamento automático baseado em altura e inclinação

### Sistema de Iluminação
- Sky procedural com Three.js
- DirectionalLight (sol) com sombras em tempo real
- Shadow mapping 2048x2048
- AmbientLight e HemisphereLight para iluminação natural
- Fog atmosférico para profundidade
- Tone mapping ACES para cores cinematográficas

### Painel de Controles Interativos (Leva)
- **Environment**: Sea Level, Wave Intensity, Wave Speed, Time Scale
- **Brush**: Type, Radius, Strength
- **Colors**: Sand Color, Shallow Water, Deep Water
- **Sun**: Azimuth, Elevation

## 🛠️ Stack Tecnológica

- **Next.js 16** - Framework React com Turbopack
- **Three.js** - Biblioteca 3D
- **React Three Fiber** - Integração React para Three.js
- **React Three Drei** - Helpers e componentes úteis
- **TypeScript** - Type safety
- **GLSL** - Shaders customizados
- **Leva** - Painel de controles interativos
- **Simplex Noise** - Geração procedural de terreno

## 🚀 Começando

### Pré-requisitos

- Node.js 18+ 
- npm ou yarn

### Instalação

```bash
# Clone o repositório
git clone https://github.com/seu-usuario/waves.io.git
cd waves.io

# Instale as dependências
npm install

# Execute o servidor de desenvolvimento
npm run dev
```

Acesse [http://localhost:3000](http://localhost:3000) no seu navegador.

## 🎮 Controles

### Edição de Terreno
- **Left Click + Drag**: Aplica o brush no terreno
- **Brush Types**: Selecione no painel de controles

### Câmera
- **Right Click + Drag**: Rotaciona a câmera
- **Scroll**: Zoom in/out
- **Middle Click + Drag**: Pan (mover câmera lateralmente)

### Painel de Controles
Use o painel à direita para ajustar:
- Nível do mar
- Intensidade e velocidade das ondas
- Raio e força do brush
- Cores do terreno e água
- Posição do sol

## 📁 Estrutura do Projeto

```
app/
├── page.tsx                          # Página principal
├── layout.tsx                        # Layout com metadata
├── globals.css                       # Estilos globais
└── simulator/
    ├── BeachSimulator.tsx           # Componente React principal
    ├── core/
    │   ├── scene.ts                 # Setup de câmera, luzes, fog
    │   ├── terrain.ts               # Sistema de terreno com heightmap
    │   ├── water.ts                 # Água com shaders customizados
    │   ├── vegetation.ts            # InstancedMesh para vegetação
    │   ├── brushes.ts               # Sistema de brushes (5 tipos)
    │   └── controls.ts              # Controles de raycasting
    └── shaders/
        ├── terrain.vert.glsl        # Vertex shader do terreno
        ├── terrain.frag.glsl        # Fragment shader do terreno (PBR)
        ├── water.vert.glsl          # Vertex shader da água (Gerstner waves)
        └── water.frag.glsl          # Fragment shader da água (Fresnel, foam)
```

## 🎨 Arquitetura Técnica

### Sistema de Terreno
O terreno utiliza um `PlaneGeometry` com 256x256 subdivisões. A altura de cada vértice é armazenada em um `Float32Array` para modificações rápidas. Quando o usuário clica no terreno:

1. **Raycasting** detecta a posição 3D do clique
2. O **brush system** calcula quais vértices serão afetados
3. Uma **função de falloff** (cosine/gaussian) suaviza a borda do brush
4. Os vértices são modificados e **normals recalculadas**

### Shaders de Água
Os shaders de água implementam:
- **Vertex Shader**: Calcula ondas Gerstner (múltiplas direções) e deforma a geometria
- **Fragment Shader**: Aplica Fresnel effect, gradiente de profundidade, especular, e foam procedural

### Performance
- InstancedMesh para vegetação (1 draw call por tipo)
- BufferAttribute.needsUpdate apenas quando modificado
- Frustum culling automático
- Shaders otimizados sem loops complexos

## ✨ Demonstração

O usuário pode criar uma praia funcional em menos de 1 minuto:
1. Ajuste o nível do mar
2. Use brushes para esculpir montanhas e vales
3. Altere cores para criar diferentes atmosferas
4. Ajuste ondas para simular diferentes condições marítimas

## 🔧 Próximas Melhorias

- [ ] Sistema de save/load de terrenos
- [ ] Mais tipos de vegetação
- [ ] Exportação para glTF
- [ ] Texturas para terreno (areia, pedras)
- [ ] Partículas (spray de água, folhas)
- [ ] Áudio ambiente (ondas, vento)
- [ ] Mobile touch controls

## 📝 Licença

Este projeto é uma POC (Proof of Concept) para demonstração técnica.

## 🙏 Agradecimentos

- Three.js team
- React Three Fiber maintainers
- Simplex Noise library

---

**Desenvolvido com ❤️ usando Next.js, Three.js e TypeScript**
