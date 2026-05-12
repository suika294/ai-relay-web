import { Carousel } from 'antd';
import React from 'react';

interface Props {
  banners: API.Banner[];
}

// 把 banner 包装成可点击的 <a>(如果有 link_url),否则用 <div>。
// 绝对 URL(http(s):// 开头)外开新标签 + noopener;相对路径走站内导航。
function SlideAnchor({
  banner,
  children,
}: {
  banner: API.Banner;
  children: React.ReactNode;
}) {
  if (!banner.link_url) {
    return <div className="hero-carousel-slide">{children}</div>;
  }
  const isAbsolute = /^https?:\/\//i.test(banner.link_url);
  return (
    <a
      className="hero-carousel-slide"
      href={banner.link_url}
      {...(isAbsolute ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      {children}
    </a>
  );
}

export default function HeroCarousel({ banners }: Props) {
  if (banners.length === 0) return null;
  // 只有 1 张时关掉 autoplay 和 dots,免得空滑/光标闪
  const single = banners.length === 1;
  return (
    <div className="hero-carousel">
      <Carousel
        autoplay={!single}
        autoplaySpeed={4500}
        dots={!single}
        effect="fade"
        pauseOnHover
      >
        {banners.map((b, idx) => (
          <SlideAnchor key={b.id} banner={b}>
            <img
              className="hero-carousel-img"
              src={b.image_url}
              alt={b.title || `banner-${b.id}`}
              // 首图 eager 利于 LCP,后续懒加载
              loading={idx === 0 ? 'eager' : 'lazy'}
              decoding="async"
            />
            {(b.title || b.subtitle) && (
              <div className="hero-carousel-overlay">
                {b.title && <h3>{b.title}</h3>}
                {b.subtitle && <p>{b.subtitle}</p>}
              </div>
            )}
          </SlideAnchor>
        ))}
      </Carousel>
    </div>
  );
}
