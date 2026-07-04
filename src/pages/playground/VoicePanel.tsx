import { AudioOutlined, CloseCircleOutlined, CustomerServiceOutlined, DeleteOutlined, DownloadOutlined, LoadingOutlined, PauseCircleOutlined, PlayCircleOutlined, ReloadOutlined, SendOutlined, UploadOutlined } from '@ant-design/icons';
import { Alert, AutoComplete, Button, Card, Collapse, Empty, Input, message, Segmented, Select, Slider, Space, Spin, Tag, Tooltip, Upload } from 'antd';
import type { UploadProps } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { useIntl } from '@umijs/max';
import { systemApi } from '@/services/api';
import { apiURL } from '@/utils/request';
import { t } from '@/utils/i18n';
import ApiKeyField from './ApiKeyField';
import { usePlaygroundApiKey } from './apiKeyStore';

const { TextArea } = Input;

// localStorage 续作:两个子模式各一个,挂载时若有非终态任务自动恢复轮询。
// 同 ImagePanel/VideoPanel 的 LS_LAST_TASK 模式。
const LS_ASR_TASK = 'playground_audio_asr_last_task_v1';
const LS_TTS_TASK = 'playground_audio_tts_last_task_v1';

// 与后端 parseMultipartTranscribe / parseJSONTranscribe 上限对齐:
//   - multipart 64MB(handler line 121)
//   - JSON 20MB(handler line 29)
// 同步 SentenceRecognition 腾讯实际 ≤5MB / ≤60s,这里前端按经验切:
//   ≤4MB 默认同步,>4MB 自动切异步,完全避开腾讯 sync 上限。
const SYNC_FILE_THRESHOLD_BYTES = 4 * 1024 * 1024;
const MULTIPART_MAX_BYTES = 64 * 1024 * 1024;
const JSON_AUDIO_MAX_BYTES = 20 * 1024 * 1024;

// TTS 同步上游(腾讯 TextToVoice)硬限 ≤2000 字符;超出切异步。
const TTS_SYNC_CHAR_LIMIT = 2000;
// 异步上游(CreateTtsTask)硬限 10 万字符,前端用 9 万兜底防 base64 / 编码膨胀边界。
const TTS_ASYNC_CHAR_LIMIT = 90000;

type RouteMode = 'auto' | 'sync' | 'async';

// isAsyncOnlyASRProvider 返回 true 表示该 provider 的 ASR 上游**只有异步链路**,
// 没有「一句话识别」式的同步接口。点同步会被后端打回:
//   `<provider>: synchronous ASR not supported, use AudioTranscribeSubmit + Fetch`
//
// 这两家全异步:
//   - dashscope_speech(阿里 Paraformer-v2):submit → poll task_id → fetch OSS JSON
//   - volc_speech(火山豆包 ASR 大模型):submit → poll → fetch
//
// 与之相对,asr_tencent / openai(whisper)/ deepgram / minimax 等同步异步都有。
//
// 注:这两家上游同时也是 URL-only(不收 base64 内联音频),**但 Phase 89e 起 backend
// 透明 ingest base64/multipart 到 AssetService → 拿签 token 反代 URL → 转发上游**,
// 所以前端 file/mic 上传现在仍然可用,用户不再感知到 URL-only 约束。
// (`audio_url required` 兜底翻译保留在 friendlyAudioErrorMessage 作 last-resort 防御。)
//
// 用途:Playground 选这两家的 ASR model 时,自动强制 routeMode=async,禁用「自动/强制同步」选项。
function isAsyncOnlyASRProvider(providerType?: string): boolean {
  const pt = (providerType || '').toLowerCase();
  return pt === 'dashscope_speech' || pt === 'volc_speech';
}

type ASRSegment = {
  start_ms?: number;
  end_ms?: number;
  text?: string;
  speaker?: string;
};

type ASRWord = {
  start_ms?: number;
  end_ms?: number;
  word?: string;
  prob?: number;
};

type ASRResponse = {
  text?: string;
  duration_ms?: number;
  request_id?: string;
  segments?: ASRSegment[];
  words?: ASRWord[];
};

type ASRTask = {
  upstream_id?: string;
  status?: 'queued' | 'running' | 'succeeded' | 'failed';
  text?: string;
  duration_ms?: number;
  segments?: ASRSegment[];
  words?: ASRWord[];
  error_code?: string;
  error_msg?: string;
  request_id?: string;
  // 前端附加:轮询用
  _channel?: string;
  _model?: string;
  _created_at?: number;
};

type TTSTask = {
  upstream_id?: string;
  status?: 'queued' | 'running' | 'succeeded' | 'failed';
  audio_url?: string;
  char_count?: number;
  error_code?: string;
  error_msg?: string;
  request_id?: string;
  _channel?: string;
  _model?: string;
  _created_at?: number;
  _format?: string;
};

type TTSSyncResult = {
  blob: Blob;
  url: string; // objectURL,记得 revoke
  format: string;
  charCount: number;
};

