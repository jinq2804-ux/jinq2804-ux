import { config } from '../config.ts';
import { mockProvider } from './mock.ts';
import { deepseekProvider } from './deepseek.ts';
import type { AIProvider } from './types.ts';

function makeProvider(): AIProvider {
  if (config.aiMode === 'mock') return mockProvider;
  if (config.aiMode === 'deepseek' && config.deepseekApiKey) return deepseekProvider;
  // auto
  if (config.deepseekApiKey) return deepseekProvider;
  return mockProvider;
}

export function buildAI(): AIProvider {
  const primary = makeProvider();
  // 任一调用失败时自动回退到演示模式，保证本地可运行
  return new Proxy(primary, {
    get(target, prop, receiver) {
      if (typeof prop !== 'string' || prop === 'mode' || prop === 'then') {
        const v = Reflect.get(target, prop, receiver);
        return typeof v === 'function' ? v.bind(target) : v;
      }
      const fn = Reflect.get(target, prop, receiver) as (...args: unknown[]) => Promise<unknown>;
      if (typeof fn !== 'function') return fn;
      return async (...args: unknown[]) => {
        try {
          return await fn.apply(target, args);
        } catch (err) {
          if (primary.mode === 'deepseek') {
            console.warn('[ai] DeepSeek 调用失败，自动回退演示模式：', (err as Error).message);
            const m = Reflect.get(mockProvider, prop) as (...a: unknown[]) => Promise<unknown>;
            return m.apply(mockProvider, args);
          }
          throw err;
        }
      };
    },
  }) as AIProvider;
}

export const ai = buildAI();
