import { DesktopAPI } from './index'

declare global {
    interface Window {
        obscuraAPI?: DesktopAPI
    }
}

