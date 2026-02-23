import React, { useState, useEffect, useMemo } from 'react'
import { AuditLogEntry } from '@obscura/core'
import './AuditLogModal.css'

interface AuditLogModalProps {
    libraryPath: string
    libraryName: string
    onClose: () => void
}

import { api } from '../api'

const AuditLogModal: React.FC<AuditLogModalProps> = ({ libraryPath, libraryName, onClose }) => {
    const [logs, setLogs] = useState<AuditLogEntry[]>([])
    const [loading, setLoading] = useState(true)
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

    useEffect(() => {
        const fetchLogs = async () => {
            try {
                const data = await api.getAuditLogs(libraryPath)
                setLogs(data)
            } catch (error) {
                console.error('Failed to fetch audit logs:', error)
            } finally {
                setLoading(false)
            }
        }
        fetchLogs()
    }, [libraryPath])

    const formatDate = (isoString: string) => {
        const date = new Date(isoString)
        return date.toLocaleString('ja-JP', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        })
    }

    const getActionIcon = (action: string) => {
        if (action.includes('import')) return '📥'
        if (action.includes('delete')) return '🗑️'
        if (action.includes('trash')) return '🚮'
        if (action.includes('restore')) return '♻️'
        if (action.includes('update')) return '📝'
        if (action.includes('tag')) return '🏷️'
        if (action.includes('folder')) return '📁'
        if (action.includes('comment')) return '💬'
        return '🔹'
    }

    // グルーピングロジック
    const groupedLogs = useMemo(() => {
        const groups: { [key: string]: { targetId: any, targetName: string, items: AuditLogEntry[] } } = {}

        logs.forEach(log => {
            const key = log.targetId ? `${log.targetId}-${log.targetName}` : `system-${log.id}`
            if (!groups[key]) {
                groups[key] = {
                    targetId: log.targetId,
                    targetName: log.targetName,
                    items: []
                }
            }
            groups[key].items.push(log)
        })

        return Object.entries(groups).sort((a, b) => {
            // グループ内で最も新しいログのタイムスタンプでソート
            const timeA = new Date(a[1].items[0].timestamp).getTime()
            const timeB = new Date(b[1].items[0].timestamp).getTime()
            return timeB - timeA
        })
    }, [logs])

    const toggleGroup = (key: string) => {
        setExpandedGroups(prev => {
            const next = new Set(prev)
            if (next.has(key)) next.delete(key)
            else next.add(key)
            return next
        })
    }

    return (
        <div className="audit-log-overlay" onClick={onClose}>
            <div className="audit-log-modal" onClick={e => e.stopPropagation()}>
                <div className="audit-log-header">
                    <div className="audit-log-title-container">
                        <h2>監査ログ</h2>
                        <span className="library-name-badge">{libraryName}</span>
                    </div>
                    <button className="close-btn" onClick={onClose}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>

                <div className="audit-log-content">
                    {loading ? (
                        <div className="loading-state">読み込み中...</div>
                    ) : logs.length === 0 ? (
                        <div className="empty-state">ログがありません</div>
                    ) : (
                        <div className="log-list">
                            {groupedLogs.map(([key, group]) => {
                                const isExpanded = expandedGroups.has(key)
                                const latestLog = group.items[0]

                                return (
                                    <div key={key} className={`log-group ${isExpanded ? 'is-expanded' : ''}`}>
                                        <div className="log-group-header" onClick={() => toggleGroup(key)}>
                                            <div className="log-icon-container">
                                                <span className="log-icon">{getActionIcon(latestLog.action)}</span>
                                            </div>
                                            <div className="log-group-info">
                                                <div className="log-target-name">{group.targetName || 'システム操作'}</div>
                                                <div className="log-group-summary">
                                                    {group.items.length > 1 ? `${group.items.length} 件の変更` : latestLog.description}
                                                </div>
                                            </div>
                                            <div className="log-group-meta">
                                                <span className="timestamp">{formatDate(latestLog.timestamp)}</span>
                                                <svg className={`chevron ${isExpanded ? 'open' : ''}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <polyline points="6 9 12 15 18 9"></polyline>
                                                </svg>
                                            </div>
                                        </div>

                                        {isExpanded && (
                                            <div className="log-group-items">
                                                {group.items.map(log => (
                                                    <div key={log.id} className="log-item sub-item">
                                                        <div className="log-details">
                                                            <div className="log-meta">
                                                                <span className="user-nickname">{log.userNickname}</span>
                                                                <span className="timestamp">{formatDate(log.timestamp)}</span>
                                                            </div>
                                                            <div className="log-description">{log.description}</div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

export default AuditLogModal
