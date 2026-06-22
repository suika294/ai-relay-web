import { history, useIntl, useModel } from '@umijs/max';
import { useSiteInfo } from '@/hooks/useSiteInfo';
import { Button, Carousel, Col, Grid, Row, Typography } from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useAuthModal } from '@/components/AuthModalProvider';
import PublicLayout from '@/layouts/PublicLayout';
import { bannerApi, showcaseApi, systemApi } from '@/services/api';
import { publicMediaURL } from '@/utils/media';
import HeroCarousel from './HeroCarousel';
import {
  ProviderLogo,
  featuredPrice,
  fmtCtx,
  providerLabel,
  typeLabel,
  useQuickKey,
} from '../model-market/_shared';

// 文案均存 i18n key,渲染时用 intl.formatMessage 解析,以便随语言切换重渲。
const generationShowcases = [
  {
    key: 'video',
    tab: 'home.index.tabVideo',
    title: 'home.index.videoTitle',
    description: 'home.index.videoDesc',
    docsHref: '/docs/videos',
    playgroundHref: '/console/playground?tab=video',
    modelHref: '/models?type=video',
    stats: [
      'home.index.videoStat1',
      'home.index.videoStat2',
      'home.index.videoStat3',
    ],
    actions: [
      { key: 'basic', label: 'home.index.videoActionBasic' },
      { key: 'keyframe', label: 'home.index.videoActionKeyframe' },
      { key: 'multiref', label: 'home.index.videoActionMultiref' },
      { key: 'refvideo', label: 'home.index.videoActionRefvideo' },
    ],
    visualTitle: 'home.index.videoVisualTitle',
    visualSubtitle: 'submit → queued → running → succeeded',
    preview: ['Prompt', 'Frames', 'Task ID', 'Video URL'],
  },
  {
    key: 'image',
    tab: 'home.index.tabImage',
    title: 'home.index.imageTitle',
    description: 'home.index.imageDesc',
    docsHref: '/docs/images',
    playgroundHref: '/console/playground?tab=image',
    modelHref: '/models?type=image',
    stats: [
      'home.index.imageStat1',
      'home.index.imageStat2',
      'home.index.imageStat3',
    ],
    actions: [
      { key: 't2i', label: 'home.index.imageActionT2i' },
      { key: 'i2i', label: 'home.index.imageActionI2i' },
      { key: 'ratio', label: 'home.index.imageActionRatio' },
    ],
    visualTitle: 'home.index.imageVisualTitle',
    visualSubtitle: 'home.index.imageVisualSubtitle',
    preview: ['Model', 'Prompt', 'Size', 'Images'],
  },
  {
    key: 'media',
    tab: 'home.index.tabMedia',
    title: 'home.index.mediaTitle',
    description: 'home.index.mediaDesc',
    docsHref: '/docs/audio',
    playgroundHref: '/console/playground?tab=audio',
    modelHref: '/models?type=audio',
    stats: [
      'ASR / TTS',
      'home.index.mediaStat2',
      'home.index.mediaStat3',
    ],
    actions: [
      { key: 'audio', label: 'home.index.mediaActionAudio' },
      { key: 'threed', label: 'home.index.mediaActionThreed' },
      { key: 'voiceclone', label: 'home.index.mediaActionVoiceclone' },
      { key: 'avatar', label: 'home.index.mediaActionAvatar' },
    ],
    visualTitle: 'home.index.mediaVisualTitle',
    visualSubtitle: 'home.index.mediaVisualSubtitle',
    preview: ['Audio', 'Clone', '3D', 'Avatar'],
  },
] as const;

