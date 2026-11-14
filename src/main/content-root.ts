// Where the app's bundled content (content/raw, content/parsed) lives: next to the app, or
// $FOUR_E_CONTENT_DIR. UI smoke tests set it to the checkout's content/, so concurrent runs share
// nothing (they used to symlink it into the script's folder and delete the link on exit).

import { app } from 'electron'
import { join } from 'path'

export const contentRoot = (): string => process.env.FOUR_E_CONTENT_DIR || join(app.getAppPath(), 'content')
