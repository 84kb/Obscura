import { useEffect, useRef } from 'react'
import { ExtensionMountContext, ExtensionMountCleanup } from '@obscura/core'

type BasePluginMountContext = Omit<ExtensionMountContext, 'container'>

type PluginMountProps<TContext extends BasePluginMountContext> = {
    className?: string
    mount: (context: ExtensionMountContext & TContext) => ExtensionMountCleanup
    context: TContext
}

export function PluginMount<TContext extends BasePluginMountContext>({ className, mount, context }: PluginMountProps<TContext>) {
    const ref = useRef<HTMLDivElement | null>(null)

    useEffect(() => {
        if (!ref.current) return
        return mount({
            ...context,
            container: ref.current,
        }) || undefined
    }, [context, mount])

    return <div className={className} ref={ref} />
}
