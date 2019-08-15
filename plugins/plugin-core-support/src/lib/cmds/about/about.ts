/*
 * Copyright 2017-2018 IBM Corporation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as Debug from 'debug'

import * as colors from 'colors/safe'

import * as repl from '@kui-shell/core/core/repl'
import { injectCSS } from '@kui-shell/core/webapp/util/inject'
import { SidecarMode } from '@kui-shell/core/webapp/bottom-stripe'
import Presentation from '@kui-shell/core/webapp/views/presentation'
import { isHeadless } from '@kui-shell/core/core/capabilities'
import { CommandRegistrar, EvaluatorArgs } from '@kui-shell/core/models/command'

import usage from './usage'
import { bugs, description, homepage, license, version } from '@kui-shell/settings/package.json'
import { theme as settings, config as extras } from '@kui-shell/core/core/settings'

const debug = Debug('plugins/core-support/about')

/** should we show low-level version info, e.g. electron version etc.? */
const showVersionInfo = true

/**
 * The repl allows plugins to provide their own window, via the
 * `bringYourOwnWindow` attribute. Here, we define our
 * bringYourOwnWindow behavior, for the `about` command.
 *
 */
const aboutWindow = async () => {
  /* bringYourOwnWindow impl */
  debug('aboutWindow')

  const { remote, shell } = await import('electron')

  try {
    injectCSS({
      css: require('@kui-shell/plugin-core-support/web/css/about.css'),
      key: 'about-window-css'
    })
  } catch (err) {
    const { dirname, join } = await import('path')
    const ourRootDir = dirname(require.resolve('@kui-shell/plugin-core-support/package.json'))
    injectCSS(join(ourRootDir, 'web/css/about.css'))
  }

  // this is the main container for the dom
  const content = document.createElement('div')
  content.classList.add('about-window')

  const flexContent = document.createElement('div')
  flexContent.classList.add('page-content')
  content.appendChild(flexContent)

  const topContent = document.createElement('div')
  topContent.classList.add('about-window-top-content')
  flexContent.appendChild(topContent)

  const badges = []

  const name = settings.productName || remote.app.getName()
  const openHome = () => shell.openExternal(homepage)

  if (license) {
    badges.push(license)
  }

  const subtext = settings.byline || description
  /* subtext.appendChild(document.createTextNode('Distributed under an '))
  const licenseDom = document.createElement('strong')
  licenseDom.innerText = license
  subtext.appendChild(licenseDom)
  subtext.appendChild(document.createTextNode(' license')) */

  const logo = document.createElement('div')
  topContent.appendChild(logo)
  logo.classList.add('logo')

  const iconP = document.createElement('p')
  const icon = document.createElement('img')
  icon.addEventListener('click', openHome)
  icon.classList.add('clickable')
  iconP.appendChild(icon)
  logo.appendChild(iconP)
  icon.src = settings.largeIcon

  if (settings.ogDescription) {
    try {
      const marked = await import('marked')
      const longDescription = document.createElement('div')
      longDescription.classList.add('about-window-long-description')
      longDescription.innerHTML = marked(settings.ogDescription)
      logo.appendChild(longDescription)
    } catch (err) {
      debug('error rendering markdown', err)
      const longDescription = document.createElement('p')
      longDescription.classList.add('about-window-long-description')
      longDescription.innerText = settings.ogDescription
      logo.appendChild(longDescription)
    }
  }

  const bottomContent = document.createElement('div')
  bottomContent.classList.add('about-window-bottom-content')
  flexContent.appendChild(bottomContent)

  if (showVersionInfo) {
    const table = document.createElement('table')
    table.classList.add('log-lines')
    table.classList.add('versions')
    table.classList.add('somewhat-smaller-text')
    bottomContent.appendChild(table)

    const versionModel = process.versions
    versionModel[name] = version
    versionModel['build'] = extras['build-info']

    const headerRow = table.insertRow(-1)
    headerRow.className = 'log-line header-row'
    const column1 = headerRow.insertCell(-1)
    column1.innerText = 'component'
    column1.className = 'header-cell log-field'
    const column2 = headerRow.insertCell(-1)
    column2.innerText = 'version'
    column2.className = 'header-cell log-field'

    for (const component of [name, 'build', 'electron', 'chrome', 'node', 'v8']) {
      const version = versionModel[component]

      if (version !== undefined) {
        const row = table.insertRow(-1)
        row.classList.add('log-line')

        const nameCell = row.insertCell(-1)
        nameCell.classList.add('log-field')
        nameCell.innerText = component

        const versionCell = row.insertCell(-1)
        versionCell.classList.add('log-field')
        versionCell.innerText = versionModel[component]
        row.appendChild(versionCell)

        if (component === name) {
          nameCell.classList.add('semi-bold')
          nameCell.classList.add('cyan-text')
          versionCell.classList.add('semi-bold')
          versionCell.classList.add('cyan-text')
        } else {
          nameCell.classList.add('lighter-text')
        }
      }
    }
  }

  const modes: SidecarMode[] = [
    { mode: 'tutorials', label: 'Tutorials', flush: 'right', direct: settings.gettingStarted || 'getting started' },
    { mode: 'bugs', label: 'Bugs', flush: 'right', url: bugs ? bugs.url : undefined },
    { mode: 'github', label: 'GitHub', flush: 'right', url: homepage }
  ]

  return {
    type: 'custom',
    isEntity: true,
    prettyType: 'about',
    presentation: document.body.classList.contains('subwindow') && Presentation.SidecarFullscreen,
    modes,
    name,
    badges,
    version,
    subtext,
    content
  }
}

