import type { UserConfig } from 'vite'

interface DailyPaths {
  stage: string
  runtime: string
  portable: string
}

export function dailyComponents(value?: string): string[]
export function dailyPaths(source: string): DailyPaths
export function assertDailyTarget(source: string, target: string, names?: string[]): DailyPaths
export function runningBackend(source: string): Promise<string>
export function dailyViteConfig(options: { source: string; runtime: string; upstream: string; port?: number }): UserConfig
