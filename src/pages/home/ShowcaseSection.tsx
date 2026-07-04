import { history, useIntl } from '@umijs/max';
import { Button } from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode, RefObject } from 'react';
import { publicMediaURL } from '@/utils/media';

// 文案均存 i18n key,渲染时用 intl.formatMessage 解析,以便随语言切换重渲。
// 三个模态(视频/图像/数智人)各是一屏沉浸式场景(对标参考 AETHER:整屏视觉铺底 + 大标题居中压其上)。
export const generationShowcases = [
  {
    key: 'video',
    tab: 'home.index.tabVideo',
    title: 'home.index.videoTitle',
    description: 'home.index.videoDesc',
    docsHref: '/docs/videos',
    playgroundHref: '/playground?tab=video',
    modelHref: '/models?type=video',
    stats: [
      'home.index.videoStat1',
      'home.index.videoStat2',
      'home.index.videoStat3',
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
    playgroundHref: '/playground?tab=image',
    modelHref: '/models?type=image',
    stats: [
      'home.index.imageStat1',
      'home.index.imageStat2',
      'home.index.imageStat3',
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
    playgroundHref: '/playground?tab=audio',
    modelHref: '/models?type=audio',
    stats: ['ASR / TTS', 'home.index.mediaStat2', 'home.index.mediaStat3'],
    visualTitle: 'home.index.mediaVisualTitle',
    visualSubtitle: 'home.index.mediaVisualSubtitle',
    preview: ['Audio', 'Clone', '3D', 'Avatar'],
  },
] as const;

export type ShowcaseDescriptor = (typeof generationShowcases)[number];

// 声波样式音频播放器 —— 播放按钮 + 一排声波条(播放时跳动) + 时长。
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

const clamp = (v: number, lo: number, hi: number) =>
  v < lo ? lo : v > hi ? hi : v;

// 滚动揭幕 hook:随场景在视口中的位置命令式写 CSS 变量(不触发重渲染)。
//  --reveal  视频圆形揭幕半径系数 0→1(进入视口前段张开,居中时全开)
//  --ty      视差基准位移(px):场景中心相对视口中心的偏移取反,供拼贴各列按不同系数漂移
function useScrollReveal(ref: RefObject<HTMLElement>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      const h = rect.height || vh;
      // 视频圆形揭幕:rect.top 从 vh(刚进)到约 0 时才接近 1(慢)。
      const reveal = clamp((vh - rect.top) / (vh * 0.95), 0, 1);
      el.style.setProperty('--reveal', String(reveal));
      // 归一化穿过进度 0..1(对任意高度成立):进入→0,居中→0.5,离开→1
      const progress = clamp((vh - rect.top) / (vh + h), 0, 1);
      // 漂移基准(px):居中 0,越往两端越大;图片浮层各按 --pll 缩放 → 不同速度视差
      el.style.setProperty('--ty', `${(0.5 - progress) * vh * 2.4}px`);
      // 可见度:居中最亮,两端淡出(淡入淡出)
      el.style.setProperty(
        '--vis',
        String(clamp(1 - Math.abs(progress - 0.5) / 0.42, 0, 1)),
      );
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [ref]);
}

// 场景进入视口时加 .is-active,驱动交错渐入 + 缓慢缩放(纯 CSS)。
function useActiveInView(ref: RefObject<HTMLElement>) {
  const [active, setActive] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setActive(true);
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return active;
}

const cssVars = (vars: Record<string, string | number>) => vars as CSSProperties;

// 图片浮层预设:左右【交替】排列(preset[0]左、[1]右、[2]左…),这样素材少时也左右分布、不会都挤一侧。
// 左侧随滚动「从上往下」(pll 负),右侧「从下往上」(pll 正);同侧不同 |pll| 制造错速。
// translateY = --ty × --pll;--ty 随下滚递减,故 pll<0 → 下移(左),pll>0 → 上移(右)。
const IMAGE_FLOATERS: { pos: CSSProperties; pll: number }[] = [
  { pos: { left: '4%', top: '30%', width: '23vw' }, pll: -0.42 }, // 左·中
  { pos: { right: '4%', top: '22%', width: '27vw' }, pll: 0.42 }, // 右·中偏上
  { pos: { left: '13%', top: '6%', width: '15vw' }, pll: -0.3 }, // 左·上
  { pos: { right: '13%', top: '54%', width: '15vw' }, pll: 0.34 }, // 右·下
  { pos: { left: '3%', top: '62%', width: '15vw' }, pll: -0.6 }, // 左·下
  { pos: { right: '2%', top: '4%', width: '14vw' }, pll: 0.6 }, // 右·上
];

export interface ShowcaseSectionProps {
  showcase: ShowcaseDescriptor;
  index: number;
  items: API.Showcase[]; // 已按 category 过滤 + media_url 有效
}

// 单个模态的一屏沉浸场景。
// 视频/图像:整屏视觉铺底 + 浅色柔光 scrim + 大标题居中压其上(对标参考)。
// 数智人:居中标题在上 + 卡片网格在下(卡片可交互,不做整屏覆盖)。
export default function ShowcaseSection({
  showcase,
  index,
  items,
}: ShowcaseSectionProps) {
  const intl = useIntl();
  const sceneRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const [activeVideoId, setActiveVideoId] = useState<number | null>(null);
  const [videoMuted, setVideoMuted] = useState(true);
  const [isPortraitVideo, setIsPortraitVideo] = useState(false);

  useScrollReveal(sceneRef);
  const isActive = useActiveInView(sceneRef);

  const activeVideos = useMemo(
    () => items.filter((s) => s.media_type === 'video'),
    [items],
  );
  const activeImages = useMemo(
    () => items.filter((s) => s.media_type === 'image'),
    [items],
  );
  const activeVideo = useMemo(
    () =>
      activeVideos.find((s) => s.id === activeVideoId) ?? activeVideos[0] ?? null,
    [activeVideos, activeVideoId],
  );

  useEffect(() => {
    setVideoMuted(true);
    setIsPortraitVideo(false);
  }, [activeVideo?.id]);

  // 视频进入视口才播放、滚出则暂停(圆形揭幕只裁剪显示,不影响 play)。
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) el.play().catch(() => {});
        else el.pause();
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [activeVideo?.id]);

  const toggleVideoSound = () => {
    const el = videoRef.current;
    if (!el) return;
    const next = !videoMuted;
    setVideoMuted(next);
    el.muted = next;
    if (!next) el.play().catch(() => {});
  };

  // 居中文案(视频/图像场景共用):大标题 + 副文案 + 能力点 + CTA。
  const renderCopy = () => (
    <div className="showcase-scene-copy">
      <h3>{intl.formatMessage({ id: showcase.title })}</h3>
      <p>{intl.formatMessage({ id: showcase.description })}</p>
      <div
        className="generation-showcase-stats"
        aria-label={intl.formatMessage({ id: 'home.index.statsLabel' })}
      >
        {showcase.stats.map((item) => (
          <span key={item}>
            {item.startsWith('home.index.')
              ? intl.formatMessage({ id: item })
              : item}
          </span>
        ))}
      </div>
      <div className="generation-showcase-cta-row">
        <Button
          type="primary"
          onClick={() => history.push(showcase.playgroundHref)}
        >
          {intl.formatMessage({ id: 'home.index.gotoPlayground' })}
        </Button>
        <Button onClick={() => history.push(showcase.docsHref)}>
          {intl.formatMessage({ id: 'home.index.viewDocs' })}
        </Button>
        <Button type="link" onClick={() => history.push(showcase.modelHref)}>
          {intl.formatMessage({ id: 'home.index.filterModels' })}
        </Button>
      </div>
    </div>
  );

  // ---------- 数智人:参考图信息条 + Prompt 输入框 + 卡片(保留原有可交互展示) ----------
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
          history.push(showcase.playgroundHref);
        }}
      >
        {intl.formatMessage({ id: 'home.index.create' })}
      </button>
    </div>
  );
  const renderRefBar = (item: API.Showcase) => {
    const refs = item.ref_images ?? [];
    const showPrompt = !!item.subtitle;
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
  const renderMediaCard = (s: API.Showcase, i: number) => (
    <figure
      className="generation-demo-card pop-in"
      key={s.id}
      style={cssVars({ '--i': i })}
    >
      {s.media_type === 'video' ? (
        <MediaVideoCard
          src={publicMediaURL(s.media_url)}
          poster={publicMediaURL(s.poster_url)}
        >
          {renderRefBar(s)}
        </MediaVideoCard>
      ) : (
        <div className="generation-demo-card-media">
          {s.media_type === 'audio' ? (
            <div className="generation-demo-card-audio">
              <WaveAudio src={publicMediaURL(s.media_url)} />
            </div>
          ) : (
            <img
              src={publicMediaURL(s.media_url)}
              alt={s.title || ''}
              loading="lazy"
            />
          )}
          {renderRefBar(s)}
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

  // ===== 数智人场景:标题在上 + 卡片网格在下 =====
  if (showcase.key === 'media') {
    return (
      <section
        ref={sceneRef}
        className={
          'showcase-scene showcase-scene--media' + (isActive ? ' is-active' : '')
        }
        aria-label={intl.formatMessage({ id: showcase.title })}
      >
        {renderCopy()}
        <div className="showcase-scene-mediagrid">
          {items.length > 0 ? (
            <div className="generation-demo-grid">
              {items.map((s, i) => renderMediaCard(s, i))}
            </div>
          ) : (
            <div className="showcase-emptybg" aria-hidden="true" />
          )}
        </div>
      </section>
    );
  }

  // ===== 图像场景:图片钉在画面中随滚动漂移(不同速度视差)+ 淡入淡出,大标题居中压其上 =====
  // 场景做高(180vh)给出滚动行程;内层 .showcase-pin 钉住一屏,图片在其中漂移。
  if (showcase.key === 'image') {
    const floaters = activeImages.slice(0, IMAGE_FLOATERS.length);
    return (
      <section
        ref={sceneRef}
        className={
          'showcase-scene showcase-scene--image' + (isActive ? ' is-active' : '')
        }
        aria-label={intl.formatMessage({ id: showcase.title })}
      >
        <div className="showcase-pin">
          <div className="showcase-floaters" aria-hidden="true">
            {floaters.length > 0 ? (
              floaters.map((s, i) => (
                <div
                  className="showcase-floater"
                  key={s.id}
                  style={{ ...IMAGE_FLOATERS[i].pos, ...cssVars({ '--pll': IMAGE_FLOATERS[i].pll }) }}
                >
                  <img src={publicMediaURL(s.media_url)} alt="" loading="lazy" />
                </div>
              ))
            ) : (
              <div className="showcase-emptybg" />
            )}
          </div>
          <div className="showcase-scene-scrim" aria-hidden="true" />
          {renderCopy()}
        </div>
      </section>
    );
  }

  // ===== 视频场景:整屏视频铺底 + 柔光 scrim + 居中大标题 + 圆形揭幕 =====
  return (
    <section
      ref={sceneRef}
      className={
        'showcase-scene showcase-scene--video' + (isActive ? ' is-active' : '')
      }
      aria-label={intl.formatMessage({ id: showcase.title })}
    >
      <div className="showcase-scene-bg">
        {activeVideo ? (
          <div
            className={
              'showcase-videowrap' + (isPortraitVideo ? ' is-portrait' : '')
            }
          >
            <video
              key={activeVideo.id}
              ref={videoRef}
              className="showcase-fullvideo"
              src={publicMediaURL(activeVideo.media_url)}
              poster={publicMediaURL(activeVideo.poster_url)}
              muted={videoMuted}
              loop
              playsInline
              preload="metadata"
              onLoadedMetadata={(e) =>
                setIsPortraitVideo(
                  e.currentTarget.videoHeight > e.currentTarget.videoWidth,
                )
              }
            />
          </div>
        ) : (
          <div className="showcase-emptybg" aria-hidden="true" />
        )}
      </div>

      {/* 柔光 scrim:中心白色柔光,保证居中深色标题可读,边缘露出视觉 */}
      <div className="showcase-scene-scrim" aria-hidden="true" />

      {/* 视频控件层:浮在 scrim 之上,角落/底部,不挡中间标题 */}
      {activeVideo && (
        <div className="showcase-video-controls">
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
          {activeVideos.length > 1 && (
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
        </div>
      )}

      {/* 居中大标题 */}
      {renderCopy()}
    </section>
  );
}
