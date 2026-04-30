import {
  ApiOutlined,
  DollarOutlined,
  GlobalOutlined,
  SafetyCertificateOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { history, Link } from '@umijs/max';
import { Button, Col, Row, Typography } from 'antd';
import PublicLayout from '@/layouts/PublicLayout';

const { Paragraph } = Typography;

const features = [
  {
    icon: <ApiOutlined />,
    title: '统一 API 协议',
    desc: '保持 OpenAI 兼容格式，切换 Anthropic / Gemini / Azure 等厂商无需改代码。',
  },
  {
    icon: <GlobalOutlined />,
    title: '全球多币种',
    desc: '按 IP 自动识别展示币种，汇率每小时自动刷新；内部统一以 quota 记账。',
  },
  {
    icon: <ThunderboltOutlined />,
    title: '流式低延迟',
    desc: 'SSE 原生透传，首 token 时间接近直连上游，不堆积不 buffer。',
  },
  {
    icon: <DollarOutlined />,
    title: '精细化计费',
    desc: '按 token 实时计价，支持渠道覆盖价 / 分组倍率 / 个人议价多层定价。',
  },
  {
    icon: <SafetyCertificateOutlined />,
    title: '安全隔离',
    desc: '渠道 Key AES-GCM 加密；用户与管理员账户体系完全分离。',
  },
];

export default function Landing() {
  return (
    <PublicLayout>
      {/* Hero */}
      <section className="hero">
        <h1 className="hero-title">
          一次接入，<span className="hero-highlight">所有主流 AI 模型</span>
        </h1>
        <p className="hero-sub">
          AI Relay 提供 OpenAI 兼容的统一 API，聚合 OpenAI / Anthropic / Gemini
          等模型；支持多币种计费、流式转发、细粒度成本控制。
        </p>
        <div className="hero-cta">
          <Button type="primary" size="large" onClick={() => history.push('/auth/register')}>
            免费注册
          </Button>
          <Button size="large" onClick={() => history.push('/pricing-classic')}>
            查看定价
          </Button>
        </div>
        <div className="hero-badges">
          <div>
            <span className="b-num">20+</span>内置模型
          </div>
          <div>
            <span className="b-num">7+</span>主流厂商
          </div>
          <div>
            <span className="b-num">5+</span>支持币种
          </div>
          <div>
            <span className="b-num">99.9%</span>可用性目标
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="section">
        <h2 className="section-title">为什么选 AI Relay</h2>
        <p className="section-sub">聚合、计费、转发、治理 —— 一个网关解决全部</p>
        <Row gutter={[24, 24]}>
          {features.map((f) => (
            <Col key={f.title} xs={24} sm={12} md={8}>
              <div className="feature-card">
                <div className="ico">{f.icon}</div>
                <div className="t">{f.title}</div>
                <div className="d">{f.desc}</div>
              </div>
            </Col>
          ))}
        </Row>
      </section>

      {/* Quickstart preview */}
      <section className="section" style={{ paddingTop: 0 }}>
        <h2 className="section-title">三行代码开始使用</h2>
        <p className="section-sub">把 OpenAI 请求的 base_url 指向 AI Relay 即可</p>
        <Paragraph copyable code style={{ maxWidth: 780, margin: '0 auto', background: '#0f1117', padding: 20, borderRadius: 12, color: '#e7eaf3' }}>
          {`curl -N http://localhost:8080/v1/chat/completions \\
  -H "Authorization: Bearer sk-your-key" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"gpt-5.3-codex","messages":[{"role":"user","content":"hi"}],"stream":true}'`}
        </Paragraph>
      </section>

      {/* CTA band */}
      <section className="cta-band">
        <h2>准备好了吗？</h2>
        <p>注册账户即赠送试用额度，两分钟跑通首个请求</p>
        <div className="hero-cta">
          <Button type="primary" size="large" onClick={() => history.push('/auth/register')}>
            立即开始
          </Button>
          <Button size="large" ghost onClick={() => history.push('/docs')}>
            阅读文档
          </Button>
        </div>
      </section>
    </PublicLayout>
  );
}