/**
 * Return, textually, the current version of the tool
 *
 */
const getVersion = () => {
  debug('getVersion')
  return version
}

/**
 * Report the current version, and availability of updates
 *    For headless, return a textual concatenation of the two.
 */
const reportVersion = ({ argv }: EvaluatorArgs) => {
  debug('reportVersion')

  const checkForUpdates = argv.find(_ => _ === '-u' || _ === '--update-check')
  const version = getVersion()

  if (!checkForUpdates) {
    // we were asked only to report the installed version
    if (extras['build-info']) {
      return `${version} (build ${extras['build-info']})`
    }
    return version
  }

  //
  // otherwise, we were asked to check for updates
  //
  if (isHeadless()) {
    console.log('You are currently on version ' + colors.blue(version))
    process.stdout.write(colors.dim('Checking for updates... '))
  }

  return repl.qexec('updater check').then(updates => {
    if (updates === true) {
      // then we're up to date, so just report the version
      if (isHeadless()) {
        return 'you are up to date!'
      } else {
        return version
      }
    } else {
      // then updates are available, so report the updates available message
      if (isHeadless()) {
        // above, we left with a process.stdout.write, so
        // now we need to clear a newline see shell issue
        // #194
        console.log('')
        console.log('')
      }
      return updates
    }
  })
}

/**
 * Here we install the command handlers for /version and /about
 *
 */
export default (commandTree: CommandRegistrar) => {
  debug('init')

  // for menu
  if (!commandTree) {
    return aboutWindow()
  }

  // these commands don't require any auth
  const noAuthOk = true

  /**
   * Print out the current version of the tool, as text
   *
   */
  commandTree.listen(
    '/version', // the command path
    reportVersion, // the command handler
    { noAuthOk, usage: usage.version }
  )

  /**
   * Open a graphical window displaying more detail about the tool
   *
   */
  commandTree.listen('/about', aboutWindow, {
    hidden: true, // don't list about in the help menu
    needsUI: true, // about requires a window
    noAuthOk // about doesn't require openwhisk authentication
  })

  debug('init done')
}

export const preload = () => {
  // install click handlers
  ;(document.querySelector('#help-button') as HTMLElement).onclick = () =>
    repl.pexec(settings.gettingStarted || 'getting started')
}