// 把腾讯云数字 ID + OpenAI 风格逻辑名对齐成一份 UI 候选,与后端
// tts_tencent/client.go resolveVoiceType + textToVoiceReq.VoiceType 对应。
// VOICE_CATALOG 按 provider_type 分组(Phase 86):腾讯 / OpenAI / MiniMax 三家的
// voice_id 语义完全不通(腾讯数字 + OpenAI 别名 / OpenAI 6 个固定 / MiniMax 语义化字符串),
// 不能再单一列表混在一起。TTS 子模式按 selected model 的 provider_type 切换候选集。
type VoiceProvider = 'tencent' | 'openai' | 'minimax' | 'dashscope' | 'kling';
type VoiceOption = {
  value: string; // 直接发给后端的字符串(腾讯数字 ID / OpenAI 别名 / MiniMax 语义 ID / 可灵 voice_id)
  label: string; // UI 显示
  desc?: string; // tooltip
  provider: VoiceProvider;
  // family 仅 tencent 用 —— standard / premium / hunyuan 候选不同
  family?: 'standard' | 'premium' | 'hunyuan';
  // lang 仅 kling 用 —— 同一 voice_id 在 zh / en 下发音不同,候选按 language 切换
  lang?: 'zh' | 'en';
};
const VOICE_CATALOG: VoiceOption[] = [
  // ---- 腾讯云 standard / hunyuan 共享 ----
  { value: 'alloy', label: `alloy (${t('playground.voice.cat.tencent.alloy')})`, desc: t('playground.voice.cat.tencent.alloyDesc'), provider: 'tencent', family: 'standard' },
  { value: 'echo', label: `echo (${t('playground.voice.cat.tencent.echo')})`, desc: t('playground.voice.cat.tencent.echoDesc'), provider: 'tencent', family: 'standard' },
  { value: 'fable', label: `fable (${t('playground.voice.cat.tencent.fable')})`, desc: t('playground.voice.cat.tencent.fableDesc'), provider: 'tencent', family: 'standard' },
  { value: 'shimmer', label: `shimmer (${t('playground.voice.cat.tencent.shimmer')})`, desc: t('playground.voice.cat.tencent.shimmerDesc'), provider: 'tencent', family: 'standard' },
  { value: '101001', label: `101001 ${t('playground.voice.cat.tencent.101001')}`, provider: 'tencent', family: 'standard' },
  { value: '101002', label: `101002 ${t('playground.voice.cat.tencent.101002')}`, provider: 'tencent', family: 'standard' },
  { value: '101003', label: `101003 ${t('playground.voice.cat.tencent.101003')}`, provider: 'tencent', family: 'standard' },
  { value: '101004', label: `101004 ${t('playground.voice.cat.tencent.101004')}`, provider: 'tencent', family: 'standard' },
  { value: '101005', label: `101005 ${t('playground.voice.cat.tencent.101005')}`, provider: 'tencent', family: 'standard' },
  { value: '101006', label: `101006 ${t('playground.voice.cat.tencent.101006')}`, provider: 'tencent', family: 'standard' },
  { value: '101008', label: `101008 ${t('playground.voice.cat.tencent.101008')}`, provider: 'tencent', family: 'standard' },
  // 腾讯云 premium
  { value: '502001', label: `502001 ${t('playground.voice.cat.tencent.502001')}`, provider: 'tencent', family: 'premium' },
  { value: '502003', label: `502003 ${t('playground.voice.cat.tencent.502003')}`, provider: 'tencent', family: 'premium' },
  { value: '501008', label: `501008 ${t('playground.voice.cat.tencent.501008')}`, provider: 'tencent', family: 'premium' },

  // ---- OpenAI 6 个官方音色(tts-1 / tts-1-hd 通用)----
  { value: 'alloy', label: `alloy (${t('playground.voice.cat.openai.alloy')})`, desc: t('playground.voice.cat.openai.alloyDesc'), provider: 'openai' },
  { value: 'echo', label: `echo (${t('playground.voice.cat.openai.echo')})`, desc: t('playground.voice.cat.openai.echoDesc'), provider: 'openai' },
  { value: 'fable', label: `fable (${t('playground.voice.cat.openai.fable')})`, desc: t('playground.voice.cat.openai.fableDesc'), provider: 'openai' },
  { value: 'onyx', label: `onyx (${t('playground.voice.cat.openai.onyx')})`, desc: t('playground.voice.cat.openai.onyxDesc'), provider: 'openai' },
  { value: 'nova', label: `nova (${t('playground.voice.cat.openai.nova')})`, desc: t('playground.voice.cat.openai.novaDesc'), provider: 'openai' },
  { value: 'shimmer', label: `shimmer (${t('playground.voice.cat.openai.shimmer')})`, desc: t('playground.voice.cat.openai.shimmerDesc'), provider: 'openai' },

  // ---- MiniMax T2A v2 真实 system voice_id(来自官方 T2A v2 文档示例;官方共 300+,
  // 完整列表见 https://platform.minimax.io/docs/faq/system-voice-id 或调用 Get Voice API)
  // 注意:voice_id 必填 + 没有上游默认 + 大小写敏感,以下 ID 都从官方文档抓取过精确字符串
  // ----
  // 英文
  { value: 'English_Insightful_Speaker', label: `English_Insightful_Speaker (${t('playground.voice.cat.minimax.English_Insightful_Speaker')})`, provider: 'minimax' },
  { value: 'English_Graceful_Lady', label: `English_Graceful_Lady (${t('playground.voice.cat.minimax.English_Graceful_Lady')})`, provider: 'minimax' },
  { value: 'English_Persuasive_Man', label: `English_Persuasive_Man (${t('playground.voice.cat.minimax.English_Persuasive_Man')})`, provider: 'minimax' },
  { value: 'English_radiant_girl', label: `English_radiant_girl (${t('playground.voice.cat.minimax.English_radiant_girl')})`, provider: 'minimax' },
  { value: 'English_Lucky_Robot', label: `English_Lucky_Robot (${t('playground.voice.cat.minimax.English_Lucky_Robot')})`, provider: 'minimax' },
  { value: 'English_expressive_narrator', label: `English_expressive_narrator (${t('playground.voice.cat.minimax.English_expressive_narrator')})`, provider: 'minimax' },
  // 中文(普通话)
  { value: 'Chinese (Mandarin)_Lyrical_Voice', label: `Chinese (Mandarin)_Lyrical_Voice (${t('playground.voice.cat.minimax.Chinese_Mandarin_Lyrical_Voice')})`, provider: 'minimax' },
  { value: 'Chinese (Mandarin)_HK_Flight_Attendant', label: `Chinese (Mandarin)_HK_Flight_Attendant (${t('playground.voice.cat.minimax.Chinese_Mandarin_HK_Flight_Attendant')})`, provider: 'minimax' },
  // 日文
  { value: 'Japanese_Whisper_Belle', label: `Japanese_Whisper_Belle (${t('playground.voice.cat.minimax.Japanese_Whisper_Belle')})`, provider: 'minimax' },
  // 粤语(注意:粤语需要请求里同时设 language_boost="Chinese,Yue")
  { value: 'Cantonese_GentleLady', label: `Cantonese_GentleLady (${t('playground.voice.cat.minimax.Cantonese_GentleLady')})`, provider: 'minimax' },
  { value: 'Cantonese_podacast_host_1', label: `Cantonese_podacast_host_1 (${t('playground.voice.cat.minimax.Cantonese_podacast_host_1')})`, provider: 'minimax' },

  // ---- 阿里 DashScope CosyVoice v2(2026 官方默认,_v2 后缀)----
  // 后端 dashscope_speech provider 默认 model=cosyvoice-v2,voice 必须配 _v2 后缀,
  // 否则上游 InvalidParameter `Engine return error code: 418`(版本不匹配)。
  // v1 老 voice(longxiaochun / loongstella 无后缀)部分账号已下线,本前端不再暴露。
  { value: 'longxiaochun_v2', label: `longxiaochun_v2 (${t('playground.voice.cat.dashscope.longxiaochun_v2')})`, desc: t('playground.voice.cat.dashscope.longxiaochun_v2Desc'), provider: 'dashscope' },
  { value: 'longwan_v2', label: `longwan_v2 (${t('playground.voice.cat.dashscope.longwan_v2')})`, provider: 'dashscope' },
  { value: 'longcheng_v2', label: `longcheng_v2 (${t('playground.voice.cat.dashscope.longcheng_v2')})`, provider: 'dashscope' },
  { value: 'longhua_v2', label: `longhua_v2 (${t('playground.voice.cat.dashscope.longhua_v2')})`, provider: 'dashscope' },
  { value: 'longshu_v2', label: `longshu_v2 (${t('playground.voice.cat.dashscope.longshu_v2')})`, provider: 'dashscope' },
  { value: 'loongstella_v2', label: `loongstella_v2 (${t('playground.voice.cat.dashscope.loongstella_v2')})`, desc: t('playground.voice.cat.dashscope.loongstella_v2Desc'), provider: 'dashscope' },
  { value: 'longmiao_v2', label: `longmiao_v2 (${t('playground.voice.cat.dashscope.longmiao_v2')})`, provider: 'dashscope' },
  { value: 'longtong_v2', label: `longtong_v2 (${t('playground.voice.cat.dashscope.longtong_v2')})`, provider: 'dashscope' },
  { value: 'longlaotie_v2', label: `longlaotie_v2 (${t('playground.voice.cat.dashscope.longlaotie_v2')})`, provider: 'dashscope' },
  { value: 'longxiaoxia_v2', label: `longxiaoxia_v2 (${t('playground.voice.cat.dashscope.longxiaoxia_v2')})`, provider: 'dashscope' },

  // ---- 可灵(KlingAI)官方预置音色 —— voice_id + language(zh/en)。
  // 同一 voice_id 在 zh / en 下发音不同(genshin_vindi2 = 阳光少年 / Sunny),故按 lang 分两组,
  // 提交时 voice=voice_id + language=lang 分开发(见 provider.SpeechRequest.Language)。----
  // 中文音色
  { value: 'genshin_vindi2', label: `${t('playground.voice.cat.kling.genshin_vindi2')} (genshin_vindi2)`, provider: 'kling', lang: 'zh' },
  { value: 'zhinen_xuesheng', label: `${t('playground.voice.cat.kling.zhinen_xuesheng')} (zhinen_xuesheng)`, provider: 'kling', lang: 'zh' },
  { value: 'tiyuxi_xuedi', label: `${t('playground.voice.cat.kling.tiyuxi_xuedi')} (tiyuxi_xuedi)`, provider: 'kling', lang: 'zh' },
  { value: 'ai_shatang', label: `${t('playground.voice.cat.kling.ai_shatang')} (ai_shatang)`, provider: 'kling', lang: 'zh' },
  { value: 'genshin_klee2', label: `${t('playground.voice.cat.kling.genshin_klee2')} (genshin_klee2)`, provider: 'kling', lang: 'zh' },
  { value: 'genshin_kirara', label: `${t('playground.voice.cat.kling.genshin_kirara')} (genshin_kirara)`, provider: 'kling', lang: 'zh' },
  { value: 'ai_kaiya', label: `${t('playground.voice.cat.kling.ai_kaiya')} (ai_kaiya)`, provider: 'kling', lang: 'zh' },
  { value: 'tiexin_nanyou', label: `${t('playground.voice.cat.kling.tiexin_nanyou')} (tiexin_nanyou)`, provider: 'kling', lang: 'zh' },
  { value: 'ai_chenjiahao_712', label: `${t('playground.voice.cat.kling.ai_chenjiahao_712')} (ai_chenjiahao_712)`, provider: 'kling', lang: 'zh' },
  { value: 'girlfriend_1_speech02', label: `${t('playground.voice.cat.kling.girlfriend_1_speech02')} (girlfriend_1_speech02)`, provider: 'kling', lang: 'zh' },
  { value: 'chat1_female_new-3', label: `${t('playground.voice.cat.kling.chat1_female_new_3')} (chat1_female_new-3)`, provider: 'kling', lang: 'zh' },
  { value: 'girlfriend_2_speech02', label: `${t('playground.voice.cat.kling.girlfriend_2_speech02')} (girlfriend_2_speech02)`, provider: 'kling', lang: 'zh' },
  { value: 'cartoon-boy-07', label: `${t('playground.voice.cat.kling.cartoon_boy_07')} (cartoon-boy-07)`, provider: 'kling', lang: 'zh' },
  { value: 'cartoon-girl-01', label: `${t('playground.voice.cat.kling.cartoon_girl_01')} (cartoon-girl-01)`, provider: 'kling', lang: 'zh' },
  { value: 'ai_huangyaoshi_712', label: `${t('playground.voice.cat.kling.ai_huangyaoshi_712')} (ai_huangyaoshi_712)`, provider: 'kling', lang: 'zh' },
  { value: 'you_pingjing', label: `${t('playground.voice.cat.kling.you_pingjing')} (you_pingjing)`, provider: 'kling', lang: 'zh' },
  { value: 'ai_laoguowang_712', label: `${t('playground.voice.cat.kling.ai_laoguowang_712')} (ai_laoguowang_712)`, provider: 'kling', lang: 'zh' },
  { value: 'chengshu_jiejie', label: `${t('playground.voice.cat.kling.chengshu_jiejie')} (chengshu_jiejie)`, provider: 'kling', lang: 'zh' },
  { value: 'zhuxi_speech02', label: `${t('playground.voice.cat.kling.zhuxi_speech02')} (zhuxi_speech02)`, provider: 'kling', lang: 'zh' },
  { value: 'uk_oldman3', label: `${t('playground.voice.cat.kling.uk_oldman3')} (uk_oldman3)`, provider: 'kling', lang: 'zh' },
  { value: 'laopopo_speech02', label: `${t('playground.voice.cat.kling.laopopo_speech02')} (laopopo_speech02)`, provider: 'kling', lang: 'zh' },
  { value: 'heainainai_speech02', label: `${t('playground.voice.cat.kling.heainainai_speech02')} (heainainai_speech02)`, provider: 'kling', lang: 'zh' },
  { value: 'dongbeilaotie_speech02', label: `${t('playground.voice.cat.kling.dongbeilaotie_speech02')} (dongbeilaotie_speech02)`, provider: 'kling', lang: 'zh' },
  { value: 'chongqingxiaohuo_speech02', label: `${t('playground.voice.cat.kling.chongqingxiaohuo_speech02')} (chongqingxiaohuo_speech02)`, provider: 'kling', lang: 'zh' },
  { value: 'chuanmeizi_speech02', label: `${t('playground.voice.cat.kling.chuanmeizi_speech02')} (chuanmeizi_speech02)`, provider: 'kling', lang: 'zh' },
  { value: 'chaoshandashu_speech02', label: `${t('playground.voice.cat.kling.chaoshandashu_speech02')} (chaoshandashu_speech02)`, provider: 'kling', lang: 'zh' },
  { value: 'ai_taiwan_man2_speech02', label: `${t('playground.voice.cat.kling.ai_taiwan_man2_speech02')} (ai_taiwan_man2_speech02)`, provider: 'kling', lang: 'zh' },
  { value: 'xianzhanggui_speech02', label: `${t('playground.voice.cat.kling.xianzhanggui_speech02')} (xianzhanggui_speech02)`, provider: 'kling', lang: 'zh' },
  { value: 'tianjinjiejie_speech02', label: `${t('playground.voice.cat.kling.tianjinjiejie_speech02')} (tianjinjiejie_speech02)`, provider: 'kling', lang: 'zh' },
  { value: 'diyinnansang_DB_CN_M_04-v2', label: `${t('playground.voice.cat.kling.diyinnansang_DB_CN_M_04_v2')} (diyinnansang_DB_CN_M_04-v2)`, provider: 'kling', lang: 'zh' },
  { value: 'yizhipiannan-v1', label: `${t('playground.voice.cat.kling.yizhipiannan_v1')} (yizhipiannan-v1)`, provider: 'kling', lang: 'zh' },
  { value: 'guanxiaofang-v2', label: `${t('playground.voice.cat.kling.guanxiaofang_v2')} (guanxiaofang-v2)`, provider: 'kling', lang: 'zh' },
  { value: 'tianmeixuemei-v1', label: `${t('playground.voice.cat.kling.tianmeixuemei_v1')} (tianmeixuemei-v1)`, provider: 'kling', lang: 'zh' },
  { value: 'daopianyansang-v1', label: `${t('playground.voice.cat.kling.daopianyansang_v1')} (daopianyansang-v1)`, provider: 'kling', lang: 'zh' },
  { value: 'mengwa-v1', label: `${t('playground.voice.cat.kling.mengwa_v1')} (mengwa-v1)`, provider: 'kling', lang: 'zh' },
  // 英文音色
  { value: 'genshin_vindi2', label: 'Sunny (genshin_vindi2)', provider: 'kling', lang: 'en' },
  { value: 'zhinen_xuesheng', label: 'Sage (zhinen_xuesheng)', provider: 'kling', lang: 'en' },
  { value: 'AOT', label: 'Ace (AOT)', provider: 'kling', lang: 'en' },
  { value: 'ai_shatang', label: 'Blossom (ai_shatang)', provider: 'kling', lang: 'en' },
  { value: 'genshin_klee2', label: 'Peppy (genshin_klee2)', provider: 'kling', lang: 'en' },
  { value: 'genshin_kirara', label: 'Dove (genshin_kirara)', provider: 'kling', lang: 'en' },
  { value: 'ai_kaiya', label: 'Shine (ai_kaiya)', provider: 'kling', lang: 'en' },
  { value: 'oversea_male1', label: 'Anchor (oversea_male1)', provider: 'kling', lang: 'en' },
  { value: 'ai_chenjiahao_712', label: 'Lyric (ai_chenjiahao_712)', provider: 'kling', lang: 'en' },
  { value: 'girlfriend_4_speech02', label: 'Melody (girlfriend_4_speech02)', provider: 'kling', lang: 'en' },
  { value: 'chat1_female_new-3', label: 'Tender (chat1_female_new-3)', provider: 'kling', lang: 'en' },
  { value: 'chat_0407_5-1', label: 'Siren (chat_0407_5-1)', provider: 'kling', lang: 'en' },
  { value: 'cartoon-boy-07', label: 'Zippy (cartoon-boy-07)', provider: 'kling', lang: 'en' },
  { value: 'uk_boy1', label: 'Bud (uk_boy1)', provider: 'kling', lang: 'en' },
  { value: 'cartoon-girl-01', label: 'Sprite (cartoon-girl-01)', provider: 'kling', lang: 'en' },
  { value: 'PeppaPig_platform', label: 'Candy (PeppaPig_platform)', provider: 'kling', lang: 'en' },
  { value: 'ai_huangzhong_712', label: 'Beacon (ai_huangzhong_712)', provider: 'kling', lang: 'en' },
  { value: 'ai_huangyaoshi_712', label: 'Rock (ai_huangyaoshi_712)', provider: 'kling', lang: 'en' },
  { value: 'ai_laoguowang_712', label: 'Titan (ai_laoguowang_712)', provider: 'kling', lang: 'en' },
  { value: 'chengshu_jiejie', label: 'Grace (chengshu_jiejie)', provider: 'kling', lang: 'en' },
  { value: 'you_pingjing', label: 'Helen (you_pingjing)', provider: 'kling', lang: 'en' },
  { value: 'calm_story1', label: 'Lore (calm_story1)', provider: 'kling', lang: 'en' },
  { value: 'uk_man2', label: 'Crag (uk_man2)', provider: 'kling', lang: 'en' },
  { value: 'laopopo_speech02', label: 'Prattle (laopopo_speech02)', provider: 'kling', lang: 'en' },
  { value: 'heainainai_speech02', label: 'Hearth (heainainai_speech02)', provider: 'kling', lang: 'en' },
  { value: 'reader_en_m-v1', label: 'The Reader (reader_en_m-v1)', provider: 'kling', lang: 'en' },
  { value: 'commercial_lady_en_f-v1', label: 'Commercial Lady (commercial_lady_en_f-v1)', provider: 'kling', lang: 'en' },
];

// modelProviderTypeToVoiceProvider 把后端 ai_models.provider_type 映射到 voice 候选 provider。
// tts_tencent → 'tencent'(发数字 ID / 别名,后端 tts_tencent 自己映射)
// openai → 'openai'(发别名,openai 上游直接接受)
// minimax → 'minimax'(发语义化 voice_id)
function modelProviderTypeToVoiceProvider(providerType?: string): VoiceProvider {
  switch ((providerType || '').toLowerCase()) {
    case 'openai':
      return 'openai';
    case 'minimax':
      return 'minimax';
    case 'dashscope_speech':
      return 'dashscope';
    case 'kling':
      return 'kling';
    case 'tts_tencent':
    default:
      return 'tencent';
  }
}

