const destinations = new Set([
  '/profile', '/profile/edit', '/profile/goals', '/profile/settings',
  '/profile/identities', '/profile/security', '/profile/data',
])

export function loginReturn(value: unknown): string {
  return typeof value === 'string' && destinations.has(value) ? value : '/profile'
}
