import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import {
  DrawerParams,
  GridBox,
  BoxPart,
  getBoxDimensions,
  generateBoxParts,
  generateSingleDrawerLidPart,
  computeDividerSlotCenters,
  selectActiveSlotCenters,
} from '../lib/boxGenerator';

type MaterialPreset = 'birch' | 'walnut' | 'acrylic';
type CameraPreset = 'iso' | 'top' | 'front';

interface Drawer3DViewerProps {
  params: DrawerParams;
  boxes: GridBox[];
  boxMode: 'drawer' | 'single';
  selectedBoxId: number | null;
  onSelectBox: (id: number | null) => void;
}

const MM_SCALE = 0.02; // 100 mm = 2.0 scene units

const _targetVec = new THREE.Vector3();
const _targetCamPos = new THREE.Vector3();

function createWoodCanvasTexture(
  baseHex: string,
  grainHex: string,
  ringHex: string
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = baseHex;
    ctx.fillRect(0, 0, 256, 256);

    // Subtle organic wood fibers
    for (let y = 0; y < 256; y += 2) {
      const wave = Math.sin(y * 0.09) * 0.5 + 0.5;
      ctx.fillStyle = grainHex;
      ctx.globalAlpha = 0.04 + wave * 0.05;
      ctx.fillRect(0, y, 256, 1.3);
    }
    ctx.globalAlpha = 0.08;
    ctx.strokeStyle = ringHex;
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 14; i++) {
      const y0 = i * 19 + 4;
      ctx.beginPath();
      for (let x = 0; x <= 256; x += 16) {
        const dy = Math.sin((x / 256) * Math.PI * 2 + i) * 3.5;
        if (x === 0) ctx.moveTo(x, y0 + dy);
        else ctx.lineTo(x, y0 + dy);
      }
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(0.18, 0.18);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(128, 128, 16, 128, 128, 124);
    grad.addColorStop(0, 'rgba(15, 23, 42, 0.35)');
    grad.addColorStop(0.55, 'rgba(15, 23, 42, 0.12)');
    grad.addColorStop(1, 'rgba(15, 23, 42, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createPartGeometry(
  part: BoxPart,
  thicknessMm: number,
  mapPt: (origX: number, origY: number) => [number, number]
): THREE.ExtrudeGeometry {
  const minX = part.normMinX ?? 0;
  const minY = part.normMinY ?? 0;

  const shape = new THREE.Shape();
  part.points.forEach((pt, idx) => {
    const [sx, sy] = mapPt(pt.x + minX, pt.y + minY);
    if (idx === 0) shape.moveTo(sx * MM_SCALE, sy * MM_SCALE);
    else shape.lineTo(sx * MM_SCALE, sy * MM_SCALE);
  });
  shape.closePath();

  const depth = Math.max(0.01, thicknessMm * MM_SCALE);
  const bevel = Math.min(0.005, depth * 0.06);

  return new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.005, depth - bevel * 2),
    bevelEnabled: bevel > 0.0005,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
    curveSegments: 1,
  });
}

function disposeObjectTree(root: THREE.Object3D) {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh | THREE.LineSegments;
    if (mesh.geometry) {
      mesh.geometry.dispose();
    }
    if (mesh.material) {
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((m) => m.dispose());
      } else {
        mesh.material.dispose();
      }
    }
  });
}

