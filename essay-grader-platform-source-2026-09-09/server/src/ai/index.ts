import { config } from '../config.ts';
import { mockProvider } from './mock.ts';
import { deepseekProvider } from './deepseek.ts';
import type { AIProvider } from './types.ts';

function makeProvider(): AIProvider {
  if (config.aiMode === 'mock') return mockProvider;
  if (config.aiMode === 'deepseek') {
    if (config.deepseekApiKey) return deepseekProvider;
    return new Proxy({ mode: 'unconfigured' }, {
      get(target, prop) {
        if (prop === 'mode') return target.mode;
        return async () => {
          throw new Error('真实 AI 尚未配置：请在 Render 环境变量中设置 DEEPSEEK_API_KEY');
        };
      },
    }) as AIProvider;
  }
  // auto
  if (config.deepseekApiKey) return deepseekProvider;
  return mockProvider;
}

export function buildAI(): AIProvider {
  const primary = makeProvider();
  // 仅在显式开启 AI_FALLBACK_TO_MOCK 时回退，生产环境避免混淆真实结果与演示结果。
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
          if (primary.mode === 'deepseek' && config.aiFallbackToMock) {
            console.warn('[ai] DeepSeek 调用失败，自动回退演示模式：', (err as Error).message);
            const m = Reflect.get(mockProvider, prop) as (...a: unknown[]) => Promise<unknown>;
            return m.apply(mockProvider, args);
          }
          if (primary.mode === 'deepseek') {
            throw new Error(`AI 服务调用失败：${(err as Error).message}。请检查 Render 的 DEEPSEEK_API_KEY、余额和网络设置`);
          }
          throw err;
        }
      };
    },
  }) as AIProvider;
}

export const ai = buildAI();
