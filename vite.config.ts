import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import fs from 'node:fs'
import path from 'node:path'
import pkg from './package.json'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [
        react(),
        electron([
            {
                // メインプロセス
                entry: 'electron/main.ts',
                onstart(args) {
                    const distPath = path.join(process.cwd(), 'dist-electron')

                    // dist-electronディレクトリの作成（既に存在する場合は何もしない）
                    try {
                        if (!fs.existsSync(distPath)) {
                            fs.mkdirSync(distPath, { recursive: true })
                        }
                    } catch (err) {
                        console.error('❌ Failed to create dist-electron directory:', err)
                    }

                    // CommonJSを強制するためのpackage.json
                    try {
                        fs.writeFileSync(
                            path.join(distPath, 'package.json'),
                            JSON.stringify({ type: 'commonjs' }, null, 2)
                        )
                    } catch (err) {
                        console.error('❌ Failed to write package.json:', err)
                    }

                    // プリロードスクリプトを直接コピー（ビルドプロセスをスキップ）
                    const preloadSrc = path.join(process.cwd(), 'electron', 'preload.cjs')
                    const preloadDest = path.join(distPath, 'preload.cjs')
                    try {
                        if (fs.existsSync(preloadSrc)) {
                            fs.copyFileSync(preloadSrc, preloadDest)
                            console.log('✅ Preload script copied successfully')
                        } else {
                            console.warn('⚠️ Preload source file not found:', preloadSrc)
                        }
                    } catch (err) {
                        console.error('❌ Failed to copy preload script:', err)
                    }

                    // main.cjsのビルド完了を少し待ってからElectronを起動
                    // これにより、ファイルシステムの同期が完了するのを待つ
                    const mainPath = path.join(distPath, 'main.cjs')
                    const maxRetries = 10
                    let retries = 0

                    const waitForMain = () => {
                        if (fs.existsSync(mainPath)) {
                            console.log('✅ Main process ready, starting Electron...')
                            args.startup()
                        } else if (retries < maxRetries) {
                            retries++
                            console.log(`⏳ Waiting for main.cjs... (${retries}/${maxRetries})`)
                            setTimeout(waitForMain, 200)
                        } else {
                            console.error('❌ Timeout waiting for main.cjs, starting anyway...')
                            args.startup()
                        }
                    }

                    // 少し遅延を入れてからチェック開始
                    setTimeout(waitForMain, 100)
                },
                vite: {
                    build: {
                        outDir: 'dist-electron',
                        minify: false,
                        lib: {
                            entry: 'electron/main.ts',
                            formats: ['cjs'],
                            fileName: () => 'main.cjs',
                        },
                        rollupOptions: {
                            external: ['electron', ...Object.keys(pkg.dependencies || {})],
                            output: {
                                format: 'cjs',
                                entryFileNames: 'main.cjs',
                                compact: false,
                                generatedCode: {
                                    constBindings: false,
                                },
                            },
                            treeshake: false,
                        },
                    },
                },
            },
        ]),
    ],
    server: {
        port: 5173,
    },
})
