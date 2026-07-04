import { GlobalOutlined } from '@ant-design/icons';
import { history, useIntl, useModel } from '@umijs/max';
import { useSiteInfo } from '@/hooks/useSiteInfo';
import { Button, Carousel, Col, Grid, Row, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { useAuthModal } from '@/components/AuthModalProvider';
import PublicLayout from '@/layouts/PublicLayout';
import { bannerApi, showcaseApi, systemApi } from '@/services/api';
import { publicMediaURL } from '@/utils/media';
import HeroCarousel from './HeroCarousel';
import ShowcaseSection, { generationShowcases } from './ShowcaseSection';
import {
  ProviderLogo,
  featuredPrice,
  fmtCtx,
  providerLabel,
  typeLabel,
  useQuickKey,
} from '../model-market/_shared';

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
  const screens = Grid.useBreakpoint();

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
    // showcases 失败不阻塞 —— 拉不到则各场景回退到抽象占位图(优雅降级)
    showcaseApi
      .list()
      .then((res) => {
        if (res.code === 0) setShowcases((res.data as API.Showcase[]) || []);
      })
      .catch(() => {});
  }, []);

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

  const renderFeaturedCard = (m: API.PublicModel) => {
    const t = typeLabel[m.type];
    const price = featuredPrice(m);
    // 海外 / 全球版模型:名称里带 "Global" 的,去掉文字,改用左上角 🌍 角标标识
    const rawName = m.display_name || m.name;
    const isGlobal = /\bglobal\b/i.test(rawName);
    const cardName = isGlobal
      ? rawName.replace(/\bglobal\b/gi, '').replace(/\s{2,}/g, ' ').trim()
      : rawName;
    const globalTitle = intl.formatMessage({ id: 'home.index.globalEdition' });
    return (
      <Col key={m.id} xs={24} sm={12} md={12} lg={6}>
        <div className="featured-card" onClick={() => handleGenerate(m)}>
          {isGlobal && (
            <span
              className="featured-globe-badge"
              title={globalTitle}
              aria-label={globalTitle}
            >
              <GlobalOutlined aria-hidden="true" />
            </span>
          )}
          <div className="featured-card-top">
            <div className="featured-card-main">
              <div className="featured-logo-wrap">
                <ProviderLogo provider={m.provider_type} size={26} />
              </div>
              <div className="featured-card-titles">
                <div className="featured-card-name">{cardName}</div>
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

  return (
    <>
      {/* 首屏 = Hero + 推荐模型 一起占满一屏(桌面 min-height:100vh),
          让下方深色滚动叙事场景从折叠线以下开始,不再从推荐区下方漏进首屏。 */}
      <div className="home-firstscreen">
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
      </div>

      {/* 产品功能区 —— 整页滚动叙事:三个模态各一屏「钉住 → 下一屏覆盖」的场景,
          每个场景自带入场揭幕(视频圆形揭幕 / 图片视差 + 交错渐入 + 缓慢缩放)。
          外层用全新 .showcase-narrative 类,刻意不复用旧的 .generation-showcase-section
          外壳(那套是滚动劫持一屏 tab 切换器,会把内容钉成一屏)。 */}
      <section className="showcase-narrative">
        <div className="showcase-narrative-head">
          <Typography.Title level={2} style={{ margin: 0 }}>
            {intl.formatMessage({ id: 'home.index.featuresTitle' })}
          </Typography.Title>
        </div>
        <div className="showcase-scroll">
          {generationShowcases.map((sc, i) => (
            <ShowcaseSection
              key={sc.key}
              showcase={sc}
              index={i}
              items={showcases.filter(
                (s) => s.category === sc.key && publicMediaURL(s.media_url),
              )}
            />
          ))}
        </div>
      </section>

      {/* 选模型直出 Key 的弹窗(推荐模型卡片的"生成 Key"会用到) */}
      {modals}
    </>
  );
}