// cloneProviderTypeToVoiceProvider 把「声音复刻」记录的 provider_type 映射到 TTS 音色 provider,
// 仅在"克隆出来的 voice_id 能直接用于该家 TTS"时返回非空(否则注入会误导)。
//   - minimax 克隆 → minimax TTS(voice_id 直接通用)
//   - dashscope_speech(CosyVoice)克隆 → dashscope TTS(cosyvoice-v2-xxx 直接当 voice 用)
// 其余(volc/elevenlabs/vidu/kling/tencent_voice_clone)与本面板的 TTS 音色体系不直通,返回 null 不注入。
function cloneProviderTypeToVoiceProvider(providerType?: string): VoiceProvider | null {
  switch ((providerType || '').toLowerCase()) {
    case 'minimax':
      return 'minimax';
    case 'dashscope_speech':
      return 'dashscope';
    default:
      return null;
  }
}

function voicesForModel(modelName?: string, providerType?: string, lang?: 'zh' | 'en'): VoiceOption[] {
  const voiceProvider = modelProviderTypeToVoiceProvider(providerType);
  if (voiceProvider === 'kling') {
    // 同一 voice_id 在 zh/en 都有 → 必须按 lang 过滤,否则 AutoComplete value 重复。
    // lang 未指定(如校验当前 voice 是否仍合法时)→ 返回全部 kling 候选,更宽松不误重置。
    return VOICE_CATALOG.filter((v) => v.provider === 'kling' && (!lang || v.lang === lang));
  }
  if (voiceProvider !== 'tencent') {
    return VOICE_CATALOG.filter((v) => v.provider === voiceProvider);
  }
  // 腾讯按 model 名细分 family
  const m = (modelName || '').toLowerCase();
  let family: 'standard' | 'premium' | 'hunyuan' = 'standard';
  if (m.includes('premium')) family = 'premium';
  else if (m.includes('hunyuan')) family = 'hunyuan';
  return VOICE_CATALOG.filter((v) => v.provider === 'tencent' && (v.family === family || (family === 'hunyuan' && v.family === 'standard')));
}

function defaultVoiceForModel(modelName?: string, providerType?: string): string {
  const voiceProvider = modelProviderTypeToVoiceProvider(providerType);
  if (voiceProvider === 'openai') return 'alloy';
  if (voiceProvider === 'minimax') return 'English_Insightful_Speaker';
  if (voiceProvider === 'dashscope') return 'longxiaochun_v2';
  if (voiceProvider === 'kling') return 'genshin_vindi2'; // 阳光少年 / Sunny,zh/en 共用
  const m = (modelName || '').toLowerCase();
  if (m.includes('premium')) return '502001';
  return 'alloy';
}

// formatMs 给时间轴 / 时长用,01:23.45 风格。
function formatMs(ms?: number): string {
  if (!ms || ms < 0) return '00:00.00';
  const total = Math.floor(ms);
  const min = Math.floor(total / 60000);
  const sec = Math.floor((total % 60000) / 1000);
  const cs = Math.floor((total % 1000) / 10);
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function statusColor(s?: string): 'default' | 'processing' | 'success' | 'error' {
  switch (s) {
    case 'queued':
      return 'default';
    case 'running':
      return 'processing';
    case 'succeeded':
      return 'success';
    case 'failed':
      return 'error';
    default:
      return 'default';
  }
}

function statusText(s?: string): string {
  const m: Record<string, string> = {
    queued: t('playground.voice.status.queued'),
    running: t('playground.voice.status.running'),
    succeeded: t('playground.voice.status.succeeded'),
    failed: t('playground.voice.status.failed'),
  };
  return s ? m[s] || s : '';
}

// 错误响应里挖 message,兼容三种形态:
//   1) OpenAI 风格 { error: { message, code } } —— 后端 BadRequestOAI/FailOpenAI 出口
//   2) 旧风格 { message, code }
//   3) Nginx 等返回 HTML 错误页(标题/h1)
// 返回值再过一道 friendlyAudioErrorMessage 做中文映射。
function extractErrMsg(raw: string, httpStatus: number): { msg: string; code?: string } {
  if (!raw) return { msg: `HTTP ${httpStatus}` };
  const trimmed = raw.trim();
  if (trimmed.startsWith('<')) {
    const title = /<title>([^<]+)<\/title>/i.exec(trimmed)?.[1]?.trim();
    const h1 = /<h1[^>]*>([^<]+)<\/h1>/i.exec(trimmed)?.[1]?.trim();
    return { msg: title || h1 || `HTTP ${httpStatus}` };
  }
  try {
    const j = JSON.parse(trimmed);
    const msg = j?.error?.message || j?.message || trimmed.slice(0, 4000);
    const code = j?.error?.code || j?.code;
    return { msg, code };
  } catch {
    return { msg: trimmed.slice(0, 4000) };
  }
}

function friendlyAudioErrorMessage(httpStatus: number, msg: string, code?: string): string {
  const m = (msg || '').toLowerCase();
  // dashscope_speech / volc_speech 的 ASR 上游只有异步链路,sync 接口被打回时给清晰指引。
  // 兜底:Playground 自己已经在选这两家 model 时强制 async,这里走到说明是直接调 API 的用户。
  if (/synchronous ASR not supported|use AudioTranscribeSubmit/i.test(msg)) {
    return [t('playground.voice.err.asyncOnly1'), t('playground.voice.err.asyncOnly2'), t('playground.voice.err.asyncOnly3'), t('playground.voice.err.rawError', { msg })].join('\n');
  }
  // dashscope_speech / volc_speech 不接受 base64 / multipart 上传,只接受公网 URL。
  // Playground 已经自动锁定 URL 模式;走到这里说明是直接调 API 用了 audio_data 字段。
  if (/audio_url required|paraformer 不接受 base64|audio_url must be public/i.test(msg)) {
    return [t('playground.voice.err.urlOnly1'), t('playground.voice.err.urlOnly2'), t('playground.voice.err.urlOnly3'), t('playground.voice.err.rawError', { msg })].join('\n');
  }
  if (code === 'channel_not_found' || /no enabled .* channel|no available channel/i.test(msg)) {
    return [t('playground.voice.err.channelNotFound1'), t('playground.voice.err.channelNotFound2')].join('\n');
  }
  // MiniMax 业务错误码:2054 voice id not exist(我们前端列表只能列常用,300+ 不可能枚举完)
  if (/status_code=2054|voice id not exist|voice.*not.*exist/i.test(msg)) {
    return [t('playground.voice.err.voiceNotExist1'), t('playground.voice.err.voiceNotExist2'), t('playground.voice.err.voiceNotExist3'), t('playground.voice.err.rawError', { msg })].join('\n');
  }
  // MiniMax 业务错误码(其它常见):1000 invalid api key / 1004 unauthorized / 2013 invalid params
  if (/^minimax tts: status_code=/i.test(msg)) {
    return [t('playground.voice.err.minimaxBiz'), t('playground.voice.err.rawError', { msg })].join('\n');
  }
  if (httpStatus === 401 || httpStatus === 403) {
    return [t('playground.voice.err.unauthorized'), t('playground.voice.err.rawError', { msg })].join('\n');
  }
  if (httpStatus === 402 || code === 'insufficient_quota' || /insufficient.*quota/i.test(msg)) {
    return t('playground.voice.err.insufficientQuota');
  }
  if (httpStatus === 413 || /too large|exceed.*size/i.test(msg)) {
    return t('playground.voice.err.tooLarge', { multipart: formatBytes(MULTIPART_MAX_BYTES), json: formatBytes(JSON_AUDIO_MAX_BYTES) });
  }
  if (httpStatus === 415 || /unsupported.*(format|media)/i.test(m)) {
    return t('playground.voice.err.unsupportedFormat');
  }
  // 上游 404 —— 通常是「选了 ⚠ 角标的导入模型 + 上游不认这条路径 / model 名」
  // 例:用户选 gpt-realtime-whisper(model_sync 导入,OpenAI 官方不存在这个名字),
  // 后端透传给 openai 渠道 POST /v1/audio/transcriptions —— 如果你的 openai 渠道
  // base_url 是聚合站(不支持 audio 路径)或 model 名不对,上游就直接 404。
  if (httpStatus === 404 || /404.*not.*found|page not found|no such (url|path|endpoint)/i.test(m)) {
    return [t('playground.voice.err.notFound0'), t('playground.voice.err.notFound1'), t('playground.voice.err.notFound2'), t('playground.voice.err.notFound3'), t('playground.voice.err.rawError', { msg })].join('\n');
  }
  if (httpStatus === 504 || /context deadline|timeout|gateway time-?out/i.test(m)) {
    return t('playground.voice.err.upstreamTimeout');
  }
  if (httpStatus === 502 || httpStatus === 503) {
    return t('playground.voice.err.upstreamUnavailable', { status: httpStatus });
  }
  if (httpStatus === 0 || /failed to fetch|networkerror|load failed/i.test(m)) {
    return t('playground.voice.err.network');
  }
  return msg;
}

// classifyAudioModel 决定一个 audio 类模型该落到 ASR / TTS / Realtime / Unknown 哪个桶。
//
// 为什么需要这个 helper:数据库里 audio 类模型 type 字段有三种来源:
//   1) migration 045 seed 的细分 type=audio.transcribe / audio.speech(11 个 ASR + 3 个 TTS)
//   2) admin 手动建的同款细分 type(走管理后台「新建模型」表单)
//   3) model_sync_service 从上游(/v1/models)批量导入的统一 type=audio
//      ([model_sync_service.go:734](backend/internal/service/model_sync_service.go#L734) 把
//       name 含 whisper/-tts/audio 的全归到 'audio' 单字符串,丢失 ASR vs TTS 语义)
//
// 第 3 种情况下后端 provider 通常没实现 SpeechToTextProvider/TextToSpeechProvider —— 后端
// audio 路由硬编码走 asr_tencent/tts_tencent 渠道(见 service/relay_audio.go:29-30),model
// 名只是透传给腾讯 provider,腾讯不认 gpt-realtime-* / minimax-speech 这些上游 model 名
// 会返 InvalidParameter。前端把这些行展示出来时要带 imported chip 警告用户,选 verified
// 的更稳妥。
type AudioClass = 'asr' | 'tts' | 'realtime' | 'unknown';

function classifyAudioModel(m: { type?: string; name?: string; tags?: string[] }): AudioClass {
  const type = (m.type || '').toLowerCase();
  const name = (m.name || '').toLowerCase();
  const tags = Array.isArray(m.tags) ? m.tags.map((t) => String(t).toLowerCase()) : [];

  // 声音复刻资源模型(type=audio.speech.clone,名如 *-voice-clone)是"克隆音色"计费/资源行,
  // 不是合成/识别模型 —— 不能出现在 TTS / ASR 下拉里(否则被名字里的 -voice 误判成 tts)。
  // 克隆走独立的「声音复刻」面板,这里直接排除。
  if (type === 'audio.speech.clone' || type === 'audio.clone' || name.includes('voice-clone') || name.includes('voice_clone')) {
    return 'unknown';
  }

  // 细分 type 直接定:045 seed + admin 手建走这条
  if (type === 'audio.transcribe') return 'asr';
  if (type === 'audio.speech') return 'tts';
  if (type === 'audio.realtime') return 'realtime';

  // 明确语义 tag 先于 realtime 标签(否则 gpt-realtime-whisper 会被错归 realtime)
  if (tags.includes('asr') || tags.includes('stt') || tags.includes('transcribe')) return 'asr';
  if (tags.includes('tts') || tags.includes('speech')) return 'tts';

  // 名字启发式(顺序敏感):whisper / asr / transcrib / -stt 一定是 ASR
  if (name.includes('whisper') || name.includes('-asr') || name.includes('asr-') || name.includes('transcrib') || name.includes('-stt')) return 'asr';
  // -tts / tts- / -speech / speech- / -voice 一定是 TTS
  if (name.includes('-tts') || name.includes('tts-') || name.includes('-speech') || name.startsWith('speech-') || name.includes('-voice')) return 'tts';
  // 兜底 realtime(双向流,本轮 Playground 不支持,但识别出来好歹两边都不展)
  if (name.includes('realtime') || name.includes('-live') || name.includes('live-')) return 'realtime';
  return 'unknown';
}

// audioVerified 仅作排序用 —— 细分 type(045/053 seed)= verified,排在前面;
// 通用 audio 占位(model_sync 自动导入)排在后面。Phase 86 起 chip 不再用"verified/imported"
// 二元概念,改成按 provider_type 显示厂商色,让用户一眼看出哪家。
function audioVerified(m: { type?: string }): boolean {
  const t = (m.type || '').toLowerCase();
  return t === 'audio.transcribe' || t === 'audio.speech';
}

// AudioProviderInfo 是 Phase 86 的核心展示语义:不再标"verified/imported",而是按
// ai_models.provider_type 给厂商色 chip,让用户认清"这是哪家上游"。
// 走完整 model→provider_type→channel 路由的模型(045+053 seed)provider_type 非空,
// 显示明确品牌色;旧的 model_sync 导入 type=audio 占位行 provider_type 通常也非空
// (但可能是 unknown 字符串),走默认灰色 chip 提示模糊归类。
type AudioProviderInfo = {
  color: 'green' | 'blue' | 'purple' | 'orange' | 'default';
  label: string;
  providerType: string;
};
function audioProviderInfo(m: { provider_type?: string; type?: string }): AudioProviderInfo {
  const pt = (m.provider_type || '').toLowerCase();
  switch (pt) {
    case 'asr_tencent':
      return { color: 'green', label: t('playground.voice.provider.tencentAsr'), providerType: pt };
    case 'tts_tencent':
      return { color: 'green', label: t('playground.voice.provider.tencentTts'), providerType: pt };
    case 'openai':
      return { color: 'blue', label: 'OpenAI', providerType: pt };
    case 'minimax':
      return { color: 'purple', label: 'MiniMax', providerType: pt };
    case 'gemini':
      return { color: 'orange', label: 'Gemini', providerType: pt };
    default:
      return { color: 'default', label: pt || t('playground.voice.provider.uncategorized'), providerType: pt };
  }
}

// MediaRecorder 浏览器兼容性挑选:优先 opus,降级 mp4。
// 选不到任何受支持的 mimeType 时返回 undefined 让 MediaRecorder 自己挑默认。
function pickRecorderMime(): { mime?: string; format: string } {
  if (typeof MediaRecorder === 'undefined') return { format: 'webm' };
  const candidates = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm', 'audio/mp4'];
  for (const c of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(c)) {
        const format = c.includes('opus') ? 'opus' : c.includes('mp4') ? 'm4a' : 'webm';
        return { mime: c, format };
      }
    } catch {
      /* IE-ish or shim: ignore */
    }
  }
  return { format: 'webm' };
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const result = String(r.result || '');
      // 去掉 "data:audio/xxx;base64," 前缀,只留 base64 字符
      const idx = result.indexOf(';base64,');
      resolve(idx >= 0 ? result.slice(idx + ';base64,'.length) : result);
    };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

