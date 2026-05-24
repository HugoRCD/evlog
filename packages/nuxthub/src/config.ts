/** evlog module options read by @evlog/nuxthub (retention augments evlog/nuxt). */
export interface EvlogHubConfig {
  retention?: string
}

export interface NuxtOptionsWithEvlog {
  evlog?: EvlogHubConfig
}

export interface RuntimeConfigWithEvlog {
  evlog?: EvlogHubConfig
}

export function getNuxtEvlogConfig(nuxt: { options: NuxtOptionsWithEvlog }): EvlogHubConfig {
  return nuxt.options.evlog ?? {}
}
