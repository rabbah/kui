/*
 * Copyright 2019 IBM Corporation
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

import * as common from '@kui-shell/core/tests/lib/common'
import * as ui from '@kui-shell/core/tests/lib/ui'

const { cli } = ui
const { localDescribe } = common

localDescribe('pty output with many lines', function(this: common.ISuite) {
  before(common.before(this))
  after(common.after(this))

  it(`should execute a recursive grep that emits many lines`, () =>
    cli
      .do(`grep -r localDescribe ../../plugins`, this.app)
      .then(cli.expectOKWithString('localDescribe'))
      .catch(common.oops(this)))

  it('should still have a prompt that works', () =>
    cli
      .do('echo hi', this.app)
      .then(cli.expectOKWithString('hi'))
      .catch(common.oops(this)))
})