// ---------- 主组件 ----------

export default function VoicePanel() {
  const intl = useIntl();
  const [mode, setMode] = useState<'asr' | 'tts'>('asr');

  return (
    <div className="pg-voice">
      <div style={{ marginBottom: 16, textAlign: 'center' }}>
        <Segmented
          size="large"
          value={mode}
          onChange={(v) => setMode(v as 'asr' | 'tts')}
          options={[
            {
              label: (
                <span>
                  <AudioOutlined /> {intl.formatMessage({ id: 'playground.voice.tabAsr' })}
                </span>
              ),
              value: 'asr',
            },
            {
              label: (
                <span>
                  <CustomerServiceOutlined /> {intl.formatMessage({ id: 'playground.voice.tabTts' })}
                </span>
              ),
              value: 'tts',
            },
          ]}
        />
      </div>
      {mode === 'asr' ? <ASRMode /> : <TTSMode />}
    </div>
  );
}

// ---------- ASR 子模式 ----------

type ASRModelOpt = {
  value: string;
  label: string;
  tags?: string[];
  verified?: boolean;
  providerInfo: AudioProviderInfo;
};

function ASRMode() {
  const intl = useIntl();
  const { apiKey } = usePlaygroundApiKey();
  const [models, setModels] = useState<ASRModelOpt[]>([]);
  const [modelName, setModelName] = useState<string>();

  const [input, setInput] = useState<'file' | 'url' | 'mic'>('file');
  const [routeMode, setRouteMode] = useState<RouteMode>('auto');
  const [channelName, setChannelName] = useState('');
  const [language, setLanguage] = useState('');

  const [file, setFile] = useState<File | null>(null);
  const [filePreviewURL, setFilePreviewURL] = useState<string>('');
  const [fileDurationMs, setFileDurationMs] = useState<number | undefined>();
  const [url, setURL] = useState('');

  const [recording, setRecording] = useState(false);
  const [recDurationMs, setRecDurationMs] = useState(0);
  const [recBlob, setRecBlob] = useState<Blob | null>(null);
  const [recPreviewURL, setRecPreviewURL] = useState<string>('');
  const [recFormat, setRecFormat] = useState<string>('webm');
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recChunksRef = useRef<Blob[]>([]);
  const recStartRef = useRef<number>(0);
  const recTimerRef = useRef<number | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [polling, setPolling] = useState(false);
  const [task, setTask] = useState<ASRTask | null>(null);
  const [syncResp, setSyncResp] = useState<ASRResponse | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  // 当前选中 model 的 provider_type 与 async-only 标记。async-only model(Paraformer-v2 /
  // 火山 ASR 大模型)同步上游不存在,选中后必须走 async 路径,否则会被后端打回。
  const selectedASRModel = models.find((x) => x.value === modelName);
  const selectedASRProviderType = selectedASRModel?.providerInfo.providerType;
  const asyncOnly = isAsyncOnlyASRProvider(selectedASRProviderType);

  // model 切换时,若新 model 是 async-only,强制 routeMode → 'async'(同步接口不存在)。
  // input 模式不锁 —— Phase 89e 起 backend 透明 ingest base64/multipart 到 AssetService,
  // file/mic 上传现在对 dashscope_speech / volc_speech 也能跑。
  useEffect(() => {
    if (asyncOnly && routeMode !== 'async') {
      setRouteMode('async');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelName, asyncOnly]);

  // 加载模型 + Token + 续作
  useEffect(() => {
    systemApi.models().then((res) => {
      const list: ASRModelOpt[] = ((res.data as any[]) || [])
        .filter((m) => m.enabled !== false && classifyAudioModel(m) === 'asr')
        .map((m) => ({
          value: m.name,
          label: m.display_name ? m.display_name : m.name,
          tags: Array.isArray(m.tags) ? m.tags : [],
          verified: audioVerified(m),
          providerInfo: audioProviderInfo(m),
        }))
        // verified(细分 type 045/053 seed)排前,通用 audio 占位排后,组内按名字稳定排序
        .sort((a, b) => {
          if (a.verified !== b.verified) return a.verified ? -1 : 1;
          return a.value.localeCompare(b.value);
        });
      setModels(list);
      if (list.length > 0) {
        // 默认 asr-16k-zh(045 seed 腾讯)→ whisper-1(053 seed openai)→ 第一个 verified → list[0]
        setModelName((prev) => {
          if (prev && list.some((x) => x.value === prev)) return prev;
          const zh = list.find((x) => x.value === 'asr-16k-zh');
          if (zh) return zh.value;
          const whisper = list.find((x) => x.value === 'whisper-1');
          if (whisper) return whisper.value;
          const v = list.find((x) => x.verified);
          return (v || list[0]).value;
        });
      }
    });

    const saved = localStorage.getItem(LS_ASR_TASK);
    if (saved) {
      try {
        const t = JSON.parse(saved) as ASRTask;
        setTask(t);
        if (t.upstream_id && (t.status === 'queued' || t.status === 'running')) {
          // 续作时 token 列表可能还没到位,延一帧调度
          window.setTimeout(() => schedulePoll(t.upstream_id!, t._channel || '', t._model || '', 1500), 50);
        }
      } catch {}
    }
    return () => {
      if (pollRef.current) window.clearTimeout(pollRef.current);
      if (recTimerRef.current) window.clearInterval(recTimerRef.current);
      stopMediaTracks();
      if (filePreviewURL) URL.revokeObjectURL(filePreviewURL);
      if (recPreviewURL) URL.revokeObjectURL(recPreviewURL);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 保存任务进度到 localStorage
  useEffect(() => {
    if (task) localStorage.setItem(LS_ASR_TASK, JSON.stringify(task));
  }, [task]);

  // 文件接入:存文件 + 抠时长(<audio>.duration)
  const acceptFile = async (f: File) => {
    if (f.size > MULTIPART_MAX_BYTES) {
      message.warning(intl.formatMessage({ id: 'playground.voice.asr.fileExceedMultipart' }, { size: formatBytes(f.size), max: formatBytes(MULTIPART_MAX_BYTES) }));
      return;
    }
    if (filePreviewURL) URL.revokeObjectURL(filePreviewURL);
    const purl = URL.createObjectURL(f);
    setFile(f);
    setFilePreviewURL(purl);
    setFileDurationMs(undefined);
    // 通过 audio 元素读 duration
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.src = purl;
    audio.onloadedmetadata = () => {
      if (audio.duration && isFinite(audio.duration)) {
        setFileDurationMs(Math.round(audio.duration * 1000));
      }
    };
  };

  const uploadProps: UploadProps = {
    accept: 'audio/*,.wav,.mp3,.m4a,.flac,.opus,.aac,.pcm,.webm,.ogg',
    multiple: false,
    showUploadList: false,
    beforeUpload: (f) => {
      void acceptFile(f as File);
      return false; // 阻止 antd 自动上传,我们手动管理
    },
  };

  // 麦克风录音:start/stop + chunks + 时长 ticker
  const startRecording = async () => {
    if (recording) return;
    if (typeof MediaRecorder === 'undefined') {
      message.error(intl.formatMessage({ id: 'playground.voice.asr.noMediaRecorder' }));
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const { mime, format } = pickRecorderMime();
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      recorderRef.current = rec;
      recChunksRef.current = [];
      setRecFormat(format);
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) recChunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const blob = new Blob(recChunksRef.current, {
          type: mime || 'audio/webm',
        });
        if (recPreviewURL) URL.revokeObjectURL(recPreviewURL);
        const purl = URL.createObjectURL(blob);
        setRecBlob(blob);
        setRecPreviewURL(purl);
        // 把 mic 轨道关掉,否则浏览器 tab 一直显示红点
        stream.getTracks().forEach((t) => t.stop());
      };
      rec.start();
      recStartRef.current = Date.now();
      setRecDurationMs(0);
      recTimerRef.current = window.setInterval(() => {
        setRecDurationMs(Date.now() - recStartRef.current);
      }, 100);
      setRecording(true);
    } catch (e: any) {
      message.error(intl.formatMessage({ id: 'playground.voice.asr.micFailed' }, { err: e?.message || e }));
    }
  };

  const stopRecording = () => {
    if (!recording) return;
    try {
      recorderRef.current?.stop();
    } catch {}
    if (recTimerRef.current) {
      window.clearInterval(recTimerRef.current);
      recTimerRef.current = null;
    }
    setRecording(false);
  };

  const clearRecording = () => {
    if (recPreviewURL) URL.revokeObjectURL(recPreviewURL);
    setRecBlob(null);
    setRecPreviewURL('');
    setRecDurationMs(0);
  };

  const clearFile = () => {
    if (filePreviewURL) URL.revokeObjectURL(filePreviewURL);
    setFile(null);
    setFilePreviewURL('');
    setFileDurationMs(undefined);
  };

  const stopMediaTracks = () => {
    try {
      recorderRef.current?.stream?.getTracks().forEach((t) => t.stop());
    } catch {}
  };

  // 决定本次提交走 sync 还是 async,以及 input 类型 → multipart/json
  const decideRouteAndPayload = async (): Promise<
    | {
        route: 'sync' | 'async';
        payload: FormData | object;
        contentType?: string;
      }
    | { error: string }
  > => {
    if (!modelName) return { error: intl.formatMessage({ id: 'playground.voice.asr.selectModel' }) };
    // URL 模式必须异步(腾讯同步不接 URL)
    if (input === 'url') {
      const u = url.trim();
      if (!u) return { error: intl.formatMessage({ id: 'playground.voice.asr.enterUrl' }) };
      // async-only provider 一律 async;否则 URL 模式仍按 routeMode(sync 会下面 error 出去)
      const route: 'sync' | 'async' = asyncOnly ? 'async' : routeMode === 'sync' ? 'sync' : 'async';
      if (route === 'sync') {
        return {
          error: intl.formatMessage({ id: 'playground.voice.asr.syncNoUrl' }),
        };
      }
      const payload: any = { model: modelName, url: u };
      if (channelName.trim()) payload.channel = channelName.trim();
      if (language.trim()) payload.language = language.trim();
      return { route: 'async', payload };
    }
    // file 或 mic:看大小 / 时长决路由
    let blob: Blob | null = null;
    let filename = '';
    let format = '';
    if (input === 'file') {
      if (!file) return { error: intl.formatMessage({ id: 'playground.voice.asr.selectFile' }) };
      blob = file;
      filename = file.name;
      format = file.name.split('.').pop()?.toLowerCase() || '';
    } else {
      if (!recBlob) return { error: intl.formatMessage({ id: 'playground.voice.asr.recordFirst' }) };
      blob = recBlob;
      filename = `recording.${recFormat}`;
      format = recFormat;
    }
    const size = blob.size;
    if (size > MULTIPART_MAX_BYTES) {
      return { error: intl.formatMessage({ id: 'playground.voice.asr.sizeExceedMultipart' }, { size: formatBytes(size), max: formatBytes(MULTIPART_MAX_BYTES) }) };
    }
    let route: 'sync' | 'async';
    // async-only provider 一律走 async,无视 routeMode 选项(即便用户刚切到「强制同步」也兜住)。
    // 同时 useEffect 也会把 routeMode 拨回 async,这里是 defense in depth。
    if (asyncOnly) route = 'async';
    else if (routeMode === 'sync') route = 'sync';
    else if (routeMode === 'async') route = 'async';
    else route = size <= SYNC_FILE_THRESHOLD_BYTES ? 'sync' : 'async';

    if (route === 'sync') {
      // multipart 上传(对齐 OpenAI Whisper 习惯)
      const fd = new FormData();
      fd.append('file', blob, filename);
      fd.append('model', modelName);
      if (format) fd.append('format', format);
      if (channelName.trim()) fd.append('channel', channelName.trim());
      if (language.trim()) fd.append('language', language.trim());
      return { route, payload: fd };
    }
    // async 走 JSON + base64
    if (size > JSON_AUDIO_MAX_BYTES) {
      return {
        error: intl.formatMessage({ id: 'playground.voice.asr.asyncJsonExceed' }, { max: formatBytes(JSON_AUDIO_MAX_BYTES), size: formatBytes(size) }),
      };
    }
    const b64 = await blobToBase64(blob);
    const payload: any = {
      model: modelName,
      audio_data: b64,
    };
    if (format) payload.format = format;
    if (channelName.trim()) payload.channel = channelName.trim();
    if (language.trim()) payload.language = language.trim();
    return { route, payload };
  };

  // schedulePoll / pollOnce 都接 mdl(原 Submit 时用的 model),透传给 backend Fetch 查询参数。
  // 不传 model 会落到 backend 老 asr_tencent fallback,把 UUID task_id 当 int ParseInt 报错。
  const schedulePoll = (id: string, ch: string, mdl: string, delay = 3000) => {
    if (pollRef.current) window.clearTimeout(pollRef.current);
    pollRef.current = window.setTimeout(() => pollOnce(id, ch, mdl, true), delay);
  };

  const pollOnce = async (id: string, ch: string, mdl: string, auto = false) => {
    if (!apiKey) {
      // Key 未填,稍后重试
      schedulePoll(id, ch, mdl, 1000);
      return;
    }
    if (!auto) setPolling(true);
    try {
      const params = new URLSearchParams();
      if (mdl) params.set('model', mdl);
      if (ch) params.set('channel', ch);
      const q = params.toString() ? `?${params.toString()}` : '';
      const res = await fetch(apiURL(`/v1/audio/transcriptions/${encodeURIComponent(id)}${q}`), {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const text = await res.text();
      if (!res.ok) {
        const { msg, code } = extractErrMsg(text, res.status);
        // 5xx / 网络错保留任务,继续轮询(轻量退避)
        if (auto && (res.status === 0 || res.status >= 500)) {
          setErrMsg(intl.formatMessage({ id: 'playground.voice.refreshRetry' }, { msg: friendlyAudioErrorMessage(res.status, msg, code) }));
          schedulePoll(id, ch, mdl, 5000);
          return;
        }
        setErrMsg(friendlyAudioErrorMessage(res.status, msg, code));
        return;
      }
      const t = JSON.parse(text) as ASRTask;
      setTask((prev) => ({ ...prev, ...t, _channel: ch, _model: prev?._model || mdl }));
      setErrMsg(null);
      if (t.status === 'queued' || t.status === 'running') {
        schedulePoll(id, ch, mdl, 3000);
      }
    } catch (e: any) {
      const msg = String(e?.message || e);
      if (auto) {
        setErrMsg(intl.formatMessage({ id: 'playground.voice.refreshRetry' }, { msg: friendlyAudioErrorMessage(0, msg) }));
        schedulePoll(id, ch, mdl, 5000);
        return;
      }
      setErrMsg(friendlyAudioErrorMessage(0, msg));
    } finally {
      if (!auto) setPolling(false);
    }
  };

  const submit = async () => {
    if (!apiKey) return message.warning(intl.formatMessage({ id: 'playground.index.fillKeyFirst' }));

    const decided = await decideRouteAndPayload();
    if ('error' in decided) {
      message.warning(decided.error);
      return;
    }

    setSubmitting(true);
    setErrMsg(null);
    setTask(null);
    setSyncResp(null);
    if (pollRef.current) window.clearTimeout(pollRef.current);

    try {
      const url = decided.route === 'sync' ? '/v1/audio/transcriptions' : '/v1/audio/transcriptions/async';
      const init: RequestInit = {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
      };
      if (decided.payload instanceof FormData) {
        init.body = decided.payload;
        // multipart 让浏览器自己加 boundary,别手动设 Content-Type
      } else {
        (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
        init.body = JSON.stringify(decided.payload);
      }
      const res = await fetch(apiURL(url), init);
      const text = await res.text();
      if (!res.ok) {
        const { msg, code } = extractErrMsg(text, res.status);
        setErrMsg(friendlyAudioErrorMessage(res.status, msg, code));
        return;
      }
      if (decided.route === 'sync') {
        const data = JSON.parse(text) as ASRResponse;
        setSyncResp(data);
      } else {
        const t = JSON.parse(text) as ASRTask;
        const ch = (decided.payload as any).channel || '';
        const enriched: ASRTask = {
          ...t,
          _channel: ch,
          _model: modelName,
          _created_at: Math.floor(Date.now() / 1000),
        };
        setTask(enriched);
        if (enriched.upstream_id && (enriched.status === 'queued' || enriched.status === 'running')) {
          schedulePoll(enriched.upstream_id, ch, modelName || '', 2000);
        }
      }
    } catch (e: any) {
      setErrMsg(friendlyAudioErrorMessage(0, String(e?.message || e)));
    } finally {
      setSubmitting(false);
    }
  };

  const clearResult = () => {
    if (pollRef.current) window.clearTimeout(pollRef.current);
    setTask(null);
    setSyncResp(null);
    setErrMsg(null);
    localStorage.removeItem(LS_ASR_TASK);
  };

  // 派生:当前结果展示用的统一 view(同步直接,异步 task.text 等)
  const result = syncResp || task;
  const isInFlight = task && (task.status === 'queued' || task.status === 'running');

  return (
    <div className="pg-voice-grid">
      {/* 左:输入 */}
      <Card
        className="pg-voice-card"
        title={
          <span>
            <AudioOutlined /> {intl.formatMessage({ id: 'playground.voice.asr.cardTitle' })}
          </span>
        }
        extra={<span className="pg-voice-path">POST /v1/audio/transcriptions[/async]</span>}
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <div>
            <div className="pg-voice-label">
              {intl.formatMessage({ id: 'playground.voice.modelLabel' })}
              <span style={{ marginLeft: 8, fontWeight: 400, color: '#888', fontSize: 12 }}>· {intl.formatMessage({ id: 'playground.voice.candidateCount' }, { count: models.length })}</span>
            </div>
            <Select
              style={{ width: '100%' }}
              placeholder={models.length === 0 ? intl.formatMessage({ id: 'playground.voice.asr.noModelMounted' }) : intl.formatMessage({ id: 'playground.voice.asr.selectModelPh' })}
              notFoundContent={
                <div style={{ padding: '12px 8px', color: '#888', fontSize: 12, lineHeight: 1.6 }}>
                  {intl.formatMessage({ id: 'playground.voice.asr.noModelTip' })}
                  <ol style={{ paddingLeft: 18, margin: '4px 0' }}>
                    <li>
                      {intl.formatMessage({ id: 'playground.voice.asr.noModelTip1a' })} <code>migrations/045</code>{intl.formatMessage({ id: 'playground.voice.asr.noModelTip1b' })} <code>asr-*</code>{intl.formatMessage({ id: 'playground.voice.asr.noModelTip1c' })} <code>053</code>(<code>whisper-1</code>);
                    </li>
                    <li>
                      {intl.formatMessage({ id: 'playground.voice.asr.noModelTip2a' })} <code>models</code> {intl.formatMessage({ id: 'playground.voice.asr.noModelTip2b' })} <code>type=asr_tencent</code> {intl.formatMessage({ id: 'playground.voice.asr.noModelTip2c' })} <code>type=openai</code> {intl.formatMessage({ id: 'playground.voice.asr.noModelTip2d' })}
                    </li>
                    <li>
                      {intl.formatMessage({ id: 'playground.voice.asr.noModelTip3a' })} <code>enabled=true</code>。
                    </li>
                  </ol>
                </div>
              }
              options={models.map((m) => ({
                value: m.value,
                label: (
                  <span>
                    {/* verified ✓ / 通用 ⚠ 角标 —— 区分 045/053 seed 与 model_sync 自动导入的占位 */}
                    <span
                      style={{
                        display: 'inline-block',
                        width: 16,
                        textAlign: 'center',
                        marginRight: 4,
                        color: m.verified ? '#52c41a' : '#faad14',
                        fontWeight: 600,
                      }}
                      title={m.verified ? intl.formatMessage({ id: 'playground.voice.verifiedTip' }) : intl.formatMessage({ id: 'playground.voice.importedTip' })}
                    >
                      {m.verified ? '✓' : '⚠'}
                    </span>
                    {m.label}
                    <Tag color={m.providerInfo.color} style={{ marginLeft: 8, fontSize: 11 }} title={`provider_type=${m.providerInfo.providerType || intl.formatMessage({ id: 'playground.voice.emptyValue' })}`}>
                      {m.providerInfo.label}
                    </Tag>
                    {m.tags?.includes('async') && (
                      <Tag color="purple" style={{ marginLeft: 4, fontSize: 11 }}>
                        async
                      </Tag>
                    )}
                  </span>
                ),
              }))}
              value={modelName}
              onChange={setModelName}
              showSearch
              optionFilterProp="value"
              disabled={submitting || !!isInFlight || recording}
            />
            <div className="pg-voice-hint">
              <span style={{ color: '#52c41a', fontWeight: 600 }}>✓</span> {intl.formatMessage({ id: 'playground.voice.asr.hintVerified' })}
              <span style={{ color: '#faad14', fontWeight: 600, marginLeft: 8 }}>⚠</span> {intl.formatMessage({ id: 'playground.voice.asr.hintImportedA' })}<code>type=audio</code>{intl.formatMessage({ id: 'playground.voice.asr.hintImportedB' })}
              <Tag color="green" style={{ fontSize: 11 }}>
                {intl.formatMessage({ id: 'playground.voice.brand.tencent' })}
              </Tag>
              <Tag color="blue" style={{ fontSize: 11, marginLeft: 4 }}>
                OpenAI
              </Tag>
              <Tag color="purple" style={{ fontSize: 11, marginLeft: 4 }}>
                MiniMax
              </Tag>
              {intl.formatMessage({ id: 'playground.voice.asr.hintClose' })}
              <code>asr-16k-*</code> {intl.formatMessage({ id: 'playground.voice.asr.hintAsr16k' })}<code>asr-recfile-*</code> {intl.formatMessage({ id: 'playground.voice.asr.hintAsrRecfile' })}<code>whisper-1</code> {intl.formatMessage({ id: 'playground.voice.asr.hintWhisper' })}
            </div>
          </div>

          <ApiKeyField />

          <div>
            <div className="pg-voice-label">{intl.formatMessage({ id: 'playground.voice.asr.inputMethod' })}</div>
            <Segmented
              value={input}
              onChange={(v) => setInput(v as 'file' | 'url' | 'mic')}
              options={[
                { value: 'file', label: intl.formatMessage({ id: 'playground.voice.asr.inputFile' }) },
                { value: 'url', label: 'URL' },
                { value: 'mic', label: intl.formatMessage({ id: 'playground.voice.asr.inputMic' }) },
              ]}
              disabled={submitting || !!isInFlight || recording}
              block
            />
          </div>

          {input === 'file' && (
            <div>
              <Upload {...uploadProps} disabled={submitting || !!isInFlight}>
                <Button icon={<UploadOutlined />} disabled={submitting || !!isInFlight}>
                  {intl.formatMessage({ id: 'playground.voice.asr.selectFileBtn' })}
                </Button>
              </Upload>
              {file && (
                <div className="pg-voice-file-meta">
                  <div className="pg-voice-file-name" title={file.name}>
                    📄 {file.name}
                  </div>
                  <div className="pg-voice-file-info">
                    <span>{formatBytes(file.size)}</span>
                    {fileDurationMs !== undefined && <span>· {intl.formatMessage({ id: 'playground.voice.asr.duration' }, { dur: formatMs(fileDurationMs) })}</span>}
                    <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={clearFile} disabled={submitting || !!isInFlight}>
                      {intl.formatMessage({ id: 'playground.voice.asr.remove' })}
                    </Button>
                  </div>
                  {filePreviewURL && <audio src={filePreviewURL} controls style={{ width: '100%', marginTop: 8 }} />}
                </div>
              )}
              <div className="pg-voice-hint">
                {intl.formatMessage({ id: 'playground.voice.asr.fileHint' }, { sync: formatBytes(SYNC_FILE_THRESHOLD_BYTES), multipart: formatBytes(MULTIPART_MAX_BYTES) })}
              </div>
            </div>
          )}

          {input === 'url' && (
            <div>
              <Input placeholder={intl.formatMessage({ id: 'playground.voice.asr.urlPh' })} value={url} onChange={(e) => setURL(e.target.value)} disabled={submitting || !!isInFlight} allowClear />
              <div className="pg-voice-hint">{intl.formatMessage({ id: 'playground.voice.asr.urlHint' })}</div>
            </div>
          )}

          {input === 'mic' && (
            <div>
              <Space>
                {!recording && !recBlob && (
                  <Button type="primary" icon={<AudioOutlined />} onClick={startRecording} disabled={submitting || !!isInFlight}>
                    {intl.formatMessage({ id: 'playground.voice.asr.startRec' })}
                  </Button>
                )}
                {recording && (
                  <Button danger icon={<PauseCircleOutlined />} onClick={stopRecording}>
                    {intl.formatMessage({ id: 'playground.voice.asr.stopRec' }, { dur: formatMs(recDurationMs) })}
                  </Button>
                )}
                {!recording && recBlob && (
                  <>
                    <Tag color="green">
                      {intl.formatMessage({ id: 'playground.voice.asr.recorded' }, { dur: formatMs(recDurationMs), size: formatBytes(recBlob.size), fmt: recFormat })}
                    </Tag>
                    <Button icon={<DeleteOutlined />} onClick={clearRecording} disabled={submitting || !!isInFlight}>
                      {intl.formatMessage({ id: 'playground.voice.asr.reRec' })}
                    </Button>
                  </>
                )}
              </Space>
              {recPreviewURL && <audio src={recPreviewURL} controls style={{ width: '100%', marginTop: 8 }} />}
              <div className="pg-voice-hint">{intl.formatMessage({ id: 'playground.voice.asr.micHint' })}</div>
            </div>
          )}

          <div className="pg-voice-row">
            <div style={{ flex: 1 }}>
              <div className="pg-voice-label">
                {intl.formatMessage({ id: 'playground.voice.routeMode' })}
                {asyncOnly && <span style={{ marginLeft: 8, color: '#fa8c16', fontSize: 12, fontWeight: 400 }}>· {intl.formatMessage({ id: 'playground.voice.asyncLocked' })}</span>}
              </div>
              <Segmented
                value={routeMode}
                onChange={(v) => setRouteMode(v as RouteMode)}
                options={[
                  { value: 'auto', label: intl.formatMessage({ id: 'playground.voice.routeAuto' }), disabled: asyncOnly },
                  { value: 'sync', label: intl.formatMessage({ id: 'playground.voice.routeSync' }), disabled: asyncOnly },
                  { value: 'async', label: intl.formatMessage({ id: 'playground.voice.routeAsync' }) },
                ]}
                disabled={submitting || !!isInFlight}
              />
            </div>
          </div>

          <details>
            <summary style={{ cursor: 'pointer', color: '#666', fontSize: 13 }}>{intl.formatMessage({ id: 'playground.voice.advanced' })}</summary>
            <div style={{ marginTop: 12 }}>
              <div className="pg-voice-row">
                <div style={{ flex: 1 }}>
                  <div className="pg-voice-label">{intl.formatMessage({ id: 'playground.voice.channelName' })}</div>
                  <Input placeholder={intl.formatMessage({ id: 'playground.voice.channelPh' })} value={channelName} onChange={(e) => setChannelName(e.target.value)} disabled={submitting || !!isInFlight} />
                </div>
                <div style={{ flex: 1 }}>
                  <div className="pg-voice-label">{intl.formatMessage({ id: 'playground.voice.asr.langHint' })}</div>
                  <Input placeholder={intl.formatMessage({ id: 'playground.voice.asr.langPh' })} value={language} onChange={(e) => setLanguage(e.target.value)} disabled={submitting || !!isInFlight} />
                </div>
              </div>
            </div>
          </details>

          <Button type="primary" size="large" block icon={submitting ? <LoadingOutlined /> : <SendOutlined />} onClick={submit} loading={submitting} disabled={!modelName || !apiKey || !!isInFlight || recording}>
            {submitting ? intl.formatMessage({ id: 'playground.voice.submitting' }) : isInFlight ? intl.formatMessage({ id: 'playground.voice.asr.recognizing' }) : intl.formatMessage({ id: 'playground.voice.asr.startRecognize' })}
          </Button>
        </Space>
      </Card>

      {/* 右:结果 */}
      <Card
        className="pg-voice-card"
        title={<span>{intl.formatMessage({ id: 'playground.voice.asr.resultTitle' })}</span>}
        extra={
          task || syncResp || errMsg ? (
            <Space size="small">
              {isInFlight && task?.upstream_id && (
                <Button size="small" icon={<ReloadOutlined spin={polling} />} onClick={() => pollOnce(task.upstream_id!, task._channel || '', task._model || '')}>
                  {intl.formatMessage({ id: 'playground.voice.refresh' })}
                </Button>
              )}
              <Button size="small" onClick={clearResult}>
                {intl.formatMessage({ id: 'playground.voice.clear' })}
              </Button>
            </Space>
          ) : null
        }
      >
        {!result && !errMsg && (
          <div className="pg-voice-empty">
            <Empty image={<AudioOutlined style={{ fontSize: 48, color: '#ccc' }} />} imageStyle={{ height: 60 }} description={<span style={{ color: '#999' }}>{intl.formatMessage({ id: 'playground.voice.asr.emptyHint' })}</span>} />
          </div>
        )}

        {errMsg && !result && <Alert type="error" showIcon message={intl.formatMessage({ id: 'playground.voice.asr.failed' })} description={<pre className="pg-voice-err-pre">{errMsg}</pre>} />}

        {/* 异步进行中 */}
        {task && isInFlight && (
          <div className="pg-voice-empty">
            <Spin indicator={<LoadingOutlined style={{ fontSize: 36 }} spin />} size="large" />
            <div style={{ marginTop: 16, color: '#555', fontWeight: 500 }}>{statusText(task.status)}</div>
            <div style={{ marginTop: 4, color: '#888', fontSize: 13 }}>
              upstream_id: <code>{task.upstream_id}</code> · {intl.formatMessage({ id: 'playground.voice.autoRefresh' })}
            </div>
            {errMsg && <Alert type="warning" showIcon message={errMsg} style={{ marginTop: 16 }} />}
          </div>
        )}

        {/* 同步/异步 succeeded */}
        {result && (syncResp || task?.status === 'succeeded') && (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <div className="pg-voice-result-meta">
              {task?.status && <Tag color={statusColor(task.status)}>{statusText(task.status)}</Tag>}
              {result.duration_ms !== undefined && (
                <span>
                  {intl.formatMessage({ id: 'playground.voice.asr.audioDuration' })} <b>{formatMs(result.duration_ms)}</b>
                </span>
              )}
              {result.request_id && (
                <span style={{ color: '#888' }}>
                  req_id <code>{result.request_id}</code>
                </span>
              )}
            </div>
            <div>
              <div className="pg-voice-label">{intl.formatMessage({ id: 'playground.voice.asr.recognizedText' })}</div>
              <TextArea value={result.text || ''} autoSize={{ minRows: 4, maxRows: 16 }} readOnly style={{ background: '#fafbfc' }} />
              {(result.text || '').length > 0 && (
                <div style={{ marginTop: 6, textAlign: 'right' }}>
                  <Button
                    size="small"
                    type="text"
                    onClick={() => {
                      navigator.clipboard?.writeText(result.text || '');
                      message.success(intl.formatMessage({ id: 'common.copied' }));
                    }}
                  >
                    {intl.formatMessage({ id: 'playground.voice.asr.copyAll' })}
                  </Button>
                </div>
              )}
            </div>
            {(result.segments?.length || 0) > 0 && (
              <Collapse
                size="small"
                items={[
                  {
                    key: 'segs',
                    label: intl.formatMessage({ id: 'playground.voice.asr.segTimeline' }, { count: result.segments!.length }),
                    children: (
                      <div className="pg-voice-seg-list">
                        {result.segments!.map((s, i) => (
                          <div key={i} className="pg-voice-seg-row">
                            <code className="pg-voice-seg-time">
                              [{formatMs(s.start_ms)} - {formatMs(s.end_ms)}]
                            </code>
                            {s.speaker && <Tag>{s.speaker}</Tag>}
                            <span>{s.text}</span>
                          </div>
                        ))}
                      </div>
                    ),
                  },
                ]}
              />
            )}
            {(result.words?.length || 0) > 0 && (
              <Collapse
                size="small"
                items={[
                  {
                    key: 'words',
                    label: intl.formatMessage({ id: 'playground.voice.asr.wordTimestamps' }, { count: result.words!.length }),
                    children: (
                      <div className="pg-voice-word-grid">
                        {result.words!.map((w, i) => (
                          <span key={i} className="pg-voice-word-item" title={`${formatMs(w.start_ms)}-${formatMs(w.end_ms)} prob=${w.prob ?? '-'}`}>
                            {w.word}
                          </span>
                        ))}
                      </div>
                    ),
                  },
                ]}
              />
            )}
          </Space>
        )}

        {/* 异步 failed */}
        {task?.status === 'failed' && <Alert type="error" showIcon message={<span style={{ fontWeight: 500 }}>{task.error_code ? `${task.error_code} · ` : ''}{intl.formatMessage({ id: 'playground.voice.asr.failed' })}</span>} description={<pre className="pg-voice-err-pre">{task.error_msg || errMsg || intl.formatMessage({ id: 'playground.voice.noUpstreamReason' })}</pre>} />}
      </Card>
    </div>
  );
}

// ---------- TTS 子模式 ----------

type TTSModelOpt = {
  value: string;
  label: string;
  verified?: boolean;
  providerInfo: AudioProviderInfo;
};

function TTSMode() {
  const intl = useIntl();
  const { apiKey } = usePlaygroundApiKey();
  const [models, setModels] = useState<TTSModelOpt[]>([]);
  const [modelName, setModelName] = useState<string>();

  const [text, setText] = useState(() => intl.formatMessage({ id: 'playground.voice.tts.defaultText' }));
  const [voice, setVoice] = useState<string>('alloy');
  // ttsLang 仅 kling 用:voice_language(zh/en)。同一 voice_id 在两种语种下发音不同,
  // 作为独立轴(voice 仍是纯 voice_id),提交时分开发 body.language。
  const [ttsLang, setTtsLang] = useState<'zh' | 'en'>('zh');
  // 用户自己的克隆音色(status=ready),注入音色下拉做建议;仅 provider 直通的厂商展示(见 cloneProviderTypeToVoiceProvider)。
  const [clonedVoices, setClonedVoices] = useState<{ voice_id: string; display_name: string; provider_type: string }[]>([]);
  const [speed, setSpeed] = useState<number>(1.0);
  const [format, setFormat] = useState<string>('mp3');
  const [sampleRate, setSampleRate] = useState<number | undefined>(16000);
  const [routeMode, setRouteMode] = useState<RouteMode>('auto');
  const [channelName, setChannelName] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [polling, setPolling] = useState(false);
  const [task, setTask] = useState<TTSTask | null>(null);
  const [syncResult, setSyncResult] = useState<TTSSyncResult | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  // 字数(按 rune 计,中文 1 = 1)与上游对齐(腾讯 char_count)。
  // 注意 JS 的 string.length 数 UTF-16 code unit,emoji / 罕见字会双数;
  // 用 Array.from 或 spread 拆 rune 更准。
  const charCount = Array.from(text).length;

  useEffect(() => {
    systemApi.models().then((res) => {
      const list: TTSModelOpt[] = ((res.data as any[]) || [])
        .filter((m) => m.enabled !== false && classifyAudioModel(m) === 'tts')
        .map((m) => ({
          value: m.name,
          label: m.display_name ? m.display_name : m.name,
          verified: audioVerified(m),
          providerInfo: audioProviderInfo(m),
        }))
        .sort((a, b) => {
          if (a.verified !== b.verified) return a.verified ? -1 : 1;
          return a.value.localeCompare(b.value);
        });
      setModels(list);
      if (list.length > 0) {
        // 默认 tencent-tts-standard(045)→ tts-1(053 openai)→ speech-2.8-turbo(053 minimax)→ 第一个 verified → list[0]
        setModelName((prev) => {
          if (prev && list.some((x) => x.value === prev)) return prev;
          for (const target of ['tencent-tts-standard', 'tts-1', 'speech-2.8-turbo']) {
            const hit = list.find((x) => x.value === target);
            if (hit) return hit.value;
          }
          const v = list.find((x) => x.verified);
          return (v || list[0]).value;
        });
      }
    });

    const saved = localStorage.getItem(LS_TTS_TASK);
    if (saved) {
      try {
        const t = JSON.parse(saved) as TTSTask;
        setTask(t);
        if (t.upstream_id && (t.status === 'queued' || t.status === 'running')) {
          window.setTimeout(() => schedulePoll(t.upstream_id!, t._channel || '', 1500), 50);
        }
      } catch {}
    }

    return () => {
      if (pollRef.current) window.clearTimeout(pollRef.current);
      // 释放上次同步 blob URL
      if (syncResult?.url) URL.revokeObjectURL(syncResult.url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 切模型时把默认 voice 重置 —— 仅在「音色上下文」(provider + tencent family)真的变化时才重置,
  // **不能**在用户每次输入 voice 时触发(否则自由输入的自定义 voice_id 会被立刻清掉)。
  const voiceCtxRef = useRef<string>('');
  useEffect(() => {
    if (!modelName) return;
    const m = models.find((x) => x.value === modelName);
    const pt = m?.providerInfo.providerType;
    const vp = modelProviderTypeToVoiceProvider(pt);
    const ml = (modelName || '').toLowerCase();
    const family = vp === 'tencent' ? (ml.includes('premium') ? 'premium' : ml.includes('hunyuan') ? 'hunyuan' : 'standard') : '';
    const ctxKey = `${vp}:${family}`;
    if (voiceCtxRef.current === ctxKey) return; // 上下文没变(只是用户在改 voice)→ 不动
    voiceCtxRef.current = ctxKey;
    const list = voicesForModel(modelName, pt);
    if (!list.some((v) => v.value === voice)) {
      setVoice(defaultVoiceForModel(modelName, pt));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelName, models]);

  // 拉用户自己的克隆音色(ready),注入音色下拉建议。依赖 apiKey(需要鉴权)。
  useEffect(() => {
    if (!apiKey) {
      setClonedVoices([]);
      return;
    }
    let aborted = false;
    fetch(apiURL('/v1/audio/voice_clones'), { headers: { Authorization: `Bearer ${apiKey}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (aborted || !body) return;
        const rows = (body.data as any[]) || [];
        setClonedVoices(
          rows
            .filter((v) => v.status === 'ready' && v.voice_id)
            .map((v) => ({
              voice_id: v.voice_id,
              display_name: v.display_name || v.voice_id,
              provider_type: v.provider_type || '',
            })),
        );
      })
      .catch(() => {
        if (!aborted) setClonedVoices([]);
      });
    return () => {
      aborted = true;
    };
  }, [apiKey]);

  useEffect(() => {
    if (task) localStorage.setItem(LS_TTS_TASK, JSON.stringify(task));
  }, [task]);

  const selectedModel = models.find((x) => x.value === modelName);
  const selectedProviderType = selectedModel?.providerInfo.providerType;
  const voiceProvider = modelProviderTypeToVoiceProvider(selectedProviderType);
  const voiceOptions = voicesForModel(modelName, selectedProviderType, voiceProvider === 'kling' ? ttsLang : undefined);

  // 合并音色建议:① 当前厂商的内置候选 ② 用户自己的克隆音色(provider 直通的那几家)。
  // 全部走自由输入(AutoComplete),所以官方没列全 / 自定义 voice_id 都能直接粘进去。
  const myCloneOptions = clonedVoices.filter((c) => cloneProviderTypeToVoiceProvider(c.provider_type) === voiceProvider).map((c) => ({ value: c.voice_id, label: `🎤 ${intl.formatMessage({ id: 'playground.voice.tts.myClone' }, { name: c.display_name, id: c.voice_id })}` }));
  const mergedVoiceOptions = [...myCloneOptions, ...voiceOptions.filter((v) => !myCloneOptions.some((m) => m.value === v.value)).map((v) => ({ value: v.value, label: v.label }))];

  // 决定路由(auto:>2000 字走异步)
  const decideRoute = (): 'sync' | 'async' | { error: string } => {
    if (charCount === 0) return { error: intl.formatMessage({ id: 'playground.voice.tts.enterText' }) };
    if (charCount > TTS_ASYNC_CHAR_LIMIT) return { error: intl.formatMessage({ id: 'playground.voice.tts.exceedAsyncLimit' }, { count: charCount, limit: TTS_ASYNC_CHAR_LIMIT }) };
    if (routeMode === 'sync') {
      if (charCount > TTS_SYNC_CHAR_LIMIT) return { error: intl.formatMessage({ id: 'playground.voice.tts.exceedSyncLimit' }, { count: charCount, limit: TTS_SYNC_CHAR_LIMIT }) };
      return 'sync';
    }
    if (routeMode === 'async') return 'async';
    return charCount > TTS_SYNC_CHAR_LIMIT ? 'async' : 'sync';
  };

  const schedulePoll = (id: string, ch: string, delay = 3000) => {
    if (pollRef.current) window.clearTimeout(pollRef.current);
    pollRef.current = window.setTimeout(() => pollOnce(id, ch, true), delay);
  };

  const pollOnce = async (id: string, ch: string, auto = false) => {
    if (!apiKey) {
      schedulePoll(id, ch, 1000);
      return;
    }
    if (!auto) setPolling(true);
    try {
      const q = ch ? `?channel=${encodeURIComponent(ch)}` : '';
      const res = await fetch(apiURL(`/v1/audio/speech/${encodeURIComponent(id)}${q}`), {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const text = await res.text();
      if (!res.ok) {
        const { msg, code } = extractErrMsg(text, res.status);
        if (auto && (res.status === 0 || res.status >= 500)) {
          setErrMsg(intl.formatMessage({ id: 'playground.voice.refreshRetry' }, { msg: friendlyAudioErrorMessage(res.status, msg, code) }));
          schedulePoll(id, ch, 5000);
          return;
        }
        setErrMsg(friendlyAudioErrorMessage(res.status, msg, code));
        return;
      }
      const t = JSON.parse(text) as TTSTask;
      setTask((prev) => ({ ...prev, ...t, _channel: ch, _model: prev?._model, _format: prev?._format }));
      setErrMsg(null);
      if (t.status === 'queued' || t.status === 'running') {
        schedulePoll(id, ch, 3000);
      }
    } catch (e: any) {
      const msg = String(e?.message || e);
      if (auto) {
        setErrMsg(intl.formatMessage({ id: 'playground.voice.refreshRetry' }, { msg: friendlyAudioErrorMessage(0, msg) }));
        schedulePoll(id, ch, 5000);
        return;
      }
      setErrMsg(friendlyAudioErrorMessage(0, msg));
    } finally {
      if (!auto) setPolling(false);
    }
  };

  const submit = async () => {
    if (!modelName) return message.warning(intl.formatMessage({ id: 'playground.voice.asr.selectModel' }));
    if (!apiKey) return message.warning(intl.formatMessage({ id: 'playground.index.fillKeyFirst' }));

    const decided = decideRoute();
    if (typeof decided !== 'string') {
      message.warning(decided.error);
      return;
    }

    setSubmitting(true);
    setErrMsg(null);
    setTask(null);
    if (syncResult?.url) URL.revokeObjectURL(syncResult.url);
    setSyncResult(null);
    if (pollRef.current) window.clearTimeout(pollRef.current);

    try {
      const body: any = {
        model: modelName,
        input: text,
        voice,
        response_format: format,
        speed,
      };
      if (sampleRate) body.sample_rate = sampleRate;
      if (voiceProvider === 'kling') body.language = ttsLang; // 可灵需显式 voice_language zh/en
      if (channelName.trim()) body.channel = channelName.trim();

      const url = decided === 'sync' ? '/v1/audio/speech' : '/v1/audio/speech/async';
      const res = await fetch(apiURL(url), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text();
        const { msg, code } = extractErrMsg(text, res.status);
        setErrMsg(friendlyAudioErrorMessage(res.status, msg, code));
        return;
      }
      if (decided === 'sync') {
        // 同步返回二进制
        const blob = await res.blob();
        const objURL = URL.createObjectURL(blob);
        setSyncResult({ blob, url: objURL, format, charCount });
      } else {
        const text = await res.text();
        const t = JSON.parse(text) as TTSTask;
        const enriched: TTSTask = {
          ...t,
          _channel: channelName.trim(),
          _model: modelName,
          _format: format,
          _created_at: Math.floor(Date.now() / 1000),
        };
        setTask(enriched);
        if (enriched.upstream_id && (enriched.status === 'queued' || enriched.status === 'running')) {
          schedulePoll(enriched.upstream_id, channelName.trim(), 2000);
        }
      }
    } catch (e: any) {
      setErrMsg(friendlyAudioErrorMessage(0, String(e?.message || e)));
    } finally {
      setSubmitting(false);
    }
  };

  const clearResult = () => {
    if (pollRef.current) window.clearTimeout(pollRef.current);
    if (syncResult?.url) URL.revokeObjectURL(syncResult.url);
    setSyncResult(null);
    setTask(null);
    setErrMsg(null);
    localStorage.removeItem(LS_TTS_TASK);
  };

  const isInFlight = task && (task.status === 'queued' || task.status === 'running');
  // 同步 / 异步终态 audio src
  const playableSrc = syncResult?.url || (task?.status === 'succeeded' ? task.audio_url : '') || '';
  const downloadName = `tts-${modelName || 'audio'}-${Date.now()}.${format}`;

  return (
    <div className="pg-voice-grid">
      {/* 左:输入 */}
      <Card
        className="pg-voice-card"
        title={
          <span>
            <CustomerServiceOutlined /> {intl.formatMessage({ id: 'playground.voice.tts.cardTitle' })}
          </span>
        }
        extra={<span className="pg-voice-path">POST /v1/audio/speech[/async]</span>}
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <div>
            <div className="pg-voice-label">
              {intl.formatMessage({ id: 'playground.voice.modelLabel' })}
              <span style={{ marginLeft: 8, fontWeight: 400, color: '#888', fontSize: 12 }}>· {intl.formatMessage({ id: 'playground.voice.candidateCount' }, { count: models.length })}</span>
            </div>
            <Select
              style={{ width: '100%' }}
              placeholder={models.length === 0 ? intl.formatMessage({ id: 'playground.voice.tts.noModelMounted' }) : intl.formatMessage({ id: 'playground.voice.tts.selectModelPh' })}
              notFoundContent={
                <div style={{ padding: '12px 8px', color: '#888', fontSize: 12, lineHeight: 1.6 }}>
                  {intl.formatMessage({ id: 'playground.voice.tts.noModelTip' })}
                  <ol style={{ paddingLeft: 18, margin: '4px 0' }}>
                    <li>
                      {intl.formatMessage({ id: 'playground.voice.tts.noModelTip1a' })} <code>migrations/045</code>{intl.formatMessage({ id: 'playground.voice.tts.noModelTip1b' })} <code>tencent-tts-*</code>{intl.formatMessage({ id: 'playground.voice.tts.noModelTip1c' })} <code>053</code>(<code>tts-1 / tts-1-hd / speech-2.8-hd / speech-2.8-turbo</code>);
                    </li>
                    <li>
                      {intl.formatMessage({ id: 'playground.voice.tts.noModelTip2a' })} <code>models</code> {intl.formatMessage({ id: 'playground.voice.tts.noModelTip2b' })} <code>type=tts_tencent</code>{intl.formatMessage({ id: 'playground.voice.tts.noModelTip2c' })} <code>type=openai</code>{intl.formatMessage({ id: 'playground.voice.tts.noModelTip2d' })} <code>type=minimax</code>;
                    </li>
                    <li>
                      {intl.formatMessage({ id: 'playground.voice.asr.noModelTip3a' })} <code>enabled=true</code>。
                    </li>
                  </ol>
                </div>
              }
              options={models.map((m) => ({
                value: m.value,
                label: (
                  <span>
                    <span
                      style={{
                        display: 'inline-block',
                        width: 16,
                        textAlign: 'center',
                        marginRight: 4,
                        color: m.verified ? '#52c41a' : '#faad14',
                        fontWeight: 600,
                      }}
                      title={m.verified ? intl.formatMessage({ id: 'playground.voice.verifiedTip' }) : intl.formatMessage({ id: 'playground.voice.importedTip' })}
                    >
                      {m.verified ? '✓' : '⚠'}
                    </span>
                    {m.label}
                    <Tag color={m.providerInfo.color} style={{ marginLeft: 8, fontSize: 11 }} title={`provider_type=${m.providerInfo.providerType || intl.formatMessage({ id: 'playground.voice.emptyValue' })}`}>
                      {m.providerInfo.label}
                    </Tag>
                  </span>
                ),
              }))}
              value={modelName}
              onChange={setModelName}
              showSearch
              optionFilterProp="value"
              disabled={submitting || !!isInFlight}
            />
            <div className="pg-voice-hint">
              <span style={{ color: '#52c41a', fontWeight: 600 }}>✓</span> {intl.formatMessage({ id: 'playground.voice.tts.hintVerified' })}
              <span style={{ color: '#faad14', fontWeight: 600, marginLeft: 8 }}>⚠</span> {intl.formatMessage({ id: 'playground.voice.tts.hintImportedA' })}<code>type=audio</code>{intl.formatMessage({ id: 'playground.voice.tts.hintImportedB' })}
              <Tag color="green" style={{ fontSize: 11 }}>
                {intl.formatMessage({ id: 'playground.voice.brand.tencent' })}
              </Tag>
              <Tag color="blue" style={{ fontSize: 11, marginLeft: 4 }}>
                OpenAI
              </Tag>
              <Tag color="purple" style={{ fontSize: 11, marginLeft: 4 }}>
                MiniMax
              </Tag>
              {intl.formatMessage({ id: 'playground.voice.tts.hintVoiceReset' })}
            </div>
          </div>

          <ApiKeyField />

          <div>
            <div className="pg-voice-label">
              {intl.formatMessage({ id: 'playground.voice.tts.textLabel' })}{' '}
              <span style={{ color: charCount > TTS_SYNC_CHAR_LIMIT ? '#cf1322' : '#888', fontWeight: 400 }}>
                · {intl.formatMessage({ id: 'playground.voice.tts.charCount' }, { count: charCount })}{charCount > TTS_SYNC_CHAR_LIMIT && ` · ${intl.formatMessage({ id: 'playground.voice.tts.willAsync' }, { limit: TTS_SYNC_CHAR_LIMIT })}`}
              </span>
            </div>
            <TextArea value={text} onChange={(e) => setText(e.target.value)} autoSize={{ minRows: 4, maxRows: 12 }} placeholder={intl.formatMessage({ id: 'playground.voice.tts.textPh' })} disabled={submitting || !!isInFlight} maxLength={TTS_ASYNC_CHAR_LIMIT} showCount={false} />
          </div>

          <div className="pg-voice-row">
            <div style={{ flex: 1 }}>
              <div className="pg-voice-label">
                {intl.formatMessage({ id: 'playground.voice.tts.voiceLabel' })}
                <span style={{ marginLeft: 8, fontWeight: 400, color: '#888', fontSize: 12 }}>
                  · {intl.formatMessage({ id: 'playground.voice.tts.voiceByProvider' }, { provider: voiceProvider })}
                </span>
                <Tooltip title={voiceProvider === 'openai' ? intl.formatMessage({ id: 'playground.voice.tts.tipOpenai' }) : voiceProvider === 'minimax' ? intl.formatMessage({ id: 'playground.voice.tts.tipMinimax' }) : voiceProvider === 'dashscope' ? intl.formatMessage({ id: 'playground.voice.tts.tipDashscope' }) : voiceProvider === 'kling' ? intl.formatMessage({ id: 'playground.voice.tts.tipKling' }) : intl.formatMessage({ id: 'playground.voice.tts.tipTencent' })}>
                  <span style={{ marginLeft: 6, color: '#1677ff', cursor: 'help', fontSize: 12 }}>?</span>
                </Tooltip>
              </div>
              {/* 所有厂商统一用 AutoComplete:下拉给内置候选 + 你自己的克隆音色,同时永远支持自由输入
                  —— 官方没列全的、或你自定义/克隆的 voice_id,直接粘进去回车即可(大小写敏感)。 */}
              <AutoComplete
                style={{ width: '100%' }}
                options={mergedVoiceOptions}
                value={voice}
                onChange={(v) => setVoice(typeof v === 'string' ? v : '')}
                disabled={submitting || !!isInFlight}
                placeholder={intl.formatMessage({ id: 'playground.voice.tts.voicePh' })}
                filterOption={(input, option) =>
                  String(option?.value ?? '')
                    .toLowerCase()
                    .includes(input.toLowerCase()) ||
                  String(option?.label ?? '')
                    .toLowerCase()
                    .includes(input.toLowerCase())
                }
                allowClear
              />
              {voiceProvider === 'kling' && (
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: '#888', fontSize: 12 }}>{intl.formatMessage({ id: 'playground.voice.tts.langLabel' })}</span>
                  <Segmented
                    size="small"
                    value={ttsLang}
                    onChange={(v) => setTtsLang(v as 'zh' | 'en')}
                    options={[
                      { label: intl.formatMessage({ id: 'playground.voice.tts.langZh' }), value: 'zh' },
                      { label: 'English', value: 'en' },
                    ]}
                    disabled={submitting || !!isInFlight}
                  />
                  <span style={{ color: '#aaa', fontSize: 12 }}>{intl.formatMessage({ id: 'playground.voice.tts.langDesc' })}</span>
                </div>
              )}
              <div className="pg-voice-hint" style={{ marginTop: 6 }}>
                {myCloneOptions.length > 0 && (
                  <span>
                    {intl.formatMessage({ id: 'playground.voice.tts.injectedClonesA' })} <b>{myCloneOptions.length}</b> {intl.formatMessage({ id: 'playground.voice.tts.injectedClonesB' })}
                  </span>
                )}
                {intl.formatMessage({ id: 'playground.voice.tts.freeInputHint' })}
                {voiceProvider === 'minimax' && (
                  <>
                    {' '}
                    {intl.formatMessage({ id: 'playground.voice.tts.minimaxHintA' })}{' '}
                    <a href="https://platform.minimax.io/docs/faq/system-voice-id" target="_blank" rel="noreferrer">
                      {intl.formatMessage({ id: 'playground.voice.tts.minimaxHintLink' })}
                    </a>
                    {intl.formatMessage({ id: 'playground.voice.tts.minimaxHintB' })}
                  </>
                )}
                {voiceProvider === 'tencent' && <> {intl.formatMessage({ id: 'playground.voice.tts.tencentHint' })}</>}
                {voiceProvider === 'dashscope' && <> {intl.formatMessage({ id: 'playground.voice.tts.dashscopeHint' })}</>}
                {voiceProvider === 'kling' && (
                  <>
                    {' '}
                    {intl.formatMessage({ id: 'playground.voice.tts.klingHint' })}
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="pg-voice-row">
            <div style={{ flex: 1 }}>
              <div className="pg-voice-label">
                {intl.formatMessage({ id: 'playground.voice.tts.speed' })} <span style={{ color: '#888', fontWeight: 400 }}>· {speed.toFixed(2)}x</span>
              </div>
              <Slider min={0.5} max={2.0} step={0.1} value={speed} onChange={(v) => setSpeed(v as number)} marks={{ 0.5: '0.5x', 1: '1x', 2: '2x' }} disabled={submitting || !!isInFlight} />
            </div>
          </div>

          <div className="pg-voice-row">
            <div style={{ flex: 1 }}>
              <div className="pg-voice-label">{intl.formatMessage({ id: 'playground.voice.tts.format' })}</div>
              <Select
                style={{ width: '100%' }}
                value={format}
                onChange={setFormat}
                options={[
                  { value: 'mp3', label: intl.formatMessage({ id: 'playground.voice.tts.fmtMp3' }) },
                  { value: 'wav', label: 'wav' },
                  { value: 'opus', label: 'opus' },
                  { value: 'aac', label: 'aac' },
                  { value: 'm4a', label: 'm4a' },
                  { value: 'pcm', label: intl.formatMessage({ id: 'playground.voice.tts.fmtPcm' }) },
                ]}
                disabled={submitting || !!isInFlight}
              />
            </div>
            <div style={{ flex: 1 }}>
              <div className="pg-voice-label">{intl.formatMessage({ id: 'playground.voice.tts.sampleRate' })}</div>
              <Select
                style={{ width: '100%' }}
                value={sampleRate}
                onChange={setSampleRate}
                options={[
                  { value: 8000, label: '8000 Hz' },
                  { value: 16000, label: intl.formatMessage({ id: 'playground.voice.tts.rate16k' }) },
                  { value: 22050, label: '22050 Hz' },
                  { value: 24000, label: '24000 Hz' },
                ]}
                disabled={submitting || !!isInFlight}
              />
            </div>
          </div>

          <div>
            <div className="pg-voice-label">{intl.formatMessage({ id: 'playground.voice.routeMode' })}</div>
            <Segmented
              value={routeMode}
              onChange={(v) => setRouteMode(v as RouteMode)}
              options={[
                { value: 'auto', label: intl.formatMessage({ id: 'playground.voice.routeAuto' }) },
                { value: 'sync', label: intl.formatMessage({ id: 'playground.voice.routeSync' }) },
                { value: 'async', label: intl.formatMessage({ id: 'playground.voice.routeAsync' }) },
              ]}
              disabled={submitting || !!isInFlight}
            />
          </div>

          <details>
            <summary style={{ cursor: 'pointer', color: '#666', fontSize: 13 }}>{intl.formatMessage({ id: 'playground.voice.advanced' })}</summary>
            <div style={{ marginTop: 12 }}>
              <div className="pg-voice-label">{intl.formatMessage({ id: 'playground.voice.channelName' })}</div>
              <Input placeholder={intl.formatMessage({ id: 'playground.voice.channelPh' })} value={channelName} onChange={(e) => setChannelName(e.target.value)} disabled={submitting || !!isInFlight} />
            </div>
          </details>

          <Button type="primary" size="large" block icon={submitting ? <LoadingOutlined /> : <SendOutlined />} onClick={submit} loading={submitting} disabled={!modelName || !apiKey || !!isInFlight || charCount === 0}>
            {submitting ? intl.formatMessage({ id: 'playground.voice.submitting' }) : isInFlight ? intl.formatMessage({ id: 'playground.voice.tts.synthesizing' }) : intl.formatMessage({ id: 'playground.voice.tts.startSynthesize' })}
          </Button>
        </Space>
      </Card>

      {/* 右:结果 */}
      <Card
        className="pg-voice-card"
        title={<span>{intl.formatMessage({ id: 'playground.voice.tts.resultTitle' })}</span>}
        extra={
          syncResult || task || errMsg ? (
            <Space size="small">
              {isInFlight && task?.upstream_id && (
                <Button size="small" icon={<ReloadOutlined spin={polling} />} onClick={() => pollOnce(task.upstream_id!, task._channel || '')}>
                  {intl.formatMessage({ id: 'playground.voice.refresh' })}
                </Button>
              )}
              <Button size="small" onClick={clearResult}>
                {intl.formatMessage({ id: 'playground.voice.clear' })}
              </Button>
            </Space>
          ) : null
        }
      >
        {!syncResult && !task && !errMsg && (
          <div className="pg-voice-empty">
            <Empty image={<PlayCircleOutlined style={{ fontSize: 48, color: '#ccc' }} />} imageStyle={{ height: 60 }} description={<span style={{ color: '#999' }}>{intl.formatMessage({ id: 'playground.voice.tts.emptyHint' })}</span>} />
          </div>
        )}

        {errMsg && !syncResult && !task && <Alert type="error" showIcon message={intl.formatMessage({ id: 'playground.voice.tts.failed' })} description={<pre className="pg-voice-err-pre">{errMsg}</pre>} />}

        {/* 异步进行中 */}
        {task && isInFlight && (
          <div className="pg-voice-empty">
            <Spin indicator={<LoadingOutlined style={{ fontSize: 36 }} spin />} size="large" />
            <div style={{ marginTop: 16, color: '#555', fontWeight: 500 }}>{statusText(task.status)}</div>
            <div style={{ marginTop: 4, color: '#888', fontSize: 13 }}>
              upstream_id: <code>{task.upstream_id}</code> · {intl.formatMessage({ id: 'playground.voice.autoRefresh' })}
            </div>
            <div style={{ marginTop: 4, color: '#bbb', fontSize: 12 }}>{intl.formatMessage({ id: 'playground.voice.tts.longTextHint' })}</div>
            {errMsg && <Alert type="warning" showIcon message={errMsg} style={{ marginTop: 16 }} />}
          </div>
        )}

        {/* 同步成功 / 异步终态 succeeded */}
        {playableSrc && (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <div className="pg-voice-result-meta">
              {task?.status && <Tag color={statusColor(task.status)}>{statusText(task.status)}</Tag>}
              {syncResult && (
                <>
                  <Tag color="green">{intl.formatMessage({ id: 'playground.voice.tts.syncTag' })}</Tag>
                  <span>{formatBytes(syncResult.blob.size)}</span>
                </>
              )}
              {task?.char_count !== undefined && (
                <span>
                  {intl.formatMessage({ id: 'playground.voice.tts.charCountLabel' })} <b>{task.char_count}</b>
                </span>
              )}
              {task?.request_id && (
                <span style={{ color: '#888' }}>
                  req_id <code>{task.request_id}</code>
                </span>
              )}
            </div>
            <audio src={playableSrc} controls style={{ width: '100%' }} />
            <Space>
              <a href={playableSrc} download={downloadName}>
                <Button icon={<DownloadOutlined />} type="primary" ghost>
                  {intl.formatMessage({ id: 'playground.voice.tts.downloadAudio' })}
                </Button>
              </a>
              {task?.audio_url && <span style={{ color: '#999', fontSize: 12 }}>{intl.formatMessage({ id: 'playground.voice.tts.asyncUrlHint' })}</span>}
            </Space>
          </Space>
        )}

        {/* 异步 failed */}
        {task?.status === 'failed' && <Alert type="error" showIcon message={<span style={{ fontWeight: 500 }}>{task.error_code ? `${task.error_code} · ` : ''}{intl.formatMessage({ id: 'playground.voice.tts.failed' })}</span>} description={<pre className="pg-voice-err-pre">{task.error_msg || errMsg || intl.formatMessage({ id: 'playground.voice.noUpstreamReason' })}</pre>} />}

        {/* 兜底:终态 succeeded 但 audio_url 为空 */}
        {task?.status === 'succeeded' && !task.audio_url && <Alert type="info" showIcon message={intl.formatMessage({ id: 'playground.voice.tts.audioUrlEmpty' })} description={intl.formatMessage({ id: 'playground.voice.tts.audioUrlEmptyDesc' })} />}
      </Card>
    </div>
  );
}

// CloseCircleOutlined 在 ImagePanel 里用过(取消按钮),这里没用到取消,但保留 import 兼容未来扩展。
// PlayCircleOutlined 仅作为 Empty 图标使用。
void CloseCircleOutlined;
void PlayCircleOutlined;
