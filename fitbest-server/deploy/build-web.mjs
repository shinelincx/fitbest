import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const workspace = fileURLToPath(new URL('../../', import.meta.url))
const output = resolve(process.argv[2] ?? join(workspace, 'fitbest-server', 'web'))
if (existsSync(output) && readdirSync(output).length) {
  throw new Error(`请选择空的构建产物目录：${output}`)
}
mkdirSync(output, { recursive: true })

const projects = [
  { name: 'fit-best-trainer', builds: [['fitbest', 'production'], ['fitbest-hd', 'hd']] },
  { name: 'hyrox-trainer', builds: [['hyrox', 'production'], ['hyrox/HD', 'hd']] },
  { name: 'btwe-trainer', builds: [['btwe', 'production'], ['btwe/HD', 'hd']] },
  { name: 'fit-best-admin', builds: [['fit-best', 'production']] },
]

function runTool(project, name, args) {
  const directory = join(project, 'node_modules', name)
  const { bin } = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'))
  const program = typeof bin === 'string' ? bin : name === 'typescript' ? bin.tsc : bin[name]
  execFileSync(process.execPath, [join(directory, program), ...args], {
    cwd: project,
    stdio: 'inherit',
    env: { ...process.env, VITE_API_BASE: '/api/v1', VITE_API_BASE_URL: '/api/v1' },
  })
}

for (const { name, builds } of projects) {
  const project = join(workspace, name)
  runTool(project, 'typescript', ['-b'])
  for (const [site, mode] of builds) {
    runTool(project, 'vite', ['build', '--mode', mode, '--outDir', join(output, site)])
  }
}

for (const [source, site, files] of [
  ['fitbest-website', 'fitbestwebsite', ['index.html', 'logo.png']],
  ['rowing-console-simulator', 'console', ['index.html', 'logo.png', 'media']],
]) {
  const target = join(output, site)
  mkdirSync(target, { recursive: true })
  for (const file of files) {
    cpSync(join(workspace, source, file), join(target, file), { recursive: true })
  }
}

console.log(`静态站点已构建到 ${output}`)
