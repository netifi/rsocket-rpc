/**
 * Copyright (c) 2019-present, Netifi Inc.
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

import type {
  Payload,
} from 'rsocket-types';

'use strict';


// Marshaller methods should leave payload metadata alone and only transform the data
export type Marshaller = {|
  marshall: (payload: Payload<Buffer, Buffer>) => Payload<Buffer, Buffer>,
  unmarshall: (payload: Payload<Buffer, Buffer>) => Payload<Buffer, Buffer>,
|};

export const IdentityMarshaller: Marshaller = {
  marshall: payload => payload,
  unmarshall: payload => payload
};