// 声波样式音频播放器 —— 替代原生 <audio controls>,在成品/参考里更好看:
// 播放按钮 + 一排声波条(播放时跳动) + 时长。深色玻璃药丸,深浅底上都协调。
const WAVE_BAR_HEIGHTS = [9, 15, 22, 13, 26, 17, 11, 24, 19, 14, 21, 10];
function WaveAudio({ src, label }: { src?: string; label?: string }) {
  const intl = useIntl();
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [dur, setDur] = useState(0);
  const toggle = () => {
    const el = ref.current;
    if (!el) return;
    if (el.paused) el.play().catch(() => {});
    else el.pause();
  };
  return (
    <div className={'wave-audio' + (playing ? ' is-playing' : '')}>
      <button
        type="button"
        className="wave-audio-btn"
        onClick={toggle}
        aria-label={
          playing
            ? intl.formatMessage({ id: 'home.index.pause' })
            : intl.formatMessage({ id: 'home.index.play' })
        }
      >
        {playing ? '❚❚' : '▶'}
      </button>
      <div className="wave-audio-bars" aria-hidden="true">
        {WAVE_BAR_HEIGHTS.concat(WAVE_BAR_HEIGHTS).map((h, i) => (
          <i
            key={i}
            style={{ height: `${h}px`, animationDelay: `${(i % 7) * 0.09}s` }}
          />
        ))}
      </div>
      <span className="wave-audio-label">
        {dur ? `${Math.round(dur)}"` : ''}
        {label
          ? ` ${label}`
          : !dur
          ? intl.formatMessage({ id: 'home.index.audio' })
          : ''}
      </span>
      <audio
        ref={ref}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onLoadedMetadata={(e) => setDur(e.currentTarget.duration || 0)}
      />
    </div>
  );
}

// 数智人视频卡:静音循环自动播放,右上角声音开关(各卡独立,点了才出声)。
function MediaVideoCard({
  src,
  poster,
  children,
}: {
  src?: string;
  poster?: string;
  children?: ReactNode;
}) {
  const intl = useIntl();
  const ref = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const toggle = () => {
    const el = ref.current;
    if (!el) return;
    const next = !muted;
    setMuted(next);
    el.muted = next;
    if (!next) el.play().catch(() => {});
  };
  return (
    <div className="generation-demo-card-media">
      <video
        ref={ref}
        src={src}
        poster={poster}
        muted={muted}
        loop
        playsInline
        autoPlay
        preload="metadata"
      />
      <button
        type="button"
        className="generation-demo-sound-btn"
        onClick={toggle}
        aria-label={
          muted
            ? intl.formatMessage({ id: 'home.index.unmute' })
            : intl.formatMessage({ id: 'home.index.mute' })
        }
        title={
          muted
            ? intl.formatMessage({ id: 'home.index.unmute' })
            : intl.formatMessage({ id: 'home.index.mute' })
        }
      >
        {muted ? '🔇' : '🔊'}
      </button>
      {children}
    </div>
  );
}

export default function Home() {
  // useAuthModal 依赖 AuthModalProvider,而 Provider 由 PublicLayout 在 children 外层提供。
  // 所以调用 useAuthModal 的逻辑必须放在 PublicLayout 的子组件里(跟 landing 一致),
  // 不能直接写在渲染 <PublicLayout> 的 Home 函数体内 —— 否则 Home 在 Provider 之上,
  // useAuthModal 拿不到 context 会抛 "must be used within AuthModalProvider"。
  return (
    <PublicLayout hideFooter>
      <HomeContent />
    </PublicLayout>
  );
}

