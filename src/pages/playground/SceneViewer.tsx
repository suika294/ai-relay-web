// SceneViewer —— 混元 3D 世界模型 / 360 全景图的交互式查看器。
//
// 统一一个 three.js 场景,按产物类型分派渲染:
//   - splat(.spz/.ply)      → Niantic Spark(@sparkjsdev/spark)高斯泼溅,可轨道漫游
//   - mesh(.glb/.gltf)      → three.js GLTFLoader + OrbitControls
//   - panorama-image(ERP)   → 内翻球体贴图,拖拽看 360°
//   - panorama-video(.mp4)  → 视频贴图球体
//
// three 与 spark 都用动态 import 懒加载,不进主 bundle。任何加载/渲染异常都吞进
// onError 走父组件的「下载 + 预览图」兜底,绝不把 Playground 整页拖崩。

import { useEffect, useRef, useState } from 'react';

export type SceneKind = 'splat' | 'mesh' | 'panorama-image' | 'panorama-video';

export interface SceneViewerProps {
  url: string;
  kind: SceneKind;
  height?: number;
  /** 加载中的提示文案(父组件传 i18n 文本)。 */
  loadingText?: string;
  /** 加载失败时通知父组件切到下载兜底 UI。 */
  onError?: (err: unknown) => void;
}

// classifyThreeDFile 从 3D 任务的文件类型/URL 推断可交互渲染的 kind。
// 返回 null 表示没有可内嵌渲染的产物(父组件走纯下载)。
export function classifyThreeDFile(type?: string, url?: string): SceneKind | null {
  const t = (type || '').toLowerCase();
  const u = (url || '').toLowerCase().split(/[?#]/)[0];
  const is = (ext: string) => t === ext.slice(1) || u.endsWith(ext);
  if (is('.spz') || is('.ply') || is('.splat') || is('.ksplat')) return 'splat';
  if (is('.glb') || is('.gltf')) return 'mesh';
  if (is('.mp4')) return 'panorama-video';
  return null;
}

export default function SceneViewer({ url, kind, height = 380, loadingText, onError }: SceneViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !url) return;

    let disposed = false;
    // 各类资源句柄,cleanup 用。
    let renderer: any;
    let controls: any;
    let raf = 0;
    let ro: ResizeObserver | undefined;
    let videoEl: HTMLVideoElement | undefined;
    const disposables: Array<() => void> = [];

    const fail = (err: unknown) => {
      if (disposed) return;
      // eslint-disable-next-line no-console
      console.warn('[SceneViewer] render failed:', err);
      setFailed(true);
      setLoading(false);
      onError?.(err);
    };

    (async () => {
      try {
        const THREE: any = await import('three');
        // @ts-ignore three examples 无类型声明入口
        const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');
        if (disposed) return;

        const width = container.clientWidth || 640;
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(width, height);
        renderer.setClearColor(0x0b0d12, 1);
        container.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(60, width / height, 0.01, 2000);
        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;

        if (kind === 'mesh') {
          // @ts-ignore
          const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
          if (disposed) return;
          scene.add(new THREE.AmbientLight(0xffffff, 1.4));
          const dir = new THREE.DirectionalLight(0xffffff, 1.1);
          dir.position.set(2, 3, 2);
          scene.add(dir);
          camera.position.set(0, 0, 3);
          const gltf: any = await new GLTFLoader().loadAsync(url);
          if (disposed) return;
          const obj = gltf.scene || gltf.scenes?.[0];
          // 居中 + 按包围盒把相机拉到合适距离。
          const box = new THREE.Box3().setFromObject(obj);
          const size = box.getSize(new THREE.Vector3());
          const center = box.getCenter(new THREE.Vector3());
          obj.position.sub(center);
          const maxDim = Math.max(size.x, size.y, size.z) || 1;
          const dist = maxDim / (2 * Math.tan((Math.PI * camera.fov) / 360));
          camera.position.set(0, 0, dist * 1.6);
          controls.target.set(0, 0, 0);
          scene.add(obj);
        } else if (kind === 'splat') {
          const spark: any = await import('@sparkjsdev/spark');
          if (disposed) return;
          const SplatMesh = spark.SplatMesh || spark.default?.SplatMesh;
          if (!SplatMesh) throw new Error('spark: SplatMesh export missing');
          const splats = new SplatMesh({ url });
          // spark 部分版本产物坐标系是相机朝 -z、Y 向下,翻转一下更符合直觉。
          splats.rotation.x = Math.PI;
          scene.add(splats);
          camera.position.set(0, 0, 4);
          controls.target.set(0, 0, 0);
          disposables.push(() => splats.dispose?.());
          // 若 spark 暴露 initialized promise,等它以便首帧不空。
          if (splats.initialized?.then) {
            try {
              await splats.initialized;
            } catch {
              /* 忽略:动画循环仍会渲染 */
            }
          }
        } else if (kind === 'panorama-image' || kind === 'panorama-video') {
          const geo = new THREE.SphereGeometry(500, 64, 40);
          geo.scale(-1, 1, 1); // 内翻:相机在球心朝内看
          let tex: any;
          if (kind === 'panorama-video') {
            videoEl = document.createElement('video');
            videoEl.src = url;
            videoEl.crossOrigin = 'anonymous';
            videoEl.loop = true;
            videoEl.muted = true;
            videoEl.playsInline = true;
            await videoEl.play().catch(() => undefined);
            tex = new THREE.VideoTexture(videoEl);
          } else {
            tex = await new THREE.TextureLoader().loadAsync(url);
          }
          if (disposed) return;
          if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
          const mat = new THREE.MeshBasicMaterial({ map: tex });
          scene.add(new THREE.Mesh(geo, mat));
          disposables.push(() => {
            geo.dispose();
            mat.dispose();
            tex.dispose?.();
          });
          camera.position.set(0, 0, 0.1);
          controls.target.set(0, 0, 0);
          controls.enableZoom = false;
          controls.enablePan = false;
          controls.rotateSpeed = -0.3; // 反向:拖拽方向 = 视线方向
        } else {
          throw new Error('SceneViewer: unsupported kind ' + kind);
        }

        if (disposed) return;
        setLoading(false);

        const animate = () => {
          raf = requestAnimationFrame(animate);
          controls?.update?.();
          renderer.render(scene, camera);
        };
        animate();

        ro = new ResizeObserver(() => {
          const w = container.clientWidth || width;
          camera.aspect = w / height;
          camera.updateProjectionMatrix();
          renderer.setSize(w, height);
        });
        ro.observe(container);
      } catch (err) {
        fail(err);
      }
    })();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro?.disconnect();
      controls?.dispose?.();
      disposables.forEach((fn) => {
        try {
          fn();
        } catch {
          /* noop */
        }
      });
      if (videoEl) {
        videoEl.pause();
        videoEl.removeAttribute('src');
      }
      if (renderer) {
        renderer.dispose?.();
        const el = renderer.domElement;
        if (el && el.parentNode) el.parentNode.removeChild(el);
      }
    };
  }, [url, kind, height, onError]);

  if (failed) return null; // 交给父组件的下载兜底

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height,
          borderRadius: 10,
          overflow: 'hidden',
          background: '#0b0d12',
        }}
      />
      {loading && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#9aa4b2',
            fontSize: 13,
            pointerEvents: 'none',
          }}
        >
          {loadingText || '加载 3D 场景…'}
        </div>
      )}
    </div>
  );
}
