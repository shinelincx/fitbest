import type { Region } from '@/api/system'

export interface RegionNode extends Region {
  children?: RegionNode[]
}

export function regionTree(regions: Region[]) {
  const nodes = new Map(regions.map(row => [row.code, { ...row } as RegionNode]))
  const roots: RegionNode[] = []
  for (const node of nodes.values()) {
    const parent = node.parentCode && nodes.get(node.parentCode)
    if (parent) (parent.children ??= []).push(node)
    else roots.push(node)
  }
  return roots
}
