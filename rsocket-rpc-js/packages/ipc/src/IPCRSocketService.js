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

'use strict';

import invariant from 'fbjs/lib/invariant';

import {Flowable, Single} from 'rsocket-flowable';
import type {Payload, ReactiveSocket, Responder} from 'rsocket-types';
import {
  traceAsChild,
  traceSingleAsChild,
  mapToBuffer,
  deserializeTraceData,
} from 'rsocket-rpc-tracing';
import {Tracer} from 'opentracing';
import {Metrics, IMeterRegistry} from 'rsocket-rpc-metrics';
import {encodeMetadata, getMetadata, getMethod} from 'rsocket-rpc-frames';
import {SwitchTransformOperator} from 'rsocket-rpc-core';

import type {Marshaller} from './Marshaller';
import {IdentityMarshaller} from './Marshaller';

type FlowableHandler = (
  data: any,
  metadata: any,
) => Flowable<Payload<Buffer, Buffer>>;
type SingleHandler = (
  data: any,
  metadata: any,
) => Single<Payload<Buffer, Buffer>>;

type HandlerMethod = FlowableHandler | SingleHandler;

/**
 * Handlers are classes or object literals passed in to services that provide methods expected by a service
 */
type Handler = {
  [key: string]: HandlerMethod,
};

/**
 * IPCRSocketService wraps a Handler in order to manage marshalling and unmarshalling of payload data
 */
export default class IPCRSocketService implements Responder<Buffer, Buffer> {
  _service: string;
  _marshaller: Marshaller;
  _handler: Handler;
  _meterRegistry: IMeterRegistry;
  _tracer: Tracer;

  constructor(
    service: string,
    marshaller: Marshaller,
    handler: Handler,
    meterRegistry: IMeterRegistry,
    tracer: Tracer,
  ) {
    this._service = service;
    this._marshaller = marshaller;
    this._handler = handler;
    this._meterRegistry = meterRegistry;
    this._tracer = tracer;
  }

  _getTracingWrapper(stream: boolean, method: string): Function {
    if (stream) {
      return traceAsChild(
        this._tracer,
        this._service,
        {'rsocket.rpc.service': this._service},
        {'rsocket.rpc.role': 'server'},
        {'rsocket.rpc.version': ''},
        {method: method},
      );
    }
    return traceSingleAsChild(
      this._tracer,
      this._service,
      {'rsocket.rpc.service': this._service},
      {'rsocket.rpc.role': 'server'},
      {'rsocket.rpc.version': ''},
      {method: method},
    );
  }

  _getMetricsWrapper(stream: boolean, method: string): Function {
    if (stream) {
      return Metrics.timed(
        this._meterRegistry,
        this._service,
        {service: this._service},
        {role: 'server'},
        {method: method},
      );
    }
    return Metrics.timedSingle(
      this._meterRegistry,
      this._service,
      {service: this._service},
      {role: 'server'},
      {method: method},
    );
  }

  _getMethod(payload: Payload<Buffer, Buffer>): string {
    if (payload.metadata == null) {
      throw new Error('Metadata is empty');
    }
    const method: string = getMethod(payload.metadata);
    if (!this._handler[method]) {
      throw new Error(`No method ${method} found in ${this._service} handler`);
    }
    return method;
  }

  fireAndForget(payload: Payload<Buffer, Buffer>): void {
    const method: string = this._getMethod(payload);
    const spanContext = deserializeTraceData(this._tracer, payload.metadata);
    this._getMetricsWrapper(false, method)(
      new Single(subscriber => {
        this._getTracingWrapper(false, method)(spanContext)(
          new Single(innerSub => {
            const {data, metadata} = this._marshaller.unmarshall(payload);
            this._handler[method](data, metadata);
            innerSub.onSubscribe();
            innerSub.onComplete();
          }).subscribe({
            onSubscribe: () => {
              subscriber.onSubscribe();
            },
            onComplete: () => {
              subscriber.onComplete();
            },
          }),
        );
      }).subscribe(),
    );
  }

  requestResponse(
    payload: Payload<Buffer, Buffer>,
  ): Single<Payload<Buffer, Buffer>> {
    const method: string = this._getMethod(payload);
    const spanContext = deserializeTraceData(this._tracer, payload.metadata);
    return this._getMetricsWrapper(false, method)(
      this._getTracingWrapper(false, method)(spanContext)(
        new Single(subscriber => {
          const {data, metadata} = this._marshaller.unmarshall(payload);
          return (
            this._handler[method](data, metadata)
              .map(this._marshaller.marshall)
              // $FlowFixMe
              .subscribe(subscriber)
          );
        }),
      ),
    );
  }

  requestStream(
    payload: Payload<Buffer, Buffer>,
  ): Flowable<Payload<Buffer, Buffer>> {
    const method: string = this._getMethod(payload);
    const spanContext = deserializeTraceData(this._tracer, payload.metadata);
    return this._getMetricsWrapper(true, method)(
      this._getTracingWrapper(true, method)(spanContext)(
        new Flowable(subscriber => {
          const {data, metadata} = this._marshaller.unmarshall(payload);
          return this._handler[method](data, metadata)
            .map(this._marshaller.marshall)
            .subscribe(subscriber);
        }),
      ),
    );
  }

  requestChannel(payloads: Flowable<Payload<Buffer, Buffer>>) {
    return new Flowable(subscriber => {
      return payloads.subscribe(subscriber);
    }).lift(sub => {
      return new SwitchTransformOperator(
        sub,
        (firstPayload, restOfPayloads) => {
          const method: string = this._getMethod(firstPayload);
          const spanContext = deserializeTraceData(
            this._tracer,
            firstPayload.metadata,
          );
          const unmarshalledData = restOfPayloads
            .map(this._marshaller.unmarshall)
            .map(payload => payload.data);
          return this._getMetricsWrapper(true, method)(
            this._getTracingWrapper(true, method)(spanContext)(
              this._handler[method](
                unmarshalledData,
                firstPayload.metadata,
              ).map(this._marshaller.marshall),
            ),
          );
        },
      );
    });
  }

  metadataPush(payload: Payload<Buffer, Buffer>): Single<void> {
    return Single.error(new Error('metadataPush() is not implemented'));
  }
}
