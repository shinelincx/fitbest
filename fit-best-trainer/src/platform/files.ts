import { FilePicker } from '@capawesome/capacitor-file-picker'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { isCancellation } from './runtime'

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}

function decodeBase64(data: string): string {
  const binary = atob(data)
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

async function shareNativeFile(path: string, data: string, title: string, text?: string, utf8 = false) {
  const safePath = path.replace(/[\\/:*?"<>|]/g, '-')
  await Filesystem.writeFile({
    path: safePath,
    data,
    directory: Directory.Cache,
    ...(utf8 ? { encoding: Encoding.UTF8 } : {}),
  })
  try {
    const { uri } = await Filesystem.getUri({ path: safePath, directory: Directory.Cache })
    await Share.share({ title, text, files: [uri], dialogTitle: title })
  } finally {
    await Filesystem.deleteFile({ path: safePath, directory: Directory.Cache }).catch(() => undefined)
  }
}

export async function shareNativeImage(
  blob: Blob,
  filename: string,
  title: string,
  text: string,
): Promise<boolean> {
  try {
    await shareNativeFile(filename, await blobToBase64(blob), title, text)
    return true
  } catch (error) {
    if (isCancellation(error)) return false
    throw error
  }
}

export async function exportNativeBackup(json: string, filename: string): Promise<boolean> {
  try {
    await shareNativeFile(filename, json, 'FITBEST 数据备份', undefined, true)
    return true
  } catch (error) {
    if (isCancellation(error)) return false
    throw error
  }
}

export async function pickNativeBackup(): Promise<string | null> {
  try {
    const { files } = await FilePicker.pickFiles({
      types: ['application/json', 'application/octet-stream'],
      limit: 1,
      readData: true,
    })
    const file = files[0]
    if (!file?.data) return null
    return decodeBase64(file.data)
  } catch (error) {
    if (isCancellation(error)) return null
    throw error
  }
}
