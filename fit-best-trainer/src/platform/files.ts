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

function decodeBase64(data: string) {
  return Uint8Array.from(atob(data), character => character.charCodeAt(0))
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
    return new TextDecoder().decode(decodeBase64(file.data))
  } catch (error) {
    if (isCancellation(error)) return null
    throw error
  }
}

export async function pickNativeFeedbackImages(limit: number, maxBytes: number): Promise<File[]> {
  try {
    const { files } = await FilePicker.pickImages({ limit, readData: false })
    if (files.length > limit) throw new Error('最多添加 3 张图片')
    return await Promise.all(files.map(async file => {
      if (file.size <= 0 || file.size > maxBytes) {
        throw new Error('每张图片不得超过 5 MiB，且不能为空')
      }
      if (!file.path) throw new Error('无法读取所选图片，请重新选择')
      const { data } = await Filesystem.readFile({ path: file.path })
      return new File([typeof data === 'string' ? decodeBase64(data) : data], file.name, { type: file.mimeType })
    }))
  } catch (error) {
    if (isCancellation(error)) return []
    throw error
  }
}
