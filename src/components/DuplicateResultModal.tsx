import React, { useMemo } from 'react'
import { MediaFile } from '../types'
import { MediaCard } from './MediaCard'
import { api } from '../api'
import './DuplicateResultModal.css'

interface DuplicateResultModalProps {
    duplicates: { [key: string]: MediaFile[] }[]
    onClose: () => void
    gridSize?: number
}

// 1グループを表示するコンポーネント
const DuplicateGroup = ({ group }: { group: MediaFile[] }) => {
    // グループ内のファイルはすべて同じサイズ/名前のはずだが、パスは違う
    // 最初のファイルを代表として情報を表示
    const representative = group[0]

    return (
        <div className="duplicate-group-row">
            <div className="group-header">
                <span className="file-name">{representative.file_name}</span>
                <span className="file-size">
                    ({(representative.file_size / 1024 / 1024).toFixed(2)} MB)
                </span>
                <span className="group-count">
                    {group.length} 件の重複
                </span>
            </div>
            <div className="group-items-grid">
                {group.map(media => (
                    <div key={media.id} className="duplicate-item-wrapper">
                        <MediaCard
                            media={media}
                            onClick={() => {
                                // 選択ロジックなどを入れるならここ
                                // 現状は確認用なので、クリックしたらエクスプローラーで開くなどが便利かも
                                api.showItemInFolder(media.file_path)
                            }}
                            onDoubleClick={() => { }}
                            onContextMenu={() => { }}
                            isSelected={false}
                            showName={false}
                            showItemInfo={false}
                            itemInfoType="size"
                            showExtension={false}
                            showExtensionLabel={false}
                            thumbnailMode="speed"
                            width={150 * 0.8} // Roughly trying to match a smaller size if possible, or leave default
                        />
                        <div className="path-hint" title={media.file_path}>
                            ...{media.file_path.slice(-30)}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}

export const DuplicateResultModal: React.FC<DuplicateResultModalProps> = ({ duplicates, onClose }) => {
    const totalFiles = useMemo(() => {
        return duplicates.reduce((acc, group) => acc + Object.values(group).flat().length, 0)
    }, [duplicates])

    return (
        <div className="modal-overlay">
            <div className="modal-content large">
                <div className="modal-header">
                    <h3>重複検索結果</h3>
                    <div className="modal-close" onClick={onClose}>×</div>
                </div>

                <div className="modal-body">
                    <div className="result-summary">
                        <p>
                            <strong>{duplicates.length}</strong> グループ、
                            合計 <strong>{totalFiles}</strong> 個の重複ファイルが見つかりました。
                        </p>
                        <p className="text-muted small">
                            サムネイルをクリックすると、ファイルの場所を開きます。
                        </p>
                    </div>

                    <div className="duplicate-groups-list">
                        {duplicates.map((groupObj, index) => {
                            // findLibraryDuplicates は { key: [files] } の配列を返す仕様だが、
                            // 実装を見ると Object.values(groups).filter(...) なので、
                            // 実は MediaFile[] の配列が返ってきている可能性がある。
                            // database.ts の実装を確認すると:
                            // const duplicateGroups = Object.values(groups).filter(...)
                            // なので、 duplicates は MediaFile[][] (MediaFile[] の配列) です。

                            // Typescriptの型定義が { [key: string]: MediaFile[] }[] になっているのが間違いの可能性がある。
                            // database.ts: return duplicateGroups
                            // duplicateGroups は any[][] (MediaFile[][])

                            // ここでは groupObj が配列(MediaFile[])であるとして扱うか、オブジェクトとして扱うか安全に判断する

                            let files: MediaFile[] = []
                            if (Array.isArray(groupObj)) {
                                files = groupObj
                            } else {
                                // もしオブジェクトなら values を取る
                                files = Object.values(groupObj).flat()
                            }

                            if (files.length === 0) return null

                            return (
                                <DuplicateGroup key={index} group={files} />
                            )
                        })}
                    </div>
                </div>

                <div className="modal-footer">
                    <button className="btn btn-primary" onClick={onClose}>閉じる</button>
                </div>
            </div>
        </div>
    )
}
