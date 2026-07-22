import {
  BlockOutlined,
  DeleteOutlined,
  EditOutlined,
  PictureOutlined,
  PlusOutlined,
  ThunderboltOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { Button, Input, InputNumber, message, Select } from 'antd';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import ReactFlow, {
  addEdge,
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from 'reactflow';
import type { Connection, NodeProps } from 'reactflow';
import 'reactflow/dist/style.css';
import { systemApi } from '@/services/api';
import { apiURL } from '@/utils/request';
import ApiKeyField from './ApiKeyField';
import { usePlaygroundApiKey } from './apiKeyStore';
import './CanvasStudioPanel.css';

// 自研 React 画布(react-flow),交互与视觉对齐无限画布 canvas.css:
//   - 右键画布任意处(容器层拦截,不漏给浏览器)→ 空白弹「创建菜单」、节点上弹「节点菜单(删除)」
//   - 从节点拖线到空白 → 弹菜单创建下游节点并连线
//   - 节点是圆角卡片,hover 显示删除按钮,选中按 Delete 删,生成中显示脉冲徽章
// 文档存模桥 DB(/v1/canvas/documents),生成直调 /v1/images/generations(已计费),画布本地零落地。

type ModelOpt = { value: string; label: string };
type Ctx = {
  models: ModelOpt[];
  running: Record<string, boolean>;
  updateNodeData: (id: string, patch: Record<string, unknown>) => void;
  runGenerator: (id: string) => void;
  uploadImage: (id: string, file: File) => void;
  deleteNode: (id: string) => void;
};
const CanvasCtx = createContext<Ctx>({} as Ctx);

const SIZE_OPTS = [
  { value: '1024x1024', label: '1:1' },
  { value: '1024x1536', label: '2:3' },
  { value: '1536x1024', label: '3:2' },
];

function NodeHead({ id, icon, title, extra }: { id: string; icon: JSX.Element; title: string; extra?: JSX.Element }) {
  const { deleteNode } = useContext(CanvasCtx);
  return (
    <div className="cs-node-head">
      <span className="cs-node-title">
        {icon}
        {title}
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {extra}
        <button className="cs-node-del nodrag" title="删除节点" onClick={() => deleteNode(id)}>
          <DeleteOutlined />
        </button>
      </span>
    </div>
  );
}

function PromptNode({ id, data }: NodeProps) {
  const { updateNodeData } = useContext(CanvasCtx);
  return (
    <div className="cs-node">
      <NodeHead id={id} icon={<EditOutlined />} title="提示词" />
      <div className="cs-node-body">
        <Input.TextArea
          className="nodrag"
          value={data.text}
          onChange={(e) => updateNodeData(id, { text: e.target.value })}
          placeholder="描述你想生成的画面…"
          autoSize={{ minRows: 2, maxRows: 6 }}
          style={{ width: 210 }}
        />
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

function GeneratorNode({ id, data }: NodeProps) {
  const { models, updateNodeData, runGenerator, running } = useContext(CanvasCtx);
  const busy = !!running[id];
  return (
    <div className="cs-node">
      <Handle type="target" position={Position.Left} />
      <NodeHead
        id={id}
        icon={<ThunderboltOutlined />}
        title="图像生成"
        extra={
          busy ? (
            <span className="cs-badge">
              <span className="dot" />
              生成中
            </span>
          ) : undefined
        }
      />
      <div className="cs-node-body">
        <Select
          className="nodrag"
          size="small"
          style={{ width: 220 }}
          value={data.model}
          onChange={(v) => updateNodeData(id, { model: v })}
          options={models}
          placeholder="选择图像模型"
          showSearch
          optionFilterProp="label"
        />
        <div className="cs-params">
          <Select
            className="nodrag"
            size="small"
            style={{ width: 92 }}
            value={data.size || '1024x1024'}
            onChange={(v) => updateNodeData(id, { size: v })}
            options={SIZE_OPTS}
          />
          <InputNumber
            className="nodrag"
            size="small"
            min={1}
            max={4}
            style={{ width: 120 }}
            value={data.n || 1}
            onChange={(v) => updateNodeData(id, { n: v || 1 })}
            addonBefore="数量"
          />
        </div>
        <Button
          className="cs-run nodrag"
          type="primary"
          block
          loading={busy}
          icon={<ThunderboltOutlined />}
          onClick={() => runGenerator(id)}
        >
          运行生成
        </Button>
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

function OutputNode({ id, data }: NodeProps) {
  const imgs: string[] = data.images || [];
  return (
    <div className="cs-node" style={{ width: 248 }}>
      <Handle type="target" position={Position.Left} />
      <NodeHead id={id} icon={<BlockOutlined />} title="输出" />
      <div className="cs-node-body">
        {imgs.length ? (
          imgs.map((u, i) => (
            <img key={i} className="cs-out-img" src={u} alt="" style={{ marginTop: i ? 8 : 0 }} />
          ))
        ) : (
          <div className="cs-out-empty">运行生成后在此显示</div>
        )}
      </div>
    </div>
  );
}

function ImageNode({ id, data }: NodeProps) {
  const { uploadImage } = useContext(CanvasCtx);
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="cs-node" style={{ width: 248 }}>
      <NodeHead id={id} icon={<PictureOutlined />} title="素材" />
      <div className="cs-node-body">
        {data.url ? (
          <img className="cs-out-img" src={data.url} alt="" />
        ) : (
          <div className="cs-upload nodrag" onClick={() => ref.current?.click()}>
            <UploadOutlined />
            <span>点击上传参考图</span>
          </div>
        )}
        <input
          ref={ref}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) uploadImage(id, f);
          }}
        />
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = { prompt: PromptNode, generator: GeneratorNode, output: OutputNode, image: ImageNode };

const NODE_MENU: { type: string; label: string; icon: JSX.Element }[] = [
  { type: 'image', label: '上传素材', icon: <PictureOutlined /> },
  { type: 'prompt', label: '提示词', icon: <EditOutlined /> },
  { type: 'generator', label: '图像生成', icon: <ThunderboltOutlined /> },
  { type: 'output', label: '输出', icon: <BlockOutlined /> },
];

type DocMeta = { id: number; title: string; icon: string };
type MenuState = { x: number; y: number; kind: 'create' | 'node'; source?: string | null; nodeId?: string };

function CanvasInner() {
  const { apiKey } = usePlaygroundApiKey();
  const rf = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [models, setModels] = useState<ModelOpt[]>([]);
  const [docs, setDocs] = useState<DocMeta[]>([]);
  const [docId, setDocId] = useState<number | null>(null);
  const [running, setRunning] = useState<Record<string, boolean>>({});
  const [saveHint, setSaveHint] = useState('');
  const [menu, setMenu] = useState<MenuState | null>(null);

  const loadingRef = useRef(true);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const connectingRef = useRef<string | null>(null);
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);
  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  const authFetch = useCallback(
    (path: string, init?: RequestInit) =>
      fetch(apiURL(path), {
        ...init,
        headers: { Authorization: `Bearer ${apiKey}`, ...(init?.headers || {}) },
      }),
    [apiKey],
  );

  useEffect(() => {
    systemApi.models().then((res) => {
      const list = ((res.data as any[]) || [])
        .filter((m) => m.type === 'image' && m.enabled !== false)
        .map((m) => ({ value: m.name, label: m.display_name || m.name }));
      setModels(list);
    });
  }, []);

  const loadList = useCallback(async () => {
    const r = await authFetch('/v1/canvas/documents');
    const j = await r.json();
    const list: DocMeta[] = j?.data?.documents || [];
    setDocs(list);
    return list;
  }, [authFetch]);

  const openDoc = useCallback(
    async (id: number) => {
      loadingRef.current = true;
      const r = await authFetch(`/v1/canvas/documents/${id}`);
      const j = await r.json();
      const g = j?.data?.graph || {};
      setNodes(g.nodes || []);
      setEdges(g.edges || []);
      setDocId(id);
      setTimeout(() => {
        loadingRef.current = false;
      }, 150);
    },
    [authFetch, setNodes, setEdges],
  );

  const createDoc = useCallback(async () => {
    const r = await authFetch('/v1/canvas/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '未命名画布', icon: '🎨', graph: { nodes: [], edges: [] } }),
    });
    const j = await r.json();
    const id = j?.data?.id;
    await loadList();
    if (id) await openDoc(id);
  }, [authFetch, loadList, openDoc]);

  useEffect(() => {
    if (!apiKey) return;
    (async () => {
      const list = await loadList();
      if (list.length) await openDoc(list[0].id);
      else await createDoc();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]);

  useEffect(() => {
    if (loadingRef.current || !docId) return undefined;
    const t = setTimeout(async () => {
      setSaveHint('保存中…');
      try {
        await authFetch(`/v1/canvas/documents/${docId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ graph: { nodes: nodesRef.current, edges: edgesRef.current } }),
        });
        setSaveHint('已保存');
      } catch {
        setSaveHint('保存失败');
      }
    }, 800);
    return () => clearTimeout(t);
  }, [nodes, edges, docId, authFetch]);

  const onConnect = useCallback((c: Connection) => setEdges((eds) => addEdge(c, eds)), [setEdges]);
  const updateNodeData = useCallback(
    (id: string, patch: Record<string, unknown>) =>
      setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n))),
    [setNodes],
  );
  const deleteNode = useCallback(
    (id: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== id));
      setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
      setMenu(null);
    },
    [setNodes, setEdges],
  );

  const spawnNode = useCallback(
    (type: string, screenX: number, screenY: number, source: string | null) => {
      const pos = rf.screenToFlowPosition({ x: screenX, y: screenY });
      const id = `${type}_${Date.now().toString(36)}`;
      const data =
        type === 'prompt'
          ? { text: '' }
          : type === 'generator'
          ? { model: models[0]?.value, size: '1024x1024', n: 1 }
          : type === 'image'
          ? { url: '' }
          : { images: [] };
      setNodes((nds) => nds.concat({ id, type, position: pos, data }));
      if (source) setEdges((eds) => addEdge({ source, target: id } as Connection, eds));
    },
    [rf, models, setNodes, setEdges],
  );

  const uploadImage = useCallback(
    async (nodeId: string, file: File) => {
      try {
        const fd = new FormData();
        fd.append('file', file);
        const r = await authFetch(`/v1/canvas/documents/${docId || 0}/assets`, { method: 'POST', body: fd });
        const j = await r.json();
        const url = j?.data?.url;
        if (url) updateNodeData(nodeId, { url });
        else throw new Error('no url');
      } catch {
        message.error('上传失败');
      }
    },
    [authFetch, docId, updateNodeData],
  );

  const runGenerator = useCallback(
    async (genId: string) => {
      const gen = nodesRef.current.find((n) => n.id === genId);
      if (!gen) return;
      const model = gen.data?.model;
      if (!model) {
        message.warning('先给生成节点选一个模型');
        return;
      }
      const upIds = edgesRef.current.filter((e) => e.target === genId).map((e) => e.source);
      const prompt = nodesRef.current
        .filter((n) => upIds.includes(n.id) && n.type === 'prompt')
        .map((n) => n.data?.text)
        .filter(Boolean)
        .join('\n')
        .trim();
      if (!prompt) {
        message.warning('连一个提示词节点并填写内容');
        return;
      }
      setRunning((r) => ({ ...r, [genId]: true }));
      try {
        const r = await authFetch('/v1/images/generations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, prompt, size: gen.data?.size || '1024x1024', n: gen.data?.n || 1 }),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error?.message || j?.message || `HTTP ${r.status}`);
        const urls: string[] = (j?.data || [])
          .map((d: any) => d.url || (d.b64_json ? `data:image/png;base64,${d.b64_json}` : ''))
          .filter(Boolean);
        if (!urls.length) throw new Error('上游未返回图片');
        const outEdge = edgesRef.current.find(
          (e) => e.source === genId && nodesRef.current.find((n) => n.id === e.target)?.type === 'output',
        );
        if (outEdge) {
          updateNodeData(outEdge.target, { images: urls });
        } else {
          const oid = `output_${Date.now().toString(36)}`;
          setNodes((nds) =>
            nds.concat({
              id: oid,
              type: 'output',
              position: { x: gen.position.x + 320, y: gen.position.y },
              data: { images: urls },
            }),
          );
          setEdges((eds) => addEdge({ source: genId, target: oid } as Connection, eds));
        }
      } catch (e: any) {
        message.error('生成失败:' + (e?.message || String(e)));
      } finally {
        setRunning((r) => ({ ...r, [genId]: false }));
      }
    },
    [authFetch, updateNodeData, setNodes, setEdges],
  );

  // 容器层拦截右键(不漏给浏览器):节点上 → 节点菜单;空白 → 创建菜单
  const onCanvasContextMenu = useCallback((e: React.MouseEvent) => {
    const el = e.target as HTMLElement;
    if (el.closest('.react-flow__minimap, .react-flow__controls')) return; // 小地图/控件放行
    e.preventDefault();
    const nodeEl = el.closest('.react-flow__node') as HTMLElement | null;
    if (nodeEl) {
      setMenu({ x: e.clientX, y: e.clientY, kind: 'node', nodeId: nodeEl.getAttribute('data-id') || '' });
    } else {
      setMenu({ x: e.clientX, y: e.clientY, kind: 'create', source: null });
    }
  }, []);

  const onConnectStart = useCallback((_: unknown, p: { nodeId: string | null }) => {
    connectingRef.current = p.nodeId;
  }, []);
  const onConnectEnd = useCallback((e: MouseEvent | TouchEvent) => {
    const target = e.target as HTMLElement;
    if (target?.classList?.contains('react-flow__pane')) {
      const cx = (e as MouseEvent).clientX ?? (e as TouchEvent).changedTouches?.[0]?.clientX;
      const cy = (e as MouseEvent).clientY ?? (e as TouchEvent).changedTouches?.[0]?.clientY;
      setMenu({ x: cx, y: cy, kind: 'create', source: connectingRef.current });
    }
    connectingRef.current = null;
  }, []);

  const pickCreate = useCallback(
    (type: string) => {
      if (!menu) return;
      spawnNode(type, menu.x, menu.y, menu.source || null);
      setMenu(null);
    },
    [menu, spawnNode],
  );

  useEffect(() => {
    if (!menu) return undefined;
    const h = () => setMenu(null);
    window.addEventListener('mousedown', h);
    return () => window.removeEventListener('mousedown', h);
  }, [menu]);

  if (!apiKey) {
    return (
      <div style={{ maxWidth: 420, margin: '48px auto' }}>
        <p style={{ color: '#666', marginBottom: 12 }}>填入 API Key 使用画布</p>
        <ApiKeyField />
      </div>
    );
  }

  return (
    <CanvasCtx.Provider value={{ models, running, updateNodeData, runGenerator, uploadImage, deleteNode }}>
      <div className="cs-root">
        <div className="cs-topbar">
          <Select
            size="small"
            style={{ width: 220 }}
            value={docId || undefined}
            onChange={openDoc}
            placeholder="选择画布"
            options={docs.map((d) => ({ value: d.id, label: `${d.icon || '🎨'} ${d.title || '未命名'}` }))}
          />
          <Button size="small" icon={<PlusOutlined />} onClick={createDoc}>
            新画布
          </Button>
          <span className="cs-hint">右键画布空白添加节点 · 拖线到空白创建下游 · 右键节点或选中按 Delete 删除</span>
          <span className="cs-save">{saveHint}</span>
        </div>
        <div className="cs-canvas" onContextMenu={onCanvasContextMenu}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onConnectStart={onConnectStart}
            onConnectEnd={onConnectEnd}
            onPaneClick={() => setMenu(null)}
            nodeTypes={nodeTypes}
            deleteKeyCode={['Delete', 'Backspace']}
            fitView
            minZoom={0.2}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="#dbe2ea" />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable />
          </ReactFlow>
          {menu && (
            <div
              className="cs-menu"
              style={{ left: menu.x, top: menu.y }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {menu.kind === 'create' ? (
                <>
                  <div className="cs-menu-title">{menu.source ? '创建并连接' : '添加节点'}</div>
                  {NODE_MENU.map((m) => (
                    <button key={m.type} className="cs-menu-item" onClick={() => pickCreate(m.type)}>
                      {m.icon}
                      <span>{m.label}</span>
                    </button>
                  ))}
                </>
              ) : (
                <>
                  <div className="cs-menu-title">节点</div>
                  <button
                    className="cs-menu-item danger"
                    onClick={() => menu.nodeId && deleteNode(menu.nodeId)}
                  >
                    <DeleteOutlined />
                    <span>删除节点</span>
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </CanvasCtx.Provider>
  );
}

export default function CanvasStudioPanel() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}
