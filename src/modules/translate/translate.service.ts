import { Injectable } from '@nestjs/common';
import pinyin from 'pinyin';

const { translate } = require('@vitalets/google-translate-api');

type CacheItem = {
  zh: string;
  pinyin: string;
  time: number;
};

@Injectable()
export class TranslateService {
  private cache = new Map<string, CacheItem>();
  private lastRequestTime = 0;

  async translateViToZh(text: string) {
    const clean = text.trim();
    const now = Date.now();

    // 1️⃣ CACHE – TRÁNH GỌI LẠI
    const cached = this.cache.get(clean);
    if (cached && now - cached.time < 5 * 60 * 1000) {
      return {
        zh: cached.zh,
        pinyin: cached.pinyin,
        cached: true,
      };
    }

    // 2️⃣ THROTTLE – CHỐNG SPAM
    if (now - this.lastRequestTime < 1500) {
      if (cached) return cached;
      throw new Error('Too fast, slow down');
    }
    this.lastRequestTime = now;

    try {
      // 3️⃣ TRANSLATE
      const result = await translate(clean, {
        from: 'vi',
        to: 'zh-CN',
      });

      const zh = result.text.trim();

      // 4️⃣ PINYIN
      const zhChars = zh.replace(/[^\u4e00-\u9fa5]/g, '').split('');
      const pyArr = pinyin(zhChars.join(''), {
        style: pinyin.STYLE_TONE,
      }).flat();

      const data = {
        zh,
        pinyin: pyArr.join(' '),
        time: now,
      };

      // 5️⃣ SAVE CACHE
      this.cache.set(clean, data);

      return data;
    } catch (err: any) {
      // 6️⃣ NẾU 429 → TRẢ CACHE
      if (cached) {
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
