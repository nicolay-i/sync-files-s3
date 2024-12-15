import {GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client,} from "@aws-sdk/client-s3";
import type {HttpHandlerOptions} from "@aws-sdk/types";
// @ts-ignore
import {requestTimeout} from "@smithy/fetch-http-handler/dist-es/request-timeout";
import {buildQueryString} from "@smithy/querystring-builder";
// biome-ignore lint/suspicious/noShadowRestrictedNames: <explanation>
import {requestUrl, type RequestUrlParam, Vault} from "obsidian";
import {URL} from 'url';
import {type HttpRequest, HttpResponse} from "@smithy/protocol-http";
import {FetchHttpHandler, type FetchHttpHandlerOptions,} from "@smithy/fetch-http-handler";
import {bufferToArrayBuffer} from "./misc";
import {VALID_REQURL} from "./baseTypesObs";
import {Readable} from "stream";
import {minioConfig} from "./config";

////////////////////////////////////////////////////////////////////////////////
// special handler using Obsidian requestUrl
////////////////////////////////////////////////////////////////////////////////

/**
 * This is close to origin implementation of FetchHttpHandler
 * https://github.com/aws/aws-sdk-js-v3/blob/main/packages/fetch-http-handler/src/fetch-http-handler.ts
 * that is released under Apache 2 License.
 * But this uses Obsidian requestUrl instead.
 */
export class ObsHttpHandler extends FetchHttpHandler {
	requestTimeoutInMs: number | undefined;
	reverseProxyNoSignUrl: string | undefined;

	constructor(
		options?: FetchHttpHandlerOptions,
		reverseProxyNoSignUrl?: string
	) {
		super(options);
		this.requestTimeoutInMs =
			options === undefined ? undefined : options.requestTimeout;
		this.reverseProxyNoSignUrl = reverseProxyNoSignUrl;
	}

	async handle(
		request: HttpRequest,
		{abortSignal}: HttpHandlerOptions = {}
	): Promise<{ response: HttpResponse }> {
		if (abortSignal?.aborted) {
			const abortError = new Error("Request aborted");
			abortError.name = "AbortError";
			return Promise.reject(abortError);
		}

		let path = request.path;
		if (request.query) {
			const queryString = buildQueryString(request.query);
			if (queryString) {
				path += `?${queryString}`;
			}
		}

		const {port, method} = request;
		let url = `${request.protocol}//${request.hostname}${
			port ? `:${port}` : ""
		}${path}`;
		if (
			this.reverseProxyNoSignUrl !== undefined &&
			this.reverseProxyNoSignUrl !== ""
		) {
			const urlObj = new URL(url);
			urlObj.host = this.reverseProxyNoSignUrl;
			url = urlObj.href;
		}
		const body =
			method === "GET" || method === "HEAD" ? undefined : request.body;

		const transformedHeaders: Record<string, string> = {};
		for (const key of Object.keys(request.headers)) {
			const keyLower = key.toLowerCase();
			if (keyLower === "host" || keyLower === "content-length") {
				continue;
			}
			transformedHeaders[keyLower] = request.headers[key];
		}

		let contentType: string | undefined = undefined;
		if (transformedHeaders["content-type"] !== undefined) {
			contentType = transformedHeaders["content-type"];
		}

		let transformedBody: any = body;
		if (ArrayBuffer.isView(body)) {
			transformedBody = bufferToArrayBuffer(body);
		}

		const param: RequestUrlParam = {
			body: transformedBody,
			headers: transformedHeaders,
			method: method,
			url: url,
			contentType: contentType,
		};

		const raceOfPromises = [
			requestUrl(param).then((rsp) => {
				const headers = rsp.headers;
				const headersLower: Record<string, string> = {};
				for (const key of Object.keys(headers)) {
					headersLower[key.toLowerCase()] = headers[key];
				}
				const stream = new ReadableStream<Uint8Array>({
					start(controller) {
						controller.enqueue(new Uint8Array(rsp.arrayBuffer));
						controller.close();
					},
				});
				return {
					response: new HttpResponse({
						headers: headersLower,
						statusCode: rsp.status,
						body: stream,
					}),
				};
			}),
			requestTimeout(this.requestTimeoutInMs),
		];

		if (abortSignal) {
			raceOfPromises.push(
				new Promise<never>((resolve, reject) => {
					abortSignal.onabort = () => {
						const abortError = new Error("Request aborted");
						abortError.name = "AbortError";
						reject(abortError);
					};
				})
			);
		}
		return Promise.race(raceOfPromises);
	}
}
