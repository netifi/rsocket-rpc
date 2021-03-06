/**
 * Copyright (c) 2017-present, Netifi Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *       http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @flow
 */

'use strict';

import type {IMeter} from './IMeter';
import {IMeterRegistry} from './IMeterRegistry';

export default class SimpleMeterRegistry implements IMeterRegistry {
  meterMap: Object;

  constructor() {
    this.meterMap = {};
  }

  registerMeter(meter: IMeter): void {
    const id = {
      name: meter.name,
      tags: meter.tags,
      type: meter.type,
    };

    if (!this.meterMap[id]) {
      this.meterMap[id] = [];
    }

    this.meterMap[id].push(meter);
  }

  registerMeters(meters: IMeter[]): void {
    (meters || []).forEach(meter => this.registerMeter(meter));
  }

  meters(): IMeter[] {
    return Array.prototype.concat.apply(
      [],
      Object.keys(this.meterMap).map(key => this.meterMap[key]),
    );
  }
}
