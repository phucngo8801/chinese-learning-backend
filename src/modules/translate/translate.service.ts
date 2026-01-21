import {
  Injectable,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import pinyin from 'pinyin';

const { translate } = require('@vitalets/google-translate-api');

type CacheItem = {
  zh: string;
  pinyin: string;
  time: number;
};

type RequestContext = {
  ip?: string;
  authHeader?: string;
};

@Injectable()
export class TranslateService {
  private cache = new Map<string, CacheItem>();

  // Throttle theo client (token hoặc IP), tránh trường hợp 1 user spam làm block toàn hệ thống.
  private lastRequestByKey = new Map<string, number>();

  private getThrottleKey(ctx?: RequestContext): string {
    const authHeader = ctx?.authHeader ?? '';
    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice('Bearer '.length).trim();
      if (token.length >= 16) {
        // Không lưu full token trong bộ nhớ; dùng suffix để giảm rủi ro lộ dữ liệu.
        return `token:${token.slice(-16)}`;
      }
      if (token.length > 0) return `token:${token}`;
    }

    const ip = (ctx?.ip ?? '').trim();
    if (ip) return `ip:${ip}`;

    return 'anon';
  }

  private enforceThrottle(key: string, now: number): void {
    const last = this.lastRequestByKey.get(key) ?? 0;
    if (now - last < 1500) {
      throw new HttpException(
        'Too many requests. Please slow down.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    this.lastRequestByKey.set(key, now);

    // Tránh map phình vô hạn (MVP): prune thô khi quá lớn.
    if (this.lastRequestByKey.size > 5000) {
      const cutoff = now - 10 * 60 * 1000; // 10 phút
      for (const [k, t] of this.lastRequestByKey.entries()) {
        if (t < cutoff) this.lastRequestByKey.delete(k);
      }
    }
  }

  async translateViToZh(text: string, ctx?: RequestContext) {
    if (typeof text !== 'string') {
      throw new BadRequestException('text must be a string');
    }

    const clean = text.trim();
    if (!clean) {
      throw new BadRequestException('text is required');
    }

    const now = Date.now();

    // 1) CACHE – tránh gọi lại
    const cached = this.cache.get(clean);
    if (cached && now - cached.time < 5 * 60 * 1000) {
      return {
        zh: cached.zh,
        pinyin: cached.pinyin,
        cached: true,
      };
    }

    // 2) THROTTLE – theo client
    const key = this.getThrottleKey(ctx);
    try {
      this.enforceThrottle(key, now);
    } catch (e) {
      // Nếu bị throttle mà có cache cũ (dù hết TTL), trả cache để UI mượt hơn.
      if (cached) {
        return {
          zh: cached.zh,
          pinyin: cached.pinyin,
          cached: true,
        };
      }
      throw e;
    }

    try {
      // 3) TRANSLATE
      const result = await translate(clean, { from: 'vi', to: 'zh-CN' });
      const zh = result.text;

      // 4) PINYIN
      const zhChars = zh.replace(/[^\u4e00-\u9fa5]/g, '').split('');
      const pyArr = pinyin(zhChars.join(''), { style: pinyin.STYLE_TONE }).flat();

      const data = {
        zh,
        pinyin: pyArr.join(' '),
        time: now,
      };

      // 5) SAVE CACHE
      this.cache.set(clean, data);

      return data;
    } catch (err: any) {
      // Nếu upstream rate-limit (429) mà có cache → trả cache.
      const status = err?.status ?? err?.statusCode ?? err?.code;
      if ((status === 429 || status === '429') && cached) {
        return {
          zh: cached.zh,
          pinyin: cached.pinyin,
          cached: true,
        };
      }

      throw err;
    }
  }
}