export const Drawer3DViewer: React.FC<Drawer3DViewerProps> = ({
  params,
  boxes,
  boxMode,
  selectedBoxId,
  onSelectBox,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [explodePct, setExplodePct] = useState<number>(0);
  const [liftLid, setLiftLid] = useState<boolean>(false);
  const [showDrawerShell, setShowDrawerShell] = useState<boolean>(true);
  const [materialPreset, setMaterialPreset] = useState<MaterialPreset>('birch');
  const [controlsCollapsed, setControlsCollapsed] = useState<boolean>(false);

  const onSelectBoxRef = useRef(onSelectBox);
  onSelectBoxRef.current = onSelectBox;

  const animStateRef = useRef({
    targetExplode: 0,
    currentExplode: 0,
    targetLidLift: 0,
    currentLidLift: 0,
    camTransitionActive: false,
    camTargetPos: new THREE.Vector3(6, 5.2, 8.2),
    camTargetLook: new THREE.Vector3(0, 0.5, 0),
    sceneRadius: 5,
  });

  const sceneEngineRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: OrbitControls;
    assemblyGroup: THREE.Group;
    keyLight: THREE.DirectionalLight;
    shadowPlane: THREE.Mesh;
    gridHelper: THREE.GridHelper;
    woodTexBirch: THREE.CanvasTexture;
    woodTexWalnut: THREE.CanvasTexture;
    requestRender: () => void;
    isSoftwareGl: boolean;
  } | null>(null);

  // Sync slider/toggle targets into animation ref without rebuilding scene
  useEffect(() => {
    animStateRef.current.targetExplode = explodePct / 100;
    sceneEngineRef.current?.requestRender();
  }, [explodePct]);

  useEffect(() => {
    animStateRef.current.targetLidLift = liftLid ? 1 : 0;
    sceneEngineRef.current?.requestRender();
  }, [liftLid]);

  // Initialize Three.js WebGL stage once on mount
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = (() => {
      try {
        const gl = document.createElement('canvas').getContext('webgl2');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    const width = Math.max(320, container.clientWidth);
    const height = Math.max(320, container.clientHeight);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf1f5f9);
    scene.fog = new THREE.Fog(0xf1f5f9, 28, 95);

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.08, 220);
    camera.position.set(7.5, 6.5, 9.2);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setPixelRatio(
      isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2)
    );
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // Mandatory studio environment map via PMREMGenerator + RoomEnvironment
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTarget = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envTarget.texture;
    pmremGenerator.dispose();

    // Warm/cool 3-point lighting rig
    const hemiLight = new THREE.HemisphereLight(0xe0ecff, 0x64748b, 0.72);
    hemiLight.position.set(0, 20, 0);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff5e8, 2.05);
    keyLight.position.set(9, 14, 10);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);
    scene.add(keyLight.target);

    const fillLight = new THREE.DirectionalLight(0xdbeafe, 0.7);
    fillLight.position.set(-10, 8, -7);
    scene.add(fillLight);

    // Subtle ground workbench plane & millimeter-calibrated CAD grid
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.92,
      metalness: 0.0,
    });
    const groundMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(180, 180),
      groundMat
    );
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.position.y = -0.002;
    groundMesh.receiveShadow = true;
    scene.add(groundMesh);

    const shadowTex = createContactShadowTexture();
    const shadowPlaneMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.55,
    });
    const shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      shadowPlaneMat
    );
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = 0.001;
    scene.add(shadowPlane);

    const gridHelper = new THREE.GridHelper(32, 32, 0xcbd5e1, 0xe2e8f0);
    gridHelper.position.y = 0.002;
    scene.add(gridHelper);

    const assemblyGroup = new THREE.Group();
    scene.add(assemblyGroup);

    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const woodTexBirch = createWoodCanvasTexture('#e8cfa8', '#d7b585', '#c59d67');
    woodTexBirch.anisotropy = maxAniso;
    const woodTexWalnut = createWoodCanvasTexture('#8a5c3c', '#6e4529', '#53321c');
    woodTexWalnut.anisotropy = maxAniso;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.minDistance = 1.5;
    controls.maxDistance = 85;
    controls.target.set(0, 0.5, 0);

    controls.addEventListener('start', () => {
      animStateRef.current.camTransitionActive = false;
    });

    // Coalesced on-demand render loop with software-WebGL pacing & damping
    let frameId = 0;
    let renderBusy = false;
    let renderDirty = false;
    let disposed = false;
    let lastTime = performance.now();

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) : null;
      if (!sync) {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      gl.flush();
      const poll = () => {
        if (disposed) {
          gl.deleteSync(sync);
          return;
        }
        const st = gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (st === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function applyAnimStep(dt: number): boolean {
      const anim = animStateRef.current;
      let needsAnotherFrame = false;

      const nextEx = THREE.MathUtils.damp(
        anim.currentExplode,
        anim.targetExplode,
        10,
        dt
      );
      if (Math.abs(nextEx - anim.targetExplode) > 0.002) {
        anim.currentExplode = nextEx;
        needsAnotherFrame = true;
      } else {
        anim.currentExplode = anim.targetExplode;
      }

      const nextLid = THREE.MathUtils.damp(
        anim.currentLidLift,
        anim.targetLidLift,
        10,
        dt
      );
      if (Math.abs(nextLid - anim.targetLidLift) > 0.002) {
        anim.currentLidLift = nextLid;
        needsAnotherFrame = true;
      } else {
        anim.currentLidLift = anim.targetLidLift;
      }

      // Apply offsets to exploded parts without rebuilding geometries
      assemblyGroup.traverse((obj) => {
        const base = obj.userData.basePos as THREE.Vector3 | undefined;
        const ex = obj.userData.explodeOffset as THREE.Vector3 | undefined;
        if (base && ex) {
          const liftY = obj.userData.isLid
            ? (obj.userData.lidLiftHeight as number) * anim.currentLidLift
            : 0;
          obj.position.set(
            base.x + ex.x * anim.currentExplode,
            base.y + ex.y * anim.currentExplode + liftY,
            base.z + ex.z * anim.currentExplode
          );
        }
      });

      if (anim.camTransitionActive) {
        const lambda = isSoftwareGl ? 24 : 9;
        camera.position.x = THREE.MathUtils.damp(
          camera.position.x,
          anim.camTargetPos.x,
          lambda,
          dt
        );
        camera.position.y = THREE.MathUtils.damp(
          camera.position.y,
          anim.camTargetPos.y,
          lambda,
          dt
        );
        camera.position.z = THREE.MathUtils.damp(
          camera.position.z,
          anim.camTargetPos.z,
          lambda,
          dt
        );
        controls.target.x = THREE.MathUtils.damp(
          controls.target.x,
          anim.camTargetLook.x,
          lambda,
          dt
        );
        controls.target.y = THREE.MathUtils.damp(
          controls.target.y,
          anim.camTargetLook.y,
          lambda,
          dt
        );
        controls.target.z = THREE.MathUtils.damp(
          controls.target.z,
          anim.camTargetLook.z,
          lambda,
          dt
        );
        const distLeft =
          camera.position.distanceTo(anim.camTargetPos) +
          controls.target.distanceTo(anim.camTargetLook);
        if (distLeft > 0.015) {
          needsAnotherFrame = true;
        } else {
          camera.position.copy(anim.camTargetPos);
          controls.target.copy(anim.camTargetLook);
          anim.camTransitionActive = false;
        }
      }

      return needsAnotherFrame;
    }

    function requestRender() {
      if (disposed) return;
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame(() => {
        if (disposed) return;
        renderDirty = false;
        const now = performance.now();
        const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
        lastTime = now;

        const moving = applyAnimStep(dt);
        const dampingActive = controls.update();
        renderer.render(scene, camera);

        const done = () => {
          renderBusy = false;
          if (!disposed && (renderDirty || moving || dampingActive)) {
            requestRender();
          }
        };
        if (isSoftwareGl) afterDraw(done);
        else done();
      });
    }

    controls.addEventListener('change', requestRender);

    // Raycasting on clean click (< 5px drag)
    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();
    let downX = 0;
    let downY = 0;

    const handlePointerDown = (e: PointerEvent) => {
      downX = e.clientX;
      downY = e.clientY;
    };

    const handlePointerUp = (e: PointerEvent) => {
      const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
      if (moved > 5) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointerNdc, camera);
      const hits = raycaster.intersectObjects(assemblyGroup.children, true);
      const hitBox = hits.find(
        (h) => typeof h.object.userData.boxId === 'number' && h.object.userData.boxId > 0
      );
      if (hitBox) {
        onSelectBoxRef.current(hitBox.object.userData.boxId as number);
      }
    };

    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    renderer.domElement.addEventListener('pointerup', handlePointerUp);

    const resizeObserver = new ResizeObserver(() => {
      if (!container || disposed) return;
      const w = Math.max(320, container.clientWidth);
      const h = Math.max(320, container.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      requestRender();
    });
    resizeObserver.observe(container);

    sceneEngineRef.current = {
      scene,
      camera,
      renderer,
      controls,
      assemblyGroup,
      keyLight,
      shadowPlane,
      gridHelper,
      woodTexBirch,
      woodTexWalnut,
      requestRender,
      isSoftwareGl,
    };

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    requestRender();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('pointerup', handlePointerUp);
      controls.dispose();
      disposeObjectTree(assemblyGroup);
      groundMesh.geometry.dispose();
      groundMat.dispose();
      shadowPlane.geometry.dispose();
      shadowPlaneMat.dispose();
      shadowTex.dispose();
      woodTexBirch.dispose();
      woodTexWalnut.dispose();
      envTarget.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
      sceneEngineRef.current = null;
    };
  }, []);

  const hasInitialFramedRef = useRef(false);
  const prevBoxModeRef = useRef<'drawer' | 'single'>(boxMode);

  // Rebuild 3D meshes whenever dimensions, layout, dividers, lids, selection, or material change
  useEffect(() => {
    const engine = sceneEngineRef.current;
    if (!engine) return;

    const { assemblyGroup, woodTexBirch, woodTexWalnut, keyLight, shadowPlane } =
      engine;

    disposeObjectTree(assemblyGroup);
    assemblyGroup.clear();

    const nomParams: DrawerParams = { ...params, kerf: 0 };
    const T = Math.max(0.5, nomParams.thickness);
    const H = nomParams.boxHeight;
    const withTopLid = nomParams.lidMode === 'per-box';

    // Shared PBR materials for this build
    const partMat =
      materialPreset === 'birch'
        ? new THREE.MeshStandardMaterial({
            map: woodTexBirch,
            color: 0xf7e7ce,
            roughness: 0.54,
            metalness: 0.0,
          })
        : materialPreset === 'walnut'
        ? new THREE.MeshStandardMaterial({
            map: woodTexWalnut,
            color: 0xb6825c,
            roughness: 0.48,
            metalness: 0.02,
          })
        : new THREE.MeshPhysicalMaterial({
            color: 0xcbd5e1,
            roughness: 0.18,
            metalness: 0.04,
            clearcoat: 0.75,
            clearcoatRoughness: 0.12,
          });

    const dividerMat =
      materialPreset === 'birch'
        ? new THREE.MeshStandardMaterial({
            map: woodTexBirch,
            color: 0xe6cda6,
            roughness: 0.62,
            metalness: 0.0,
          })
        : materialPreset === 'walnut'
        ? new THREE.MeshStandardMaterial({
            map: woodTexWalnut,
            color: 0x9b6b49,
            roughness: 0.56,
            metalness: 0.02,
          })
        : new THREE.MeshPhysicalMaterial({
            color: 0x94a3b8,
            roughness: 0.25,
            metalness: 0.06,
            clearcoat: 0.5,
          });

    const selectedMat = partMat.clone();
    if ('emissive' in selectedMat) {
      selectedMat.emissive = new THREE.Color(0x1d4ed8);
      selectedMat.emissiveIntensity = 0.14;
    }

    const selectedDivMat = dividerMat.clone();
    if ('emissive' in selectedDivMat) {
      selectedDivMat.emissive = new THREE.Color(0x2563eb);
      selectedDivMat.emissiveIntensity = 0.16;
    }

    const edgeLineMat = new THREE.LineBasicMaterial({
      color: materialPreset === 'walnut' ? 0x3b2314 : 0x64748b,
      transparent: true,
      opacity: 0.5,
    });

    const selectedEdgeLineMat = new THREE.LineBasicMaterial({
      color: 0x1d4ed8,
      transparent: true,
      opacity: 0.9,
    });

    const shellEnabled = boxMode === 'drawer' && showDrawerShell;
    const shellFloorT = Math.max(4, T * 1.4);
    const shellWallT = Math.max(8, T * 2.4);
    const boxBaseY = shellEnabled ? shellFloorT : 0;

    let footprintW = nomParams.drawerWidth;
    let footprintD = nomParams.drawerDepth;

    // Build outer drawer casing in drawer mode
    if (shellEnabled) {
      const shellMat = new THREE.MeshStandardMaterial({
        color: 0x334155,
        roughness: 0.82,
        metalness: 0.14,
      });
      const pullMat = new THREE.MeshStandardMaterial({
        color: 0xcbd5e1,
        roughness: 0.24,
        metalness: 0.86,
      });

      const outerW = nomParams.drawerWidth + shellWallT * 2;
      const outerD = nomParams.drawerDepth + shellWallT * 2;
      const shellWallH = shellFloorT + Math.max(H + 5, H * 1.1);
      footprintW = outerW;
      footprintD = outerD;

      const shellParts: Array<{
        w: number;
        h: number;
        d: number;
        x: number;
        y: number;
        z: number;
        mat: THREE.Material;
      }> = [
        // Drawer floor
        {
          w: outerW,
          h: shellFloorT,
          d: outerD,
          x: 0,
          y: shellFloorT / 2,
          z: 0,
          mat: shellMat,
        },
        // Drawer back wall
        {
          w: outerW,
          h: shellWallH - shellFloorT,
          d: shellWallT,
          x: 0,
          y: shellFloorT + (shellWallH - shellFloorT) / 2,
          z: -(nomParams.drawerDepth / 2 + shellWallT / 2),
          mat: shellMat,
        },
        // Drawer front wall
        {
          w: outerW,
          h: shellWallH - shellFloorT,
          d: shellWallT,
          x: 0,
          y: shellFloorT + (shellWallH - shellFloorT) / 2,
          z: nomParams.drawerDepth / 2 + shellWallT / 2,
          mat: shellMat,
        },
        // Drawer left wall
        {
          w: shellWallT,
          h: shellWallH - shellFloorT,
          d: nomParams.drawerDepth,
          x: -(nomParams.drawerWidth / 2 + shellWallT / 2),
          y: shellFloorT + (shellWallH - shellFloorT) / 2,
          z: 0,
          mat: shellMat,
        },
        // Drawer right wall
        {
          w: shellWallT,
          h: shellWallH - shellFloorT,
          d: nomParams.drawerDepth,
          x: nomParams.drawerWidth / 2 + shellWallT / 2,
          y: shellFloorT + (shellWallH - shellFloorT) / 2,
          z: 0,
          mat: shellMat,
        },
        // Brushed metallic front handle trim
        {
          w: Math.min(outerW * 0.34, 140),
          h: Math.min(10, (shellWallH - shellFloorT) * 0.25),
          d: 6,
          x: 0,
          y: shellFloorT + (shellWallH - shellFloorT) * 0.58,
          z: outerD / 2 + 3,
          mat: pullMat,
        },
      ];

      shellParts.forEach((sp) => {
        const g = new THREE.BoxGeometry(
          sp.w * MM_SCALE,
          sp.h * MM_SCALE,
          sp.d * MM_SCALE
        );
        const m = new THREE.Mesh(g, sp.mat);
        m.position.set(sp.x * MM_SCALE, sp.y * MM_SCALE, sp.z * MM_SCALE);
        m.castShadow = !engine.isSoftwareGl;
        m.receiveShadow = true;
        assemblyGroup.add(m);
      });
    }

    // Compute positions of all boxes in mm relative to center (0, 0)
    const usableW = Math.max(10, nomParams.drawerWidth - nomParams.clearance);
    const usableD = Math.max(10, nomParams.drawerDepth - nomParams.clearance);
    const cellW = usableW / Math.max(1, nomParams.cols);
    const cellD = usableD / Math.max(1, nomParams.rows);

    let singleCols = 1;
    let singleRows = 1;
    let singleGap = 14;
    if (boxMode === 'single') {
      singleCols = Math.ceil(Math.sqrt(boxes.length));
      singleRows = Math.ceil(boxes.length / singleCols);
      footprintW = singleCols * usableW + Math.max(0, singleCols - 1) * singleGap;
      footprintD = singleRows * usableD + Math.max(0, singleRows - 1) * singleGap;
    }

    const anim = animStateRef.current;

    boxes.forEach((box, boxIdx) => {
      const dims = getBoxDimensions(box, nomParams);
      const W = dims.width;
      const D = dims.depth;
      const boxT = Math.max(0.5, Math.min(T, Math.min(W, D, H) * 0.28));
      const innerW = Math.max(2, W - 2 * boxT);
      const innerD = Math.max(2, D - 2 * boxT);
      const topPad = withTopLid ? boxT : 0;
      const innerH = Math.max(4, H - boxT - topPad);

      // Center of this box in world mm (centered at 0, 0)
      let cx = 0;
      let cz = 0;
      if (boxMode === 'drawer') {
        cx = -usableW / 2 + (box.col + box.colSpan / 2) * cellW;
        cz = -usableD / 2 + (box.row + box.rowSpan / 2) * cellD;
      } else {
        const sc = boxIdx % singleCols;
        const sr = Math.floor(boxIdx / singleCols);
        cx = -footprintW / 2 + W / 2 + sc * (W + singleGap);
        cz = -footprintD / 2 + D / 2 + sr * (D + singleGap);
      }

      const xAllSlots = computeDividerSlotCenters(
        innerW,
        boxT,
        box.dividersX,
        nomParams.movableDividers,
        nomParams.movableSlotSpacing
      );
      const yAllSlots = computeDividerSlotCenters(
        innerD,
        boxT,
        box.dividersY,
        nomParams.movableDividers,
        nomParams.movableSlotSpacing
      );
      const xActive = selectActiveSlotCenters(xAllSlots, box.dividersX);
      const yActive = selectActiveSlotCenters(yAllSlots, box.dividersY);

      const parts = generateBoxParts(box, nomParams);
      const isSelected = box.id === selectedBoxId;
      const explodeSpread = Math.min(34, Math.max(12, Math.min(W, D, H) * 0.32));

      let divXIdx = 0;
      let divYIdx = 0;

      parts.forEach((part) => {
        let geo: THREE.ExtrudeGeometry;
        let basePos = new THREE.Vector3();
        let explodeOffset = new THREE.Vector3();
        let isLid = false;
        const isDivider = part.role.startsWith('Skillevegg');

        if (part.role === 'Bunn') {
          geo = createPartGeometry(part, boxT, (ox, oy) => [ox - W / 2, -(oy - D / 2)]);
          geo.rotateX(-Math.PI / 2);
          basePos.set(cx * MM_SCALE, boxBaseY * MM_SCALE, cz * MM_SCALE);
          explodeOffset.set(0, -explodeSpread * 0.45 * MM_SCALE, 0);
        } else if (part.role === 'Lokk') {
          geo = createPartGeometry(part, boxT, (ox, oy) => [ox - W / 2, -(oy - D / 2)]);
          geo.rotateX(-Math.PI / 2);
          basePos.set(cx * MM_SCALE, (boxBaseY + H - boxT) * MM_SCALE, cz * MM_SCALE);
          explodeOffset.set(0, explodeSpread * 1.45 * MM_SCALE, 0);
          isLid = true;
        } else if (part.role === 'Forvegg' || part.role === 'Bakvegg') {
          geo = createPartGeometry(part, boxT, (ox, oy) => [ox - W / 2, H - oy]);
          geo.translate(0, 0, (-boxT / 2) * MM_SCALE);
          const isFront = part.role === 'Forvegg';
          basePos.set(
            cx * MM_SCALE,
            boxBaseY * MM_SCALE,
            (cz + (isFront ? D / 2 - boxT / 2 : -D / 2 + boxT / 2)) * MM_SCALE
          );
          explodeOffset.set(
            0,
            0,
            (isFront ? explodeSpread : -explodeSpread) * MM_SCALE
          );
        } else if (part.role === 'Venstre' || part.role === 'Høyre') {
          geo = createPartGeometry(part, boxT, (ox, oy) => [-(ox - D / 2), H - oy]);
          geo.translate(0, 0, (-boxT / 2) * MM_SCALE);
          geo.rotateY(Math.PI / 2);
          const isRight = part.role === 'Høyre';
          basePos.set(
            (cx + (isRight ? W / 2 - boxT / 2 : -W / 2 + boxT / 2)) * MM_SCALE,
            boxBaseY * MM_SCALE,
            cz * MM_SCALE
          );
          explodeOffset.set(
            (isRight ? explodeSpread : -explodeSpread) * MM_SCALE,
            0,
            0
          );
        } else if (part.role === 'Skillevegg X') {
          const slotCenterX = xActive[divXIdx++] ?? innerW / 2;
          geo = createPartGeometry(part, boxT, (ox, oy) => [
            -(ox - innerD / 2),
            innerH - oy,
          ]);
          geo.translate(0, 0, (-boxT / 2) * MM_SCALE);
          geo.rotateY(Math.PI / 2);
          basePos.set(
            (cx - W / 2 + boxT + slotCenterX) * MM_SCALE,
            (boxBaseY + boxT) * MM_SCALE,
            cz * MM_SCALE
          );
          explodeOffset.set(0, explodeSpread * 0.85 * MM_SCALE, 0);
        } else if (part.role === 'Skillevegg Y') {
          const slotCenterY = yActive[divYIdx++] ?? innerD / 2;
          geo = createPartGeometry(part, boxT, (ox, oy) => [
            ox - innerW / 2,
            innerH - oy,
          ]);
          geo.translate(0, 0, (-boxT / 2) * MM_SCALE);
          basePos.set(
            cx * MM_SCALE,
            (boxBaseY + boxT) * MM_SCALE,
            (cz - D / 2 + boxT + slotCenterY) * MM_SCALE
          );
          explodeOffset.set(0, explodeSpread * 1.15 * MM_SCALE, 0);
        } else {
          return;
        }

        const meshMat = isSelected
          ? isDivider
            ? selectedDivMat
            : selectedMat
          : isDivider
          ? dividerMat
          : partMat;

        const mesh = new THREE.Mesh(geo, meshMat);
        mesh.castShadow = !engine.isSoftwareGl;
        mesh.receiveShadow = true;
        mesh.userData.boxId = box.id;
        mesh.userData.basePos = basePos;
        mesh.userData.explodeOffset = explodeOffset;
        mesh.userData.isLid = isLid;
        mesh.userData.lidLiftHeight = (H * 0.75 + 14) * MM_SCALE;

        mesh.position.set(
          basePos.x + explodeOffset.x * anim.currentExplode,
          basePos.y +
            explodeOffset.y * anim.currentExplode +
            (isLid ? (mesh.userData.lidLiftHeight as number) * anim.currentLidLift : 0),
          basePos.z + explodeOffset.z * anim.currentExplode
        );

        const edges = new THREE.EdgesGeometry(geo, 28);
        const line = new THREE.LineSegments(
          edges,
          isSelected ? selectedEdgeLineMat : edgeLineMat
        );
        mesh.add(line);

        assemblyGroup.add(mesh);
      });
    });

    // Optional single-drawer flat lid spanning all boxes
    if (boxMode === 'drawer' && nomParams.lidMode === 'single-drawer') {
      const lidPart = generateSingleDrawerLidPart(nomParams);
      const geo = createPartGeometry(lidPart, T, (ox, oy) => [
        ox - usableW / 2,
        -(oy - usableD / 2),
      ]);
      geo.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(geo, partMat);
      const basePos = new THREE.Vector3(0, (boxBaseY + H) * MM_SCALE, 0);
      const explodeOffset = new THREE.Vector3(
        0,
        Math.min(48, Math.max(18, H * 0.55)) * MM_SCALE,
        0
      );
      mesh.castShadow = !engine.isSoftwareGl;
      mesh.receiveShadow = true;
      mesh.userData.basePos = basePos;
      mesh.userData.explodeOffset = explodeOffset;
      mesh.userData.isLid = true;
      mesh.userData.lidLiftHeight = (H * 0.8 + 18) * MM_SCALE;
      mesh.position.set(
        basePos.x,
        basePos.y +
          explodeOffset.y * anim.currentExplode +
          (mesh.userData.lidLiftHeight as number) * anim.currentLidLift,
        basePos.z
      );
      const edges = new THREE.EdgesGeometry(geo, 28);
      mesh.add(new THREE.LineSegments(edges, edgeLineMat));
      assemblyGroup.add(mesh);
    }

    // Ground contact shadow & directional shadow frustum calibration
    const maxSpan = Math.max(footprintW, footprintD, H) * MM_SCALE;
    anim.sceneRadius = maxSpan * 0.65;
    engine.controls.minDistance = Math.max(0.5, maxSpan * 0.3);
    engine.controls.maxDistance = Math.max(35, maxSpan * 5.5);

    shadowPlane.scale.set(
      Math.max(1.4, footprintW * MM_SCALE * 1.45),
      Math.max(1.4, footprintD * MM_SCALE * 1.45),
      1
    );

    const shadowBound = Math.max(3, maxSpan * 0.85);
    keyLight.shadow.camera.left = -shadowBound;
    keyLight.shadow.camera.right = shadowBound;
    keyLight.shadow.camera.top = shadowBound;
    keyLight.shadow.camera.bottom = -shadowBound;
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = Math.max(35, maxSpan * 4);
    keyLight.shadow.camera.updateProjectionMatrix();
    keyLight.position.set(maxSpan * 1.15, maxSpan * 1.55 + 2, maxSpan * 1.1);

    // Frame camera on initial open or boxMode switch (preserve user camera when editing dimensions!)
    if (!hasInitialFramedRef.current || prevBoxModeRef.current !== boxMode) {
      hasInitialFramedRef.current = true;
      prevBoxModeRef.current = boxMode;
      const dist = Math.max(2.2, maxSpan * 1.4);
      engine.camera.position.set(dist * 0.72, dist * 0.66, dist * 0.88);
      engine.controls.target.set(0, (H * MM_SCALE) * 0.45, 0);
      engine.controls.update();
    }

    engine.requestRender();
  }, [params, boxes, boxMode, selectedBoxId, materialPreset, showDrawerShell]);

  const applyCameraPreset = (preset: CameraPreset) => {
    const engine = sceneEngineRef.current;
    if (!engine) return;
    const r = Math.max(1.2, animStateRef.current.sceneRadius);
    const centerY = (params.boxHeight * MM_SCALE) * 0.45;
    const anim = animStateRef.current;
    anim.camTargetLook.set(0, centerY, 0);

    if (preset === 'iso') {
      anim.camTargetPos.set(r * 1.45, r * 1.25 + 0.5, r * 1.65);
    } else if (preset === 'top') {
      anim.camTargetPos.set(0, r * 2.25 + 1.0, 0.08);
    } else {
      anim.camTargetPos.set(0, centerY + r * 0.45, r * 2.1);
    }

    _targetVec.copy(anim.camTargetLook);
    _targetCamPos.copy(anim.camTargetPos);
    anim.camTransitionActive = true;
    engine.requestRender();
  };

  const selectedBox = boxes.find((b) => b.id === selectedBoxId) ?? null;
  const selectedDims = selectedBox ? getBoxDimensions(selectedBox, params) : null;
  const hasLid = params.lidMode !== 'none';

  return (
    <div className="relative flex flex-col h-full min-h-[540px] bg-slate-100 border border-slate-200 rounded-lg overflow-hidden">
      {/* Top-Left Minimal Spec Readout (static, tabular-nums, zero pulse dots) */}
      <div className="absolute top-3.5 left-3.5 z-10 pointer-events-none">
        <div className="bg-white/95 border border-slate-200/90 rounded-lg px-3 py-1.5 text-xs text-slate-700 shadow-xs flex flex-wrap items-center gap-2">
          <span className="font-semibold text-slate-900">
            {boxMode === 'single' ? 'Enkeltboks 3D' : 'Skuffe 3D'}
          </span>
          <span aria-hidden="true" className="text-slate-300">
            ·
          </span>
          <span className="font-mono tabular-nums">
            {params.drawerWidth.toFixed(0)} × {params.drawerDepth.toFixed(0)} ×{' '}
            {params.boxHeight.toFixed(0)} mm
          </span>
          <span aria-hidden="true" className="text-slate-300">
            ·
          </span>
          <span className="font-mono tabular-nums">
            {boxes.length} {boxes.length === 1 ? 'boks' : 'bokser'}
          </span>
          {selectedBox && selectedDims && (
            <>
              <span aria-hidden="true" className="text-slate-300">
                ·
              </span>
              <span className="font-mono tabular-nums text-blue-700 font-medium">
                Valgt #{selectedBox.id}: {selectedDims.width.toFixed(1)} ×{' '}
                {selectedDims.depth.toFixed(1)} mm
              </span>
            </>
          )}
        </div>
      </div>

      {/* Dedicated WebGL Mount Container */}
      <div
        ref={mountRef}
        className="flex-1 w-full h-full min-h-[540px] cursor-grab active:cursor-grabbing"
      />

      {/* Collapsible Bottom Control Dock (Zero Viewport Occlusion, solid rgba background) */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center max-w-[94vw]">
        <button
          type="button"
          onClick={() => setControlsCollapsed((v) => !v)}
          className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/95 border border-b-0 border-slate-200 rounded-t-lg text-[11px] font-semibold text-slate-700 hover:text-slate-900 shadow-xs cursor-pointer"
        >
          {controlsCollapsed ? (
            <>
              <ChevronUp className="w-3.5 h-3.5" />
              <span>Vis 3D-kontroller</span>
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5" />
              <span>Skjul kontroller</span>
            </>
          )}
        </button>

        {!controlsCollapsed && (
          <div className="bg-white/95 border border-slate-200 rounded-xl shadow-md px-4 py-2.5 flex flex-wrap items-center justify-center gap-4 text-xs">
            {/* Exploded View Slider */}
            <div className="flex items-center gap-2">
              <label
                htmlFor="explodeSlider"
                className="font-medium text-slate-700 whitespace-nowrap"
              >
                Eksplodert
              </label>
              <input
                id="explodeSlider"
                type="range"
                min={0}
                max={100}
                step={1}
                value={explodePct}
                onChange={(e) => setExplodePct(Number(e.target.value))}
                className="w-24 accent-blue-700 cursor-pointer"
              />
              <span className="w-8 font-mono tabular-nums text-slate-600 text-right">
                {explodePct}%
              </span>
            </div>

            <span aria-hidden="true" className="hidden sm:inline text-slate-200">
              |
            </span>

            {/* Material Swatches */}
            <div className="flex items-center gap-1.5">
              <span className="text-slate-600 font-medium mr-0.5">
                Materiale:
              </span>
              {(
                [
                  { id: 'birch', label: 'Bjørk', swatch: 'bg-[#e8cfa8]' },
                  { id: 'walnut', label: 'Valnøtt', swatch: 'bg-[#8a5c3c]' },
                  { id: 'acrylic', label: 'Akryl', swatch: 'bg-slate-300' },
                ] as const
              ).map((mat) => (
                <button
                  key={mat.id}
                  type="button"
                  onClick={() => setMaterialPreset(mat.id)}
                  className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md font-medium border transition-colors cursor-pointer ${
                    materialPreset === mat.id
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <span
                    className={`w-2.5 h-2.5 rounded-full border border-black/15 ${mat.swatch}`}
                  />
                  <span>{mat.label}</span>
                </button>
              ))}
            </div>

            {(boxMode === 'drawer' || hasLid) && (
              <>
                <span
                  aria-hidden="true"
                  className="hidden sm:inline text-slate-200"
                >
                  |
                </span>
                <div className="flex items-center gap-3">
                  {boxMode === 'drawer' && (
                    <label className="flex items-center gap-1.5 font-medium text-slate-700 cursor-pointer select-none whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={showDrawerShell}
                        onChange={(e) => setShowDrawerShell(e.target.checked)}
                        className="rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                      />
                      <span>Skuffekasse</span>
                    </label>
                  )}
                  {hasLid && (
                    <label className="flex items-center gap-1.5 font-medium text-slate-700 cursor-pointer select-none whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={liftLid}
                        onChange={(e) => setLiftLid(e.target.checked)}
                        className="rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                      />
                      <span>Løft lokk</span>
                    </label>
                  )}
                </div>
              </>
            )}

            <span aria-hidden="true" className="hidden sm:inline text-slate-200">
              |
            </span>

            {/* Camera Presets */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => applyCameraPreset('iso')}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md font-medium bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 cursor-pointer"
                title="Isometrisk kameravinkel"
              >
                <RotateCcw className="w-3 h-3" />
                <span>3D</span>
              </button>
              <button
                type="button"
                onClick={() => applyCameraPreset('top')}
                className="px-2 py-1 rounded-md font-medium bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Ovenfra
              </button>
              <button
                type="button"
                onClick={() => applyCameraPreset('front')}
                className="px-2 py-1 rounded-md font-medium bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Forfra
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