function HomeContent() {
  const intl = useIntl();
  const { initialState } = useModel('@@initialState');
  const user = initialState?.currentUser;
  const site = useSiteInfo();
  const { openAuthModal } = useAuthModal();
  const { handleGenerate, modals } = useQuickKey();

  const [list, setList] = useState<API.PublicModel[]>([]);
  const [banners, setBanners] = useState<API.Banner[]>([]);
  const [showcases, setShowcases] = useState<API.Showcase[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeShowcaseKey, setActiveShowcaseKey] =
    useState<(typeof generationShowcases)[number]['key']>('video');
  // 视频面板当前选中项(多条素材时由缩略图切换)
  const [activeVideoId, setActiveVideoId] = useState<number | null>(null);
  // 当前选中的功能(对应左侧功能小按钮);null = 未筛选,展示该 tab 全部
  const [activeFeature, setActiveFeature] = useState<string | null>(null);
  const screens = Grid.useBreakpoint();
  // 右侧成果展示面板 —— 功能小按钮点击后平滑滚动/聚焦到这里
  const demoRef = useRef<HTMLDivElement>(null);
  const scrollToDemo = () =>
    demoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });

  // 产品功能区:桌面端「卡在一屏 + 滚轮切 tab」(对标苹果产品页,但不撑高页面)。
  // 板块本身就一屏高;占据视口中心时接管滚轮。关键:面板内容(如图像瀑布)比一屏高时,
  // 先在板块内把内容滚到尽头(演示完),再往同方向滚才切下一个 tab;切到首/末项后再滚就放行。
  const showcaseRef = useRef<HTMLElement>(null);
  const lastShowcaseKeyRef =
    useRef<(typeof generationShowcases)[number]['key']>('video');
  // 切换面板后,把新面板内容滚到该方向的起点(向下进入→顶部,向上进入→底部)
  const pendingPanelScrollRef = useRef<'top' | 'bottom' | null>(null);
  // 切换方向:1=前进(新卡片从下往上覆盖),-1=后退(从上往下覆盖),驱动覆盖动画
  const slideDirRef = useRef(1);
  useEffect(() => {
    const sc = showcaseRef.current?.querySelector<HTMLElement>(
      '.generation-showcase-sticky',
    );
    if (!sc || !pendingPanelScrollRef.current) return;
    sc.scrollTop = pendingPanelScrollRef.current === 'bottom' ? sc.scrollHeight : 0;
    pendingPanelScrollRef.current = null;
  }, [activeShowcaseKey]);

  useEffect(() => {
    const el = showcaseRef.current;
    if (!el) return;
    const mq = window.matchMedia('(min-width: 901px)');
    const n = generationShowcases.length;
    let engaged = false; // 板块当前是否已“接管”(占据视口中心)
    let cooldown = false; // 一次手势只切一格,期间吞掉多余滚轮
    const arm = () => {
      cooldown = true;
      window.setTimeout(() => {
        cooldown = false;
      }, 600);
    };
    // from: 切到新面板后内容停靠的位置;同面板时直接就地归位
    const setIdx = (idx: number, from: 'top' | 'bottom') => {
      const key = generationShowcases[idx].key;
      if (key === lastShowcaseKeyRef.current) {
        const sc = el.querySelector<HTMLElement>('.generation-showcase-sticky');
        if (sc) sc.scrollTop = from === 'bottom' ? sc.scrollHeight : 0;
        return;
      }
      pendingPanelScrollRef.current = from;
      slideDirRef.current = from === 'top' ? 1 : -1;
      lastShowcaseKeyRef.current = key;
      setActiveShowcaseKey(key);
      setActiveFeature(null);
      setActiveVideoId(null);
    };
    const onWheel = (e: WheelEvent) => {
      if (!mq.matches) return;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      // 板块中心进入视口才算“主导”——此时才接管滚轮
      const dominant = rect.top < vh * 0.5 && rect.bottom > vh * 0.5;
      if (!dominant) {
        engaged = false;
        return;
      }
      const dir = e.deltaY > 0 ? 1 : e.deltaY < 0 ? -1 : 0;
      if (!dir) return;
      const sc = el.querySelector<HTMLElement>('.generation-showcase-sticky');

      // 刚进入板块:吸附对齐到一屏,并按进入方向把焦点放到首/末项
      if (!engaged) {
        engaged = true;
        e.preventDefault();
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setIdx(dir > 0 ? 0 : n - 1, dir > 0 ? 'top' : 'bottom');
        arm();
        return;
      }

      // 先让当前面板内容在该方向上滚动(瀑布流等);没到尽头就交给原生滚动,不切 tab
      if (sc) {
        const canDown = sc.scrollTop + sc.clientHeight < sc.scrollHeight - 2;
        const canUp = sc.scrollTop > 2;
        if (dir > 0 && canDown) return;
        if (dir < 0 && canUp) return;
      }

      const curIdx = generationShowcases.findIndex(
        (s) => s.key === lastShowcaseKeyRef.current,
      );
      const nextIdx = curIdx + dir;
      // 已到该方向的边界:放行页面滚动,正常滚出板块
      if (nextIdx < 0 || nextIdx >= n) return;

      // 内容已演示完,切下一个 tab
      e.preventDefault();
      if (cooldown) return;
      arm();
      setIdx(nextIdx, dir > 0 ? 'top' : 'bottom');
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => {
    setLoading(true);
    systemApi.models().then((res) => {
      setList((res.data as API.PublicModel[]) || []);
      setLoading(false);
    });
    // banners 失败不阻塞首页 —— 拉到则展示,拉不到则右侧塌掉走单列布局
    bannerApi
      .list()
      .then((res) => {
        if (res.code === 0) setBanners((res.data as API.Banner[]) || []);
      })
      .catch(() => {});
    // showcases 失败不阻塞 —— 拉不到则各 tab 回退到抽象占位图(优雅降级)
    showcaseApi
      .list()
      .then((res) => {
        if (res.code === 0) setShowcases((res.data as API.Showcase[]) || []);
      })
      .catch(() => {});
  }, []);

  // 当前 tab 下的素材:按 category 归属(后端已按 sort_order DESC, id DESC 排好)。
  const tabItems = useMemo(
    () =>
      showcases.filter(
        (s) => s.category === activeShowcaseKey && publicMediaURL(s.media_url),
      ),
    [showcases, activeShowcaseKey],
  );
  // 选了功能则只展示绑定该功能的素材;该功能还没素材时回退展示该 tab 全部。
  // 再按 media_type 决定怎么渲染(视频播放器 / 图片画廊 / 音频播放器)。
  const activeItems = useMemo(() => {
    if (!activeFeature) return tabItems;
    const matched = tabItems.filter((s) => s.feature === activeFeature);
    return matched.length ? matched : tabItems;
  }, [tabItems, activeFeature]);
  const activeVideos = useMemo(
    () => activeItems.filter((s) => s.media_type === 'video'),
    [activeItems],
  );
  const activeImages = useMemo(
    () => activeItems.filter((s) => s.media_type === 'image'),
    [activeItems],
  );
  const activeAudios = useMemo(
    () => activeItems.filter((s) => s.media_type === 'audio'),
    [activeItems],
  );

  // 当前要播放的视频:优先选中项,否则第一条
  const activeVideo = useMemo(
    () => activeVideos.find((s) => s.id === activeVideoId) ?? activeVideos[0] ?? null,
    [activeVideos, activeVideoId],
  );

  // 竖版视频(如数智人 9:16)在 16:9 容器里用 cover 会被裁掉头尾,
  // 元数据加载后检测宽高比,竖版改用 contain 完整显示(两侧留深色边)
  const [isPortraitVideo, setIsPortraitVideo] = useState(false);
  useEffect(() => {
    setIsPortraitVideo(false);
  }, [activeVideo?.id]);

  // 视频默认不自动播放,只有滚动进入视口才播放、滚出则暂停(IntersectionObserver)。
  // 声音默认静音(无声自动播放才被浏览器允许),用户可点按钮切换。
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoMuted, setVideoMuted] = useState(true);
  // 切换视频时回到静音,避免上一条开了声音、下一条直接外放
  useEffect(() => {
    setVideoMuted(true);
  }, [activeVideo?.id]);
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.play().catch(() => {});
        } else {
          el.pause();
        }
      },
      // 露出约一半再播,滚出即停
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [activeVideo?.id]);
  const toggleVideoSound = () => {
    const el = videoRef.current;
    if (!el) return;
    const next = !videoMuted;
    setVideoMuted(next);
    // React 对 video.muted 的 prop 同步不可靠,这里命令式兜底
    el.muted = next;
    // 取消静音通常发生在用户手势内,顺手确保在播放
    if (!next) el.play().catch(() => {});
  };

  // 推荐模型:优先取带 `recommended` 标签的;若没有则降级取带 `new` 标签;
  // 都没有时直接取列表前几个(后端通常按 sort 字段排过序了)。
  // 超过 perSlide 张就切到 Carousel,上限 12(对应桌面 3 屏 / 移动 12 屏)。
  const RECOMMENDED_MAX = 12;
  // md+(≥768)保持 4 张/屏 跟 Col 网格对齐;sm(576-768)2 张/屏;xs(<576)1 张/屏
  const RECOMMENDED_PER_SLIDE = screens.md ? 4 : screens.sm ? 2 : 1;
  const recommended = useMemo(() => {
    const tagged = list.filter((m) => m.tags?.includes('recommended'));
    if (tagged.length >= RECOMMENDED_MAX)
      return tagged.slice(0, RECOMMENDED_MAX);
    const news = list.filter((m) => m.tags?.includes('new'));
    const merged = [...tagged];
    for (const m of news) {
      if (merged.length >= RECOMMENDED_MAX) break;
      if (!merged.find((x) => x.id === m.id)) merged.push(m);
    }
    // 兜底:推荐/新模型都不够 4 个时,再从全表补足到 4
    if (merged.length < 4) {
      for (const m of list) {
        if (merged.length >= 4) break;
        if (!merged.find((x) => x.id === m.id)) merged.push(m);
      }
    }
    return merged.slice(0, RECOMMENDED_MAX);
  }, [list]);

  // 把 recommended 按每屏 perSlide 个切片,供 Carousel 使用 —— perSlide 跟着断点变化,要进 deps
  const recommendedSlides = useMemo(() => {
    const slides: API.PublicModel[][] = [];
    for (let i = 0; i < recommended.length; i += RECOMMENDED_PER_SLIDE) {
      slides.push(recommended.slice(i, i + RECOMMENDED_PER_SLIDE));
    }
    return slides;
  }, [recommended, RECOMMENDED_PER_SLIDE]);

  const activeShowcase = useMemo(
    () =>
      generationShowcases.find((item) => item.key === activeShowcaseKey) ??
      generationShowcases[0],
    [activeShowcaseKey],
  );

  const renderFeaturedCard = (m: API.PublicModel) => {
    const t = typeLabel[m.type];
    const price = featuredPrice(m);
    return (
      <Col key={m.id} xs={24} sm={12} md={12} lg={6}>
        <div className="featured-card" onClick={() => handleGenerate(m)}>
          <div className="featured-card-top">
            <div className="featured-card-main">
              <div className="featured-logo-wrap">
                <ProviderLogo provider={m.provider_type} size={26} />
              </div>
              <div className="featured-card-titles">
                <div className="featured-card-name">
                  {m.display_name || m.name}
                </div>
                <div className="featured-card-provider">
                  {providerLabel[m.provider_type] ?? m.provider_type}
                </div>
              </div>
            </div>
          </div>
          <div className="featured-card-meta">
            <span>
              {t?.icon} {t?.text ?? m.type}
            </span>
            <span>
              {fmtCtx(m.max_tokens)}{' '}
              {intl.formatMessage({ id: 'home.index.context' })}
            </span>
          </div>
          <div className="featured-card-foot">
            <span className="featured-price">
              {price.text}
              <em>{price.unit}</em>
            </span>
            <Button type="primary" size="small">
              {intl.formatMessage({ id: 'home.index.generateKey' })}
            </Button>
          </div>
        </div>
      </Col>
    );
  };

  // Prompt 做成「输入框」样子(对标 Vidu):闪光图标 + 提示词 + 「创作」按钮(点了跳 Playground),
  // 让人一眼看出这是生成用的提示词。
  const renderPromptBox = (prompt: string) => (
    <div className="generation-demo-promptbox">
      <span className="generation-demo-promptbox-icon" aria-hidden="true">
        ✦
      </span>
      <span className="generation-demo-promptbox-text" title={prompt}>
        {prompt}
      </span>
      <button
        type="button"
        className="generation-demo-promptbox-go"
        onClick={(e) => {
          e.stopPropagation();
          history.push(activeShowcase.playgroundHref);
        }}
      >
        {intl.formatMessage({ id: 'home.index.create' })}
      </button>
    </div>
  );

  // 成品底部「参考图(+ 连接) + Prompt 文案」信息条 —— 默认隐藏,鼠标悬停成品时淡入(CSS 控制)。
  // includePrompt:视频走影院模式(原 prompt 已隐藏)由这里带 Prompt;图片有 figcaption 带文案,故只放参考图。
  const renderRefBar = (item: API.Showcase, includePrompt: boolean) => {
    const refs = item.ref_images ?? [];
    const showPrompt = includePrompt && !!item.subtitle;
    if (refs.length === 0 && !showPrompt) return null;
    return (
      <div className="generation-demo-refbar">
        {refs.length > 0 && (
          <div className="generation-demo-refbar-items">
            {refs.map((r, i) => (
              <span className="generation-demo-refbar-item" key={`${r.url}-${i}`}>
                {r.kind === 'audio' ? (
                  <WaveAudio src={publicMediaURL(r.url)} />
                ) : (
                  <img src={publicMediaURL(r.url)} alt="" loading="lazy" />
                )}
              </span>
            ))}
          </div>
        )}
        {showPrompt && renderPromptBox(item.subtitle)}
      </div>
    );
  };

  // 数智人/音频/3D tab:每个实例一张卡(视频卡 / 音频卡 / 图片卡),按 media_type 渲染。
  // 悬停卡片时底部浮出该实例的参考图 + Prompt(renderRefBar)。
  const renderMediaCard = (s: API.Showcase) => (
    <figure className="generation-demo-card" key={s.id}>
      {s.media_type === 'video' ? (
        <MediaVideoCard
          src={publicMediaURL(s.media_url)}
          poster={publicMediaURL(s.poster_url)}
        >
          {renderRefBar(s, true)}
        </MediaVideoCard>
      ) : (
        <div className="generation-demo-card-media">
          {s.media_type === 'audio' ? (
            <div className="generation-demo-card-audio">
              <WaveAudio src={publicMediaURL(s.media_url)} />
            </div>
          ) : (
            <img src={publicMediaURL(s.media_url)} alt={s.title || ''} loading="lazy" />
          )}
          {renderRefBar(s, true)}
        </div>
      )}
      {(s.title || s.model_name) && (
        <figcaption className="generation-demo-card-cap">
          {s.title && <strong>{s.title}</strong>}
          {s.model_name && <em>{s.model_name}</em>}
        </figcaption>
      )}
    </figure>
  );

  return (
    <>
      {/* Hero —— 有 banner 时整块铺满背景轮播;无 banner 时退回纯文案居中。 */}
      <section
        className={
          'hero home-hero' +
          (banners.length > 0 ? ' home-hero--with-banner' : '')
        }
      >
        {banners.length > 0 && <HeroCarousel banners={banners} />}
        <div
          className={
            'hero-inner' +
            (banners.length === 0 ? ' hero-inner--solo' : ' hero-inner--banner')
          }
        >
          <div className="hero-left">
            <h1 className="hero-title">
              {intl.formatMessage({ id: 'home.index.heroTitleLine1' })}
              <br />
              <span className="hero-highlight">
                {intl.formatMessage({ id: 'home.index.heroTitleLine2' })}
              </span>
            </h1>
            <p className="hero-sub">
              {intl.formatMessage(
                { id: 'home.index.heroSub' },
                { name: site.name },
              )}
            </p>
            <div className="hero-cta">
              <Button
                type="primary"
                size="large"
                onClick={() => history.push('/models')}
              >
                {intl.formatMessage({ id: 'home.index.browseModels' })}
              </Button>
              {!user && (
                <>
                  {site.register_enabled && (
                    <Button
                      size="large"
                      onClick={() =>
                        openAuthModal({
                          defaultTab: 'register',
                          onSuccess: () => history.push('/console/dashboard'),
                        })
                      }
                    >
                      {intl.formatMessage({ id: 'home.index.register' })}
                    </Button>
                  )}
                  <Button
                    size="large"
                    onClick={() =>
                      openAuthModal({
                        defaultTab: 'login',
                        onSuccess: () => history.push('/console/dashboard'),
                      })
                    }
                  >
                    {site.register_enabled
                      ? intl.formatMessage({ id: 'home.index.loginWithAccount' })
                      : intl.formatMessage({ id: 'home.index.login' })}
                  </Button>
                </>
              )}
            </div>
            <div className="hero-badges">
              <div>
                <span className="b-num">20+</span>
                {intl.formatMessage({ id: 'home.index.badgeModels' })}
              </div>
              <div>
                <span className="b-num">7+</span>
                {intl.formatMessage({ id: 'home.index.badgeProviders' })}
              </div>
              <div>
                <span className="b-num">5+</span>
                {intl.formatMessage({ id: 'home.index.badgeCurrencies' })}
              </div>
              <div>
                <span className="b-num">99.9%</span>
                {intl.formatMessage({ id: 'home.index.badgeUptime' })}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 推荐模型 —— banner 下方。推荐/新标签优先,最多 12 张。超过 4 张自动切 Carousel,每屏 4 张 */}
      {!loading && recommended.length > 0 && (
        <section className="featured-section">
          <div className="featured-head">
            <Typography.Title level={3} style={{ margin: 0 }}>
              {intl.formatMessage({ id: 'home.index.recommendedTitle' })}
            </Typography.Title>
            <span className="featured-sub">
              {intl.formatMessage({ id: 'home.index.recommendedSub' })}
            </span>
          </div>
          {recommendedSlides.length > 1 ? (
            <Carousel
              className="featured-carousel"
              autoplay
              autoplaySpeed={5000}
              dots
              arrows
              pauseOnHover
              infinite={false}
            >
              {recommendedSlides.map((slide, idx) => (
                <div key={idx}>
                  <Row gutter={[16, 16]}>
                    {slide.map((m) => renderFeaturedCard(m))}
                  </Row>
                </div>
              ))}
            </Carousel>
          ) : (
            <Row gutter={[16, 16]}>
              {recommended.map((m) => renderFeaturedCard(m))}
            </Row>
          )}
        </section>
      )}

      <section className="generation-showcase-section" ref={showcaseRef}>
        <div className="generation-showcase-sticky">
        <div className="generation-showcase-inner">
          <div className="generation-showcase-head">
            <Typography.Title level={2} style={{ margin: 0 }}>
              {intl.formatMessage({ id: 'home.index.featuresTitle' })}
            </Typography.Title>
            <div className="generation-showcase-tabs" role="tablist">
              {generationShowcases.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={
                    'generation-showcase-tab' +
                    (activeShowcase.key === item.key ? ' is-active' : '')
                  }
                  onClick={() => {
                    setActiveShowcaseKey(item.key);
                    setActiveFeature(null);
                    setActiveVideoId(null);
                  }}
                >
                  {intl.formatMessage({ id: item.tab })}
                </button>
              ))}
            </div>
          </div>

          <div
            key={activeShowcase.key}
            className={
              `generation-showcase-body generation-showcase-body--${activeShowcase.key}` +
              // 仅视频走全屏影院式布局;数智人(media)改用卡片网格(见 --media 样式)
              (activeShowcase.key === 'video' ? ' is-cinematic' : '') +
              (slideDirRef.current < 0 ? ' is-back' : '')
            }
          >
            <div className="generation-showcase-copy">
              <h3>{intl.formatMessage({ id: activeShowcase.title })}</h3>
              <p>{intl.formatMessage({ id: activeShowcase.description })}</p>
              <div
                className="generation-showcase-stats"
                aria-label={intl.formatMessage({ id: 'home.index.statsLabel' })}
              >
                {activeShowcase.stats.map((item) => (
                  <span key={item}>
                    {item.startsWith('home.index.')
                      ? intl.formatMessage({ id: item })
                      : item}
                  </span>
                ))}
              </div>
              <div className="generation-showcase-actions">
                {activeShowcase.actions.map((action) => (
                  <button
                    key={action.key}
                    type="button"
                    className={activeFeature === action.key ? 'is-active' : ''}
                    onClick={() => {
                      setActiveFeature(action.key);
                      setActiveVideoId(null);
                      scrollToDemo();
                    }}
                  >
                    {intl.formatMessage({ id: action.label })}
                  </button>
                ))}
              </div>
              <div className="generation-showcase-cta-row">
                <Button
                  type="primary"
                  onClick={() => history.push(activeShowcase.playgroundHref)}
                >
                  {intl.formatMessage({ id: 'home.index.gotoPlayground' })}
                </Button>
                <Button onClick={() => history.push(activeShowcase.docsHref)}>
                  {intl.formatMessage({ id: 'home.index.viewDocs' })}
                </Button>
                <Button type="link" onClick={() => history.push(activeShowcase.modelHref)}>
                  {intl.formatMessage({ id: 'home.index.filterModels' })}
                </Button>
              </div>
            </div>

            <div
              className="generation-demo"
              ref={demoRef}
              aria-label={intl.formatMessage({ id: activeShowcase.title })}
            >
              <div className="generation-demo-panel">
                {activeItems.length > 0 && activeShowcase.key === 'media' ? (
                  // 数智人/音频/3D:混合且可能多实例 —— 每个实例一张卡,网格排列(1 个或 N 个都自然)
                  <div className="generation-demo-grid">
                    {activeItems.map((s) => renderMediaCard(s))}
                  </div>
                ) : activeItems.length > 0 ? (
                  // 真实素材:按渲染方式拼装 —— 视频播放器 + 图片画廊 + 音频播放器
                  <div
                    className={`generation-demo-stage generation-demo-stage--${activeShowcase.key}`}
                  >
                    {activeVideo && (
                      <div
                        className={
                          'generation-demo-video-wrap' +
                          (isPortraitVideo ? ' is-portrait' : '')
                        }
                      >
                        <video
                          key={activeVideo.id}
                          ref={videoRef}
                          className="generation-demo-video"
                          src={publicMediaURL(activeVideo.media_url)}
                          poster={publicMediaURL(activeVideo.poster_url)}
                          muted={videoMuted}
                          loop
                          playsInline
                          preload="metadata"
                          onLoadedMetadata={(e) =>
                            setIsPortraitVideo(
                              e.currentTarget.videoHeight >
                                e.currentTarget.videoWidth,
                            )
                          }
                        />
                        <button
                          type="button"
                          className="generation-demo-sound-btn"
                          onClick={toggleVideoSound}
                          aria-label={
                            videoMuted
                              ? intl.formatMessage({ id: 'home.index.unmute' })
                              : intl.formatMessage({ id: 'home.index.mute' })
                          }
                          title={
                            videoMuted
                              ? intl.formatMessage({ id: 'home.index.unmute' })
                              : intl.formatMessage({ id: 'home.index.mute' })
                          }
                        >
                          {videoMuted ? '🔇' : '🔊'}
                        </button>
                        {activeVideo.model_name && (
                          <span className="generation-demo-model-badge">
                            {activeVideo.model_name}
                          </span>
                        )}
                        {(activeVideo.title || activeVideo.subtitle) && (
                          <div className="generation-demo-prompt">
                            {activeVideo.title && <strong>{activeVideo.title}</strong>}
                            {activeVideo.subtitle && <span>{activeVideo.subtitle}</span>}
                          </div>
                        )}
                        {renderRefBar(activeVideo, true)}
                      </div>
                    )}
                    {activeVideos.length > 1 && activeVideo && (
                      <div className="generation-demo-thumbs">
                        {activeVideos.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            className={
                              'generation-demo-thumb' +
                              (s.id === activeVideo.id ? ' is-active' : '')
                            }
                            onClick={() => setActiveVideoId(s.id)}
                            aria-label={
                              s.title ||
                              s.subtitle ||
                              intl.formatMessage({ id: 'home.index.videoAsset' })
                            }
                          >
                            {s.poster_url ? (
                              <img src={publicMediaURL(s.poster_url)} alt="" />
                            ) : (
                              <video
                                src={publicMediaURL(s.media_url)}
                                muted
                                preload="metadata"
                              />
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                    {activeImages.length > 0 && (
                      <div className="generation-demo-gallery">
                        {activeImages.map((s) => (
                          <figure key={s.id} className="generation-demo-tile">
                            <img
                              src={publicMediaURL(s.media_url)}
                              alt={s.title || s.subtitle || ''}
                              loading="lazy"
                            />
                            {(s.title || s.model_name) && (
                              <figcaption>
                                {s.title && <strong>{s.title}</strong>}
                                {s.model_name && <em>{s.model_name}</em>}
                              </figcaption>
                            )}
                            {s.subtitle && (
                              <div className="generation-demo-tile-prompt">
                                {renderPromptBox(s.subtitle)}
                              </div>
                            )}
                          </figure>
                        ))}
                      </div>
                    )}
                    {activeAudios.length > 0 && (
                      <div className="generation-demo-audio-list">
                        {activeAudios.map((s) => (
                          <div key={s.id} className="generation-demo-audio-item">
                            <div className="generation-demo-audio-meta">
                              {s.title && <strong>{s.title}</strong>}
                              {s.model_name && <em>{s.model_name}</em>}
                              {s.subtitle && <span>{s.subtitle}</span>}
                            </div>
                            <WaveAudio src={publicMediaURL(s.media_url)} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  // 兜底:无素材(或音频/3D tab)时保留原抽象占位图
                  <>
                    <div className="generation-demo-window">
                      <div className="generation-demo-window-head">
                        <span />
                        <span />
                        <span />
                        <strong>{activeShowcase.title}</strong>
                      </div>
                      <div className="generation-demo-body">
                        <div className="generation-demo-preview">
                          <div className="generation-demo-orbit" />
                          <div className="generation-demo-surface" />
                          <div className="generation-demo-glow" />
                        </div>
                        <div className="generation-demo-fields">
                          {activeShowcase.preview.map((item, idx) => (
                            <div key={item} className="generation-demo-field">
                              <span>{item}</span>
                              <i style={{ width: `${88 - idx * 12}%` }} />
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="generation-demo-foot">
                      <div>
                        <strong>
                          {intl.formatMessage({ id: activeShowcase.visualTitle })}
                        </strong>
                        <span>
                          {activeShowcase.visualSubtitle.startsWith('home.index.')
                            ? intl.formatMessage({
                                id: activeShowcase.visualSubtitle,
                              })
                            : activeShowcase.visualSubtitle}
                        </span>
                      </div>
                      <Button size="small" onClick={() => history.push(activeShowcase.docsHref)}>
                        {intl.formatMessage({ id: 'home.index.docs' })}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
        </div>
      </section>

      {/* 选模型直出 Key 的弹窗(推荐模型卡片的"生成 Key"会用到) */}
      {modals}
    </>
  );
}
