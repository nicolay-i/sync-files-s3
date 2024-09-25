import * as Minio from 'minio'
import {Buffer} from "buffer";
import * as crypto from 'crypto';
import {Platform, requestUrl, RequestUrlParam, requireApiVersion} from "obsidian";
import {signV4} from "minio/dist/main/signing";

export default async function uploadFile1(props: {
	host: string,
	accessKeyId: string,
	secretAccessKey: string,
	region: string,
	bucketName: string,
	fileName: string,
	content: string
}) {

	const accessKeyId = props.accessKeyId;
	const secretAccessKey = props.secretAccessKey;
	const bucketName = props.bucketName;
	const region = props.region;
	const objectKey = props.fileName;
	const body = props.content;

// Шаги для создания запроса с подписью:
// 1. Создаем параметры запроса.
// 2. Создаем заголовки.
// 3. Вычисляем подпись.
// 4. Отправляем запрос.

	function sha256(message: string | Buffer, encoding?: any) {
		return crypto.createHash('sha256').update(message).digest(encoding);
	}

	function hmac(key: crypto.BinaryLike, message: string | Buffer, encoding?: any) {
		return crypto.createHmac('sha256', key).update(message).digest(encoding);
	}

	function getSignatureKey(key: string, dateStamp: string, regionName: string, serviceName: string) {
		const kDate = hmac(`AWS4${key}`, dateStamp);
		const kRegion = hmac(kDate, regionName);
		const kService = hmac(kRegion, serviceName);
		const kSigning = hmac(kService, 'aws4_request');
		return kSigning;
	}

	async function saveToS3() {
		const method = 'PUT';
		const service = 's3';
		const endpoint = `https://${props.host}/${props.bucketName}/${objectKey}`;

		// Дата и время в требуемом формате
		const now = new Date();
		const amzDate = now.toISOString().replace(/[:\-]|\.\d{3}/g, '');
		const dateStamp = amzDate.substring(0, 8); // YYYYMMDD

		// Заголовки
		const headers: Record<string, string> = {
			'x-amz-date': amzDate,
			'x-amz-content-sha256': sha256(body, 'hex'),
		};

		// Создаем Canonical Request
		const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
		const canonicalHeaders = Object.keys(headers)
			.map(key => `${key.toLowerCase()}:${headers[key]}\n`)
			.join('');
		const payloadHash = headers['x-amz-content-sha256'];
		const canonicalRequest = [
			method,
			`/${objectKey}`,
			'', // query string
			canonicalHeaders,
			signedHeaders,
			payloadHash,
		].join('\n');

		// Создаем String to Sign
		const algorithm = 'AWS4-HMAC-SHA256';
		const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
		const stringToSign = [
			algorithm,
			amzDate,
			credentialScope,
			sha256(canonicalRequest, 'hex'),
		].join('\n');

		// Вычисляем подпись
		const signingKey = getSignatureKey(secretAccessKey, dateStamp, region, service);
		const signature = hmac(signingKey, stringToSign, 'hex');


		// Функция для создания подписи
		function sign(key: Buffer, msg: string): Buffer {
			return crypto.createHmac('sha256', key).update(msg).digest();
		}

		function getSignatureKey(key: string, dateStamp: string, regionName: string, serviceName: string): Buffer {
			const kDate = sign(Buffer.from(`AWS4${key}`, 'utf-8'), dateStamp);
			const kRegion = sign(kDate, regionName);
			const kService = sign(kRegion, serviceName);
			const kSigning = sign(kService, 'aws4_request');
			return kSigning;
		}


		// Добавляем заголовок авторизации
		headers['Authorization'] = [
			`${algorithm} Credential=${accessKeyId}/${credentialScope}`,
			`SignedHeaders=${signedHeaders}`,
			`Signature=${signature}`,
		].join(', ');


		const param: RequestUrlParam = {
			body: props.content,
			headers,
			method: method,
			url: endpoint,
			contentType: 'application/octet-stream',
		};

		await requestUrl(param)
			.then((rsp) => {
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
					response: {
						headers: headersLower,
						statusCode: rsp.status,
						body: stream,
					},
				};
			})
			.catch(err => {
				console.error(err)
			})


	}

	saveToS3();
}

